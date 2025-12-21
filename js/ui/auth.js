// js/ui/auth.js
// Authentication UI components - modals, forms, account menu

import { $ } from '../core/utils.js';
import { 
  login, 
  signup, 
  logout, 
  requestPasswordReset,
  updatePassword,
  onAuthChange,
  isValidEmail,
  validatePassword,
  getAccessTokenFromHash,
  clearHashFromUrl
} from '../core/auth.js';

// =====================================================
// Auth Modal Management
// =====================================================

let currentModal = null;

function showAuthModal(mode = 'login') {
  hideAuthModal();
  
  const modal = document.createElement('div');
  modal.id = 'auth-modal';
  modal.className = 'modal';
  modal.innerHTML = getAuthModalHTML(mode);
  document.body.appendChild(modal);
  
  currentModal = modal;
  
  // Setup event listeners
  setupAuthModalEvents(modal, mode);
  
  // Focus first input
  setTimeout(() => {
    const firstInput = modal.querySelector('input');
    if (firstInput) firstInput.focus();
  }, 100);
  
  // Handle ESC key
  const escHandler = (e) => {
    if (e.key === 'Escape') hideAuthModal();
  };
  document.addEventListener('keydown', escHandler);
  modal.dataset.escHandler = 'true';
  modal._escHandler = escHandler;
}

function hideAuthModal() {
  if (currentModal) {
    if (currentModal._escHandler) {
      document.removeEventListener('keydown', currentModal._escHandler);
    }
    currentModal.remove();
    currentModal = null;
  }
}

function getAuthModalHTML(mode) {
  const isLogin = mode === 'login';
  const isSignup = mode === 'signup';
  const isForgot = mode === 'forgot';
  const isReset = mode === 'reset';
  
  let title, subtitle, formHTML;
  
  if (isLogin) {
    title = 'Welcome Back';
    subtitle = 'Log in to access your books';
    formHTML = `
      <form id="auth-form" class="auth-form">
        <div class="form-group">
          <label class="label" for="auth-email">Email</label>
          <input type="email" id="auth-email" class="input" placeholder="you@example.com" required autocomplete="email">
        </div>
        <div class="form-group">
          <label class="label" for="auth-password">Password</label>
          <input type="password" id="auth-password" class="input" placeholder="••••••••" required autocomplete="current-password">
        </div>
        <div id="auth-error" class="auth-error hidden"></div>
        <button type="submit" class="btn btn-primary btn-full" id="auth-submit">
          <span>Log In</span>
        </button>
        <div class="auth-footer">
          <button type="button" class="btn-link" id="switch-to-forgot">Forgot password?</button>
          <span class="auth-divider">•</span>
          <button type="button" class="btn-link" id="switch-to-signup">Create account</button>
        </div>
      </form>
    `;
  } else if (isSignup) {
    title = 'Create Account';
    subtitle = 'Start creating amazing books';
    formHTML = `
      <form id="auth-form" class="auth-form">
        <div class="form-group">
          <label class="label" for="auth-name">Name (optional)</label>
          <input type="text" id="auth-name" class="input" placeholder="Your name" autocomplete="name">
        </div>
        <div class="form-group">
          <label class="label" for="auth-email">Email</label>
          <input type="email" id="auth-email" class="input" placeholder="you@example.com" required autocomplete="email">
        </div>
        <div class="form-group">
          <label class="label" for="auth-password">Password</label>
          <input type="password" id="auth-password" class="input" placeholder="At least 8 characters" required autocomplete="new-password">
          <div id="password-strength" class="password-strength"></div>
        </div>
        <div class="form-group">
          <label class="label" for="auth-confirm">Confirm Password</label>
          <input type="password" id="auth-confirm" class="input" placeholder="••••••••" required autocomplete="new-password">
        </div>
        <div id="auth-error" class="auth-error hidden"></div>
        <button type="submit" class="btn btn-primary btn-full" id="auth-submit">
          <span>Create Account</span>
        </button>
        <div class="auth-footer">
          <span>Already have an account?</span>
          <button type="button" class="btn-link" id="switch-to-login">Log in</button>
        </div>
      </form>
    `;
  } else if (isForgot) {
    title = 'Reset Password';
    subtitle = "We'll send you a reset link";
    formHTML = `
      <form id="auth-form" class="auth-form">
        <div class="form-group">
          <label class="label" for="auth-email">Email</label>
          <input type="email" id="auth-email" class="input" placeholder="you@example.com" required autocomplete="email">
        </div>
        <div id="auth-error" class="auth-error hidden"></div>
        <div id="auth-success" class="auth-success hidden"></div>
        <button type="submit" class="btn btn-primary btn-full" id="auth-submit">
          <span>Send Reset Link</span>
        </button>
        <div class="auth-footer">
          <button type="button" class="btn-link" id="switch-to-login">Back to login</button>
        </div>
      </form>
    `;
  } else if (isReset) {
    title = 'Set New Password';
    subtitle = 'Choose a strong password';
    formHTML = `
      <form id="auth-form" class="auth-form">
        <div class="form-group">
          <label class="label" for="auth-password">New Password</label>
          <input type="password" id="auth-password" class="input" placeholder="At least 8 characters" required autocomplete="new-password">
          <div id="password-strength" class="password-strength"></div>
        </div>
        <div class="form-group">
          <label class="label" for="auth-confirm">Confirm Password</label>
          <input type="password" id="auth-confirm" class="input" placeholder="••••••••" required autocomplete="new-password">
        </div>
        <div id="auth-error" class="auth-error hidden"></div>
        <button type="submit" class="btn btn-primary btn-full" id="auth-submit">
          <span>Update Password</span>
        </button>
      </form>
    `;
  }
  
  return `
    <div class="modal-backdrop" id="auth-backdrop"></div>
    <div class="modal-dialog modal-dialog-sm auth-modal-dialog" role="dialog" aria-modal="true">
      <div class="modal-header">
        <div class="modal-header-left">
          <div class="modal-title">${title}</div>
          <div class="modal-subtitle">${subtitle}</div>
        </div>
        <button id="close-auth-modal" class="icon-btn" title="Close">✕</button>
      </div>
      <div class="modal-body">
        ${formHTML}
      </div>
    </div>
  `;
}

