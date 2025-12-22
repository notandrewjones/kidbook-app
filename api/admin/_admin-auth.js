// api/admin/_admin-auth.js
// Admin authentication middleware

const { createClient } = require("@supabase/supabase-js");
const { getCurrentUser } = require("../_auth.js");

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// List of admin email addresses
// In production, you might want to store this in a database table
const ADMIN_EMAILS = [
  process.env.ADMIN_EMAIL, // Set this in your Vercel environment variables
].filter(Boolean);

/**
 * Check if the current user is an admin
 */
async function isAdmin(req, res) {
  const { user, error } = await getCurrentUser(req, res);
  
  if (!user) {
    return { isAdmin: false, error: error || "Not authenticated" };
  }

  // Check if user's email is in the admin list
  if (!ADMIN_EMAILS.includes(user.email)) {
    return { isAdmin: false, user, error: `Not authorized as admin. Your email: ${user.email}` };
  }

  return { isAdmin: true, user, error: null };
}

/**
 * Middleware wrapper for admin-only endpoints
 */
function requireAdmin(handler) {
  return async (req, res) => {
    const { isAdmin: authorized, user, error } = await isAdmin(req, res);
    
    if (!authorized) {
      return res.status(403).json({ 
        error: "Forbidden", 
        message: error || "Admin access required",
        debug: {
          userEmail: user?.email,
          adminEmailConfigured: ADMIN_EMAILS.length > 0,
        }
      });
    }

    // Add user to request for use in handler
    req.adminUser = user;
    return handler(req, res);
  };
}

module.exports = { isAdmin, requireAdmin, ADMIN_EMAILS };