// js/api/orders.js
// Client-side API functions for orders

/**
 * Format price in cents to display string
 */
export function formatPrice(cents) {
  return `$${(cents / 100).toFixed(2)}`;
}

/**
 * Get all orders for the current user
 */
export async function getOrders() {
  const response = await fetch('/api/orders/list', {
    credentials: 'include',
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.message || error.error || 'Failed to fetch orders');
  }

  return response.json();
}

/**
 * Get details for a specific order
 */
export async function getOrderDetails(orderId) {
  const response = await fetch(`/api/orders/${orderId}`, {
    credentials: 'include',
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.message || error.error || 'Failed to fetch order details');
  }

  return response.json();
}

/**
 * Request cancellation of an order
 */
export async function requestCancellation(orderId, reason = '') {
  const response = await fetch('/api/orders/cancel', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({ orderId, reason }),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.message || error.error || 'Failed to request cancellation');
  }

  return response.json();
}

/**
 * Reorder an item (add to cart)
 */
export async function reorder(orderId) {
  const response = await fetch('/api/orders/reorder', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({ orderId }),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.message || error.error || 'Failed to reorder');
  }

  // Dispatch cart update event
  window.dispatchEvent(new CustomEvent('cart-updated', { detail: { reorder: true } }));

  return response.json();
}

/**
 * Create a support ticket
 */
export async function createSupportTicket(orderId, subject, message, category = 'order') {
  const response = await fetch('/api/orders/support', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({ orderId, subject, message, category }),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.message || error.error || 'Failed to create support ticket');
  }

  return response.json();
}

/**
 * Get fulfillment status display info
 */
export function getFulfillmentStatusInfo(status, paymentStatus = 'paid') {
  // If payment was refunded, show that status
  if (paymentStatus === 'refunded') {
    return {
      label: 'Refunded',
      color: '#6b7280',
      icon: '💰',
      description: 'This order has been refunded',
    };
  }

  const statusMap = {
    pending: {
      label: 'Processing',
      color: '#f59e0b',
      icon: '⏳',
      description: 'Your order is being prepared',
    },
    processing: {
      label: 'Printing',
      color: '#8b5cf6',
      icon: '🖨️',
      description: 'Your book is being printed',
    },
    printed: {
      label: 'Ready to Ship',
      color: '#3b82f6',
      icon: '📦',
      description: 'Your book is printed and ready for shipping',
    },
    shipped: {
      label: 'Shipped',
      color: '#10b981',
      icon: '🚚',
      description: 'Your order is on its way',
    },
    delivered: {
      label: 'Delivered',
      color: '#22c55e',
      icon: '✅',
      description: 'Your order has been delivered',
    },
    cancelled: {
      label: 'Cancelled',
      color: '#ef4444',
      icon: '❌',
      description: 'This order has been cancelled',
    },
  };

  return statusMap[status] || statusMap.pending;
}

/**
 * Format date for display
 */
export function formatDate(dateString) {
  if (!dateString) return '';
  const date = new Date(dateString);
  return date.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

/**
 * Format date with time for display
 */
export function formatDateTime(dateString) {
  if (!dateString) return '';
  const date = new Date(dateString);
  return date.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}