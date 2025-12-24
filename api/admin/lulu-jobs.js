// api/admin/lulu-jobs.js
// Admin endpoint to manage Lulu print jobs

const { createClient } = require("@supabase/supabase-js");
const { requireAdmin } = require("./_admin-auth.js");
const { luluClient } = require("../lulu/client.js");

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function handler(req, res) {
  switch (req.method) {
    case "GET":
      return listPrintJobs(req, res);
    case "POST":
      return handleAction(req, res);
    default:
      return res.status(405).json({ error: "Method not allowed" });
  }
}

/**
 * List all print jobs with filtering
 */
async function listPrintJobs(req, res) {
  try {
    const { 
      status, 
      orderId,
      limit = 50,
      offset = 0 
    } = req.query;

    let query = supabase
      .from("lulu_print_jobs")
      .select(`
        *,
        order:order_id (
          id,
          status,
          amount_cents,
          shipping_name,
          shipping_city,
          shipping_country
        )
      `, { count: "exact" })
      .order("created_at", { ascending: false })
      .range(offset, offset + parseInt(limit) - 1);

    if (status) {
      query = query.eq("lulu_status", status);
    }
    if (orderId) {
      query = query.eq("order_id", orderId);
    }

    const { data: jobs, error, count } = await query;

    if (error) throw error;

    // Get book titles
    const bookIds = [...new Set(jobs.map(j => j.book_id).filter(Boolean))];
    let booksMap = {};
    if (bookIds.length > 0) {
      const { data: books } = await supabase
        .from("book_projects")
        .select("id, selected_idea")
        .in("id", bookIds);
      
      books?.forEach(b => {
        booksMap[b.id] = b.selected_idea?.title || 'Untitled';
      });
    }

    const formattedJobs = jobs.map(job => ({
      id: job.id,
      orderId: job.order_id,
      bookId: job.book_id,
      bookTitle: booksMap[job.book_id] || 'Unknown',
      luluPrintJobId: job.lulu_print_job_id,
      luluStatus: job.lulu_status,
      luluStatusMessage: job.lulu_status_message,
      podPackageId: job.pod_package_id,
      pageCount: job.page_count,
      quantity: job.quantity,
      shippingLevel: job.shipping_level,
      shippingName: job.shipping_name,
      shippingCity: job.shipping_city,
      shippingCountry: job.shipping_country_code,
      trackingId: job.tracking_id,
      carrierName: job.carrier_name,
      trackingUrls: job.tracking_urls,
      luluCostCents: job.lulu_cost_cents,
      shippingCostCents: job.shipping_cost_cents,
      totalCostCents: job.total_cost_cents,
      estimatedShipDate: job.estimated_ship_date,
      estimatedDeliveryMin: job.estimated_delivery_min,
      estimatedDeliveryMax: job.estimated_delivery_max,
      createdAt: job.created_at,
      submittedAt: job.submitted_at,
      shippedAt: job.shipped_at,
      errorMessage: job.error_message,
      retryCount: job.retry_count,
      order: job.order,
    }));

    return res.status(200).json({
      jobs: formattedJobs,
      total: count,
      limit: parseInt(limit),
      offset: parseInt(offset),
    });

  } catch (err) {
    console.error("List print jobs error:", err);
    return res.status(500).json({ error: "Failed to fetch print jobs" });
  }
}

/**
 * Handle admin actions on print jobs
 */
async function handleAction(req, res) {
  const { action, printJobId, orderId } = req.body;

  if (!action) {
    return res.status(400).json({ error: "Action required" });
  }

  try {
    switch (action) {
      case "submit":
        return await submitJob(orderId, res);
      
      case "retry":
        return await retryJob(printJobId, res);
      
      case "cancel":
        return await cancelJob(printJobId, res);
      
      case "sync_status":
        return await syncStatus(printJobId, res);
      
      case "sync_all":
        return await syncAllJobs(res);
      
      default:
        return res.status(400).json({ error: `Unknown action: ${action}` });
    }
  } catch (err) {
    console.error(`Action ${action} error:`, err);
    return res.status(500).json({ error: err.message });
  }
}

/**
 * Submit a new print job for an order
 */
async function submitJob(orderId, res) {
  if (!orderId) {
    return res.status(400).json({ error: "Order ID required" });
  }

  const { submitPrintJob } = require("../lulu/submit-print-job.js");
  const result = await submitPrintJob(orderId);
  
  return res.status(200).json(result);
}

/**
 * Retry a failed print job
 */
async function retryJob(printJobId, res) {
  if (!printJobId) {
    return res.status(400).json({ error: "Print job ID required" });
  }

  // Get the print job
  const { data: job, error } = await supabase
    .from("lulu_print_jobs")
    .select("id, order_id, lulu_status")
    .eq("id", printJobId)
    .single();

  if (error || !job) {
    return res.status(404).json({ error: "Print job not found" });
  }

  if (!['error', 'rejected', 'canceled'].includes(job.lulu_status)) {
    return res.status(400).json({ 
      error: `Cannot retry job with status: ${job.lulu_status}` 
    });
  }

  // Resubmit
  const { submitPrintJob } = require("../lulu/submit-print-job.js");
  const result = await submitPrintJob(job.order_id, { forceResubmit: true });
  
  return res.status(200).json(result);
}

/**
 * Cancel a print job (if not yet in production)
 */
