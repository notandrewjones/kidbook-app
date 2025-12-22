// api/orders/support.js
// Create a support ticket for an order

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
      message: authError || "Please log in to submit a support request",
    });
  }

  const { orderId, subject, message, category = 'order' } = req.body;

  if (!subject || !message) {
    return res.status(400).json({ error: "Subject and message are required" });
  }

  try {
    // If orderId provided, verify it belongs to the user
    if (orderId) {
      const { data: order, error: orderError } = await supabase
        .from("orders")
        .select("id")
        .eq("id", orderId)
        .eq("user_id", user.id)
        .single();

      if (orderError || !order) {
        return res.status(404).json({ error: "Order not found" });
      }
    }

    // Create the support ticket
    const { data: ticket, error: insertError } = await supabase
      .from("support_tickets")
      .insert({
        user_id: user.id,
        order_id: orderId || null,
        subject,
        message,
        category,
        status: 'open',
        priority: 'normal',
      })
      .select()
      .single();

    if (insertError) throw insertError;

    return res.status(200).json({
      success: true,
      message: "Support ticket created",
      ticket: {
        id: ticket.id,
        subject: ticket.subject,
        status: ticket.status,
        createdAt: ticket.created_at,
      },
    });

  } catch (err) {
    console.error("Error creating support ticket:", err);
    return res.status(500).json({ error: "Failed to create support ticket" });
  }
}

module.exports = handler;