function setupAuthModalEvents(modal, mode) {
  // Close handlers
  modal.querySelector('#close-auth-modal')?.addEventListener('click', hideAuthModal);
  modal.querySelector('#auth-backdrop')?.addEventListener('click', hideAuthModal);
  
  // Mode switch handlers
  modal.querySelector('#switch-to-login')?.addEventListener('click', () => showAuthModal('login'));
  modal.querySelector('#switch-to-signup')?.addEventListener('click', () => showAuthModal('signup'));
  modal.querySelector('#switch-to-forgot')?.addEventListener('click', () => showAuthModal('forgot'));
  
  // Password strength indicator
  const passwordInput = modal.querySelector('#auth-password');
  const strengthIndicator = modal.querySelector('#password-strength');
  if (passwordInput && strengthIndicator) {
    passwordInput.addEventListener('input', () => {
      const { valid, errors } = validatePassword(passwordInput.value);
      if (passwordInput.value.length === 0) {
        strengthIndicator.innerHTML = '';
      } else if (valid) {
        strengthIndicator.innerHTML = '<span class="strength-good">✓ Strong password</span>';
      } else {
        strengthIndicator.innerHTML = `<span class="strength-weak">Need: ${errors.join(', ')}</span>`;
      }
    });
  }
  
  // Form submission
  const form = modal.querySelector('#auth-form');
  form?.addEventListener('submit', async (e) => {
    e.preventDefault();
    await handleAuthSubmit(mode, form);
  });
}

