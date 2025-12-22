// api/cart/get.js
// Get the current user's cart with full details

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
      message: authError || "Please log in to view cart",
    });
  }

  try {
    // Get cart items with details using the helper function
    const { data: items, error: cartError } = await supabase
      .rpc('get_cart_with_details', { p_user_id: user.id });

    if (cartError) {
      console.error("Cart fetch error:", cartError);
      throw cartError;
    }

    // Calculate totals
    const itemCount = items?.reduce((sum, item) => sum + item.quantity, 0) || 0;
    const totalCents = items?.reduce((sum, item) => sum + item.line_total_cents, 0) || 0;

    return res.status(200).json({
      items: items || [],
      itemCount,
      totalCents,
      totalFormatted: `$${(totalCents / 100).toFixed(2)}`,
    });

  } catch (err) {
    console.error("Get cart error:", err);
    return res.status(500).json({ error: "Failed to get cart" });
  }
}

module.exports = handler;
