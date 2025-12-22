// api/cart/clear.js
// Clear all items from the user's cart

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
      message: authError || "Please log in",
    });
  }

  try {
    const { error } = await supabase
      .from("cart_items")
      .delete()
      .eq("user_id", user.id);

    if (error) throw error;

    return res.status(200).json({ success: true });

  } catch (err) {
    console.error("Cart clear error:", err);
    return res.status(500).json({ error: "Failed to clear cart" });
  }
}

module.exports = handler;
