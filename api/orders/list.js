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
    const { data: orders, error } = await supabase
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
        shipping_carrier,
        tracking_number,
        tracking_url,
        estimated_delivery_date,
        shipped_at,
        delivered_at,
        paid_at,
        cancellation_requested_at,
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

    // Get hardcover sizes for display names
    const { data: sizes } = await supabase
      .from("hardcover_sizes")
      .select("size_code, display_name");

    const sizeMap = {};
    sizes?.forEach(s => {
      sizeMap[s.size_code] = s.display_name;
    });

    // Format the response
    const formattedOrders = orders.map(order => ({
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
      sizeDisplayName: order.size ? sizeMap[order.size] : null,
      shippingCarrier: order.shipping_carrier,
      trackingNumber: order.tracking_number,
      trackingUrl: order.tracking_url,
      estimatedDeliveryDate: order.estimated_delivery_date,
      shippedAt: order.shipped_at,
      deliveredAt: order.delivered_at,
      paidAt: order.paid_at,
      cancellationRequestedAt: order.cancellation_requested_at,
    }));

    return res.status(200).json({
      orders: formattedOrders,
      count: formattedOrders.length,
    });

  } catch (err) {
    console.error("Error fetching orders:", err);
    return res.status(500).json({ error: "Failed to fetch orders" });
  }
}

module.exports = handler;