async function handleAuthSubmit(mode, form) {
  const submitBtn = form.querySelector('#auth-submit');
  const errorEl = form.querySelector('#auth-error');
  const successEl = form.querySelector('#auth-success');
  
  const email = form.querySelector('#auth-email')?.value?.trim();
  const password = form.querySelector('#auth-password')?.value;
  const confirmPassword = form.querySelector('#auth-confirm')?.value;
  const name = form.querySelector('#auth-name')?.value?.trim();
  
  // Clear previous messages
  errorEl?.classList.add('hidden');
  successEl?.classList.add('hidden');
  
  // Validation
  if (mode === 'signup' || mode === 'reset') {
    if (password !== confirmPassword) {
      showAuthError(errorEl, 'Passwords do not match');
      return;
    }
    
    const { valid, errors } = validatePassword(password);
    if (!valid) {
      showAuthError(errorEl, `Password requirements: ${errors.join(', ')}`);
      return;
    }
  }
  
  if ((mode === 'login' || mode === 'signup' || mode === 'forgot') && email && !isValidEmail(email)) {
    showAuthError(errorEl, 'Please enter a valid email address');
    return;
  }
  
  // Show loading state
  const originalText = submitBtn.innerHTML;
  submitBtn.disabled = true;
  submitBtn.innerHTML = '<span class="spinner"></span> Please wait...';
  
  try {
    let result;
    
    switch (mode) {
      case 'login':
        result = await login(email, password);
        if (result.error) {
          showAuthError(errorEl, result.error);
        } else {
          hideAuthModal();
          showToast('Welcome back!', 'success');
        }
        break;
        
      case 'signup':
        result = await signup(email, password, name);
        if (result.error) {
          showAuthError(errorEl, result.error);
        } else if (result.requiresEmailVerification) {
          showAuthSuccess(successEl, result.message || 'Please check your email to verify your account.');
          form.reset();
        } else {
          hideAuthModal();
          showToast('Account created! Welcome!', 'success');
        }
        break;
        
      case 'forgot':
        result = await requestPasswordReset(email);
        showAuthSuccess(successEl, result.message);
        break;
        
      case 'reset':
        const accessToken = getAccessTokenFromHash();
        result = await updatePassword(password, accessToken);
        if (result.success) {
          clearHashFromUrl();
          hideAuthModal();
          showToast('Password updated successfully!', 'success');
        } else {
          showAuthError(errorEl, result.error);
        }
        break;
    }
  } catch (err) {
    showAuthError(errorEl, 'An unexpected error occurred. Please try again.');
  } finally {
    submitBtn.disabled = false;
    submitBtn.innerHTML = originalText;
  }
}

function showAuthError(el, message) {
  if (el) {
    el.textContent = message;
    el.classList.remove('hidden');
  }
}

function showAuthSuccess(el, message) {
  if (el) {
    el.textContent = message;
    el.classList.remove('hidden');
  }
}

// =====================================================
// Account Menu
// =====================================================

export function initAuthUI() {
  // Subscribe to auth state changes
  onAuthChange(updateAccountUI);
  
  // Setup click handlers
  $('login-btn')?.addEventListener('click', () => showAuthModal('login'));
  
  $('logout-btn')?.addEventListener('click', async () => {
    await logout();
    showToast('Logged out', 'info');
    // Optionally redirect or refresh
    window.location.reload();
  });
  
  // Check for password reset flow
  if (window.location.pathname.includes('reset-password') || getAccessTokenFromHash()) {
    const token = getAccessTokenFromHash();
    if (token) {
      showAuthModal('reset');
    }
  }
}

function updateAccountUI({ user, isAuthenticated, isLoading }) {
  const accountBtn = $('account-btn');
  const loginBtn = $('login-btn');
  const logoutBtn = $('logout-btn');
  const accountName = accountBtn?.querySelector('.account-name');
  const accountSub = accountBtn?.querySelector('.account-sub');
  const avatar = accountBtn?.querySelector('.avatar');
  
  if (isLoading) {
    if (accountName) accountName.textContent = 'Loading...';
    return;
  }
  
  if (isAuthenticated && user) {
    if (avatar) avatar.textContent = user.name?.[0]?.toUpperCase() || user.email?.[0]?.toUpperCase() || 'U';
    if (accountName) accountName.textContent = user.name || user.email?.split('@')[0] || 'Account';
    if (accountSub) accountSub.textContent = user.email || 'My Books';
    if (loginBtn) loginBtn.classList.add('hidden');
    if (logoutBtn) logoutBtn.classList.remove('hidden');
  } else {
    if (avatar) avatar.textContent = 'A';
    if (accountName) accountName.textContent = 'Account';
    if (accountSub) accountSub.textContent = 'Login / Sign up';
    if (loginBtn) loginBtn.classList.remove('hidden');
    if (logoutBtn) logoutBtn.classList.add('hidden');
  }
}

// Simple toast notification
function showToast(message, type = 'info') {
  const container = $('toast-container') || document.body;
  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;
  toast.textContent = message;
  container.appendChild(toast);
  
  setTimeout(() => {
    toast.classList.add('toast-fade-out');
    setTimeout(() => toast.remove(), 300);
  }, 3000);
}

// Expose for external use
export { showAuthModal, hideAuthModal };
