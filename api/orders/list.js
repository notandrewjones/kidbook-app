// api/orders/list.js
// Get all orders for the current user

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
      message: authError || "Please log in to view orders",
    });
  }

  try {
    // Get all paid orders for this user with book details
    // Note: Some columns may not exist if migration hasn't been run yet
    const { data: orders, error } = await supabase
      .from("orders")
      .select(`
        id,
        created_at,
        status,
        amount_cents,
        currency,
        book_id,
        paid_at,
        product:product_id (
          name,
          display_name
        ),
        book:book_id (
          selected_idea,
          illustrations
        )
      `)
      .eq("user_id", user.id)
      .eq("status", "paid")
      .order("created_at", { ascending: false });

    if (error) throw error;

    // Try to get extended fulfillment data if available
    let fulfillmentData = {};
    try {
      const { data: extendedOrders } = await supabase
        .from("orders")
        .select(`
          id,
          fulfillment_status,
          size,
          shipping_carrier,
          tracking_number,
          tracking_url,
          estimated_delivery_date,
          shipped_at,
          delivered_at,
          cancellation_requested_at
        `)
        .eq("user_id", user.id)
        .eq("status", "paid");
      
      if (extendedOrders) {
        extendedOrders.forEach(o => {
          fulfillmentData[o.id] = o;
        });
      }
    } catch (e) {
      // Columns don't exist yet - that's OK
      console.log("Extended fulfillment columns not available yet");
    }

    // Get hardcover sizes for display names
    let sizeMap = {};
    try {
      const { data: sizes } = await supabase
        .from("hardcover_sizes")
        .select("size_code, display_name");
      
      sizes?.forEach(s => {
        sizeMap[s.size_code] = s.display_name;
      });
    } catch (e) {
      // Table might not exist
    }

    // Format the response
    const formattedOrders = orders.map(order => {
      const extended = fulfillmentData[order.id] || {};
      return {
        id: order.id,
        createdAt: order.created_at,
        status: order.status,
        fulfillmentStatus: extended.fulfillment_status || 'pending',
        amountCents: order.amount_cents,
        currency: order.currency || 'usd',
        bookId: order.book_id,
        bookTitle: order.book?.selected_idea?.title || 'Untitled Book',
        bookThumbnail: order.book?.illustrations?.[0]?.image_url || null,
        productType: order.product?.name || 'unknown',
        productDisplayName: order.product?.display_name || 'Unknown Product',
        size: extended.size || null,
        sizeDisplayName: extended.size ? sizeMap[extended.size] : null,
        shippingCarrier: extended.shipping_carrier || null,
        trackingNumber: extended.tracking_number || null,
        trackingUrl: extended.tracking_url || null,
        estimatedDeliveryDate: extended.estimated_delivery_date || null,
        shippedAt: extended.shipped_at || null,
        deliveredAt: extended.delivered_at || null,
        paidAt: order.paid_at,
        cancellationRequestedAt: extended.cancellation_requested_at || null,
      };
    });

    return res.status(200).json({
      orders: formattedOrders,
      count: formattedOrders.length,
    });

  } catch (err) {
    console.error("Error fetching orders:", err);
    return res.status(500).json({ error: "Failed to fetch orders", details: err.message });
  }
}

module.exports = handler;