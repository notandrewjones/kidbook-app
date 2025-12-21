// api/auth/update-password.js
// Update password for authenticated user (after reset or manual change)

const { 
  supabaseAdmin,
  getCurrentUser,
  setAuthCookies,
  parseCookies
} = require("../_auth.js");

async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { password, accessToken: bodyToken } = req.body || {};

  if (!password) {
    return res.status(400).json({ error: "New password is required" });
  }

  // Password strength validation
  if (password.length < 8) {
    return res.status(400).json({ 
      error: "Password must be at least 8 characters" 
    });
  }

  if (!/\d/.test(password) || !/[a-zA-Z]/.test(password)) {
    return res.status(400).json({ 
      error: "Password must contain at least one letter and one number" 
    });
  }

  try {
    // Check for token from password reset flow (passed in body)
    // or from existing session (in cookies)
    const cookies = parseCookies(req.headers.cookie);
    const accessToken = bodyToken || cookies['sb-access-token'];

    if (!accessToken) {
      return res.status(401).json({ 
        error: "Not authenticated. Please log in or use the reset link." 
      });
    }

    // Update password using admin API
    const { data: { user }, error: getUserError } = await supabaseAdmin.auth.getUser(accessToken);
    
    if (getUserError || !user) {
      return res.status(401).json({ 
        error: "Invalid or expired session" 
      });
    }

    // Update the user's password
    const { data, error } = await supabaseAdmin.auth.admin.updateUserById(
      user.id,
      { password }
    );

    if (error) {
      console.error("Password update error:", error);
      return res.status(400).json({ 
        error: error.message || "Failed to update password" 
      });
    }

    // If this was a reset flow (token in body), create a new session
    if (bodyToken) {
      const { data: signInData, error: signInError } = await supabaseAdmin.auth.signInWithPassword({
        email: user.email,
        password
      });

      if (!signInError && signInData.session) {
        setAuthCookies(res, signInData.session);
      }
    }

    console.log("Password updated for user:", user.id);

    return res.status(200).json({
      success: true,
      message: "Password updated successfully"
    });

  } catch (err) {
    console.error("Password update fatal error:", err);
    return res.status(500).json({ 
      error: "An error occurred updating password" 
    });
  }
}

module.exports = handler;
