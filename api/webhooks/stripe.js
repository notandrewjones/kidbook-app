// api/webhooks/stripe.js
// Handles Stripe webhook events for payment processing

const { createClient } = require("@supabase/supabase-js");
const Stripe = require("stripe");

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// Helper to get raw body as buffer
async function getRawBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on("data", (chunk) => chunks.push(chunk));
    req.on("end", () => resolve(Buffer.concat(chunks)));
    req.on("error", reject);
  });
}

async function handler(req, res) {
  console.log(`Webhook received: ${req.method}`);
  
  // Allow POST only
  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }
  
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method Not Allowed" });
  }

  const sig = req.headers["stripe-signature"];
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

  console.log("Signature present:", !!sig);
  console.log("Webhook secret configured:", !!webhookSecret);

  if (!webhookSecret) {
    console.error("STRIPE_WEBHOOK_SECRET not configured");
    return res.status(500).json({ error: "Webhook not configured" });
  }

  if (!sig) {
    console.error("No stripe-signature header");
    return res.status(400).json({ error: "No signature" });
  }

  let event;

  try {
    // Get raw body for signature verification
    const rawBody = await getRawBody(req);
    console.log("Raw body length:", rawBody.length);
    
    // Verify webhook signature
    event = stripe.webhooks.constructEvent(rawBody, sig, webhookSecret);
    console.log("Event verified:", event.type);
  } catch (err) {
    console.error("Webhook signature verification failed:", err.message);
    return res.status(400).json({ error: `Webhook Error: ${err.message}` });
  }

  // Handle the event
  try {
    switch (event.type) {
      case "checkout.session.completed":
        await handleCheckoutCompleted(event.data.object);
        break;

      case "checkout.session.expired":
        await handleCheckoutExpired(event.data.object);
        break;

      case "payment_intent.payment_failed":
        await handlePaymentFailed(event.data.object);
        break;

      case "charge.refunded":
        await handleRefund(event.data.object);
        break;

      default:
        console.log(`Unhandled event type: ${event.type}`);
    }

    return res.status(200).json({ received: true });
  } catch (err) {
    console.error(`Error processing ${event.type}:`, err);
    // Return 200 to acknowledge receipt (Stripe will retry on 4xx/5xx)
    return res.status(200).json({ received: true, error: err.message });
  }
}

/**
 * Queue hardcover order for Lulu submission
 * This is called after payment is confirmed
 */
async function queueLuluSubmission(orderId, shippingDetails) {
  try {
    // Update order with shipping details from Stripe
    if (shippingDetails) {
      const shippingUpdate = {
        shipping_name: shippingDetails.name,
        shipping_address_line1: shippingDetails.address?.line1,
        shipping_address_line2: shippingDetails.address?.line2,
        shipping_city: shippingDetails.address?.city,
        shipping_state: shippingDetails.address?.state,
        shipping_postal_code: shippingDetails.address?.postal_code,
        shipping_country: shippingDetails.address?.country,
        shipping_phone: shippingDetails.phone,
      };

      await supabase
        .from("orders")
        .update(shippingUpdate)
        .eq("id", orderId);
    }

    // Mark as ready for Lulu submission (pending PDF generation)
    await supabase
      .from("orders")
      .update({
        fulfillment_status: 'pending_pdf',
      })
      .eq("id", orderId);

    console.log(`[Lulu] Order ${orderId} queued for print fulfillment`);
    
  } catch (err) {
    console.error(`[Lulu] Failed to queue order ${orderId}:`, err);
  }
}

/**
 * Handle successful checkout
 */
