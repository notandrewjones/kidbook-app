// api/auth/login.js
// Secure login endpoint with rate limiting

const { 
  supabaseAuth, 
  setAuthCookies, 
  checkRateLimit, 
  recordAuthAttempt,
  clearAuthAttempts,
  getClientIP 
} = require("../_auth.js");

async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const clientIP = getClientIP(req);
  const { email, password } = req.body || {};

  // Validate inputs
  if (!email || !password) {
    return res.status(400).json({ error: "Email and password are required" });
  }

  const normalizedEmail = email.toLowerCase().trim();
  
  // Rate limiting check - use both IP and email to prevent targeted attacks
  const ipRateCheck = checkRateLimit(`login:ip:${clientIP}`);
  const emailRateCheck = checkRateLimit(`login:email:${normalizedEmail}`);
  
  if (!ipRateCheck.allowed) {
    return res.status(429).json({ 
      error: "Too many login attempts. Please try again later.",
      retryAfter: ipRateCheck.retryAfter 
    });
  }
  
  if (!emailRateCheck.allowed) {
    return res.status(429).json({ 
      error: "Too many login attempts for this account. Please try again later.",
      retryAfter: emailRateCheck.retryAfter 
    });
  }

  try {
    // Record attempt before trying
    recordAuthAttempt(`login:ip:${clientIP}`);
    recordAuthAttempt(`login:email:${normalizedEmail}`);

    // Authenticate with Supabase
    const { data, error } = await supabaseAuth.auth.signInWithPassword({
      email: normalizedEmail,
      password
    });

    if (error) {
      console.warn("Login failed for:", normalizedEmail, "from IP:", clientIP);
      
      // Don't reveal whether email exists or password is wrong
      return res.status(401).json({ 
        error: "Invalid email or password" 
      });
    }

    if (!data.session) {
      return res.status(401).json({ 
        error: "Login failed - no session returned" 
      });
    }

    // Check if email is verified (if you have this enabled in Supabase)
    if (data.user.email_confirmed_at === null) {
      return res.status(403).json({
        error: "Please verify your email before logging in",
        requiresEmailVerification: true
      });
    }

    // Clear rate limit on success
    clearAuthAttempts(`login:ip:${clientIP}`);
    clearAuthAttempts(`login:email:${normalizedEmail}`);

    // Set secure cookies
    setAuthCookies(res, data.session);

    // Log successful login (for audit trail)
    console.log("Login success:", {
      userId: data.user.id,
      email: normalizedEmail,
      ip: clientIP,
      timestamp: new Date().toISOString()
    });

    return res.status(200).json({
      success: true,
      user: {
        id: data.user.id,
        email: data.user.email,
        name: data.user.user_metadata?.name || null,
        emailVerified: !!data.user.email_confirmed_at
      }
    });

  } catch (err) {
    console.error("Login fatal error:", err);
    return res.status(500).json({ error: "An error occurred during login" });
  }
}

module.exports = handler;