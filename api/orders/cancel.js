// api/orders/cancel.js
// Request cancellation of an order

const { createClient } = require("@supabase/supabase-js");
const { getCurrentUser } = require("../_auth.js");

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
      message: authError || "Please log in to cancel orders",
    });
  }

  const { orderId, reason } = req.body;

  if (!orderId) {
    return res.status(400).json({ error: "Order ID required" });
  }

  try {
    // First, verify the order belongs to the user and check its status
    const { data: order, error: fetchError } = await supabase
      .from("orders")
      .select("id, status, fulfillment_status, cancellation_requested_at")
      .eq("id", orderId)
      .eq("user_id", user.id)
      .single();

    if (fetchError) {
      if (fetchError.code === "PGRST116") {
        return res.status(404).json({ error: "Order not found" });
      }
      throw fetchError;
    }

    // Check if cancellation is allowed
    if (order.status !== "paid") {
      return res.status(400).json({ 
        error: "Cannot cancel this order",
        message: "Only paid orders can be cancelled",
      });
    }

    // Check if already requested
    if (order.cancellation_requested_at) {
      return res.status(400).json({ 
        error: "Cancellation already requested",
        message: "A cancellation request is already pending for this order",
      });
    }

    // Check fulfillment status - can only cancel if not yet shipped
    const nonCancellableStatuses = ['shipped', 'delivered', 'cancelled'];
    if (nonCancellableStatuses.includes(order.fulfillment_status)) {
      return res.status(400).json({ 
        error: "Cannot cancel this order",
        message: `Order cannot be cancelled because it has already been ${order.fulfillment_status}`,
      });
    }

    // Update the order with cancellation request
    const { data: updatedOrder, error: updateError } = await supabase
      .from("orders")
      .update({
        cancellation_requested_at: new Date().toISOString(),
        cancellation_requested_reason: reason || "No reason provided",
      })
      .eq("id", orderId)
      .select()
      .single();

    if (updateError) throw updateError;

    return res.status(200).json({
      success: true,
      message: "Cancellation request submitted",
      order: {
        id: updatedOrder.id,
        cancellationRequestedAt: updatedOrder.cancellation_requested_at,
      },
    });

  } catch (err) {
    console.error("Error requesting cancellation:", err);
    return res.status(500).json({ error: "Failed to request cancellation" });
  }
}

module.exports = handler;