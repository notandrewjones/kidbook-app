// api/auth/forgot-password.js
// Request password reset email

const { 
  supabaseAdmin,
  checkRateLimit,
  recordAuthAttempt,
  getClientIP
} = require("../_auth.js");

async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const clientIP = getClientIP(req);
  const { email } = req.body || {};

  if (!email) {
    return res.status(400).json({ error: "Email is required" });
  }

  const normalizedEmail = email.toLowerCase().trim();

  // Rate limiting - be stricter on password reset
  const rateCheck = checkRateLimit(`reset:${clientIP}`);
  if (!rateCheck.allowed) {
    // Still return success message to prevent email enumeration
    return res.status(200).json({
      success: true,
      message: "If an account exists with this email, you will receive a password reset link."
    });
  }

  try {
    recordAuthAttempt(`reset:${clientIP}`);

    // Get the origin for the redirect URL
    const origin = req.headers.origin || 
                   req.headers.referer?.split('/').slice(0, 3).join('/') ||
                   process.env.SITE_URL ||
                   'http://localhost:3000';

    // Request password reset from Supabase
    const { error } = await supabaseAdmin.auth.resetPasswordForEmail(
      normalizedEmail,
      {
        redirectTo: `${origin}/reset-password`
      }
    );

    if (error) {
      console.error("Password reset error:", error);
      // Don't reveal if email exists
    }

    // Always return success to prevent email enumeration
    return res.status(200).json({
      success: true,
      message: "If an account exists with this email, you will receive a password reset link."
    });

  } catch (err) {
    console.error("Password reset fatal error:", err);
    
    // Still return success
    return res.status(200).json({
      success: true,
      message: "If an account exists with this email, you will receive a password reset link."
    });
  }
}

module.exports = handler;
