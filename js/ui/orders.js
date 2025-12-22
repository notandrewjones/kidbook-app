// js/ui/orders.js
// Orders page UI component

import { $, showToast, showLoader } from '../core/utils.js';
import { state, setPhase } from '../core/state.js';
import { navigate } from '../core/router.js';
import { 
  getOrders, 
  getOrderDetails, 
  requestCancellation, 
  reorder, 
  createSupportTicket,
  getFulfillmentStatusInfo, 
  formatPrice, 
  formatDate,
  formatDateTime 
} from '../api/orders.js';

let currentOrders = [];
let selectedOrderId = null;

/**
 * Load and render the orders page
 */
export async function loadOrdersPage() {
  setPhase("orders");
  
  // Update workspace title
  const title = $("workspace-title");
  const subtitle = $("workspace-subtitle");
  if (title) title.textContent = "My Orders";
  if (subtitle) subtitle.textContent = "Track your orders and manage shipments";

  // Add dashboard-mode to hide sidebar
  const main = $("main") || document.querySelector(".main");
  main?.classList.add("dashboard-mode");

  navigate("orders");

  showLoader("Loading your orders...");

  try {
    const { orders } = await getOrders();
    currentOrders = orders;
    renderOrdersList(orders);
  } catch (err) {
    console.error("Error loading orders:", err);
    $("results").innerHTML = `
      <div class="empty-state">
        <div class="empty-icon">📦</div>
        <h3>Unable to load orders</h3>
        <p>${err.message}</p>
      </div>
    `;
  }
}

/**
 * Render the orders list
 */
function renderOrdersList(orders) {
  const container = $("results");
  if (!container) return;

  if (!orders || orders.length === 0) {
    container.innerHTML = `
      <div class="empty-state">
        <div class="empty-icon">📦</div>
        <h3>No orders yet</h3>
        <p>When you purchase books, they'll appear here.</p>
        <button class="btn btn-primary" onclick="document.getElementById('nav-dashboard')?.click()">
          Browse Your Books
        </button>
      </div>
    `;
    return;
  }

  container.innerHTML = `
    <div class="orders-page">
      <div class="orders-list">
        ${orders.map(order => renderOrderCard(order)).join('')}
      </div>
    </div>
  `;

  // Bind event listeners
  bindOrderEvents();
}

/**
 * Render a single order card
 */
function renderOrderCard(order) {
  const statusInfo = getFulfillmentStatusInfo(order.fulfillmentStatus, order.status);
  const hasTracking = order.trackingNumber && order.trackingUrl;
  const isDelivered = order.fulfillmentStatus === 'delivered';
  const isRefunded = order.status === 'refunded';
  const isCancelled = order.fulfillmentStatus === 'cancelled' || isRefunded;
  const canCancel = !isCancelled && !['shipped', 'delivered'].includes(order.fulfillmentStatus) && !order.cancellationRequestedAt;
  const canReorder = isDelivered || isCancelled; // Can reorder if delivered or cancelled/refunded

  return `
    <div class="order-card ${isCancelled ? 'order-card-cancelled' : ''}" data-order-id="${order.id}">
      <div class="order-card-header">
        <div class="order-card-info">
          <span class="order-number">Order #${order.id.substring(0, 8).toUpperCase()}</span>
          <span class="order-date">${formatDate(order.createdAt)}</span>
        </div>
        <div class="order-status" style="--status-color: ${statusInfo.color}">
          <span class="status-icon">${statusInfo.icon}</span>
          <span class="status-label">${statusInfo.label}</span>
        </div>
      </div>

      <div class="order-card-body">
        <div class="order-product">
          <div class="order-product-thumb">
            ${order.bookThumbnail 
              ? `<img src="${order.bookThumbnail}" alt="${order.bookTitle}" />`
              : '<div class="order-thumb-placeholder">📚</div>'
            }
          </div>
          <div class="order-product-details">
            <div class="order-product-title">${order.bookTitle}</div>
            <div class="order-product-type">
              ${order.productType === 'ebook' ? '📱 Digital Ebook' : `📚 ${order.productDisplayName}${order.sizeDisplayName ? ` (${order.sizeDisplayName})` : ''}`}
            </div>
            <div class="order-product-price">${formatPrice(order.amountCents)}</div>
          </div>
        </div>

        ${hasTracking && !isCancelled ? `
          <div class="order-tracking">
            <div class="tracking-label">
              <span class="tracking-carrier">${order.shippingCarrier || 'Carrier'}</span>
              <span class="tracking-number">${order.trackingNumber}</span>
            </div>
            <a href="${order.trackingUrl}" target="_blank" rel="noopener" class="btn btn-sm btn-secondary">
              Track Package
            </a>
          </div>
        ` : ''}

        ${order.estimatedDeliveryDate && !isDelivered ? `
          <div class="order-eta">
            <span class="eta-label">Estimated Delivery:</span>
            <span class="eta-date">${formatDate(order.estimatedDeliveryDate)}</span>
          </div>
        ` : ''}

        ${order.cancellationRequestedAt ? `
          <div class="order-cancellation-notice">
            <span class="notice-icon">⏳</span>
            <span>Cancellation requested on ${formatDate(order.cancellationRequestedAt)}</span>
          </div>
        ` : ''}
      </div>

      <div class="order-card-actions">
        <button class="btn btn-sm btn-ghost order-details-btn" data-order-id="${order.id}">
          View Details
        </button>
        ${canReorder ? `
          <button class="btn btn-sm btn-primary order-reorder-btn" data-order-id="${order.id}">
            Reorder
          </button>
        ` : ''}
        ${(isDelivered || isCancelled) ? `
          <button class="btn btn-sm btn-secondary order-support-btn" data-order-id="${order.id}">
            Get Help
          </button>
        ` : canCancel ? `
          <button class="btn btn-sm btn-danger-ghost order-cancel-btn" data-order-id="${order.id}">
            Request Cancellation
          </button>
        ` : ''}
      </div>
    </div>
  `;
}

