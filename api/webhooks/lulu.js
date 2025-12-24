// api/webhooks/lulu.js
// Handles webhook events from Lulu Print API
// Receives print job status updates and updates our orders accordingly

const { createClient } = require("@supabase/supabase-js");
const crypto = require("crypto");

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// Helper to get raw body as buffer for HMAC verification
async function getRawBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on("data", (chunk) => chunks.push(chunk));
    req.on("end", () => resolve(Buffer.concat(chunks)));
    req.on("error", reject);
  });
}

/**
 * Verify Lulu webhook HMAC signature
 * Lulu sends HMAC-SHA256 in the Lulu-HMAC-SHA256 header
 * Calculated with API secret as key, raw body as message
 */
function verifyLuluSignature(rawBody, signature, secret) {
  if (!signature || !secret) return false;
  
  const expectedSignature = crypto
    .createHmac("sha256", secret)
    .update(rawBody)
    .digest("hex");
  
  return crypto.timingSafeEqual(
    Buffer.from(signature),
    Buffer.from(expectedSignature)
  );
}

async function handler(req, res) {
  console.log(`[Lulu Webhook] Received: ${req.method}`);

  // Allow OPTIONS for CORS
  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method Not Allowed" });
  }

  let rawBody;
  let payload;

  try {
    // Get raw body for signature verification
    rawBody = await getRawBody(req);
    payload = JSON.parse(rawBody.toString("utf-8"));
  } catch (err) {
    console.error("[Lulu Webhook] Failed to parse body:", err);
    return res.status(400).json({ error: "Invalid request body" });
  }

  // Verify signature if secret is configured
  const luluSecret = process.env.LULU_CLIENT_SECRET;
  const signature = req.headers["lulu-hmac-sha256"];

  let verified = false;
  if (luluSecret && signature) {
    verified = verifyLuluSignature(rawBody, signature, luluSecret);
    if (!verified) {
      console.warn("[Lulu Webhook] HMAC verification failed");
      // Log but don't reject - Lulu might have issues
    }
  }

  // Log the webhook event
  const { data: webhookEvent } = await supabase
    .from("lulu_webhook_events")
    .insert({
      topic: payload.topic,
      print_job_id: payload.data?.id,
      external_id: payload.data?.external_id,
      payload: payload,
      hmac_signature: signature,
      verified: verified,
    })
    .select("id")
    .single();

  console.log(`[Lulu Webhook] Event logged: ${webhookEvent?.id}, Topic: ${payload.topic}`);

  // Process the webhook
  try {
    switch (payload.topic) {
      case "PRINT_JOB_STATUS_CHANGED":
        await handlePrintJobStatusChanged(payload.data);
        break;

      default:
        console.log(`[Lulu Webhook] Unhandled topic: ${payload.topic}`);
    }

    // Mark as processed
    if (webhookEvent?.id) {
      await supabase
        .from("lulu_webhook_events")
        .update({
          processed: true,
          processed_at: new Date().toISOString(),
        })
        .eq("id", webhookEvent.id);
    }

    return res.status(200).json({ received: true });

  } catch (err) {
    console.error(`[Lulu Webhook] Error processing ${payload.topic}:`, err);

    // Log error but return 200 to acknowledge receipt
    if (webhookEvent?.id) {
      await supabase
        .from("lulu_webhook_events")
        .update({
          processed: true,
          processed_at: new Date().toISOString(),
          error_message: err.message,
        })
        .eq("id", webhookEvent.id);
    }

    return res.status(200).json({ received: true, error: err.message });
  }
}

/**
 * Handle PRINT_JOB_STATUS_CHANGED webhook
 * Updates our records with the new status from Lulu
 */
