// js/ui/queue.js
// Generation queue and history UI

import { state } from '../core/state.js';
import { $, showToast } from '../core/utils.js';
import { openProjectById } from '../api/projects.js';
import { openImageModal } from './modals.js';

// Local history storage (synced with server for logged-in users)
let generationHistory = [];
const MAX_DROPDOWN_ITEMS = 5;

// Cache settings
const CACHE_KEY = 'generationHistory';
const CACHE_TIMESTAMP_KEY = 'generationHistoryTimestamp';
const CACHE_MAX_AGE_MS = 5 * 60 * 1000; // 5 minutes

// Track if dropdown is open for auto-refresh
let isDropdownOpen = false;

// Track if we've already fetched from server this session
let hasFetchedThisSession = false;

// Initialize queue UI
export function initQueueUI() {
  const btn = $("queue-btn");
  const dropdown = $("queue-dropdown");
  
  if (!btn || !dropdown) return;
  
  // Toggle dropdown
  btn.addEventListener("click", (e) => {
    e.stopPropagation();
    const wasHidden = dropdown.classList.contains("hidden");
    dropdown.classList.toggle("hidden");
    isDropdownOpen = wasHidden;
    
    // Refresh the list when opening
    if (isDropdownOpen) {
      renderQueueDropdown();
    }
  });
  
  // Close on outside click
  document.addEventListener("click", (e) => {
    if (!dropdown.contains(e.target) && e.target !== btn) {
      dropdown.classList.add("hidden");
      isDropdownOpen = false;
    }
  });
  
  // Show all history button
  $("show-all-history")?.addEventListener("click", () => {
    dropdown.classList.add("hidden");
    isDropdownOpen = false;
    openHistoryModal();
  });
  
  // Close history modal
  $("close-history-modal")?.addEventListener("click", closeHistoryModal);
  
  $("history-modal")?.addEventListener("click", (e) => {
    if (e.target?.classList?.contains("modal-backdrop")) {
      closeHistoryModal();
    }
  });
  
  // Escape key to close history modal
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      closeHistoryModal();
    }
  });
  
  // Load initial history from cache (instant)
  loadHistoryFromCache();
  
  // Check if we should fetch from server (cache is stale)
  maybeRefreshFromServer();
}

// Check if cache is stale and fetch from server if needed
function isCacheStale() {
  try {
    const timestamp = localStorage.getItem(CACHE_TIMESTAMP_KEY);
    if (!timestamp) return true;
    
    const age = Date.now() - parseInt(timestamp, 10);
    return age > CACHE_MAX_AGE_MS;
  } catch (e) {
    return true;
  }
}

// Maybe refresh from server if cache is stale
async function maybeRefreshFromServer() {
  // Only fetch if cache is stale AND we haven't fetched this session
  if (isCacheStale() && !hasFetchedThisSession) {
    await loadHistoryFromServer();
  }
}

// Force load history from server (called on login)
export async function loadHistoryFromServer() {
  try {
    const res = await fetch("/api/generation-history", {
      credentials: 'include'
    });
    
    if (res.ok) {
      const data = await res.json();
      if (data.history) {
        // Merge server history with any local items not yet synced
        mergeServerHistory(data.history);
        hasFetchedThisSession = true;
        refreshDropdownIfOpen();
      }
    }
  } catch (e) {
    console.warn("Could not load generation history from server:", e);
  }
}

// Merge server history with local, keeping local items that may not be synced yet
function mergeServerHistory(serverHistory) {
  // Get IDs from server
  const serverIds = new Set(serverHistory.map(h => h.id));
  
  // Keep local items that aren't on server (recently added, not yet synced)
  const recentLocalOnly = generationHistory.filter(h => 
    !serverIds.has(h.id) && 
    (Date.now() - h.timestamp) < 60000 // Less than 1 minute old
  );
  
  // Combine: recent local items first, then server history
  generationHistory = [...recentLocalOnly, ...serverHistory];
  
  // Keep only 50
  if (generationHistory.length > 50) {
    generationHistory = generationHistory.slice(0, 50);
  }
  
  // Update cache
  saveHistoryToCache();
}

