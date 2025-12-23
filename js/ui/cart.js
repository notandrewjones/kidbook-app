// js/ui/cart.js
// Shopping cart UI component

import { getCart, updateCartItem, removeCartItem, checkoutCart, formatPrice } from '../api/cart.js';

let cartData = { items: [], itemCount: 0, totalCents: 0 };
let isCartOpen = false;
let isCheckingOut = false;

/**
 * Initialize cart UI
 */
export function initCart() {
  // Create cart button and dropdown in topbar
  const topbarRight = document.querySelector('.topbar-right');
  if (!topbarRight) return;

  // Find the account button to insert before it
  const accountBtn = document.querySelector('.account');
  
  const cartWrap = document.createElement('div');
  cartWrap.className = 'cart-wrap';
  cartWrap.innerHTML = `
    <button id="cart-btn" class="icon-btn cart-btn" title="Shopping Cart">
      <svg class="icon-svg" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor">
        <path stroke-linecap="round" stroke-linejoin="round" d="M2.25 3h1.386c.51 0 .955.343 1.087.835l.383 1.437M7.5 14.25a3 3 0 0 0-3 3h15.75m-12.75-3h11.218c1.121-2.3 2.1-4.684 2.924-7.138a60.114 60.114 0 0 0-16.536-1.84M7.5 14.25 5.106 5.272M6 20.25a.75.75 0 1 1-1.5 0 .75.75 0 0 1 1.5 0Zm12.75 0a.75.75 0 1 1-1.5 0 .75.75 0 0 1 1.5 0Z" />
      </svg>
      <span id="cart-badge" class="cart-badge hidden">0</span>
    </button>
    <div id="cart-dropdown" class="cart-dropdown hidden">
      <div class="cart-header">
        <span class="cart-title">Shopping Cart</span>
        <button id="cart-close" class="cart-close">×</button>
      </div>
      <div id="cart-items" class="cart-items">
        <div class="cart-empty">Your cart is empty</div>
      </div>
      <div id="cart-footer" class="cart-footer hidden">
        <div class="cart-total">
          <span>Total</span>
          <span id="cart-total-price">$0.00</span>
        </div>
        <button id="cart-checkout-btn" class="cart-checkout-btn">
          Checkout
        </button>
      </div>
    </div>
  `;

  if (accountBtn) {
    topbarRight.insertBefore(cartWrap, accountBtn);
  } else {
    topbarRight.appendChild(cartWrap);
  }

  // Bind events
  bindCartEvents();

  // Listen for cart updates
  window.addEventListener('cart-updated', () => refreshCart());

  // Initial load
  refreshCart();
}

/**
 * Bind cart UI events
 */
function bindCartEvents() {
  const cartBtn = document.getElementById('cart-btn');
  const cartClose = document.getElementById('cart-close');
  const cartDropdown = document.getElementById('cart-dropdown');
  const checkoutBtn = document.getElementById('cart-checkout-btn');

  // Toggle cart
  cartBtn?.addEventListener('click', (e) => {
    e.stopPropagation();
    toggleCart();
  });

  // Close button
  cartClose?.addEventListener('click', () => {
    closeCart();
  });

  // Click outside to close
  document.addEventListener('click', (e) => {
    if (isCartOpen && !e.target.closest('.cart-wrap')) {
      closeCart();
    }
  });

  // Checkout button
  checkoutBtn?.addEventListener('click', handleCheckout);
}

/**
 * Toggle cart dropdown
 */
function toggleCart() {
  isCartOpen = !isCartOpen;
  const dropdown = document.getElementById('cart-dropdown');
  dropdown?.classList.toggle('hidden', !isCartOpen);
  
  if (isCartOpen) {
    refreshCart();
  }
}

/**
 * Close cart dropdown
 */
export function closeCart() {
  isCartOpen = false;
  document.getElementById('cart-dropdown')?.classList.add('hidden');
}

/**
 * Refresh cart data and UI
 */
export async function refreshCart() {
  try {
    cartData = await getCart();
    renderCartItems();
    updateCartBadge();
  } catch (err) {
    console.error('Failed to refresh cart:', err);
  }
}

/**
 * Update cart badge count
 */
function updateCartBadge() {
  const badge = document.getElementById('cart-badge');
  if (!badge) return;

  if (cartData.itemCount > 0) {
    badge.textContent = cartData.itemCount > 99 ? '99+' : cartData.itemCount;
    badge.classList.remove('hidden');
  } else {
    badge.classList.add('hidden');
  }
}

