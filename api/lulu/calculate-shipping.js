// api/lulu/calculate-shipping.js
// Calculate print and shipping costs from Lulu API
// Used during checkout to show accurate shipping options

const { createClient } = require("@supabase/supabase-js");
const { getCurrentUser } = require("../_auth.js");
const { luluClient, SHIPPING_LEVELS, POD_PACKAGE_IDS } = require("./client.js");

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  // Check if Lulu is configured
  if (!luluClient.isConfigured()) {
    return res.status(503).json({ 
      error: "Print service not configured",
      message: "Lulu API credentials not set up"
    });
  }

  const { user, error: authError } = await getCurrentUser(req, res);

  if (!user) {
    return res.status(401).json({
      error: "Unauthorized",
      message: authError || "Please log in",
    });
  }

  const { items, shippingAddress } = req.body;

  // Validate input
  if (!items || !Array.isArray(items) || items.length === 0) {
    return res.status(400).json({ error: "No items provided" });
  }

  if (!shippingAddress) {
    return res.status(400).json({ error: "Shipping address required" });
  }

  // Validate required address fields
  const requiredFields = ['street1', 'city', 'postcode', 'countryCode'];
  const missingFields = requiredFields.filter(f => !shippingAddress[f]);
  if (missingFields.length > 0) {
    return res.status(400).json({ 
      error: "Missing address fields",
      missing: missingFields 
    });
  }

  try {
    // Get POD package mappings from database
    const { data: podPackages } = await supabase
      .from("lulu_pod_packages")
      .select("size_code, pod_package_id")
      .eq("is_active", true);

    const packageMap = {};
    podPackages?.forEach(p => {
      packageMap[p.size_code] = p.pod_package_id;
    });

    // Build line items for Lulu
    const lineItems = [];
    
    for (const item of items) {
      // Get the POD package ID for this size
      let podPackageId = packageMap[item.sizeCode];
      
      // Fallback to hardcoded mappings if not in DB
      if (!podPackageId) {
        podPackageId = POD_PACKAGE_IDS[item.sizeCode];
      }

      if (!podPackageId) {
        return res.status(400).json({ 
          error: `Unknown size code: ${item.sizeCode}`,
          validSizes: Object.keys(packageMap)
        });
      }

      lineItems.push({
        pod_package_id: podPackageId,
        page_count: item.pageCount || 32, // Default to 32 pages for children's books
        quantity: item.quantity || 1,
      });
    }

    // Calculate costs for all shipping levels
    const shippingOptions = [];
    const errors = [];

    for (const level of Object.values(SHIPPING_LEVELS)) {
      try {
        const cost = await luluClient.calculateCost(
          lineItems,
          shippingAddress,
          level.id
        );

        shippingOptions.push({
          level: level.id,
          name: level.name,
          description: level.description,
          estimatedDays: level.estimatedDays,
          currency: cost.currency,
          // Costs in cents
          printCostCents: Math.round(parseFloat(cost.total_cost_excl_tax || 0) * 100),
          shippingCostCents: Math.round(parseFloat(cost.shipping_cost?.total_cost_excl_tax || 0) * 100),
          taxCents: Math.round(parseFloat(cost.total_tax || 0) * 100),
          totalCostCents: Math.round(parseFloat(cost.total_cost_incl_tax || 0) * 100),
          // Formatted for display
          printCost: `$${(parseFloat(cost.total_cost_excl_tax || 0)).toFixed(2)}`,
          shippingCost: `$${(parseFloat(cost.shipping_cost?.total_cost_excl_tax || 0)).toFixed(2)}`,
          tax: `$${(parseFloat(cost.total_tax || 0)).toFixed(2)}`,
          totalCost: `$${(parseFloat(cost.total_cost_incl_tax || 0)).toFixed(2)}`,
          // Line item details
          lineItemCosts: cost.line_item_costs,
          // Estimated dates if available
          estimatedShipping: cost.estimated_shipping_dates || null,
        });
      } catch (err) {
        console.error(`Error calculating ${level.id} shipping:`, err);
        errors.push({
          level: level.id,
          error: err.message,
        });
      }
    }

    // Sort by cost
    shippingOptions.sort((a, b) => a.totalCostCents - b.totalCostCents);

    // Check for address suggestions/warnings
    const addressWarnings = shippingOptions[0]?.lineItemCosts?.[0]?.warnings || [];
    const suggestedAddress = shippingOptions[0]?.lineItemCosts?.[0]?.suggested_address || null;

    return res.status(200).json({
      success: true,
      options: shippingOptions,
      errors: errors.length > 0 ? errors : undefined,
      address: {
        provided: shippingAddress,
        warnings: addressWarnings,
        suggested: suggestedAddress,
      },
    });

  } catch (err) {
    console.error("Calculate shipping error:", err);
    return res.status(500).json({ 
      error: "Failed to calculate shipping",
      details: err.message,
    });
  }
}

module.exports = handler;