// Add a generation to history
export async function addToHistory(item) {
  // item: { projectId, projectTitle, page, imageUrl, status, timestamp }
  const historyItem = {
    id: `${item.projectId}-${item.page}-${Date.now()}`,
    projectId: item.projectId,
    projectTitle: item.projectTitle || 'Untitled Book',
    page: item.page,
    imageUrl: item.imageUrl,
    status: item.status || 'complete',
    timestamp: item.timestamp || Date.now(),
    synced: false, // Track if synced to server
  };
  
  // Add to front of local history
  generationHistory.unshift(historyItem);
  
  // Keep only last 50 items locally
  if (generationHistory.length > 50) {
    generationHistory = generationHistory.slice(0, 50);
  }
  
  // Save to cache
  saveHistoryToCache();
  
  // Update badge and refresh dropdown if open
  updateQueueBadge();
  refreshDropdownIfOpen();
  
  // Persist to server (non-blocking)
  persistToServer(item, historyItem.id);
}

// Persist history item to server
async function persistToServer(item, localId) {
  try {
    const res = await fetch("/api/generation-history", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: 'include',
      body: JSON.stringify({
        projectId: item.projectId,
        projectTitle: item.projectTitle,
        page: item.page,
        imageUrl: item.imageUrl,
        status: item.status,
      }),
    });
    
    if (res.ok) {
      const data = await res.json();
      // Update local item with server ID and mark as synced
      const localItem = generationHistory.find(h => h.id === localId);
      if (localItem && data.item) {
        localItem.id = data.item.id;
        localItem.synced = true;
        saveHistoryToCache();
      }
    }
  } catch (e) {
    // Silently fail - local storage is the backup
    console.warn("Could not persist generation history to server:", e);
  }
}

// Update an existing history item status
export function updateHistoryItem(projectId, page, updates) {
  const item = generationHistory.find(h => 
    h.projectId === projectId && h.page === page && h.status === 'generating'
  );
  
  if (item) {
    Object.assign(item, updates);
    saveHistoryToCache();
    refreshDropdownIfOpen();
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

// Refresh dropdown if it's currently open
export function refreshDropdownIfOpen() {
  if (isDropdownOpen) {
    renderQueueDropdown();
  }
}

// Get thumbnail HTML based on status
function getThumbnailHtml(item) {
  if (item.status === 'generating') {
    return `<div class="queue-thumb-icon generating"><div class="spinner"></div></div>`;
  } else if (item.status === 'queued') {
    return `<div class="queue-thumb-icon queued">⏳</div>`;
  } else if (item.status === 'failed') {
    return `<div class="queue-thumb-icon failed">✕</div>`;
  } else if (item.imageUrl) {
    return `<img src="${item.imageUrl}" alt="Page ${item.page}">`;
  } else {
    return `<div class="queue-thumb-icon">📄</div>`;
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
    <div class="queue-item" data-project-id="${item.projectId}" data-page="${item.page}" data-status="${item.status}" data-image-url="${item.imageUrl || ''}">
      <div class="queue-item-thumb">
        ${getThumbnailHtml(item)}
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
      const page = parseInt(el.dataset.page, 10);
      const status = el.dataset.status;
      const imageUrl = el.dataset.imageUrl;
      
      if (!projectId) return;
      
      $("queue-dropdown")?.classList.add("hidden");
      isDropdownOpen = false;
      
      // Navigate to project
      await openProjectById(projectId, "storyboard");
      
      // If completed with image, open the modal for that page
      if (status === 'complete' && imageUrl) {
        // Small delay to let the storyboard render
        setTimeout(() => {
          openImageModal(page, imageUrl);
        }, 300);
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
    <div class="history-item" data-project-id="${item.projectId}" data-page="${item.page}" data-status="${item.status}" data-image-url="${item.imageUrl || ''}">
      <div class="history-item-thumb">
        ${getThumbnailHtml(item)}
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
      const page = parseInt(el.dataset.page, 10);
      const status = el.dataset.status;
      const imageUrl = el.dataset.imageUrl;
      
      if (!projectId) return;
      
      closeHistoryModal();
      
      // Navigate to project
      await openProjectById(projectId, "storyboard");
      
      // If completed with image, open the modal for that page
      if (status === 'complete' && imageUrl) {
        // Small delay to let the storyboard render
        setTimeout(() => {
          openImageModal(page, imageUrl);
        }, 300);
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

// Save history to localStorage cache with timestamp
function saveHistoryToCache() {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify(generationHistory));
    localStorage.setItem(CACHE_TIMESTAMP_KEY, String(Date.now()));
  } catch (e) {
    console.warn('Could not save generation history to cache:', e);
  }
}

// Load history from localStorage cache
function loadHistoryFromCache() {
  try {
    const stored = localStorage.getItem(CACHE_KEY);
    if (stored) {
      generationHistory = JSON.parse(stored);
    }
  } catch (e) {
    console.warn('Could not load generation history from cache:', e);
    generationHistory = [];
  }
}

// Export for use by illustrations.js
export { generationHistory };