// api/checkout/create-session.js
// Creates a Stripe Checkout session for purchasing book exports

const { createClient } = require("@supabase/supabase-js");
const { getCurrentUser } = require("../_auth.js");
const Stripe = require("stripe");

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  // Check authentication
  const { user, error: authError } = await getCurrentUser(req, res);

  if (!user) {
    return res.status(401).json({
      error: "Unauthorized",
      message: authError || "Please log in to purchase",
    });
  }

  const { bookId, productType } = req.body;

  // Validate input
  if (!bookId) {
    return res.status(400).json({ error: "Missing bookId" });
  }

  if (!productType || !["ebook", "hardcover"].includes(productType)) {
    return res.status(400).json({ 
      error: "Invalid productType. Must be 'ebook' or 'hardcover'" 
    });
  }

  try {
    // 1. Verify the book exists and belongs to this user
    const { data: book, error: bookError } = await supabase
      .from("book_projects")
      .select("id, selected_idea, user_id")
      .eq("id", bookId)
      .single();

    if (bookError || !book) {
      return res.status(404).json({ error: "Book not found" });
    }

    if (book.user_id !== user.id) {
      return res.status(403).json({ 
        error: "Access denied",
        message: "You don't have permission to purchase this book" 
      });
    }

    // 2. Check if already purchased
    const { data: existingOrder } = await supabase
      .from("orders")
      .select("id, status")
      .eq("book_id", bookId)
      .eq("status", "paid")
      .eq("user_id", user.id)
      .maybeSingle();

    // Join with products to check product type
    if (existingOrder) {
      const { data: orderWithProduct } = await supabase
        .from("orders")
        .select("id, products(name)")
        .eq("id", existingOrder.id)
        .single();

      if (orderWithProduct?.products?.name === productType) {
        return res.status(400).json({
          error: "Already purchased",
          message: `You've already purchased the ${productType} for this book`,
        });
      }
    }

    // 3. Get the product details
    const { data: product, error: productError } = await supabase
      .from("products")
      .select("id, name, display_name, price_cents, stripe_price_id")
      .eq("name", productType)
      .eq("is_active", true)
      .single();

    if (productError || !product) {
      return res.status(404).json({ error: "Product not found or unavailable" });
    }

    if (!product.stripe_price_id) {
      return res.status(500).json({ 
        error: "Product not configured",
        message: "Stripe price ID not set for this product" 
      });
    }

    // 4. Get or create Stripe customer
    let stripeCustomerId;
    
    const { data: customer } = await supabase
      .from("customers")
      .select("stripe_customer_id")
      .eq("user_id", user.id)
      .maybeSingle();

    if (customer?.stripe_customer_id) {
      stripeCustomerId = customer.stripe_customer_id;
    } else {
      // Create new Stripe customer
      const stripeCustomer = await stripe.customers.create({
        email: user.email,
        metadata: {
          supabase_user_id: user.id,
        },
      });
      stripeCustomerId = stripeCustomer.id;

      // Save to customers table
      await supabase.from("customers").upsert({
        user_id: user.id,
        stripe_customer_id: stripeCustomerId,
        email: user.email,
      });
    }

    // 5. Create pending order
    const { data: order, error: orderError } = await supabase
      .from("orders")
      .insert({
        user_id: user.id,
        book_id: bookId,
        product_id: product.id,
        amount_cents: product.price_cents,
        currency: "usd",
        status: "pending",
      })
      .select("id")
      .single();

    if (orderError) {
      console.error("ORDER CREATE ERROR:", orderError);
      return res.status(500).json({ error: "Failed to create order" });
    }

    // 6. Create Stripe Checkout Session
    const baseUrl = process.env.VERCEL_URL 
      ? `https://${process.env.VERCEL_URL}` 
      : process.env.BASE_URL || "http://localhost:3000";

    const session = await stripe.checkout.sessions.create({
      customer: stripeCustomerId,
      payment_method_types: ["card"],
      line_items: [
        {
          price: product.stripe_price_id,
          quantity: 1,
        },
      ],
      mode: "payment",
      success_url: `${baseUrl}/p/${bookId}/compositor?payment=success&order=${order.id}`,
      cancel_url: `${baseUrl}/p/${bookId}/compositor?payment=cancelled`,
      metadata: {
        order_id: order.id,
        book_id: bookId,
        product_type: productType,
        user_id: user.id,
      },
      // Optional: collect billing address for hardcover shipping
      ...(productType === "hardcover" && {
        billing_address_collection: "required",
        shipping_address_collection: {
          allowed_countries: ["US", "CA", "GB", "AU"], // Adjust as needed
        },
      }),
    });

    // 7. Update order with session ID
    await supabase
      .from("orders")
      .update({ stripe_checkout_session_id: session.id })
      .eq("id", order.id);

    // 8. Return checkout URL
    return res.status(200).json({
      checkoutUrl: session.url,
      sessionId: session.id,
      orderId: order.id,
    });

  } catch (err) {
    console.error("CHECKOUT ERROR:", err);
    return res.status(500).json({
      error: "Failed to create checkout session",
      details: process.env.NODE_ENV === "development" ? err.message : undefined,
    });
  }
}

module.exports = handler;