// api/admin/order-update.js
// Admin endpoint to update order details (tracking, fulfillment status, etc.)

const { createClient } = require("@supabase/supabase-js");
const { requireAdmin } = require("./_admin-auth.js");

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { 
    orderId, 
    fulfillmentStatus,
    shippingCarrier,
    trackingNumber,
    trackingUrl,
    estimatedDeliveryDate,
  } = req.body;

  if (!orderId) {
    return res.status(400).json({ error: "Order ID required" });
  }

  try {
    // Build update object with only provided fields
    const updates = {};
    
    if (fulfillmentStatus) {
      updates.fulfillment_status = fulfillmentStatus;
      
      // Set timestamps based on status
      if (fulfillmentStatus === 'shipped' && !updates.shipped_at) {
        updates.shipped_at = new Date().toISOString();
      }
      if (fulfillmentStatus === 'delivered' && !updates.delivered_at) {
        updates.delivered_at = new Date().toISOString();
      }
    }
    
    if (shippingCarrier !== undefined) {
      updates.shipping_carrier = shippingCarrier;
    }
    if (trackingNumber !== undefined) {
      updates.tracking_number = trackingNumber;
    }
    if (trackingUrl !== undefined) {
      updates.tracking_url = trackingUrl;
    }
    if (estimatedDeliveryDate !== undefined) {
      updates.estimated_delivery_date = estimatedDeliveryDate;
    }

    if (Object.keys(updates).length === 0) {
      return res.status(400).json({ error: "No updates provided" });
    }

    // Update the order
    const { data: order, error } = await supabase
      .from("orders")
      .update(updates)
      .eq("id", orderId)
      .select()
      .single();

    if (error) throw error;

    return res.status(200).json({
      success: true,
      message: "Order updated",
      order: {
        id: order.id,
        fulfillmentStatus: order.fulfillment_status,
        shippingCarrier: order.shipping_carrier,
        trackingNumber: order.tracking_number,
        trackingUrl: order.tracking_url,
        estimatedDeliveryDate: order.estimated_delivery_date,
        shippedAt: order.shipped_at,
        deliveredAt: order.delivered_at,
      },
    });

  } catch (err) {
    console.error("Admin order update error:", err);
    return res.status(500).json({ error: "Failed to update order", details: err.message });
  }
}

module.exports = requireAdmin(handler);