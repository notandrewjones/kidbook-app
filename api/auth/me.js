// api/auth/me.js
// Get current user session - validates and refreshes tokens if needed

const { getCurrentUser } = require("../_auth.js");

async function handler(req, res) {
  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const { user, error } = await getCurrentUser(req, res);

    if (!user) {
      return res.status(401).json({
        authenticated: false,
        error: error || "Not authenticated"
      });
    }

    return res.status(200).json({
      authenticated: true,
      user: {
        id: user.id,
        email: user.email,
        name: user.user_metadata?.name || null,
        emailVerified: !!user.email_confirmed_at,
        createdAt: user.created_at
      }
    });

  } catch (err) {
    console.error("Session check error:", err);
    return res.status(500).json({
      authenticated: false,
      error: "Session check failed"
    });
  }
}

module.exports = handler;
