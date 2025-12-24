// api/lulu/auto-fulfill.js
// Automatic print fulfillment: Generate PDFs, upload, and submit to Lulu
// This is the core automation that makes the whole flow hands-off

const { createClient } = require("@supabase/supabase-js");
const { S3Client, PutObjectCommand } = require("@aws-sdk/client-s3");
const { generateInteriorPdf, generateCoverPdf } = require("./generate-print-pdf.js");
const { submitPrintJob } = require("./submit-print-job.js");

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// R2 client setup
const r2Client = new S3Client({
  region: "auto",
  endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId: process.env.R2_ACCESS_KEY_ID,
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
  },
});

const R2_BUCKET = process.env.R2_BUCKET_NAME || "book-images";
const R2_PUBLIC_URL = process.env.R2_PUBLIC_URL;

/**
 * Upload a buffer to R2
 */
async function uploadToR2(filePath, buffer, contentType) {
  const command = new PutObjectCommand({
    Bucket: R2_BUCKET,
    Key: filePath,
    Body: buffer,
    ContentType: contentType,
  });

  await r2Client.send(command);
  return `${R2_PUBLIC_URL}/${filePath}`;
}

/**
 * Fully automatic fulfillment for a single order
 * 
 * Steps:
 * 1. Validate order is ready for fulfillment
 * 2. Generate interior PDF (all book pages)
 * 3. Generate cover PDF (wraparound)
 * 4. Upload both PDFs to storage
 * 5. Update book_exports with PDF URLs
 * 6. Submit print job to Lulu
 * 7. Update order status
 */
async function autoFulfillOrder(orderId, options = {}) {
  const { 
    shippingLevel = 'MAIL',
    productionDelay = 120,
    forceRegenerate = false,
  } = options;

  console.log(`[AutoFulfill] Starting fulfillment for order ${orderId}`);

  try {
    // Step 1: Get order and validate
    const { data: order, error: orderError } = await supabase
      .from("orders")
      .select(`
        id,
        user_id,
        book_id,
        status,
        size,
        fulfillment_status,
        product:product_id (name)
      `)
      .eq("id", orderId)
      .single();

    if (orderError || !order) {
      throw new Error(`Order not found: ${orderId}`);
    }

    if (order.status !== 'paid') {
      throw new Error(`Order not paid: ${order.status}`);
    }

    if (order.product?.name !== 'hardcover') {
      throw new Error(`Not a hardcover order: ${order.product?.name}`);
    }

    // Check if already submitted
    if (order.fulfillment_status === 'submitted' || order.fulfillment_status === 'shipped') {
      console.log(`[AutoFulfill] Order ${orderId} already submitted, skipping`);
      return { success: true, skipped: true, message: 'Already submitted' };
    }

    const bookId = order.book_id;
    const sizeCode = order.size || 'square-medium';

    console.log(`[AutoFulfill] Processing book ${bookId} with size ${sizeCode}`);

    // Step 2: Check for existing PDFs or generate new ones
    const { data: existingExport } = await supabase
      .from("book_exports")
      .select("id, interior_pdf_path, cover_pdf_path")
      .eq("order_id", orderId)
      .eq("product_type", "hardcover")
      .maybeSingle();

    let interiorUrl = existingExport?.interior_pdf_path;
    let coverUrl = existingExport?.cover_pdf_path;

    // Generate PDFs if needed
    if (!interiorUrl || !coverUrl || forceRegenerate) {
      console.log(`[AutoFulfill] Generating PDFs for order ${orderId}`);

      // Update status
      await supabase
        .from("orders")
        .update({ fulfillment_status: 'generating' })
        .eq("id", orderId);

      // Generate interior PDF
      console.log(`[AutoFulfill] Generating interior PDF...`);
      const interiorResult = await generateInteriorPdf(bookId, { sizeCode });
      console.log(`[AutoFulfill] Interior PDF generated: ${interiorResult.pageCount} pages`);

      // Generate cover PDF  
      console.log(`[AutoFulfill] Generating cover PDF...`);
      const coverResult = await generateCoverPdf(bookId, { 
        sizeCode,
        pageCount: interiorResult.pageCount,
      });
      console.log(`[AutoFulfill] Cover PDF generated: ${coverResult.dimensions.width}x${coverResult.dimensions.height}pt`);

      // Step 3: Upload PDFs to R2 storage
      console.log(`[AutoFulfill] Uploading PDFs to R2...`);
      
      const timestamp = Date.now();
      const interiorPath = `print-pdfs/${order.user_id}/${bookId}/interior-${timestamp}.pdf`;
      const coverPath = `print-pdfs/${order.user_id}/${bookId}/cover-${timestamp}.pdf`;

      // Upload interior to R2
      try {
        interiorUrl = await uploadToR2(interiorPath, interiorResult.buffer, 'application/pdf');
      } catch (uploadErr) {
        throw new Error(`Failed to upload interior PDF: ${uploadErr.message}`);
      }

      // Upload cover to R2
      try {
        coverUrl = await uploadToR2(coverPath, coverResult.buffer, 'application/pdf');
      } catch (uploadErr) {
        throw new Error(`Failed to upload cover PDF: ${uploadErr.message}`);
      }

      console.log(`[AutoFulfill] PDFs uploaded successfully`);
      console.log(`[AutoFulfill] Interior: ${interiorUrl}`);
      console.log(`[AutoFulfill] Cover: ${coverUrl}`);

      // Step 4: Update book_exports record
      if (existingExport) {
        await supabase
          .from("book_exports")
          .update({
            interior_pdf_path: interiorUrl,
            cover_pdf_path: coverUrl,
            lulu_ready: true,
          })
          .eq("id", existingExport.id);
      } else {
        await supabase
          .from("book_exports")
          .insert({
            book_id: bookId,
            order_id: orderId,
            user_id: order.user_id,
            product_type: 'hardcover',
            interior_pdf_path: interiorUrl,
            cover_pdf_path: coverUrl,
            lulu_ready: true,
            download_count: 0,
            max_downloads: 5,
          });
      }
    } else {
      console.log(`[AutoFulfill] Using existing PDFs for order ${orderId}`);
    }

    // Step 5: Submit to Lulu
    console.log(`[AutoFulfill] Submitting to Lulu...`);
    
    await supabase
      .from("orders")
      .update({ fulfillment_status: 'submitting' })
      .eq("id", orderId);

    const submitResult = await submitPrintJob(orderId, {
      shippingLevel,
      productionDelay,
      interiorPdfUrl: interiorUrl,
      coverPdfUrl: coverUrl,
    });

    if (!submitResult.success) {
      throw new Error(submitResult.error || 'Failed to submit to Lulu');
    }

    console.log(`[AutoFulfill] Order ${orderId} submitted successfully!`);
    console.log(`[AutoFulfill] Lulu Print Job ID: ${submitResult.luluPrintJobId}`);

    return {
      success: true,
      orderId,
      bookId,
      luluPrintJobId: submitResult.luluPrintJobId,
      interiorUrl,
      coverUrl,
    };

  } catch (error) {
    console.error(`[AutoFulfill] Error processing order ${orderId}:`, error);

    // Update order with error status
    await supabase
      .from("orders")
      .update({ 
        fulfillment_status: 'error',
        fulfillment_error: error.message,
      })
      .eq("id", orderId);

    return {
      success: false,
      orderId,
      error: error.message,
    };
  }
}

