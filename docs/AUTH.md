# Authentication System

This document describes the secure authentication system implemented for the Kids Book Creator application.

## Overview

The authentication system uses **Supabase Auth** with **secure httpOnly cookies** for session management. This approach provides:

- **XSS Protection**: Tokens are stored in httpOnly cookies, making them inaccessible to JavaScript
- **CSRF Protection**: Cookies use `SameSite=Strict` to prevent cross-site request forgery
- **Session Hijacking Protection**: Custom session IDs tie tokens to specific cookie jars
- **Rate Limiting**: Brute force protection on login/signup endpoints
- **Secure Token Refresh**: Automatic token refresh with rotating refresh tokens

## Security Features

### 1. Cookie Security
- `httpOnly: true` - Prevents XSS attacks by blocking JavaScript access
- `secure: true` (in production) - Only transmitted over HTTPS
- `sameSite: 'strict'` - Prevents CSRF by blocking cross-site requests
- Session ID validation - Prevents token theft/replay attacks

### 2. Rate Limiting
- Login: 5 attempts per 15 minutes (per IP and per email)
- Signup: 5 attempts per 15 minutes (per IP)
- Password reset: 5 attempts per 15 minutes (per IP)
- Lockout duration: 15 minutes

### 3. Password Requirements
- Minimum 8 characters
- At least one letter
- At least one number

### 4. Additional Protections
- Passwords are hashed by Supabase (bcrypt)
- No password storage in application code
- Constant-time error messages (prevents user enumeration)
- Session revocation on logout
- Token refresh with new session ID generation

## Setup Instructions

### 1. Database Migration

Run the SQL migration in your Supabase SQL Editor:

```bash
# File: supabase-migration.sql
```

This will:
- Add `user_id` column to `book_projects`
- Enable Row Level Security (RLS)
- Create security policies
- Set up user profiles table
- Create auto-profile trigger

### 2. Environment Variables

Add these to your Vercel environment (or `.env` file for local development):

```env
# Supabase (existing)
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key

# Add these new ones
SUPABASE_ANON_KEY=your-anon-key
NODE_ENV=production
SITE_URL=https://your-app.com
```

### 3. Supabase Dashboard Configuration

1. **Authentication > Providers**
   - Enable Email provider
   - Set "Confirm email" preference (recommended for production)

2. **Authentication > URL Configuration**
   - Set Site URL to your production URL
   - Add redirect URLs: `https://your-app.com/reset-password`

3. **Authentication > Email Templates**
   - Customize confirmation email
   - Customize password reset email

## API Endpoints

### Authentication

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/auth/signup` | POST | Create new account |
| `/api/auth/login` | POST | Log in |
| `/api/auth/logout` | POST | Log out |
| `/api/auth/me` | GET | Get current user |
| `/api/auth/forgot-password` | POST | Request password reset |
| `/api/auth/update-password` | POST | Update password |

### Request/Response Examples

#### Signup
```javascript
// Request
POST /api/auth/signup
{
  "email": "user@example.com",
  "password": "securePass123",
  "name": "John Doe"  // optional
}

// Response (success)
{
  "success": true,
  "user": {
    "id": "uuid",
    "email": "user@example.com",
    "name": "John Doe"
  }
}

// Response (email verification required)
{
  "success": true,
  "requiresEmailVerification": true,
  "message": "Please check your email to verify your account."
}
```

#### Login
```javascript
// Request
POST /api/auth/login
{
  "email": "user@example.com",
  "password": "securePass123"
}

// Response
{
  "success": true,
  "user": {
    "id": "uuid",
    "email": "user@example.com",
    "name": "John Doe",
    "emailVerified": true
  }
}
```

#### Check Session
```javascript
// Request (cookies sent automatically)
GET /api/auth/me

// Response (authenticated)
{
  "authenticated": true,
  "user": {
    "id": "uuid",
    "email": "user@example.com",
    "name": "John Doe"
  }
}

// Response (not authenticated)
{
  "authenticated": false,
  "error": "Not authenticated"
}
```

## Frontend Usage

### Check Authentication State

```javascript
import { checkSession, onAuthChange, isAuthenticated } from './js/core/auth.js';

// Check session on page load
await checkSession();

// Subscribe to auth changes
onAuthChange(({ user, isAuthenticated, isLoading }) => {
  if (isAuthenticated) {
    console.log('User logged in:', user.email);
  } else {
    console.log('User not logged in');
  }
});
```

### Login/Logout

```javascript
import { login, logout, signup } from './js/core/auth.js';

// Login
const { user, error } = await login('user@example.com', 'password');
if (error) {
  console.error('Login failed:', error);
}

// Signup
const { user, error, requiresEmailVerification } = await signup(
  'user@example.com',
  'password',
  'John Doe'
);

// Logout
await logout();
```

### Show Login Modal

```javascript
import { showAuthModal } from './js/ui/auth.js';

// Show login modal
showAuthModal('login');

// Show signup modal
showAuthModal('signup');

// Show forgot password modal
showAuthModal('forgot');
```

## Protected API Routes

All project-related API routes now require authentication:

- `/api/projects-list` - Returns only user's projects
- `/api/load-project` - Verifies ownership before loading
- `/api/save-story` - Verifies ownership before saving
- `/api/story-ideas` - Associates new projects with user

### Adding Auth to New API Routes

```javascript
const { getCurrentUser, requireAuth } = require("./_auth.js");

// Option 1: Manual check
async function handler(req, res) {
  const { user, error } = await getCurrentUser(req, res);
  if (!user) {
    return res.status(401).json({ error: "Unauthorized" });
  }
  
  // User is authenticated, continue...
  req.user = user;
}

// Option 2: Using middleware wrapper
const protectedHandler = requireAuth(async (req, res) => {
  // req.user is already populated
  const userId = req.user.id;
});

module.exports = protectedHandler;
```

## Security Considerations

### What This System Protects Against

1. **XSS (Cross-Site Scripting)**: Tokens in httpOnly cookies can't be stolen by malicious scripts
2. **CSRF (Cross-Site Request Forgery)**: SameSite=Strict prevents cross-origin requests
3. **Session Hijacking**: Session IDs are cryptographically tied to tokens
4. **Brute Force**: Rate limiting on auth endpoints
5. **User Enumeration**: Constant-time error messages
6. **Token Theft**: Session ID validation detects stolen tokens

### What This System Does NOT Protect Against

1. **Malware on user's device**: Nothing can protect against this
2. **Physical access attacks**: User's device must be trusted
3. **Network-level attacks**: Use HTTPS in production

### Best Practices

1. **Always use HTTPS in production** - Set `NODE_ENV=production`
2. **Set strong password requirements** - Already enforced
3. **Enable email verification** - Recommended for production
4. **Monitor auth logs** - Check for suspicious patterns
5. **Rotate service role keys periodically** - Update `SUPABASE_SERVICE_ROLE_KEY`

## Troubleshooting

### "Unauthorized" errors after login

- Check that cookies are being set (browser dev tools > Application > Cookies)
- Ensure `credentials: 'include'` is set on fetch requests
- Verify CORS settings if using different domains

### Cookies not being set

- In production, ensure `NODE_ENV=production` and using HTTPS
- Check browser cookie settings (third-party cookies may be blocked)

### Rate limiting issues during development

- Rate limits persist in memory; restart server to clear
- Or temporarily increase `MAX_ATTEMPTS` in `_auth.js`

### Session expires unexpectedly

- Access tokens expire after 7 days by default
- Refresh tokens expire after 30 days
- Check that token refresh is working properly
