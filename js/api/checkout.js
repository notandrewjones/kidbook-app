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
 * Initiate checkout for a product
 * @param {string} bookId 
 * @param {'ebook' | 'hardcover'} productType 
 * @returns {Promise<{checkoutUrl: string, orderId: string}>}
 */
export async function createCheckoutSession(bookId, productType) {
  const response = await fetch('/api/checkout/create-session', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    credentials: 'include',
    body: JSON.stringify({ bookId, productType }),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.message || error.error || 'Failed to create checkout');
  }

  return response.json();
}

/**
 * Redirect to Stripe Checkout
 * @param {string} bookId 
 * @param {'ebook' | 'hardcover'} productType 
 */
export async function redirectToCheckout(bookId, productType) {
  try {
    const { checkoutUrl } = await createCheckoutSession(bookId, productType);
    window.location.href = checkoutUrl;
  } catch (err) {
    console.error('Checkout error:', err);
    throw err;
  }
}

/**
 * Check if returning from a successful payment
 * @returns {{ success: boolean, orderId: string | null, cancelled: boolean }}
 */
export function checkPaymentReturn() {
  const params = new URLSearchParams(window.location.search);
  
  return {
    success: params.get('payment') === 'success',
    cancelled: params.get('payment') === 'cancelled',
    orderId: params.get('order'),
  };
}

/**
 * Clear payment params from URL (after handling)
 */
export function clearPaymentParams() {
  const url = new URL(window.location.href);
  url.searchParams.delete('payment');
  url.searchParams.delete('order');
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
