// api/orders/[id].js
// Get details for a specific order

const { createClient } = require("@supabase/supabase-js");
const { getCurrentUser } = require("../_auth.js");

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function handler(req, res) {
  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { user, error: authError } = await getCurrentUser(req, res);

  if (!user) {
    return res.status(401).json({
      error: "Unauthorized",
      message: authError || "Please log in to view order details",
    });
  }

  // Get order ID from URL
  const orderId = req.query.id;
  if (!orderId) {
    return res.status(400).json({ error: "Order ID required" });
  }

  try {
    // Get order with all details
    const { data: order, error } = await supabase
      .from("orders")
      .select(`
        id,
        created_at,
        status,
        fulfillment_status,
        amount_cents,
        currency,
        book_id,
        size,
        shipping_name,
        shipping_address_line1,
        shipping_address_line2,
        shipping_city,
        shipping_state,
        shipping_postal_code,
        shipping_country,
        shipping_carrier,
        tracking_number,
        tracking_url,
        estimated_delivery_date,
        shipped_at,
        delivered_at,
        paid_at,
        cancellation_requested_at,
        cancellation_requested_reason,
        product:product_id (
          name,
          display_name
        ),
        book:book_id (
          selected_idea,
          illustrations
        )
      `)
      .eq("id", orderId)
      .eq("user_id", user.id)
      .single();

    if (error) {
      if (error.code === "PGRST116") {
        return res.status(404).json({ error: "Order not found" });
      }
      throw error;
    }

    // Get size display name if applicable
    let sizeDisplayName = null;
    if (order.size) {
      const { data: sizeData } = await supabase
        .from("hardcover_sizes")
        .select("display_name")
        .eq("size_code", order.size)
        .single();
      sizeDisplayName = sizeData?.display_name;
    }

    // Format the response
    const formattedOrder = {
      id: order.id,
      createdAt: order.created_at,
      status: order.status,
      fulfillmentStatus: order.fulfillment_status || 'pending',
      amountCents: order.amount_cents,
      currency: order.currency || 'usd',
      bookId: order.book_id,
      bookTitle: order.book?.selected_idea?.title || 'Untitled Book',
      bookThumbnail: order.book?.illustrations?.[0]?.image_url || null,
      productType: order.product?.name || 'unknown',
      productDisplayName: order.product?.display_name || 'Unknown Product',
      size: order.size,
      sizeDisplayName,
      shipping: {
        name: order.shipping_name,
        addressLine1: order.shipping_address_line1,
        addressLine2: order.shipping_address_line2,
        city: order.shipping_city,
        state: order.shipping_state,
        postalCode: order.shipping_postal_code,
        country: order.shipping_country,
      },
      tracking: {
        carrier: order.shipping_carrier,
        trackingNumber: order.tracking_number,
        trackingUrl: order.tracking_url,
        estimatedDeliveryDate: order.estimated_delivery_date,
        shippedAt: order.shipped_at,
        deliveredAt: order.delivered_at,
      },
      paidAt: order.paid_at,
      cancellation: {
        requestedAt: order.cancellation_requested_at,
        reason: order.cancellation_requested_reason,
      },
    };

    return res.status(200).json({ order: formattedOrder });

  } catch (err) {
    console.error("Error fetching order:", err);
    return res.status(500).json({ error: "Failed to fetch order details" });
  }
}

module.exports = handler;