/**
 * Bind event listeners for order actions
 */
function bindOrderEvents() {
  // View details
  document.querySelectorAll('.order-details-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const orderId = btn.dataset.orderId;
      openOrderDetailsModal(orderId);
    });
  });

  // Reorder
  document.querySelectorAll('.order-reorder-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      const orderId = btn.dataset.orderId;
      try {
        btn.disabled = true;
        btn.textContent = 'Adding...';
        await reorder(orderId);
        showToast('Added to Cart', 'Item has been added to your cart', 'success');
        btn.textContent = 'Reorder';
        btn.disabled = false;
      } catch (err) {
        showToast('Error', err.message, 'error');
        btn.textContent = 'Reorder';
        btn.disabled = false;
      }
    });
  });

  // Support
  document.querySelectorAll('.order-support-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const orderId = btn.dataset.orderId;
      openSupportModal(orderId);
    });
  });

  // Cancel
  document.querySelectorAll('.order-cancel-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const orderId = btn.dataset.orderId;
      openCancelModal(orderId);
    });
  });
}

/**
 * Open order details modal
 */
async function openOrderDetailsModal(orderId) {
  selectedOrderId = orderId;
  const order = currentOrders.find(o => o.id === orderId);
  if (!order) return;

  const statusInfo = getFulfillmentStatusInfo(order.fulfillmentStatus);

  const modal = document.createElement('div');
  modal.id = 'order-details-modal';
  modal.className = 'modal';
  modal.innerHTML = `
    <div class="modal-backdrop"></div>
    <div class="modal-dialog order-details-dialog">
      <div class="modal-header">
        <div class="modal-header-left">
          <div class="modal-title">Order Details</div>
          <div class="modal-subtitle">Order #${orderId.substring(0, 8).toUpperCase()}</div>
        </div>
        <button class="icon-btn modal-close-btn" id="close-order-details">✕</button>
      </div>
      <div class="modal-body">
        <div class="order-details-content">
          <!-- Status Timeline -->
          <div class="order-timeline">
            <h4>Order Status</h4>
            ${renderStatusTimeline(order)}
          </div>

          <!-- Product Info -->
          <div class="order-details-section">
            <h4>Product</h4>
            <div class="order-product-large">
              <div class="order-product-thumb-lg">
                ${order.bookThumbnail 
                  ? `<img src="${order.bookThumbnail}" alt="${order.bookTitle}" />`
                  : '<div class="order-thumb-placeholder">📚</div>'
                }
              </div>
              <div class="order-product-info">
                <div class="order-product-title">${order.bookTitle}</div>
                <div class="order-product-type">${order.productDisplayName}${order.sizeDisplayName ? ` - ${order.sizeDisplayName}` : ''}</div>
                <div class="order-product-price">${formatPrice(order.amountCents)}</div>
              </div>
            </div>
          </div>

          <!-- Tracking Info -->
          ${order.trackingNumber ? `
            <div class="order-details-section">
              <h4>Tracking</h4>
              <div class="tracking-details">
                <div class="tracking-row">
                  <span class="tracking-label">Carrier:</span>
                  <span class="tracking-value">${order.shippingCarrier || 'N/A'}</span>
                </div>
                <div class="tracking-row">
                  <span class="tracking-label">Tracking #:</span>
                  <span class="tracking-value">${order.trackingNumber}</span>
                </div>
                ${order.trackingUrl ? `
                  <a href="${order.trackingUrl}" target="_blank" rel="noopener" class="btn btn-primary btn-full">
                    Track Package
                  </a>
                ` : ''}
              </div>
            </div>
          ` : ''}

          <!-- Order Dates -->
          <div class="order-details-section">
            <h4>Timeline</h4>
            <div class="order-dates">
              <div class="date-row">
                <span class="date-label">Ordered:</span>
                <span class="date-value">${formatDateTime(order.createdAt)}</span>
              </div>
              ${order.paidAt ? `
                <div class="date-row">
                  <span class="date-label">Paid:</span>
                  <span class="date-value">${formatDateTime(order.paidAt)}</span>
                </div>
              ` : ''}
              ${order.shippedAt ? `
                <div class="date-row">
                  <span class="date-label">Shipped:</span>
                  <span class="date-value">${formatDateTime(order.shippedAt)}</span>
                </div>
              ` : ''}
              ${order.deliveredAt ? `
                <div class="date-row">
                  <span class="date-label">Delivered:</span>
                  <span class="date-value">${formatDateTime(order.deliveredAt)}</span>
                </div>
              ` : ''}
              ${order.estimatedDeliveryDate && !order.deliveredAt ? `
                <div class="date-row">
                  <span class="date-label">Est. Delivery:</span>
                  <span class="date-value">${formatDate(order.estimatedDeliveryDate)}</span>
                </div>
              ` : ''}
            </div>
          </div>
        </div>
      </div>
    </div>
  `;

  document.body.appendChild(modal);

  // Bind close events
  const closeBtn = modal.querySelector('#close-order-details');
  const backdrop = modal.querySelector('.modal-backdrop');

  const closeModal = () => {
    modal.remove();
    selectedOrderId = null;
  };

  closeBtn?.addEventListener('click', closeModal);
  backdrop?.addEventListener('click', closeModal);
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closeModal();
  }, { once: true });
}

