// js/ui/queue.js
// Generation queue and history UI

import { state } from '../core/state.js';
import { $, showToast } from '../core/utils.js';
import { openProjectById } from '../api/projects.js';

// Local history storage (will persist to user account)
let generationHistory = [];
const MAX_DROPDOWN_ITEMS = 5;

// Initialize queue UI
export function initQueueUI() {
  const btn = $("queue-btn");
  const dropdown = $("queue-dropdown");
  
  if (!btn || !dropdown) return;
  
  // Toggle dropdown
  btn.addEventListener("click", (e) => {
    e.stopPropagation();
    dropdown.classList.toggle("hidden");
    
    // Refresh the list when opening
    if (!dropdown.classList.contains("hidden")) {
      renderQueueDropdown();
    }
  });
  
  // Close on outside click
  document.addEventListener("click", (e) => {
    if (!dropdown.contains(e.target) && e.target !== btn) {
      dropdown.classList.add("hidden");
    }
  });
  
  // Show all history button
  $("show-all-history")?.addEventListener("click", () => {
    dropdown.classList.add("hidden");
    openHistoryModal();
  });
  
  // Close history modal
  $("close-history-modal")?.addEventListener("click", closeHistoryModal);
  
  $("history-modal")?.addEventListener("click", (e) => {
    if (e.target?.classList?.contains("modal-backdrop")) {
      closeHistoryModal();
    }
  });
  
  // Load initial history
  loadHistory();
}

// Add a generation to history
export function addToHistory(item) {
  // item: { projectId, projectTitle, page, imageUrl, status, timestamp }
  const historyItem = {
    id: `${item.projectId}-${item.page}-${Date.now()}`,
    projectId: item.projectId,
    projectTitle: item.projectTitle || 'Untitled Book',
    page: item.page,
    imageUrl: item.imageUrl,
    status: item.status || 'complete', // 'generating', 'complete', 'failed', 'queued'
    timestamp: item.timestamp || Date.now(),
  };
  
  // Add to front
  generationHistory.unshift(historyItem);
  
  // Keep only last 50 items
  if (generationHistory.length > 50) {
    generationHistory = generationHistory.slice(0, 50);
  }
  
  // Save to localStorage (will sync to server later)
  saveHistory();
  
  // Update badge
  updateQueueBadge();
}

// Update an existing history item status
export function updateHistoryItem(projectId, page, updates) {
  const item = generationHistory.find(h => 
    h.projectId === projectId && h.page === page && h.status === 'generating'
  );
  
  if (item) {
    Object.assign(item, updates);
    saveHistory();
  }
}

// Get active generations count
function getActiveCount() {
  return state.generatingPages.size + state.queuedPages.size;
}

// Update the badge showing active generations
export function updateQueueBadge() {
  const badge = $("queue-badge");
  if (!badge) return;
  
  const count = getActiveCount();
  
  if (count > 0) {
    badge.textContent = count;
    badge.classList.remove("hidden");
  } else {
    badge.classList.add("hidden");
  }
}

// Render the dropdown with recent items
function renderQueueDropdown() {
  const list = $("queue-list");
  if (!list) return;
  
  // Get active generations first
  const activeItems = [];
  
  // Add currently generating pages
  state.generatingPages.forEach(pageNum => {
    activeItems.push({
      id: `gen-${pageNum}`,
      projectId: localStorage.getItem("projectId"),
      projectTitle: state.cachedProject?.selected_idea?.title || 'Current Project',
      page: pageNum,
      imageUrl: null,
      status: 'generating',
      timestamp: Date.now(),
    });
  });
  
  // Add queued pages
  state.queuedPages.forEach(pageNum => {
    activeItems.push({
      id: `queue-${pageNum}`,
      projectId: localStorage.getItem("projectId"),
      projectTitle: state.cachedProject?.selected_idea?.title || 'Current Project',
      page: pageNum,
      imageUrl: null,
      status: 'queued',
      timestamp: Date.now(),
    });
  });
  
  // Combine with recent history
  const recentHistory = generationHistory
    .filter(h => h.status === 'complete' || h.status === 'failed')
    .slice(0, MAX_DROPDOWN_ITEMS - activeItems.length);
  
  const allItems = [...activeItems, ...recentHistory];
  
  if (allItems.length === 0) {
    list.innerHTML = `<div class="queue-empty">No recent generations</div>`;
    return;
  }
  
  list.innerHTML = allItems.map(item => `
    <div class="queue-item" data-project-id="${item.projectId}" data-page="${item.page}">
      <div class="queue-item-thumb">
        ${item.imageUrl 
          ? `<img src="${item.imageUrl}" alt="Page ${item.page}">`
          : `<span style="font-size:18px;">📄</span>`
        }
      </div>
      <div class="queue-item-info">
        <div class="queue-item-title">${escapeHtml(item.projectTitle)}</div>
        <div class="queue-item-meta">Page ${item.page}</div>
      </div>
      <span class="queue-item-status ${item.status}">${getStatusLabel(item.status)}</span>
    </div>
  `).join("");
  
  // Wire click events
  list.querySelectorAll(".queue-item").forEach(el => {
    el.addEventListener("click", async () => {
      const projectId = el.dataset.projectId;
      if (projectId) {
        $("queue-dropdown")?.classList.add("hidden");
        await openProjectById(projectId, "storyboard");
      }
    });
  });
}