/**
 * Render cart items
 */
function renderCartItems() {
  const container = document.getElementById('cart-items');
  const footer = document.getElementById('cart-footer');
  const totalPrice = document.getElementById('cart-total-price');

  if (!container) return;

  if (cartData.items.length === 0) {
    container.innerHTML = '<div class="cart-empty">Your cart is empty</div>';
    footer?.classList.add('hidden');
    return;
  }

  footer?.classList.remove('hidden');
  if (totalPrice) totalPrice.textContent = cartData.totalFormatted;

  container.innerHTML = cartData.items.map(item => `
    <div class="cart-item" data-item-id="${item.id}">
      <div class="cart-item-thumb">
        ${item.book_thumbnail 
          ? `<img src="${item.book_thumbnail}" alt="${item.book_title}" />`
          : '<div class="cart-item-thumb-placeholder">📚</div>'
        }
      </div>
      <div class="cart-item-details">
        <div class="cart-item-title">${item.book_title}</div>
        <div class="cart-item-type">
          ${item.product_type === 'ebook' ? '📱 Ebook' : `📚 Hardcover${item.size_display_name ? ` (${item.size_display_name})` : ''}`}
        </div>
        <div class="cart-item-price">${formatPrice(item.unit_price_cents)} each</div>
      </div>
      <div class="cart-item-quantity">
        <button class="qty-btn qty-minus" data-book="${item.book_id}" data-type="${item.product_type}" data-size="${item.size || ''}">−</button>
        <span class="qty-value">${item.quantity}</span>
        <button class="qty-btn qty-plus" data-book="${item.book_id}" data-type="${item.product_type}" data-size="${item.size || ''}">+</button>
      </div>
      <div class="cart-item-line-total">${formatPrice(item.line_total_cents)}</div>
      <button class="cart-item-remove" data-book="${item.book_id}" data-type="${item.product_type}" data-size="${item.size || ''}" title="Remove">×</button>
    </div>
  `).join('');

  // Bind quantity buttons
  container.querySelectorAll('.qty-minus').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      e.stopPropagation();
      const { book, type, size } = btn.dataset;
      const item = cartData.items.find(i => 
        i.book_id === book && i.product_type === type && (i.size || '') === size
      );
      if (!item) return;
      
      // Show spinner
      const qtyEl = btn.parentElement.querySelector('.qty-value');
      showQtySpinner(qtyEl);
      
      if (item.quantity > 1) {
        await updateCartItem(book, type, { size: size || null, quantity: item.quantity - 1, action: 'set' });
      } else {
        await removeCartItem(book, type, size || null);
      }
      refreshCart();
    });
  });

  container.querySelectorAll('.qty-plus').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      e.stopPropagation();
      const { book, type, size } = btn.dataset;
      
      // Show spinner
      const qtyEl = btn.parentElement.querySelector('.qty-value');
      showQtySpinner(qtyEl);
      
      await updateCartItem(book, type, { size: size || null, quantity: 1, action: 'add' });
      refreshCart();
    });
  });

  container.querySelectorAll('.cart-item-remove').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      e.stopPropagation();
      const { book, type, size } = btn.dataset;
      
      // Show spinner on the whole item
      const cartItem = btn.closest('.cart-item');
      cartItem?.classList.add('removing');
      
      await removeCartItem(book, type, size || null);
      refreshCart();
    });
  });
}

/**
 * Show spinner in place of quantity value
 */
function showQtySpinner(qtyEl) {
  if (!qtyEl) return;
  qtyEl.innerHTML = `<div class="spinner qty-spinner"></div>`;
}

/**
 * Handle checkout
 */
async function handleCheckout() {
  if (isCheckingOut) return;
  isCheckingOut = true;

  const checkoutBtn = document.getElementById('cart-checkout-btn');
  if (checkoutBtn) {
    checkoutBtn.textContent = 'Processing...';
    checkoutBtn.disabled = true;
  }

  try {
    const { checkoutUrl } = await checkoutCart(false);
    window.location.href = checkoutUrl;
  } catch (err) {
    console.error('Checkout failed:', err);
    alert('Checkout failed: ' + err.message);
    
    if (checkoutBtn) {
      checkoutBtn.textContent = 'Checkout';
      checkoutBtn.disabled = false;
    }
  } finally {
    isCheckingOut = false;
  }
}

/**
 * Get current cart data (for external use)
 */
export function getCartData() {
  return cartData;
}