/**
 * Render status timeline
 */
function renderStatusTimeline(order) {
  const steps = [
    { key: 'pending', label: 'Order Placed', icon: '📝' },
    { key: 'processing', label: 'Printing', icon: '🖨️' },
    { key: 'shipped', label: 'Shipped', icon: '🚚' },
    { key: 'delivered', label: 'Delivered', icon: '✅' },
  ];

  const statusOrder = ['pending', 'processing', 'printed', 'shipped', 'delivered'];
  const currentIndex = statusOrder.indexOf(order.fulfillmentStatus);

  return `
    <div class="status-timeline">
      ${steps.map((step, index) => {
        const stepIndex = statusOrder.indexOf(step.key);
        const isComplete = currentIndex >= stepIndex;
        const isCurrent = order.fulfillmentStatus === step.key || 
          (step.key === 'processing' && order.fulfillmentStatus === 'printed');
        
        return `
          <div class="timeline-step ${isComplete ? 'complete' : ''} ${isCurrent ? 'current' : ''}">
            <div class="timeline-icon">${step.icon}</div>
            <div class="timeline-label">${step.label}</div>
          </div>
        `;
      }).join('')}
    </div>
  `;
}

/**
 * Open support modal
 */
function openSupportModal(orderId) {
  const order = currentOrders.find(o => o.id === orderId);
  
  const modal = document.createElement('div');
  modal.id = 'support-modal';
  modal.className = 'modal';
  modal.innerHTML = `
    <div class="modal-backdrop"></div>
    <div class="modal-dialog auth-modal-dialog">
      <div class="modal-header">
        <div class="modal-header-left">
          <div class="modal-title">Get Help</div>
          <div class="modal-subtitle">Order #${orderId.substring(0, 8).toUpperCase()}</div>
        </div>
        <button class="icon-btn modal-close-btn" id="close-support-modal">✕</button>
      </div>
      <div class="modal-body">
        <form id="support-form" class="auth-form">
          <div class="form-group">
            <label for="support-category">Issue Type</label>
            <select id="support-category" required>
              <option value="shipping">Shipping Issue</option>
              <option value="order">Order Issue</option>
              <option value="refund">Refund Request</option>
              <option value="other">Other</option>
            </select>
          </div>
          <div class="form-group">
            <label for="support-subject">Subject</label>
            <input type="text" id="support-subject" placeholder="Brief description" required />
          </div>
          <div class="form-group">
            <label for="support-message">Message</label>
            <textarea id="support-message" rows="4" placeholder="Please describe your issue in detail..." required></textarea>
          </div>
          <button type="submit" class="btn btn-primary btn-full">
            Submit Request
          </button>
        </form>
      </div>
    </div>
  `;

  document.body.appendChild(modal);

  const closeModal = () => modal.remove();
  modal.querySelector('#close-support-modal')?.addEventListener('click', closeModal);
  modal.querySelector('.modal-backdrop')?.addEventListener('click', closeModal);

  modal.querySelector('#support-form')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const category = modal.querySelector('#support-category').value;
    const subject = modal.querySelector('#support-subject').value;
    const message = modal.querySelector('#support-message').value;

    try {
      await createSupportTicket(orderId, subject, message, category);
      showToast('Request Submitted', 'Our team will get back to you soon', 'success');
      closeModal();
    } catch (err) {
      showToast('Error', err.message, 'error');
    }
  });
}