async function cancelJob(printJobId, res) {
  if (!printJobId) {
    return res.status(400).json({ error: "Print job ID required" });
  }

  // Get the print job
  const { data: job, error } = await supabase
    .from("lulu_print_jobs")
    .select("id, lulu_print_job_id, lulu_status")
    .eq("id", printJobId)
    .single();

  if (error || !job) {
    return res.status(404).json({ error: "Print job not found" });
  }

  if (!job.lulu_print_job_id) {
    return res.status(400).json({ error: "Job not yet submitted to Lulu" });
  }

  // Check if can be canceled
  const nonCancelableStatuses = ['in_production', 'shipped', 'canceled'];
  if (nonCancelableStatuses.includes(job.lulu_status)) {
    return res.status(400).json({ 
      error: `Cannot cancel job with status: ${job.lulu_status}` 
    });
  }

  // Cancel via Lulu API
  try {
    await luluClient.cancelPrintJob(job.lulu_print_job_id);

    // Update our record
    await supabase
      .from("lulu_print_jobs")
      .update({
        lulu_status: 'canceled',
        lulu_status_changed_at: new Date().toISOString(),
      })
      .eq("id", printJobId);

    return res.status(200).json({ 
      success: true, 
      message: "Print job canceled" 
    });
  } catch (apiError) {
    return res.status(500).json({ 
      error: "Failed to cancel with Lulu",
      details: apiError.message 
    });
  }
}

/**
 * Sync status from Lulu API for a specific job
 */
async function syncStatus(printJobId, res) {
  if (!printJobId) {
    return res.status(400).json({ error: "Print job ID required" });
  }

  const { data: job, error } = await supabase
    .from("lulu_print_jobs")
    .select("id, lulu_print_job_id")
    .eq("id", printJobId)
    .single();

  if (error || !job) {
    return res.status(404).json({ error: "Print job not found" });
  }

  if (!job.lulu_print_job_id) {
    return res.status(400).json({ error: "Job not yet submitted to Lulu" });
  }

  try {
    const luluJob = await luluClient.getPrintJob(job.lulu_print_job_id);
    
    // Update our record
    const updateData = {
      lulu_status: luluJob.status?.name?.toLowerCase(),
      lulu_status_message: luluJob.status?.message,
      lulu_status_changed_at: new Date().toISOString(),
    };

    if (luluJob.estimated_shipping_dates) {
      updateData.estimated_ship_date = luluJob.estimated_shipping_dates.dispatch_min;
      updateData.estimated_delivery_min = luluJob.estimated_shipping_dates.arrival_min;
      updateData.estimated_delivery_max = luluJob.estimated_shipping_dates.arrival_max;
    }

    await supabase
      .from("lulu_print_jobs")
      .update(updateData)
      .eq("id", printJobId);

    return res.status(200).json({
      success: true,
      status: updateData.lulu_status,
      message: updateData.lulu_status_message,
    });

  } catch (apiError) {
    return res.status(500).json({ 
      error: "Failed to sync with Lulu",
      details: apiError.message 
    });
  }
}

/**
 * Sync all active print jobs
 */
async function syncAllJobs(res) {
  // Get all jobs that might need syncing (not shipped/canceled/rejected)
  const { data: jobs, error } = await supabase
    .from("lulu_print_jobs")
    .select("id, lulu_print_job_id, lulu_status")
    .not("lulu_print_job_id", "is", null)
    .not("lulu_status", "in", '("shipped","canceled","rejected")');

  if (error) {
    return res.status(500).json({ error: "Failed to fetch jobs" });
  }

  const results = {
    total: jobs.length,
    synced: 0,
    errors: [],
  };

  for (const job of jobs) {
    try {
      const luluJob = await luluClient.getPrintJob(job.lulu_print_job_id);
      
      const updateData = {
        lulu_status: luluJob.status?.name?.toLowerCase(),
        lulu_status_message: luluJob.status?.message,
        lulu_status_changed_at: new Date().toISOString(),
      };

      if (luluJob.estimated_shipping_dates) {
        updateData.estimated_ship_date = luluJob.estimated_shipping_dates.dispatch_min;
        updateData.estimated_delivery_min = luluJob.estimated_shipping_dates.arrival_min;
        updateData.estimated_delivery_max = luluJob.estimated_shipping_dates.arrival_max;
      }

      // Handle shipped status
      if (luluJob.status?.name?.toLowerCase() === 'shipped') {
        updateData.shipped_at = new Date().toISOString();
        
        const lineItemStatuses = luluJob.status?.line_item_statuses || [];
        if (lineItemStatuses.length > 0 && lineItemStatuses[0].messages) {
          updateData.tracking_id = lineItemStatuses[0].messages.tracking_id;
          updateData.carrier_name = lineItemStatuses[0].messages.carrier_name;
          if (lineItemStatuses[0].messages.tracking_urls) {
            updateData.tracking_urls = Array.isArray(lineItemStatuses[0].messages.tracking_urls)
              ? lineItemStatuses[0].messages.tracking_urls
              : [lineItemStatuses[0].messages.tracking_urls];
          }
        }
      }

      await supabase
        .from("lulu_print_jobs")
        .update(updateData)
        .eq("id", job.id);

      results.synced++;

    } catch (err) {
      results.errors.push({
        jobId: job.id,
        luluId: job.lulu_print_job_id,
        error: err.message,
      });
    }
  }

  return res.status(200).json({
    success: true,
    ...results,
  });
}

module.exports = requireAdmin(handler);
