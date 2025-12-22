// api/admin/refund.js
// Admin endpoint to process refunds via Stripe and update order status

const { createClient } = require("@supabase/supabase-js");
const { requireAdmin } = require("./_admin-auth.js");
const Stripe = require("stripe");

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { orderId, reason = "requested_by_customer", amount } = req.body;

  if (!orderId) {
    return res.status(400).json({ error: "Order ID required" });
  }

  try {
    // Get the order to find Stripe payment info
    const { data: order, error: fetchError } = await supabase
      .from("orders")
      .select("*")
      .eq("id", orderId)
      .single();

    if (fetchError || !order) {
      return res.status(404).json({ error: "Order not found" });
    }

    if (order.status === "refunded") {
      return res.status(400).json({ error: "Order already refunded" });
    }

    if (order.status !== "paid") {
      return res.status(400).json({ error: "Can only refund paid orders" });
    }

    // Get the payment intent ID
    let paymentIntentId = order.stripe_payment_intent_id;
    
    // If we don't have the payment intent ID, try to get it from the checkout session
    if (!paymentIntentId && order.stripe_checkout_session_id) {
      const session = await stripe.checkout.sessions.retrieve(order.stripe_checkout_session_id);
      paymentIntentId = session.payment_intent;
    }

    if (!paymentIntentId) {
      return res.status(400).json({ 
        error: "No payment intent found", 
        message: "Cannot process refund without Stripe payment reference" 
      });
    }

    // Create the refund in Stripe
    const refundParams = {
      payment_intent: paymentIntentId,
      reason: reason, // 'duplicate', 'fraudulent', or 'requested_by_customer'
    };

    // If partial refund amount specified (in cents)
    if (amount && amount < order.amount_cents) {
      refundParams.amount = amount;
    }

    const refund = await stripe.refunds.create(refundParams);

    // Update order status in database
    const { data: updatedOrder, error: updateError } = await supabase
      .from("orders")
      .update({
        status: "refunded",
        fulfillment_status: "cancelled",
        cancelled_at: new Date().toISOString(),
        cancellation_reason: reason,
        // Clear cancellation request since it's been processed
        cancellation_requested_at: null,
        cancellation_requested_reason: null,
      })
      .eq("id", orderId)
      .select()
      .single();

    if (updateError) {
      console.error("Database update failed after Stripe refund:", updateError);
      // Note: Refund already processed in Stripe, log this for manual reconciliation
      return res.status(500).json({ 
        error: "Refund processed but database update failed",
        stripeRefundId: refund.id,
        message: "Please manually update order status"
      });
    }

    return res.status(200).json({
      success: true,
      message: "Refund processed successfully",
      refund: {
        id: refund.id,
        amount: refund.amount,
        status: refund.status,
      },
      order: {
        id: updatedOrder.id,
        status: updatedOrder.status,
        fulfillmentStatus: updatedOrder.fulfillment_status,
      },
    });

  } catch (err) {
    console.error("Admin refund error:", err);
    
    // Handle Stripe-specific errors
    if (err.type === 'StripeCardError' || err.type === 'StripeInvalidRequestError') {
      return res.status(400).json({ 
        error: "Stripe error", 
        message: err.message 
      });
    }
    
    return res.status(500).json({ error: "Failed to process refund", details: err.message });
  }
}

module.exports = requireAdmin(handler);