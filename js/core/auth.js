// js/core/auth.js
// Frontend authentication module
// Handles user sessions, login/logout, and auth state

// =====================================================
// Auth State
// =====================================================

const authState = {
  user: null,
  isAuthenticated: false,
  isLoading: true,
  listeners: new Set()
};

// Subscribe to auth state changes
export function onAuthChange(callback) {
  authState.listeners.add(callback);
  // Immediately call with current state
  callback({ 
    user: authState.user, 
    isAuthenticated: authState.isAuthenticated,
    isLoading: authState.isLoading
  });
  
  // Return unsubscribe function
  return () => authState.listeners.delete(callback);
}

// Notify all listeners of state change
function notifyListeners() {
  const state = { 
    user: authState.user, 
    isAuthenticated: authState.isAuthenticated,
    isLoading: authState.isLoading
  };
  authState.listeners.forEach(cb => cb(state));
}

// Update auth state
function setAuthState(user) {
  authState.user = user;
  authState.isAuthenticated = !!user;
  authState.isLoading = false;
  notifyListeners();
}

// =====================================================
// API Calls
// =====================================================

// Check current session on page load
export async function checkSession() {
  authState.isLoading = true;
  notifyListeners();
  
  try {
    const res = await fetch('/api/auth/me', {
      credentials: 'include' // Important: send cookies
    });
    
    if (res.ok) {
      const data = await res.json();
      if (data.authenticated && data.user) {
        setAuthState(data.user);
        return { user: data.user, error: null };
      }
    }
    
    setAuthState(null);
    return { user: null, error: null };
    
  } catch (err) {
    console.error('Session check failed:', err);
    setAuthState(null);
    return { user: null, error: err.message };
  }
}

// Login
export async function login(email, password) {
  try {
    const res = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ email, password })
    });
    
    const data = await res.json();
    
    if (!res.ok) {
      return { 
        user: null, 
        error: data.error || 'Login failed',
        requiresEmailVerification: data.requiresEmailVerification
      };
    }
    
    setAuthState(data.user);
    return { user: data.user, error: null };
    
  } catch (err) {
    console.error('Login error:', err);
    return { user: null, error: 'Network error. Please try again.' };
  }
}

// Signup
export async function signup(email, password, name) {
  try {
    const res = await fetch('/api/auth/signup', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ email, password, name })
    });
    
    const data = await res.json();
    
    if (!res.ok) {
      return { 
        user: null, 
        error: data.error || 'Signup failed',
        retryAfter: data.retryAfter
      };
    }
    
    // If email verification is required
    if (data.requiresEmailVerification) {
      return { 
        user: null, 
        error: null,
        requiresEmailVerification: true,
        message: data.message
      };
    }
    
    setAuthState(data.user);
    return { user: data.user, error: null };
    
  } catch (err) {
    console.error('Signup error:', err);
    return { user: null, error: 'Network error. Please try again.' };
  }
}

// Logout
export async function logout() {
  try {
    await fetch('/api/auth/logout', {
      method: 'POST',
      credentials: 'include'
    });
  } catch (err) {
    console.error('Logout error:', err);
  }
  
  // Always clear local state
  setAuthState(null);
  return { success: true };
}

// Request password reset
export async function requestPasswordReset(email) {
  try {
    const res = await fetch('/api/auth/forgot-password', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email })
    });
    
    const data = await res.json();
    return { success: data.success, message: data.message };
    
  } catch (err) {
    console.error('Password reset error:', err);
    return { 
      success: false, 
      message: 'Network error. Please try again.' 
    };
  }
}

// Update password
export async function updatePassword(password, accessToken = null) {
  try {
    const body = { password };
    if (accessToken) {
      body.accessToken = accessToken;
    }
    
    const res = await fetch('/api/auth/update-password', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify(body)
    });
    
    const data = await res.json();
    
    if (!res.ok) {
      return { success: false, error: data.error };
    }
    
    return { success: true, message: data.message };
    
  } catch (err) {
    console.error('Password update error:', err);
    return { success: false, error: 'Network error. Please try again.' };
  }
}

// =====================================================
// Getters
// =====================================================

export function getCurrentUser() {
  return authState.user;
}

export function isAuthenticated() {
  return authState.isAuthenticated;
}

export function isAuthLoading() {
  return authState.isLoading;
}

// =====================================================
// Utility Functions
// =====================================================

// Validate email format
export function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

// Validate password strength
export function validatePassword(password) {
  const errors = [];
  
  if (password.length < 8) {
    errors.push('At least 8 characters');
  }
  if (!/\d/.test(password)) {
    errors.push('At least one number');
  }
  if (!/[a-zA-Z]/.test(password)) {
    errors.push('At least one letter');
  }
  
  return {
    valid: errors.length === 0,
    errors
  };
}

// Parse access token from URL hash (for password reset flow)
export function getAccessTokenFromHash() {
  if (typeof window === 'undefined') return null;
  
  const hash = window.location.hash.substring(1);
  const params = new URLSearchParams(hash);
  return params.get('access_token');
}

// Clear URL hash (after extracting token)
export function clearHashFromUrl() {
  if (typeof window === 'undefined') return;
  
  const url = new URL(window.location.href);
  url.hash = '';
  window.history.replaceState({}, '', url.toString());
}
