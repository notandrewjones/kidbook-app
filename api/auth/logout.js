// api/auth/logout.js
// Secure logout endpoint

const { 
  supabaseAdmin,
  parseCookies,
  clearAuthCookies,
  getCurrentUser
} = require("../_auth.js");

async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const cookies = parseCookies(req.headers.cookie);
    const accessToken = cookies['sb-access-token'];

    // Revoke the session on Supabase side if we have a token
    if (accessToken) {
      try {
        // Get user to log the logout event
        const { user } = await getCurrentUser(req, res);
        
        // Sign out the session on Supabase
        await supabaseAdmin.auth.admin.signOut(accessToken);
        
        if (user) {
          console.log("Logout success:", {
            userId: user.id,
            email: user.email,
            timestamp: new Date().toISOString()
          });
        }
      } catch (signOutError) {
        // Log but don't fail - we still want to clear cookies
        console.warn("Supabase signout warning:", signOutError.message);
      }
    }

    // Always clear cookies
    clearAuthCookies(res);

    return res.status(200).json({
      success: true,
      message: "Logged out successfully"
    });

  } catch (err) {
    console.error("Logout error:", err);
    
    // Still clear cookies even on error
    clearAuthCookies(res);
    
    return res.status(200).json({
      success: true,
      message: "Logged out"
    });
  }
}

module.exports = handler;
