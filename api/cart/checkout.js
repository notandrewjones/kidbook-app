// api/cart/checkout.js
// Create a Stripe Checkout session for all cart items

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

  const { user, error: authError } = await getCurrentUser(req, res);

  if (!user) {
    return res.status(401).json({
      error: "Unauthorized",
      message: authError || "Please log in to checkout",
    });
  }

  const { embedded } = req.body;

  try {
    // Get cart items
    const { data: cartItems, error: cartError } = await supabase
      .rpc('get_cart_with_details', { p_user_id: user.id });

    if (cartError) throw cartError;

    if (!cartItems || cartItems.length === 0) {
      return res.status(400).json({ error: "Cart is empty" });
    }

    // Get or create Stripe customer
    let stripeCustomerId;
    
    const { data: customer } = await supabase
      .from("customers")
      .select("stripe_customer_id")
      .eq("user_id", user.id)
      .maybeSingle();

    if (customer?.stripe_customer_id) {
      stripeCustomerId = customer.stripe_customer_id;
    } else {
      const stripeCustomer = await stripe.customers.create({
        email: user.email,
        metadata: { supabase_user_id: user.id },
      });
      stripeCustomerId = stripeCustomer.id;

      await supabase.from("customers").upsert({
        user_id: user.id,
        stripe_customer_id: stripeCustomerId,
        email: user.email,
      });
    }

    // Get product Stripe price IDs
    const { data: products } = await supabase
      .from("products")
      .select("name, stripe_price_id");

    const priceMap = {};
    products?.forEach(p => {
      priceMap[p.name] = p.stripe_price_id;
    });

    // Build line items for Stripe
    // For now, all hardcovers use the same price ID regardless of size
    const lineItems = cartItems.map(item => {
      const priceId = item.product_type === 'ebook' 
        ? priceMap['ebook']
        : priceMap['hardcover'];

      if (!priceId) {
        throw new Error(`No Stripe price configured for ${item.product_type}`);
      }

      return {
        price: priceId,
        quantity: item.quantity,
      };
    });

    // Create orders for each unique book/product combo
    const orderIds = [];
    const bookIds = [...new Set(cartItems.map(i => i.book_id))];
    
    for (const item of cartItems) {
      // Get product ID
      const { data: product } = await supabase
        .from("products")
        .select("id")
        .eq("name", item.product_type)
        .single();

      const { data: order, error: orderError } = await supabase
        .from("orders")
        .insert({
          user_id: user.id,
          book_id: item.book_id,
          product_id: product.id,
          amount_cents: item.line_total_cents,
          currency: "usd",
          status: "pending",
        })
        .select("id")
        .single();

      if (orderError) {
        console.error("Order create error:", orderError);
        throw orderError;
      }

      orderIds.push(order.id);
    }

    // Create Stripe session
    const baseUrl = process.env.VERCEL_URL 
      ? `https://${process.env.VERCEL_URL}` 
      : process.env.BASE_URL || "http://localhost:3000";

    const uiMode = embedded ? "embedded" : "hosted";

    const sessionConfig = {
      customer: stripeCustomerId,
      payment_method_types: ["card"],
      line_items: lineItems,
      mode: "payment",
      metadata: {
        order_ids: orderIds.join(","),
        book_ids: bookIds.join(","),
        user_id: user.id,
        cart_checkout: "true",
      },
    };

    // Check if any hardcovers need shipping
    const hasHardcover = cartItems.some(i => i.product_type === 'hardcover');

    if (uiMode === "embedded") {
      sessionConfig.ui_mode = "embedded";
      sessionConfig.return_url = `${baseUrl}/dashboard?payment=success&session_id={CHECKOUT_SESSION_ID}`;
    } else {
      sessionConfig.success_url = `${baseUrl}/dashboard?payment=success&orders=${orderIds.join(",")}`;
      sessionConfig.cancel_url = `${baseUrl}/dashboard?payment=cancelled`;
      
      if (hasHardcover) {
        sessionConfig.billing_address_collection = "required";
        sessionConfig.shipping_address_collection = {
          allowed_countries: ["US", "CA", "GB", "AU"],
        };
      }
    }

    const session = await stripe.checkout.sessions.create(sessionConfig);

    // Update orders with session ID
    for (const orderId of orderIds) {
      await supabase
        .from("orders")
        .update({ stripe_checkout_session_id: session.id })
        .eq("id", orderId);
    }

    if (uiMode === "embedded") {
      return res.status(200).json({
        clientSecret: session.client_secret,
        sessionId: session.id,
        orderIds,
      });
    } else {
      return res.status(200).json({
        checkoutUrl: session.url,
        sessionId: session.id,
        orderIds,
      });
    }

  } catch (err) {
    console.error("Cart checkout error:", err);
    return res.status(500).json({ 
      error: "Failed to create checkout",
      details: err.message,
    });
  }
}

module.exports = handler;
