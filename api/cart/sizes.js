// api/cart/sizes.js
// Get available hardcover sizes and their prices

const { createClient } = require("@supabase/supabase-js");

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function handler(req, res) {
  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const { data: sizes, error } = await supabase
      .from("hardcover_sizes")
      .select("size_code, display_name, dimensions, price_cents")
      .eq("is_active", true)
      .order("sort_order");

    if (error) throw error;

    // Format prices
    const formatted = sizes.map(s => ({
      ...s,
      priceFormatted: `$${(s.price_cents / 100).toFixed(2)}`,
    }));

    return res.status(200).json({ sizes: formatted });

  } catch (err) {
    console.error("Get sizes error:", err);
    return res.status(500).json({ error: "Failed to get sizes" });
  }
}

module.exports = handler;
