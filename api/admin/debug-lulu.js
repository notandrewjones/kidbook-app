// api/admin/debug-lulu.js
// Debug endpoint to check Lulu auto-fulfill query

const { createClient } = require("@supabase/supabase-js");
const { processAllPendingOrders } = require("../lulu/auto-fulfill.js");
const { luluClient } = require("../lulu/client.js");

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function handler(req, res) {
  try {
    // Step 1: Get hardcover product
    const { data: product, error: productError } = await supabase
      .from("products")
      .select("id, name")
      .eq("name", "hardcover")
      .single();

    if (productError) {
      return res.status(200).json({ 
        step: "product lookup failed", 
        error: productError 
      });
    }

    // Step 2: Find all paid hardcover orders
    const { data: allPaidHardcover, error: error1 } = await supabase
      .from("orders")
      .select("id, status, fulfillment_status, product_id")
      .eq("status", "paid")
      .eq("product_id", product.id);

    // Step 3: Find orders with pending_pdf status
    const { data: pendingPdfOrders, error: error2 } = await supabase
      .from("orders")
      .select("id, status, fulfillment_status, product_id")
      .eq("status", "paid")
      .eq("fulfillment_status", "pending_pdf")
      .eq("product_id", product.id);

    // Step 4: The actual query from auto-fulfill
    const { data: autoFulfillQuery, error: error3 } = await supabase
      .from("orders")
      .select(`id, book_id, size, product:product_id (name)`)
      .eq("status", "paid")
      .in("fulfillment_status", ["pending_pdf", "pending_submission"])
      .eq("product_id", product.id)
      .limit(5);

    // Step 5: Check Lulu config
    const luluConfigured = luluClient.isConfigured();

    // Step 6: Actually try calling processAllPendingOrders if requested
    let processResult = null;
    if (req.query.run === 'true') {
      processResult = await processAllPendingOrders({ limit: 1 });
    }

    return res.status(200).json({
      hardcoverProduct: product,
      allPaidHardcoverOrders: allPaidHardcover,
      pendingPdfOrders: pendingPdfOrders,
      autoFulfillQueryResult: autoFulfillQuery,
      luluConfigured,
      processResult,
      errors: {
        error1,
        error2, 
        error3
      }
    });

  } catch (err) {
    return res.status(500).json({ error: err.message, stack: err.stack });
  }
}

module.exports = handler;