/**
 * Open cancellation modal
 */
function openCancelModal(orderId) {
  const modal = document.createElement('div');
  modal.id = 'cancel-modal';
  modal.className = 'modal';
  modal.innerHTML = `
    <div class="modal-backdrop"></div>
    <div class="modal-dialog auth-modal-dialog">
      <div class="modal-header">
        <div class="modal-header-left">
          <div class="modal-title">Request Cancellation</div>
          <div class="modal-subtitle">Order #${orderId.substring(0, 8).toUpperCase()}</div>
        </div>
        <button class="icon-btn modal-close-btn" id="close-cancel-modal">✕</button>
      </div>
      <div class="modal-body">
        <div class="cancel-warning">
          <p>Are you sure you want to cancel this order?</p>
          <p class="cancel-note">If your order has already been sent to print, we may not be able to cancel it.</p>
        </div>
        <form id="cancel-form" class="auth-form">
          <div class="form-group">
            <label for="cancel-reason">Reason (optional)</label>
            <textarea id="cancel-reason" rows="3" placeholder="Let us know why you're cancelling..."></textarea>
          </div>
          <div class="form-actions">
            <button type="button" class="btn btn-secondary" id="cancel-back">
              Keep Order
            </button>
            <button type="submit" class="btn btn-danger">
              Request Cancellation
            </button>
          </div>
        </form>
      </div>
    </div>
  `;

  document.body.appendChild(modal);

  const closeModal = () => modal.remove();
  modal.querySelector('#close-cancel-modal')?.addEventListener('click', closeModal);
  modal.querySelector('#cancel-back')?.addEventListener('click', closeModal);
  modal.querySelector('.modal-backdrop')?.addEventListener('click', closeModal);

  modal.querySelector('#cancel-form')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const reason = modal.querySelector('#cancel-reason').value;

    try {
      await requestCancellation(orderId, reason);
      showToast('Cancellation Requested', 'Your request is being reviewed', 'success');
      closeModal();
      // Refresh the orders list
      loadOrdersPage();
    } catch (err) {
      showToast('Error', err.message, 'error');
    }
  });
}