async function handleCheckoutCompleted(session) {
  const { order_id, order_ids, book_id, book_ids, product_type, user_id, cart_checkout } = session.metadata;
  
  // Get shipping details from session if available
  const shippingDetails = session.shipping_details || session.customer_details;

  // Handle cart checkout with multiple orders
  if (cart_checkout === "true" && order_ids) {
    console.log(`Processing cart checkout with orders: ${order_ids}`);
    const orderIdList = order_ids.split(",");
    const bookIdList = book_ids ? book_ids.split(",") : [];

    for (const orderId of orderIdList) {
      // Get order details to determine product type and book
      const { data: order, error: fetchError } = await supabase
        .from("orders")
        .select("id, book_id, product_id, products(name)")
        .eq("id", orderId)
        .single();

      if (fetchError || !order) {
        console.error(`Failed to fetch order ${orderId}:`, fetchError);
        continue;
      }

      const orderProductType = order.products?.name;
      const orderBookId = order.book_id;

      // Update order status
      const { error: orderError } = await supabase
        .from("orders")
        .update({
          status: "paid",
          stripe_payment_intent_id: session.payment_intent,
          paid_at: new Date().toISOString(),
        })
        .eq("id", orderId);

      if (orderError) {
        console.error(`Failed to update order ${orderId}:`, orderError);
        continue;
      }

      // Unlock the book
      if (orderProductType && orderBookId) {
        const unlockField = orderProductType === "ebook" ? "ebook_unlocked" : "hardcover_unlocked";
        
        await supabase
          .from("book_projects")
          .update({
            [unlockField]: true,
            has_watermark: false,
          })
          .eq("id", orderBookId);

        // Create export record
        await supabase
          .from("book_exports")
          .insert({
            book_id: orderBookId,
            order_id: orderId,
            user_id,
            product_type: orderProductType,
            download_count: 0,
            max_downloads: orderProductType === "ebook" ? 10 : 5,
          });
        
        // Queue hardcover orders for Lulu print fulfillment
        if (orderProductType === "hardcover") {
          await queueLuluSubmission(orderId, shippingDetails);
        }
      }

      console.log(`Order ${orderId} processed successfully`);
    }

    // Clear the user's cart after successful checkout
    if (user_id) {
      await supabase
        .from("cart_items")
        .delete()
        .eq("user_id", user_id);
      console.log(`Cart cleared for user ${user_id}`);
    }

    return;
  }

  // Handle single order checkout (legacy/direct)
  if (!order_id) {
    console.error("No order_id in session metadata");
    return;
  }

  console.log(`Processing payment for order ${order_id}`);

  // 1. Update the order status
  const { error: orderError } = await supabase
    .from("orders")
    .update({
      status: "paid",
      stripe_payment_intent_id: session.payment_intent,
      paid_at: new Date().toISOString(),
    })
    .eq("id", order_id);

  if (orderError) {
    console.error("Failed to update order:", orderError);
    throw orderError;
  }

  // 2. Unlock the book for this product type
  const unlockField = product_type === "ebook" ? "ebook_unlocked" : "hardcover_unlocked";
  
  const { error: bookError } = await supabase
    .from("book_projects")
    .update({
      [unlockField]: true,
      has_watermark: false, // Remove watermark once any product is purchased
    })
    .eq("id", book_id);

  if (bookError) {
    console.error("Failed to unlock book:", bookError);
    // Don't throw - order is still valid, we can fix the unlock manually
  }

  // 3. Create export record (file will be generated on-demand)
  const { error: exportError } = await supabase
    .from("book_exports")
    .insert({
      book_id,
      order_id,
      user_id,
      product_type,
      download_count: 0,
      max_downloads: product_type === "ebook" ? 10 : 5,
    });

  if (exportError) {
    console.error("Failed to create export record:", exportError);
    // Don't throw - order is still valid
  }

  // 4. Queue hardcover orders for Lulu print fulfillment
  if (product_type === "hardcover") {
    await queueLuluSubmission(order_id, shippingDetails);
  }

  console.log(`Order ${order_id} completed successfully`);
}

/**
 * Handle expired checkout session
 */
async function handleCheckoutExpired(session) {
  const { order_id } = session.metadata;

  if (!order_id) return;

  await supabase
    .from("orders")
    .update({ status: "expired" })
    .eq("id", order_id)
    .eq("status", "pending"); // Only update if still pending
}

/**
 * Handle failed payment
 */
async function handlePaymentFailed(paymentIntent) {
  // Find order by payment intent
  const { data: order } = await supabase
    .from("orders")
    .select("id")
    .eq("stripe_payment_intent_id", paymentIntent.id)
    .maybeSingle();

  if (order) {
    await supabase
      .from("orders")
      .update({ status: "failed" })
      .eq("id", order.id);
  }
}

/**
 * Handle refund
 */
async function handleRefund(charge) {
  // Find order by payment intent
  const { data: order } = await supabase
    .from("orders")
    .select("id, book_id, product_id, products(name)")
    .eq("stripe_payment_intent_id", charge.payment_intent)
    .maybeSingle();

  if (!order) return;

  // Update order status
  await supabase
    .from("orders")
    .update({ status: "refunded" })
    .eq("id", order.id);

  // Re-lock the book for this product type
  const productType = order.products?.name;
  if (productType && order.book_id) {
    const lockField = productType === "ebook" ? "ebook_unlocked" : "hardcover_unlocked";
    
    // Check if any other paid orders exist for this book
    const { data: otherOrders } = await supabase
      .from("orders")
      .select("id")
      .eq("book_id", order.book_id)
      .eq("status", "paid")
      .neq("id", order.id);

    // If no other paid orders, re-enable watermark
    const hasOtherPaidOrders = otherOrders && otherOrders.length > 0;
    
    await supabase
      .from("book_projects")
      .update({
        [lockField]: false,
        ...(hasOtherPaidOrders ? {} : { has_watermark: true }),
      })
      .eq("id", order.book_id);
  }
}

module.exports = handler;

// Disable Vercel's body parsing - Stripe needs raw body for signature verification
module.exports.config = {
  api: {
    bodyParser: false,
  },
};
