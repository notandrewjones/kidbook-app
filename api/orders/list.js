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
    // Get all paid orders for this user
    const { data: orders, error } = await supabase
      .from("orders")
      .select("*")
      .eq("user_id", user.id)
      .eq("status", "paid")
      .order("created_at", { ascending: false });

    if (error) {
      console.error("Orders query error:", error);
      throw error;
    }

    // If no orders, return empty array
    if (!orders || orders.length === 0) {
      return res.status(200).json({
        orders: [],
        count: 0,
      });
    }

    // Get product details
    const productIds = [...new Set(orders.map(o => o.product_id).filter(Boolean))];
    let productsMap = {};
    if (productIds.length > 0) {
      const { data: products } = await supabase
        .from("products")
        .select("id, name, display_name")
        .in("id", productIds);
      
      products?.forEach(p => {
        productsMap[p.id] = p;
      });
    }

    // Get book details
    const bookIds = [...new Set(orders.map(o => o.book_id).filter(Boolean))];
    let booksMap = {};
    if (bookIds.length > 0) {
      const { data: books } = await supabase
        .from("book_projects")
        .select("id, selected_idea, illustrations")
        .in("id", bookIds);
      
      books?.forEach(b => {
        booksMap[b.id] = b;
      });
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
      const product = productsMap[order.product_id] || {};
      const book = booksMap[order.book_id] || {};
      
      return {
        id: order.id,
        createdAt: order.created_at,
        status: order.status,
        fulfillmentStatus: order.fulfillment_status || 'pending',
        amountCents: order.amount_cents,
        currency: order.currency || 'usd',
        bookId: order.book_id,
        bookTitle: book.selected_idea?.title || 'Untitled Book',
        bookThumbnail: book.illustrations?.[0]?.image_url || null,
        productType: product.name || 'unknown',
        productDisplayName: product.display_name || 'Unknown Product',
        size: order.size || null,
        sizeDisplayName: order.size ? sizeMap[order.size] : null,
        shippingCarrier: order.shipping_carrier || null,
        trackingNumber: order.tracking_number || null,
        trackingUrl: order.tracking_url || null,
        estimatedDeliveryDate: order.estimated_delivery_date || null,
        shippedAt: order.shipped_at || null,
        deliveredAt: order.delivered_at || null,
        paidAt: order.paid_at,
        cancellationRequestedAt: order.cancellation_requested_at || null,
      };
    });

    return res.status(200).json({
      orders: formattedOrders,
      count: formattedOrders.length,
    });

  } catch (err) {
    console.error("Error fetching orders:", err);
    return res.status(500).json({ 
      error: "Failed to fetch orders", 
      details: err.message,
      code: err.code 
    });
  }
}

module.exports = handler;