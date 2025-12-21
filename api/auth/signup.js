// api/auth/signup.js
// Secure user registration endpoint

const { 
  supabaseAdmin, 
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
  
  // Rate limiting check
  const rateCheck = checkRateLimit(`signup:${clientIP}`);
  if (!rateCheck.allowed) {
    return res.status(429).json({ 
      error: "Too many attempts",
      retryAfter: rateCheck.retryAfter 
    });
  }

  const { email, password, name } = req.body || {};

  // Validate inputs
  if (!email || !password) {
    return res.status(400).json({ error: "Email and password are required" });
  }

  // Email validation
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(email)) {
    return res.status(400).json({ error: "Invalid email format" });
  }

  // Password strength validation
  if (password.length < 8) {
    return res.status(400).json({ 
      error: "Password must be at least 8 characters" 
    });
  }

  // Check for at least one number and one letter
  if (!/\d/.test(password) || !/[a-zA-Z]/.test(password)) {
    return res.status(400).json({ 
      error: "Password must contain at least one letter and one number" 
    });
  }

  try {
    recordAuthAttempt(`signup:${clientIP}`);

    // Create user with Supabase Auth
    const { data, error } = await supabaseAdmin.auth.signUp({
      email: email.toLowerCase().trim(),
      password,
      options: {
        data: {
          name: name?.trim() || null,
          created_at: new Date().toISOString()
        }
      }
    });

    if (error) {
      console.error("Signup error:", error);
      
      // Handle specific error cases
      if (error.message?.includes('already registered')) {
        return res.status(409).json({ 
          error: "An account with this email already exists" 
        });
      }
      
      return res.status(400).json({ 
        error: error.message || "Signup failed" 
      });
    }

    if (!data.user) {
      return res.status(500).json({ error: "Failed to create account" });
    }

    // Clear rate limit on success
    clearAuthAttempts(`signup:${clientIP}`);

    // If email confirmation is required, don't set cookies yet
    if (!data.session) {
      return res.status(200).json({
        success: true,
        message: "Account created! Please check your email to verify your account.",
        requiresEmailVerification: true,
        user: {
          id: data.user.id,
          email: data.user.email
        }
      });
    }

    // Set secure cookies
    setAuthCookies(res, data.session);

    return res.status(200).json({
      success: true,
      user: {
        id: data.user.id,
        email: data.user.email,
        name: data.user.user_metadata?.name || null
      }
    });

  } catch (err) {
    console.error("Signup fatal error:", err);
    return res.status(500).json({ error: "An error occurred during signup" });
  }
}

module.exports = handler;
