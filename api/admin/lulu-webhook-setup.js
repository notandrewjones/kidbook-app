// api/admin/lulu-webhook-setup.js
// Admin endpoint to setup and manage Lulu webhooks
// This helps you configure the webhook without manually using Lulu's dashboard

const { createClient } = require("@supabase/supabase-js");
const { requireAdmin } = require("./_admin-auth.js");
const { luluClient } = require("../lulu/client.js");

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function handler(req, res) {
  // Check if Lulu is configured
  if (!luluClient.isConfigured()) {
    return res.status(503).json({ 
      error: "Lulu API not configured",
      message: "Set LULU_CLIENT_KEY and LULU_CLIENT_SECRET environment variables"
    });
  }

  switch (req.method) {
    case "GET":
      return listWebhooks(req, res);
    case "POST":
      return handleAction(req, res);
    case "DELETE":
      return deleteWebhook(req, res);
    default:
      return res.status(405).json({ error: "Method not allowed" });
  }
}

/**
 * List all configured webhooks
 */
async function listWebhooks(req, res) {
  try {
    const webhooks = await luluClient.listWebhooks();
    
    // Get our expected webhook URL
    const baseUrl = process.env.VERCEL_URL 
      ? `https://${process.env.VERCEL_URL}` 
      : process.env.BASE_URL || 'http://localhost:3000';
    const expectedUrl = `${baseUrl}/api/webhooks/lulu`;

    return res.status(200).json({
      webhooks: webhooks.results || webhooks,
      expectedUrl,
      isConfigured: (webhooks.results || webhooks).some(w => 
        w.url === expectedUrl && w.is_active
      ),
    });
  } catch (err) {
    console.error("List webhooks error:", err);
    return res.status(500).json({ 
      error: "Failed to list webhooks",
      details: err.message 
    });
  }
}

/**
 * Handle webhook actions
 */
async function handleAction(req, res) {
  const { action, webhookId, url } = req.body;

  try {
    switch (action) {
      case "create": {
        // Get webhook URL
        const baseUrl = process.env.VERCEL_URL 
          ? `https://${process.env.VERCEL_URL}` 
          : process.env.BASE_URL;
        
        if (!baseUrl) {
          return res.status(400).json({ 
            error: "BASE_URL not configured",
            message: "Set VERCEL_URL or BASE_URL environment variable"
          });
        }

        const webhookUrl = url || `${baseUrl}/api/webhooks/lulu`;
        
        console.log(`Creating Lulu webhook for: ${webhookUrl}`);
        
        const result = await luluClient.createWebhook(webhookUrl, [
          'PRINT_JOB_STATUS_CHANGED'
        ]);

        return res.status(200).json({
          success: true,
          message: "Webhook created successfully",
          webhook: result,
        });
      }

      case "activate": {
        if (!webhookId) {
          return res.status(400).json({ error: "webhookId required" });
        }

        const result = await luluClient.updateWebhook(webhookId, {
          is_active: true
        });

        return res.status(200).json({
          success: true,
          message: "Webhook activated",
          webhook: result,
        });
      }

      case "deactivate": {
        if (!webhookId) {
          return res.status(400).json({ error: "webhookId required" });
        }

        const result = await luluClient.updateWebhook(webhookId, {
          is_active: false
        });

        return res.status(200).json({
          success: true,
          message: "Webhook deactivated",
          webhook: result,
        });
      }

      case "test": {
        // Return info about testing
        return res.status(200).json({
          message: "To test the webhook, create a test print job in Lulu's sandbox environment",
          steps: [
            "1. Ensure LULU_USE_SANDBOX=true in environment",
            "2. Create a test order and submit to Lulu",
            "3. Watch the lulu_webhook_events table for incoming events",
            "4. Check server logs for webhook processing"
          ],
          webhookUrl: `${process.env.VERCEL_URL ? 'https://' + process.env.VERCEL_URL : process.env.BASE_URL}/api/webhooks/lulu`
        });
      }

      default:
        return res.status(400).json({ error: `Unknown action: ${action}` });
    }
  } catch (err) {
    console.error(`Webhook action ${action} error:`, err);
    return res.status(500).json({ 
      error: err.message,
      details: err.data || undefined
    });
  }
}

/**
 * Delete a webhook
 */
async function deleteWebhook(req, res) {
  const { webhookId } = req.query;

  if (!webhookId) {
    return res.status(400).json({ error: "webhookId required" });
  }

  try {
    await luluClient.deleteWebhook(webhookId);
    return res.status(200).json({
      success: true,
      message: "Webhook deleted"
    });
  } catch (err) {
    console.error("Delete webhook error:", err);
    return res.status(500).json({ 
      error: "Failed to delete webhook",
      details: err.message 
    });
  }
}

module.exports = requireAdmin(handler);
