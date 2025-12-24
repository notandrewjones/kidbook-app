// api/cron/process-print-orders.js
// Cron job to automatically process pending hardcover orders
// 
// This endpoint is called every 10 minutes by Vercel Cron
// It finds pending orders and fully automates:
// 1. PDF generation (interior + cover)
// 2. Upload to storage
// 3. Submission to Lulu
//
// Configure in vercel.json:
// {
//   "crons": [{
//     "path": "/api/cron/process-print-orders",
//     "schedule": "*/10 * * * *"
//   }]
// }

const { processAllPendingOrders } = require("../lulu/auto-fulfill.js");
const { luluClient } = require("../lulu/client.js");

async function handler(req, res) {
  // Verify this is a legitimate cron call
  const isVercelCron = req.headers['x-vercel-cron'] === '1';
  const cronSecret = process.env.CRON_SECRET;
  const authHeader = req.headers.authorization;
  const hasValidSecret = cronSecret && authHeader === `Bearer ${cronSecret}`;
  
  if (!isVercelCron && !hasValidSecret) {
    if (process.env.NODE_ENV === 'production') {
      return res.status(401).json({ error: 'Unauthorized' });
    }
  }

  console.log('[Cron] Starting print order processing...');

  try {
    // Check if Lulu is configured
    if (!luluClient.isConfigured()) {
      console.log('[Cron] Lulu API not configured, skipping');
      return res.status(200).json({ 
        message: 'Lulu API not configured',
        configured: false,
      });
    }

    // Process all pending orders
    const result = await processAllPendingOrders({ limit: 5 });

    console.log('[Cron] Processing complete:', result);

    return res.status(200).json({
      success: true,
      ...result,
    });

  } catch (err) {
    console.error('[Cron] Fatal error:', err);
    return res.status(500).json({
      success: false,
      error: err.message,
    });
  }
}

module.exports = handler;

// Vercel config for longer timeout (PDF generation can take time)
module.exports.config = {
  maxDuration: 300, // 5 minutes
};
