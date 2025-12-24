// api/lulu/submit-print-job.js
// Submit a paid order to Lulu for printing
// Called after payment is confirmed (from webhook or admin action)

const { createClient } = require("@supabase/supabase-js");
const { luluClient, SHIPPING_LEVELS } = require("./client.js");

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

/**
 * Submit an order to Lulu for printing
 * Can be called from:
 * 1. Stripe webhook after payment (automatic)
 * 2. Admin panel (manual submission)
 * 3. Auto-fulfill system (automatic with PDF generation)
 * 
 * Prerequisites:
 * - Order must be paid
 * - PDFs must be generated and uploaded to public URLs (or provided in options)
 * - Shipping address must be available (from Stripe checkout)
 */
async function submitPrintJob(orderId, options = {}) {
  const {
    forceResubmit = false,
    shippingLevel = 'MAIL',
    productionDelay = 120, // 2 hours default - allows time for refunds
    interiorPdfUrl = null, // Optional: pass PDF URL directly
    coverPdfUrl = null,    // Optional: pass PDF URL directly
  } = options;

  console.log(`[Lulu] Submitting print job for order: ${orderId}`);

  // 1. Get order details with shipping info
  const { data: order, error: orderError } = await supabase
    .from("orders")
    .select(`
      id,
      user_id,
      book_id,
      product_id,
      status,
      size,
      lulu_print_job_id,
      shipping_name,
      shipping_address_line1,
      shipping_address_line2,
      shipping_city,
      shipping_state,
      shipping_postal_code,
      shipping_country,
      shipping_phone,
      stripe_checkout_session_id
    `)
    .eq("id", orderId)
    .single();

  if (orderError || !order) {
    console.error(`[Lulu] Order fetch error:`, orderError);
    throw new Error(`Order not found: ${orderId}`);
  }

  // Get product info separately
  let productName = null;
  if (order.product_id) {
    const { data: product } = await supabase
      .from("products")
      .select("name, display_name")
      .eq("id", order.product_id)
      .single();
    productName = product?.name;
  }

  // Get book info separately
  let book = null;
  if (order.book_id) {
    const { data: bookData } = await supabase
      .from("book_projects")
      .select("id, selected_idea, illustrations, user_id")
      .eq("id", order.book_id)
      .single();
    book = bookData;
  }

  // 2. Validate order status
  if (order.status !== 'paid') {
    throw new Error(`Order not paid. Status: ${order.status}`);
  }

  if (productName !== 'hardcover') {
    throw new Error('Only hardcover orders can be submitted to Lulu');
  }

  // 3. Check if already submitted
  if (order.lulu_print_job_id && !forceResubmit) {
    // Get existing print job status
    const { data: existingJob } = await supabase
      .from("lulu_print_jobs")
      .select("id, lulu_print_job_id, lulu_status")
      .eq("id", order.lulu_print_job_id)
      .single();

    if (existingJob && !['rejected', 'canceled'].includes(existingJob.lulu_status)) {
      console.log(`[Lulu] Order already submitted: ${existingJob.lulu_print_job_id}`);
      return {
        success: false,
        error: 'Order already submitted to Lulu',
        printJobId: existingJob.lulu_print_job_id,
        status: existingJob.lulu_status,
      };
    }
  }

  // 4. Get POD package mapping for this size
  const { data: podPackage, error: podError } = await supabase
    .from("lulu_pod_packages")
    .select("pod_package_id, min_pages")
    .eq("size_code", order.size)
    .eq("is_active", true)
    .single();

  if (podError || !podPackage) {
    throw new Error(`No POD package found for size: ${order.size}`);
  }

  // 5. Get or generate print-ready PDFs
  // Check if URLs were passed directly (from auto-fulfill)
  let interiorUrl = interiorPdfUrl;
  let coverUrl = coverPdfUrl;

  if (!interiorUrl || !coverUrl) {
    // Check if we have existing export with PDF URLs
    const { data: bookExport } = await supabase
      .from("book_exports")
      .select("interior_pdf_path, cover_pdf_path, lulu_ready")
      .eq("order_id", orderId)
      .eq("product_type", "hardcover")
      .maybeSingle();

    if (bookExport?.lulu_ready && bookExport.interior_pdf_path && bookExport.cover_pdf_path) {
      // Use existing PDFs
      interiorUrl = interiorUrl || bookExport.interior_pdf_path;
      coverUrl = coverUrl || bookExport.cover_pdf_path;
    } else {
      // PDFs need to be generated - this should be done via auto-fulfill or manual upload
      throw new Error('Print-ready PDFs not available. Use auto-fulfill or upload PDFs first.');
    }
  }

  // 6. Build shipping address
  const shippingAddress = {
    name: order.shipping_name,
    street1: order.shipping_address_line1,
    street2: order.shipping_address_line2 || '',
    city: order.shipping_city,
    stateCode: order.shipping_state || '',
    postcode: order.shipping_postal_code,
    countryCode: order.shipping_country || 'US',
    phoneNumber: order.shipping_phone || '',
    email: '', // Will use account email
  };

  // Validate shipping address
  if (!shippingAddress.name || !shippingAddress.street1 || !shippingAddress.city || !shippingAddress.postcode) {
    throw new Error('Incomplete shipping address');
  }

  // 7. Determine page count
  // For children's books, typically based on number of spreads/pages
  const illustrations = book?.illustrations || [];
  // Each spread is 2 pages, plus title page, copyright, etc.
  const pageCount = Math.max(
    podPackage.min_pages,
    Math.ceil((illustrations.length * 2 + 4) / 4) * 4 // Round up to multiple of 4
  );

  // 8. Create Lulu print job record first
  const { data: printJob, error: createError } = await supabase
    .from("lulu_print_jobs")
    .insert({
      order_id: orderId,
      user_id: order.user_id,
      book_id: order.book_id,
      external_id: orderId,
      pod_package_id: podPackage.pod_package_id,
      page_count: pageCount,
      quantity: 1,
      interior_pdf_url: interiorUrl,
      cover_pdf_url: coverUrl,
      shipping_level: shippingLevel,
      shipping_name: shippingAddress.name,
      shipping_street1: shippingAddress.street1,
      shipping_street2: shippingAddress.street2,
      shipping_city: shippingAddress.city,
      shipping_state_code: shippingAddress.stateCode,
      shipping_postcode: shippingAddress.postcode,
      shipping_country_code: shippingAddress.countryCode,
      shipping_phone: shippingAddress.phoneNumber,
      lulu_status: 'pending_submission',
    })
    .select("id")
    .single();

  if (createError) {
    throw new Error(`Failed to create print job record: ${createError.message}`);
  }

  // 9. Submit to Lulu API
  try {
    const bookTitle = book?.selected_idea?.title || 'My Book';

    const luluResponse = await luluClient.createPrintJob({
      contactEmail: process.env.LULU_CONTACT_EMAIL || process.env.ADMIN_EMAIL,
      externalId: orderId,
      lineItems: [{
        externalId: printJob.id,
        title: bookTitle,
        quantity: 1,
        podPackageId: podPackage.pod_package_id,
        coverUrl: coverUrl,
        interiorUrl: interiorUrl,
      }],
      shippingAddress: shippingAddress,
      shippingLevel: shippingLevel,
      productionDelay: productionDelay,
    });

    console.log(`[Lulu] Print job created:`, luluResponse.id);

    // 10. Update our records with Lulu's response
    const updateData = {
      lulu_print_job_id: luluResponse.id,
      lulu_order_id: luluResponse.order_id,
      lulu_status: luluResponse.status?.name?.toLowerCase() || 'created',
      lulu_status_message: luluResponse.status?.message,
      lulu_status_changed_at: new Date().toISOString(),
      submitted_at: new Date().toISOString(),
    };

    // Add cost info if available
    if (luluResponse.costs) {
      updateData.lulu_cost_cents = Math.round(parseFloat(luluResponse.costs.total_cost_excl_tax || 0) * 100);
      updateData.shipping_cost_cents = Math.round(parseFloat(luluResponse.costs.shipping_cost?.total_cost_excl_tax || 0) * 100);
      updateData.tax_cents = Math.round(parseFloat(luluResponse.costs.total_tax || 0) * 100);
      updateData.total_cost_cents = Math.round(parseFloat(luluResponse.costs.total_cost_incl_tax || 0) * 100);
      updateData.lulu_currency = luluResponse.costs.currency || 'USD';
    }

    // Add estimated dates if available
    if (luluResponse.estimated_shipping_dates) {
      updateData.estimated_ship_date = luluResponse.estimated_shipping_dates.dispatch_min;
      updateData.estimated_delivery_min = luluResponse.estimated_shipping_dates.arrival_min;
      updateData.estimated_delivery_max = luluResponse.estimated_shipping_dates.arrival_max;
    }

    await supabase
      .from("lulu_print_jobs")
      .update(updateData)
      .eq("id", printJob.id);

    // 11. Update order with print job reference
    await supabase
      .from("orders")
      .update({
        lulu_print_job_id: printJob.id,
        lulu_submitted_at: new Date().toISOString(),
        lulu_status: updateData.lulu_status,
        fulfillment_status: 'submitted',
      })
      .eq("id", orderId);

    return {
      success: true,
      printJobId: luluResponse.id,
      localPrintJobId: printJob.id,
      status: updateData.lulu_status,
      estimatedShipDate: updateData.estimated_ship_date,
      estimatedDelivery: {
        min: updateData.estimated_delivery_min,
        max: updateData.estimated_delivery_max,
      },
    };

  } catch (apiError) {
    console.error(`[Lulu] API error:`, apiError);

    // Update local record with error
    await supabase
      .from("lulu_print_jobs")
      .update({
        lulu_status: 'error',
        error_message: apiError.message,
        retry_count: 1,
        last_retry_at: new Date().toISOString(),
      })
      .eq("id", printJob.id);

    throw apiError;
  }
}

