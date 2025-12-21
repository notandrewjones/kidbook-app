// api/_auth.js
// Shared authentication utilities for API endpoints
// Uses Supabase Auth with secure httpOnly cookies

const { createClient } = require("@supabase/supabase-js");

// Admin client for server-side operations (uses service role key)
const supabaseAdmin = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// Create a client from a user's access token
function createUserClient(accessToken) {
  return createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_ANON_KEY,
    {
      global: {
        headers: {
          Authorization: `Bearer ${accessToken}`
        }
      }
    }
  );
}

// Cookie configuration for maximum security
const COOKIE_OPTIONS = {
  httpOnly: true,           // Prevents XSS attacks - JS cannot access
  secure: process.env.NODE_ENV === 'production', // HTTPS only in production
  sameSite: 'strict',       // Prevents CSRF attacks
  path: '/',                // Available to all paths
  maxAge: 60 * 60 * 24 * 7  // 7 days in seconds
};

// Refresh token has longer expiry
const REFRESH_COOKIE_OPTIONS = {
  ...COOKIE_OPTIONS,
  maxAge: 60 * 60 * 24 * 30  // 30 days
};

// Parse cookies from request
function parseCookies(cookieHeader) {
  const cookies = {};
  if (!cookieHeader) return cookies;
  
  cookieHeader.split(';').forEach(cookie => {
    const [name, ...rest] = cookie.trim().split('=');
    if (name && rest.length > 0) {
      cookies[name] = decodeURIComponent(rest.join('='));
    }
  });
  return cookies;
}

// Set a secure cookie
function setCookie(res, name, value, options = COOKIE_OPTIONS) {
  const cookieParts = [
    `${name}=${encodeURIComponent(value)}`,
    `Path=${options.path}`,
    `Max-Age=${options.maxAge}`,
    `SameSite=${options.sameSite}`
  ];
  
  if (options.httpOnly) cookieParts.push('HttpOnly');
  if (options.secure) cookieParts.push('Secure');
  
  // Append to existing Set-Cookie headers
  const existing = res.getHeader('Set-Cookie') || [];
  const cookieArray = Array.isArray(existing) ? existing : [existing].filter(Boolean);
  cookieArray.push(cookieParts.join('; '));
  res.setHeader('Set-Cookie', cookieArray);
}

// Clear auth cookies
function clearAuthCookies(res) {
  const clearOptions = {
    ...COOKIE_OPTIONS,
    maxAge: 0
  };
  setCookie(res, 'sb-access-token', '', clearOptions);
  setCookie(res, 'sb-refresh-token', '', clearOptions);
  setCookie(res, 'sb-session-id', '', clearOptions);
}

// Set auth cookies from session
function setAuthCookies(res, session) {
  if (!session) return;
  
  setCookie(res, 'sb-access-token', session.access_token, COOKIE_OPTIONS);
  setCookie(res, 'sb-refresh-token', session.refresh_token, REFRESH_COOKIE_OPTIONS);
  
  // Session ID for additional validation (fingerprinting protection)
  // This ties the session to the specific cookie jar
  const sessionId = generateSessionId(session.user.id, session.access_token);
  setCookie(res, 'sb-session-id', sessionId, COOKIE_OPTIONS);
}

// Generate a session ID that ties tokens to a specific session
function generateSessionId(userId, accessToken) {
  const crypto = require('crypto');
  return crypto
    .createHash('sha256')
    .update(`${userId}:${accessToken.slice(-16)}:${process.env.SUPABASE_SERVICE_ROLE_KEY?.slice(-8) || 'secret'}`)
    .digest('hex')
    .slice(0, 32);
}

// Validate session ID matches
function validateSessionId(userId, accessToken, sessionId) {
  if (!sessionId) return false;
  const expected = generateSessionId(userId, accessToken);
  return sessionId === expected;
}