/**
 * Process all pending orders
 * Called by cron job
 */
async function processAllPendingOrders(options = {}) {
  const { limit = 5 } = options;

  console.log(`[AutoFulfill] Checking for pending orders...`);

  // Get hardcover product ID first
  const hardcoverProductId = await getHardcoverProductId();
  
  if (!hardcoverProductId) {
    console.log(`[AutoFulfill] No hardcover product found in database`);
    return { success: true, processed: 0, results: [], message: 'No hardcover product configured' };
  }

  // Find orders ready for processing
  const { data: pendingOrders, error } = await supabase
    .from("orders")
    .select(`
      id,
      book_id,
      size,
      product:product_id (name)
    `)
    .eq("status", "paid")
    .in("fulfillment_status", ["pending_pdf", "pending_submission"])
    .eq("product_id", hardcoverProductId)
    .limit(limit);

  if (error) {
    console.error(`[AutoFulfill] Failed to fetch pending orders:`, error);
    return { success: false, error: error.message };
  }

  if (!pendingOrders || pendingOrders.length === 0) {
    console.log(`[AutoFulfill] No pending orders found`);
    return { success: true, processed: 0, results: [] };
  }

  console.log(`[AutoFulfill] Found ${pendingOrders.length} pending orders`);

  const results = [];
  for (const order of pendingOrders) {
    const result = await autoFulfillOrder(order.id);
    results.push(result);
    
    // Small delay between orders to avoid rate limits
    await new Promise(r => setTimeout(r, 1000));
  }

  const successful = results.filter(r => r.success && !r.skipped).length;
  const failed = results.filter(r => !r.success).length;
  const skipped = results.filter(r => r.skipped).length;

  console.log(`[AutoFulfill] Complete: ${successful} submitted, ${failed} failed, ${skipped} skipped`);

  return {
    success: true,
    processed: results.length,
    successful,
    failed,
    skipped,
    results,
  };
}

/**
 * Get the hardcover product ID
 */
async function getHardcoverProductId() {
  const { data } = await supabase
    .from("products")
    .select("id")
    .eq("name", "hardcover")
    .single();
  
  return data?.id;
}

module.exports = {
  autoFulfillOrder,
  processAllPendingOrders,
};