async function handlePrintJobStatusChanged(printJobData) {
  const luluPrintJobId = printJobData.id;
  const externalId = printJobData.external_id;
  const newStatus = printJobData.status?.name?.toLowerCase();
  const statusMessage = printJobData.status?.message;

  console.log(`[Lulu Webhook] Print job ${luluPrintJobId} status: ${newStatus}`);

  // Find our print job record by Lulu ID or external ID (our order ID)
  let query = supabase
    .from("lulu_print_jobs")
    .select("id, order_id");

  if (luluPrintJobId) {
    query = query.eq("lulu_print_job_id", luluPrintJobId);
  } else if (externalId) {
    query = query.eq("external_id", externalId);
  } else {
    throw new Error("No print job identifier in webhook data");
  }

  const { data: printJob, error: findError } = await query.single();

  if (findError || !printJob) {
    console.warn(`[Lulu Webhook] Print job not found for Lulu ID: ${luluPrintJobId}`);
    return;
  }

  // Build update data
  const updateData = {
    lulu_status: newStatus,
    lulu_status_message: statusMessage,
    lulu_status_changed_at: new Date().toISOString(),
  };

  // Handle shipping information
  if (newStatus === "shipped") {
    updateData.shipped_at = new Date().toISOString();

    // Extract tracking info from line item statuses
    const lineItemStatuses = printJobData.status?.line_item_statuses || [];
    if (lineItemStatuses.length > 0) {
      const lineItem = lineItemStatuses[0];
      if (lineItem.messages) {
        updateData.tracking_id = lineItem.messages.tracking_id;
        updateData.carrier_name = lineItem.messages.carrier_name;
        if (lineItem.messages.tracking_urls) {
          updateData.tracking_urls = Array.isArray(lineItem.messages.tracking_urls)
            ? lineItem.messages.tracking_urls
            : [lineItem.messages.tracking_urls];
        }
      }
    }
  }

  // Update estimated dates if available
  if (printJobData.estimated_shipping_dates) {
    updateData.estimated_ship_date = printJobData.estimated_shipping_dates.dispatch_min;
    updateData.estimated_delivery_min = printJobData.estimated_shipping_dates.arrival_min;
    updateData.estimated_delivery_max = printJobData.estimated_shipping_dates.arrival_max;
  }

  // Handle costs if updated
  if (printJobData.costs) {
    updateData.lulu_cost_cents = Math.round(parseFloat(printJobData.costs.total_cost_excl_tax || 0) * 100);
    updateData.shipping_cost_cents = Math.round(parseFloat(printJobData.costs.shipping_cost?.total_cost_excl_tax || 0) * 100);
    updateData.tax_cents = Math.round(parseFloat(printJobData.costs.total_tax || 0) * 100);
    updateData.total_cost_cents = Math.round(parseFloat(printJobData.costs.total_cost_incl_tax || 0) * 100);
  }

  // Update our print job record
  await supabase
    .from("lulu_print_jobs")
    .update(updateData)
    .eq("id", printJob.id);

  // Also update the order's fulfillment status
  if (printJob.order_id) {
    const orderUpdate = {
      lulu_status: newStatus,
    };

    // Map Lulu status to our fulfillment status
    switch (newStatus) {
      case "created":
      case "unpaid":
      case "payment_in_progress":
        orderUpdate.fulfillment_status = "submitted";
        break;
      case "production_delayed":
      case "production_ready":
        orderUpdate.fulfillment_status = "processing";
        break;
      case "in_production":
        orderUpdate.fulfillment_status = "printing";
        break;
      case "shipped":
        orderUpdate.fulfillment_status = "shipped";
        orderUpdate.shipped_at = updateData.shipped_at;
        orderUpdate.shipping_carrier = updateData.carrier_name;
        orderUpdate.tracking_number = updateData.tracking_id;
        if (updateData.tracking_urls?.length > 0) {
          orderUpdate.tracking_url = updateData.tracking_urls[0];
        }
        orderUpdate.estimated_delivery_date = updateData.estimated_delivery_max;
        break;
      case "rejected":
        orderUpdate.fulfillment_status = "failed";
        break;
      case "canceled":
        orderUpdate.fulfillment_status = "cancelled";
        break;
    }

    await supabase
      .from("orders")
      .update(orderUpdate)
      .eq("id", printJob.order_id);

    console.log(`[Lulu Webhook] Order ${printJob.order_id} fulfillment status: ${orderUpdate.fulfillment_status}`);
  }
}

module.exports = handler;

// Disable Vercel's body parsing - we need raw body for HMAC verification
module.exports.config = {
  api: {
    bodyParser: false,
  },
};