// Open history modal
function openHistoryModal() {
  const modal = $("history-modal");
  if (!modal) return;
  
  modal.classList.remove("hidden");
  modal.setAttribute("aria-hidden", "false");
  
  renderHistoryModal();
}

// Close history modal
function closeHistoryModal() {
  const modal = $("history-modal");
  if (!modal) return;
  
  modal.classList.add("hidden");
  modal.setAttribute("aria-hidden", "true");
}

// Render full history in modal
function renderHistoryModal() {
  const list = $("history-list");
  if (!list) return;
  
  if (generationHistory.length === 0) {
    list.innerHTML = `<div class="queue-empty">No generation history yet</div>`;
    return;
  }
  
  list.innerHTML = generationHistory.map(item => `
    <div class="history-item" data-project-id="${item.projectId}" data-page="${item.page}">
      <div class="history-item-thumb">
        ${item.imageUrl 
          ? `<img src="${item.imageUrl}" alt="Page ${item.page}">`
          : `<span style="font-size:24px;">📄</span>`
        }
      </div>
      <div class="history-item-info">
        <div class="history-item-title">${escapeHtml(item.projectTitle)} - Page ${item.page}</div>
        <div class="history-item-meta">
          <span class="queue-item-status ${item.status}" style="display:inline-block;">${getStatusLabel(item.status)}</span>
        </div>
      </div>
      <div class="history-item-date">${formatDate(item.timestamp)}</div>
    </div>
  `).join("");
  
  // Wire click events
  list.querySelectorAll(".history-item").forEach(el => {
    el.addEventListener("click", async () => {
      const projectId = el.dataset.projectId;
      if (projectId) {
        closeHistoryModal();
        await openProjectById(projectId, "storyboard");
      }
    });
  });
}

// Status label helper
function getStatusLabel(status) {
  switch(status) {
    case 'generating': return 'Generating...';
    case 'complete': return 'Complete';
    case 'failed': return 'Failed';
    case 'queued': return 'Queued';
    default: return status;
  }
}

// Date formatting
function formatDate(timestamp) {
  const date = new Date(timestamp);
  const now = new Date();
  const diff = now - date;
  
  // Less than a minute
  if (diff < 60000) return 'Just now';
  
  // Less than an hour
  if (diff < 3600000) {
    const mins = Math.floor(diff / 60000);
    return `${mins}m ago`;
  }
  
  // Less than a day
  if (diff < 86400000) {
    const hours = Math.floor(diff / 3600000);
    return `${hours}h ago`;
  }
  
  // Otherwise show date
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

// Escape HTML
function escapeHtml(str) {
  if (!str) return '';
  return str.replace(/[&<>"']/g, (m) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[m]));
}

// Save history to localStorage
function saveHistory() {
  try {
    localStorage.setItem('generationHistory', JSON.stringify(generationHistory));
  } catch (e) {
    console.warn('Could not save generation history:', e);
  }
}

// Load history from localStorage
function loadHistory() {
  try {
    const stored = localStorage.getItem('generationHistory');
    if (stored) {
      generationHistory = JSON.parse(stored);
    }
  } catch (e) {
    console.warn('Could not load generation history:', e);
    generationHistory = [];
  }
}

// Export for use by illustrations.js
export { generationHistory };