// Get current user from request (validates and refreshes if needed)
async function getCurrentUser(req, res) {
  const cookies = parseCookies(req.headers.cookie);
  const accessToken = cookies['sb-access-token'];
  const refreshToken = cookies['sb-refresh-token'];
  const sessionId = cookies['sb-session-id'];
  
  if (!accessToken) {
    return { user: null, error: 'No session' };
  }
  
  try {
    // Verify the access token
    const { data: { user }, error } = await supabaseAdmin.auth.getUser(accessToken);
    
    if (error) {
      // Token expired or invalid - try to refresh
      if (refreshToken) {
        const refreshResult = await refreshSession(req, res, refreshToken);
        if (refreshResult.user) {
          return refreshResult;
        }
      }
      clearAuthCookies(res);
      return { user: null, error: 'Session expired' };
    }
    
    // Validate session ID to prevent token theft
    if (!validateSessionId(user.id, accessToken, sessionId)) {
      console.warn('Session ID mismatch - possible token theft attempt');
      clearAuthCookies(res);
      return { user: null, error: 'Invalid session' };
    }
    
    return { user, error: null };
  } catch (err) {
    console.error('Auth error:', err);
    return { user: null, error: 'Authentication failed' };
  }
}

// Refresh the session using refresh token
async function refreshSession(req, res, refreshToken) {
  try {
    const { data, error } = await supabaseAdmin.auth.refreshSession({
      refresh_token: refreshToken
    });
    
    if (error || !data.session) {
      clearAuthCookies(res);
      return { user: null, error: 'Refresh failed' };
    }
    
    // Set new cookies
    setAuthCookies(res, data.session);
    return { user: data.user, session: data.session, error: null };
  } catch (err) {
    console.error('Refresh error:', err);
    clearAuthCookies(res);
    return { user: null, error: 'Refresh failed' };
  }
}

// Middleware wrapper for protected routes
function requireAuth(handler) {
  return async (req, res) => {
    const { user, error } = await getCurrentUser(req, res);
    
    if (!user) {
      return res.status(401).json({ 
        error: 'Unauthorized',
        message: error || 'Please log in to continue'
      });
    }
    
    // Attach user to request
    req.user = user;
    return handler(req, res);
  };
}

// Rate limiting for auth endpoints (prevents brute force)
const authAttempts = new Map();
const MAX_ATTEMPTS = 5;
const LOCKOUT_DURATION = 15 * 60 * 1000; // 15 minutes

function checkRateLimit(identifier) {
  const now = Date.now();
  const attempts = authAttempts.get(identifier);
  
  if (!attempts) {
    return { allowed: true };
  }
  
  // Clean up old attempts
  const recentAttempts = attempts.filter(t => now - t < LOCKOUT_DURATION);
  authAttempts.set(identifier, recentAttempts);
  
  if (recentAttempts.length >= MAX_ATTEMPTS) {
    const oldestAttempt = Math.min(...recentAttempts);
    const unlockTime = oldestAttempt + LOCKOUT_DURATION;
    return { 
      allowed: false, 
      retryAfter: Math.ceil((unlockTime - now) / 1000)
    };
  }
  
  return { allowed: true };
}

function recordAuthAttempt(identifier) {
  const attempts = authAttempts.get(identifier) || [];
  attempts.push(Date.now());
  authAttempts.set(identifier, attempts);
}

function clearAuthAttempts(identifier) {
  authAttempts.delete(identifier);
}

// Get client IP for rate limiting
function getClientIP(req) {
  return req.headers['x-forwarded-for']?.split(',')[0]?.trim() 
    || req.headers['x-real-ip'] 
    || req.socket?.remoteAddress 
    || 'unknown';
}

module.exports = {
  supabaseAdmin,
  createUserClient,
  parseCookies,
  setCookie,
  clearAuthCookies,
  setAuthCookies,
  getCurrentUser,
  requireAuth,
  checkRateLimit,
  recordAuthAttempt,
  clearAuthAttempts,
  getClientIP,
  COOKIE_OPTIONS,
  REFRESH_COOKIE_OPTIONS
};
