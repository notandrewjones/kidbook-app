// js/ui/order-confirmation.js
// Order confirmation modal after successful checkout

import { $ } from '../core/utils.js';

/**
 * Check URL for payment success and show modal if needed
 */
export function checkPaymentSuccess() {
  const params = new URLSearchParams(window.location.search);
  const paymentStatus = params.get('payment');
  
  if (paymentStatus === 'success') {
    // Get order IDs from URL
    const orderIds = params.get('orders')?.split(',') || [];
    const sessionId = params.get('session_id');
    
    // Show the confirmation modal
    showOrderConfirmation(orderIds, sessionId);
    
    // Clean up URL (remove query params without refreshing)
    const cleanUrl = window.location.pathname;
    window.history.replaceState({}, '', cleanUrl);
  } else if (paymentStatus === 'cancelled') {
    // Could show a toast or message here
    console.log('Payment was cancelled');
    
    // Clean up URL
    const cleanUrl = window.location.pathname;
    window.history.replaceState({}, '', cleanUrl);
  }
}

/**
 * Show the order confirmation modal
 */
export function showOrderConfirmation(orderIds = [], sessionId = null) {
  const modal = $('order-confirmation-modal');
  if (!modal) return;
  
  // Set order number(s)
  const orderNumberEl = $('order-number');
  if (orderNumberEl) {
    if (orderIds.length > 0) {
      // Show first order ID (truncated for display)
      const displayId = orderIds[0].substring(0, 8).toUpperCase();
      orderNumberEl.textContent = `#${displayId}`;
    } else if (sessionId) {
      // Use session ID if no order IDs
      const displayId = sessionId.substring(0, 8).toUpperCase();
      orderNumberEl.textContent = `#${displayId}`;
    } else {
      orderNumberEl.textContent = '#' + Math.random().toString(36).substring(2, 10).toUpperCase();
    }
  }
  
  // Reset animation state
  const successIcon = $('order-success-icon');
  const checkmark = $('order-success-checkmark');
  
  if (successIcon) {
    successIcon.classList.remove('complete');
  }
  if (checkmark) {
    checkmark.classList.remove('show');
  }
  
  // Show modal
  modal.classList.remove('hidden');
  modal.setAttribute('aria-hidden', 'false');
  
  // After 3 seconds, show the checkmark and hide the truck
  setTimeout(() => {
    if (successIcon) {
      successIcon.classList.add('complete');
    }
    if (checkmark) {
      checkmark.classList.add('show');
    }
  }, 3000);
  
  // Bind close button
  const closeBtn = $('close-order-modal');
  closeBtn?.addEventListener('click', closeOrderConfirmation, { once: true });
  
  // Close on backdrop click
  modal.addEventListener('click', (e) => {
    if (e.target.classList.contains('modal-backdrop')) {
      closeOrderConfirmation();
    }
  }, { once: true });
  
  // Close on Escape
  const escHandler = (e) => {
    if (e.key === 'Escape') {
      closeOrderConfirmation();
      document.removeEventListener('keydown', escHandler);
    }
  };
  document.addEventListener('keydown', escHandler);
}

/**
 * Close the order confirmation modal
 */
export function closeOrderConfirmation() {
  const modal = $('order-confirmation-modal');
  if (!modal) return;
  
  modal.classList.add('hidden');
  modal.setAttribute('aria-hidden', 'true');
}

/**
 * Initialize order confirmation (call on app load)
 */
export function initOrderConfirmation() {
  // Check for payment success on page load
  checkPaymentSuccess();
}