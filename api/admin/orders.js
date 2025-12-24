// api/admin/orders.js
// Admin endpoint to list all orders with filtering

const { createClient } = require("@supabase/supabase-js");
const { requireAdmin } = require("./_admin-auth.js");

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function handler(req, res) {
  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    // Parse query params for filtering
    const { 
      status, 
      fulfillment_status, 
      has_cancellation_request,
      search,
      limit = 50,
      offset = 0 
    } = req.query;

    // If searching, we need a different approach
    let orders = [];
    let count = 0;

    if (search && search.trim()) {
      const searchTerm = search.trim().toLowerCase();
      
      // First, check if it looks like a Lulu print job ID (numeric)
      let orderIdsFromLulu = [];
      if (/^\d+$/.test(searchTerm)) {
        const { data: luluJobs } = await supabase
          .from("lulu_print_jobs")
          .select("order_id")
          .eq("lulu_print_job_id", searchTerm);
        
        orderIdsFromLulu = luluJobs?.map(j => j.order_id).filter(Boolean) || [];
      }
      
      if (orderIdsFromLulu.length > 0) {
        // Found matching Lulu jobs - fetch those orders directly
        let query = supabase
          .from("orders")
          .select("*", { count: "exact" })
          .in("id", orderIdsFromLulu)
          .order("created_at", { ascending: false });
        
        if (status) query = query.eq("status", status);
        if (fulfillment_status) query = query.eq("fulfillment_status", fulfillment_status);
        if (has_cancellation_request === "true") query = query.not("cancellation_requested_at", "is", null);
        
        const result = await query.range(offset, offset + parseInt(limit) - 1);
        orders = result.data || [];
        count = result.count || 0;
      } else {
        // Search by order ID prefix - fetch recent orders and filter in memory
        let query = supabase
          .from("orders")
          .select("*")
          .order("created_at", { ascending: false })
          .limit(500);
        
        if (status) query = query.eq("status", status);
        if (fulfillment_status) query = query.eq("fulfillment_status", fulfillment_status);
        if (has_cancellation_request === "true") query = query.not("cancellation_requested_at", "is", null);
        
        const { data: allOrders, error } = await query;
        if (error) throw error;
        
        // Filter by order ID starting with search term
        const filteredOrders = allOrders.filter(order => 
          order.id && order.id.toLowerCase().startsWith(searchTerm)
        );
        
        orders = filteredOrders.slice(parseInt(offset), parseInt(offset) + parseInt(limit));
        count = filteredOrders.length;
      }
      
      // Also search by email in customers table if no results
      if (orders.length === 0 && searchTerm.includes('@')) {
        const { data: customers } = await supabase
          .from("customers")
          .select("user_id")
          .ilike("email", `%${searchTerm}%`);
        
        if (customers?.length > 0) {
          const userIds = customers.map(c => c.user_id);
          let emailQuery = supabase
            .from("orders")
            .select("*", { count: "exact" })
            .in("user_id", userIds)
            .order("created_at", { ascending: false });
          
          if (status) emailQuery = emailQuery.eq("status", status);
          if (fulfillment_status) emailQuery = emailQuery.eq("fulfillment_status", fulfillment_status);
          if (has_cancellation_request === "true") emailQuery = emailQuery.not("cancellation_requested_at", "is", null);
          
          const emailResult = await emailQuery.range(offset, offset + parseInt(limit) - 1);
          orders = emailResult.data || [];
          count = emailResult.count || 0;
        }
      }
    } else {
      // No search - use standard query
      let query = supabase
        .from("orders")
        .select("*", { count: "exact" })
        .order("created_at", { ascending: false })
        .range(offset, offset + parseInt(limit) - 1);

      // Apply filters
      if (status) query = query.eq("status", status);
      if (fulfillment_status) query = query.eq("fulfillment_status", fulfillment_status);
      if (has_cancellation_request === "true") query = query.not("cancellation_requested_at", "is", null);

      const result = await query;
      if (result.error) throw result.error;
      orders = result.data || [];
      count = result.count || 0;
    }

    // Get user details for orders
    const userIds = [...new Set(orders.map(o => o.user_id).filter(Boolean))];
    let usersMap = {};
    if (userIds.length > 0) {
      const { data: users } = await supabase
        .from("auth.users")
        .select("id, email")
        .in("id", userIds);
      
      // Fallback: get from customers table if auth.users doesn't work
      if (!users || users.length === 0) {
        const { data: customers } = await supabase
          .from("customers")
          .select("user_id, email")
          .in("user_id", userIds);
        
        customers?.forEach(c => {
          usersMap[c.user_id] = { email: c.email };
        });
      } else {
        users?.forEach(u => {
          usersMap[u.id] = { email: u.email };
        });
      }
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
        .select("id, selected_idea")
        .in("id", bookIds);
      
      books?.forEach(b => {
        booksMap[b.id] = b;
      });
    }

    // Format response
    const formattedOrders = orders.map(order => ({
      id: order.id,
      createdAt: order.created_at,
      status: order.status,
      fulfillmentStatus: order.fulfillment_status || 'pending',
      amountCents: order.amount_cents,
      currency: order.currency || 'usd',
      userId: order.user_id,
      userEmail: usersMap[order.user_id]?.email || 'Unknown',
      bookId: order.book_id,
      bookTitle: booksMap[order.book_id]?.selected_idea?.title || 'Untitled Book',
      productType: productsMap[order.product_id]?.name || 'unknown',
      productDisplayName: productsMap[order.product_id]?.display_name || 'Unknown',
      size: order.size,
      stripePaymentIntentId: order.stripe_payment_intent_id,
      stripeCheckoutSessionId: order.stripe_checkout_session_id,
      shippingName: order.shipping_name,
      shippingAddress: order.shipping_address_line1 ? {
        line1: order.shipping_address_line1,
        line2: order.shipping_address_line2,
        city: order.shipping_city,
        state: order.shipping_state,
        postalCode: order.shipping_postal_code,
        country: order.shipping_country,
      } : null,
      shippingCarrier: order.shipping_carrier,
      trackingNumber: order.tracking_number,
      trackingUrl: order.tracking_url,
      estimatedDeliveryDate: order.estimated_delivery_date,
      paidAt: order.paid_at,
      shippedAt: order.shipped_at,
      deliveredAt: order.delivered_at,
      cancelledAt: order.cancelled_at,
      cancellationRequestedAt: order.cancellation_requested_at,
      cancellationRequestedReason: order.cancellation_requested_reason,
    }));

    return res.status(200).json({
      orders: formattedOrders,
      total: count,
      limit: parseInt(limit),
      offset: parseInt(offset),
    });

  } catch (err) {
    console.error("Admin orders error:", err);
    return res.status(500).json({ error: "Failed to fetch orders", details: err.message });
  }
}

module.exports = requireAdmin(handler);