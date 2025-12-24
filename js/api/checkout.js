// js/api/checkout.js
// Frontend API module for checkout and payment functionality

/**
 * Get the purchase/unlock status for a book
 * @param {string} bookId 
 * @returns {Promise<Object>} Status object with product unlock info
 */
export async function getBookPurchaseStatus(bookId) {
  const response = await fetch(`/api/checkout/status?bookId=${bookId}`, {
    credentials: 'include',
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.message || error.error || 'Failed to get status');
  }

  return response.json();
}

/**
 * Create a checkout session (supports both hosted and embedded modes)
 * @param {string} bookId 
 * @param {'ebook' | 'hardcover'} productType 
 * @param {boolean} embedded - If true, creates embedded checkout session
 * @returns {Promise<{clientSecret?: string, checkoutUrl?: string, orderId: string}>}
 */
export async function createCheckoutSession(bookId, productType, embedded = false) {
  const response = await fetch('/api/checkout/create-session', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    credentials: 'include',
    body: JSON.stringify({ bookId, productType, embedded }),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.message || error.error || 'Failed to create checkout');
  }

  return response.json();
}

/**
 * Redirect to Stripe Checkout (hosted mode)
 * @param {string} bookId 
 * @param {'ebook' | 'hardcover'} productType 
 */
export async function redirectToCheckout(bookId, productType) {
  try {
    const { checkoutUrl } = await createCheckoutSession(bookId, productType, false);
    window.location.href = checkoutUrl;
  } catch (err) {
    console.error('Checkout error:', err);
    throw err;
  }
}

/**
 * Initialize embedded checkout
 * @param {string} bookId 
 * @param {'ebook' | 'hardcover'} productType 
 * @returns {Promise<{clientSecret: string, orderId: string}>}
 */
export async function initEmbeddedCheckout(bookId, productType) {
  return createCheckoutSession(bookId, productType, true);
}

/**
 * Check if returning from a successful payment
 * @returns {{ success: boolean, orderId: string | null, cancelled: boolean, sessionId: string | null }}
 */
export function checkPaymentReturn() {
  const params = new URLSearchParams(window.location.search);
  
  return {
    success: params.get('payment') === 'success',
    cancelled: params.get('payment') === 'cancelled',
    orderId: params.get('order'),
    sessionId: params.get('session_id'),
  };
}

/**
 * Clear payment params from URL (after handling)
 */
export function clearPaymentParams() {
  const url = new URL(window.location.href);
  url.searchParams.delete('payment');
  url.searchParams.delete('order');
  url.searchParams.delete('session_id');
  window.history.replaceState({}, '', url.toString());
}

/**
 * Format price from cents to display string
 * @param {number} cents 
 * @returns {string}
 */
export function formatPrice(cents) {
  return `$${(cents / 100).toFixed(2)}`;
}

/**
 * Load Stripe.js dynamically
 * @returns {Promise<Stripe>}
 */
let stripePromise = null;
export async function loadStripe() {
  if (stripePromise) return stripePromise;
  
  // Load Stripe.js from CDN if not already loaded
  if (!window.Stripe) {
    await new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = 'https://js.stripe.com/v3/';
      script.onload = resolve;
      script.onerror = () => reject(new Error('Failed to load Stripe.js'));
      document.head.appendChild(script);
    });
  }
  
  // Get publishable key from a meta tag or environment
  const publishableKey = document.querySelector('meta[name="stripe-publishable-key"]')?.content 
    || window.STRIPE_PUBLISHABLE_KEY;
  
  if (!publishableKey) {
    throw new Error('Stripe publishable key not configured');
  }
  
  stripePromise = window.Stripe(publishableKey);
  return stripePromise;
}