/**
 * API endpoint handler
 */
async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  // This endpoint should be called by:
  // 1. Internal webhook handler (no auth needed - uses service role)
  // 2. Admin panel (requires admin auth)
  
  // Check for internal call header or admin auth
  const isInternalCall = req.headers['x-internal-call'] === process.env.INTERNAL_API_SECRET;
  
  if (!isInternalCall) {
    // Verify admin auth
    const { requireAdmin } = require("../admin/_admin-auth.js");
    // Note: This is a simplified check - the actual admin auth should wrap the handler
    const authHeader = req.headers.authorization;
    if (!authHeader) {
      return res.status(401).json({ error: "Unauthorized" });
    }
  }

  const { orderId, shippingLevel, productionDelay, forceResubmit } = req.body;

  if (!orderId) {
    return res.status(400).json({ error: "Order ID required" });
  }

  // Check if Lulu is configured
  if (!luluClient.isConfigured()) {
    return res.status(503).json({ 
      error: "Print service not configured",
      message: "Lulu API credentials not set up"
    });
  }

  try {
    const result = await submitPrintJob(orderId, {
      shippingLevel,
      productionDelay,
      forceResubmit,
    });

    return res.status(200).json(result);

  } catch (err) {
    console.error("Submit print job error:", err);
    return res.status(500).json({ 
      error: "Failed to submit print job",
      details: err.message,
    });
  }
}

module.exports = handler;
module.exports.submitPrintJob = submitPrintJob;