// js/api/cart.js
// Frontend API module for shopping cart functionality

/**
 * Get the current user's cart
 * @returns {Promise<{items: Array, itemCount: number, totalCents: number, totalFormatted: string}>}
 */
export async function getCart() {
  const response = await fetch('/api/cart/get', {
    credentials: 'include',
  });

  if (!response.ok) {
    if (response.status === 401) {
      return { items: [], itemCount: 0, totalCents: 0, totalFormatted: '$0.00' };
    }
    const error = await response.json();
    throw new Error(error.message || error.error || 'Failed to get cart');
  }

  return response.json();
}

/**
 * Add an item to cart or update its quantity
 * @param {string} bookId 
 * @param {'ebook' | 'hardcover'} productType 
 * @param {object} options - { size, quantity, action: 'add' | 'set' | 'remove' }
 */
export async function updateCartItem(bookId, productType, options = {}) {
  const { size, quantity = 1, action = 'add' } = options;

  const response = await fetch('/api/cart/update', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({ bookId, productType, size, quantity, action }),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.message || error.error || 'Failed to update cart');
  }

  const result = await response.json();
  
  // Dispatch event for UI updates
  window.dispatchEvent(new CustomEvent('cart-updated', { detail: result }));
  
  return result;
}

/**
 * Remove an item from cart
 */
export async function removeCartItem(bookId, productType, size = null) {
  return updateCartItem(bookId, productType, { size, action: 'remove' });
}

/**
 * Set exact quantity for an item
 */
export async function setCartItemQuantity(bookId, productType, quantity, size = null) {
  return updateCartItem(bookId, productType, { size, quantity, action: 'set' });
}

/**
 * Clear all items from cart
 */
export async function clearCart() {
  const response = await fetch('/api/cart/clear', {
    method: 'POST',
    credentials: 'include',
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.message || error.error || 'Failed to clear cart');
  }

  window.dispatchEvent(new CustomEvent('cart-updated', { detail: { cleared: true } }));
  
  return response.json();
}

/**
 * Get available hardcover sizes
 */
export async function getHardcoverSizes() {
  const response = await fetch('/api/cart/sizes', {
    credentials: 'include',
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.message || error.error || 'Failed to get sizes');
  }

  return response.json();
}

/**
 * Checkout cart (creates Stripe session)
 * @param {boolean} embedded - Use embedded checkout mode
 */
export async function checkoutCart(embedded = false) {
  const response = await fetch('/api/cart/checkout', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({ embedded }),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.message || error.error || 'Failed to checkout');
  }

  return response.json();
}

/**
 * Redirect to Stripe checkout (hosted mode)
 */
export async function redirectToCartCheckout() {
  const { checkoutUrl } = await checkoutCart(false);
  window.location.href = checkoutUrl;
}

/**
 * Format price from cents
 */
export function formatPrice(cents) {
  return `$${(cents / 100).toFixed(2)}`;
}
