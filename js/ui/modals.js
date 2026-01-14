// js/ui/modals.js
// Modal dialogs for image preview and file upload

import { state, getProjectId } from '../core/state.js';
import { $ } from '../core/utils.js';
import { handleRegenerateIllustration, handleSetIllustration } from '../api/illustrations.js';
import { uploadPhoto } from '../api/character.js';

// Track which image URL is currently being viewed in the modal
let currentlyViewingUrl = null;
let currentPrimaryUrl = null;
let currentPageNum = null;

// =====================================================
// Image Preview Modal
// =====================================================

export function openImageModal(pageNum, imageUrl) {
  const modal = $("image-modal");
  const img = $("modal-image");
  const notes = $("revision-notes");
  const regen = $("regen-btn");
  const subtitle = $("modal-subtitle");
  const historyContainer = $("revision-history");
  const useVersionBtn = $("use-version-btn");

  if (!modal || !img || !notes || !regen) return;

  img.src = imageUrl;
  notes.value = "";
  regen.dataset.page = String(pageNum);
  subtitle.textContent = `Page ${pageNum}`;

  // Track state for "Use This Version" button
  currentlyViewingUrl = imageUrl;
  currentPrimaryUrl = imageUrl;
  currentPageNum = pageNum;
  
  // Hide "Use This Version" button initially (viewing current)
  if (useVersionBtn) {
    useVersionBtn.classList.add("hidden");
    useVersionBtn.dataset.page = String(pageNum);
  }

  // Get revision history from cached project
  const illustration = state.cachedProject?.illustrations?.find(
    i => Number(i.page) === pageNum
  );
  
  const revisionHistory = illustration?.revision_history || [];
  const currentRevision = illustration?.revisions || 0;
  
  // Handle regeneration limit (max 2 regenerations = revisions 0, 1, 2 = 3 total versions)
  const MAX_REGENERATIONS = 2;
  const canRegenerate = currentRevision < MAX_REGENERATIONS;
  const remainingRegens = Math.max(0, MAX_REGENERATIONS - currentRevision);
  
  const regenAvailable = $("regen-available");
  const regenLimitReached = $("regen-limit-reached");
  const regenRemaining = $("regen-remaining");
  
  if (regenAvailable && regenLimitReached) {
    if (canRegenerate) {
      regenAvailable.classList.remove("hidden");
      regenLimitReached.classList.add("hidden");
      if (regenRemaining) {
        regenRemaining.textContent = `${remainingRegens} left`;
      }
    } else {
      regenAvailable.classList.add("hidden");
      regenLimitReached.classList.remove("hidden");
    }
  }

  // Render current version indicator
  const currentIndicator = $("current-version-indicator");
  if (currentIndicator) {
    const currentThumbUrl = `${imageUrl}?v=${Date.now()}`;
    currentIndicator.innerHTML = `
      <div class="revision-thumb active current" data-url="${currentThumbUrl}">
        <img src="${currentThumbUrl}" alt="Current version">
        <span class="revision-label">v${currentRevision} (current)</span>
      </div>
    `;
    currentIndicator.classList.remove("hidden");
    
    currentIndicator.querySelector(".revision-thumb")?.addEventListener("click", () => {
      img.src = currentThumbUrl;
      currentlyViewingUrl = currentThumbUrl;
      
      // Update active states
      historyContainer?.querySelectorAll(".revision-thumb").forEach(t => 
        t.classList.remove("active")
      );
      currentIndicator.querySelector(".revision-thumb")?.classList.add("active");
      
      // Hide "Use This Version" button since we're viewing current
      updateUseVersionButton();
    });
  }

  // Render revision history
  if (historyContainer) {
    if (revisionHistory.length > 0) {
      const historyHtml = revisionHistory
        .slice()
        .reverse() // Show newest first
        .map((rev, idx) => {
          const cacheBuster = rev.created_at || Date.now();
          const thumbUrl = `${rev.image_url}?v=${cacheBuster}`;
          return `
            <div class="revision-thumb" data-url="${thumbUrl}" data-revision="${rev.revision}">
              <img src="${thumbUrl}" alt="Revision ${rev.revision}">
              <span class="revision-label">v${rev.revision}</span>
            </div>
          `;
        })
        .join("");

      const thumbsContainer = historyContainer.querySelector(".revision-thumbs-container");
      if (thumbsContainer) {
        thumbsContainer.innerHTML = `<div class="revision-thumbs">${historyHtml}</div>`;
      }
      historyContainer.classList.remove("hidden");

      // Wire click events for history thumbnails
      historyContainer.querySelectorAll(".revision-thumb").forEach(thumb => {
        thumb.addEventListener("click", () => {
          const url = thumb.dataset.url;
          img.src = url;
          currentlyViewingUrl = url;
          
          // Update active state
          historyContainer.querySelectorAll(".revision-thumb").forEach(t => 
            t.classList.remove("active")
          );
          thumb.classList.add("active");
          
          // Remove active from current indicator
          currentIndicator?.querySelector(".revision-thumb")?.classList.remove("active");
          
          // Show "Use This Version" button since we're viewing a past revision
          updateUseVersionButton();
        });
      });
    } else {
      historyContainer.classList.add("hidden");
    }
  }

  modal.classList.remove("hidden");
  modal.setAttribute("aria-hidden", "false");
}

// Helper to show/hide "Use This Version" button based on what's being viewed
function updateUseVersionButton() {
  const useVersionBtn = $("use-version-btn");
  if (!useVersionBtn) return;
  
  // Compare URLs without cache busters
  const viewingClean = currentlyViewingUrl?.split('?')[0] || '';
  const primaryClean = currentPrimaryUrl?.split('?')[0] || '';
  
  if (viewingClean !== primaryClean) {
    useVersionBtn.classList.remove("hidden");
    useVersionBtn.dataset.selectedUrl = currentlyViewingUrl;
  } else {
    useVersionBtn.classList.add("hidden");
  }
}

// Get the currently selected URL for setting as primary
export function getSelectedRevisionUrl() {
  return currentlyViewingUrl;
}

export function getCurrentPageNum() {
  return currentPageNum;
}

export function closeImageModal() {
  const modal = $("image-modal");
  if (!modal) return;
  modal.classList.add("hidden");
  modal.setAttribute("aria-hidden", "true");
  
  // Reset tracking state
  currentlyViewingUrl = null;
  currentPrimaryUrl = null;
  currentPageNum = null;
}

// =====================================================
// Human Request Modal
// =====================================================

function openHumanRequestModal() {
  const modal = $("human-request-modal");
  if (!modal) return;
  
  // Set the page number
  const pageInput = $("human-request-page");
  if (pageInput && currentPageNum) {
    pageInput.value = `Page ${currentPageNum}`;
  }
  
  // Clear notes
  const notesInput = $("human-request-notes");
  if (notesInput) notesInput.value = "";
  
  modal.classList.remove("hidden");
  modal.setAttribute("aria-hidden", "false");
  
  // Focus notes textarea
  notesInput?.focus();
}

function closeHumanRequestModal() {
  const modal = $("human-request-modal");
  if (!modal) return;
  modal.classList.add("hidden");
  modal.setAttribute("aria-hidden", "true");
}

async function handleHumanRequestSubmit(e) {
  e.preventDefault();
  
  const projectId = getProjectId();
  const notes = $("human-request-notes")?.value?.trim();
  
  if (!projectId || !currentPageNum || !notes) {
    return;
  }
  
  // For now, just show a success message and close
  // TODO: Connect to email/notification system
  const { showToast } = await import('../core/utils.js');
  
  showToast(
    "Request submitted",
    "Our team will review your illustration",
    "success"
  );
  
  closeHumanRequestModal();
  closeImageModal();
  
  // In the future, this would send to an API:
  // await fetch('/api/human-review-request', {
  //   method: 'POST',
  //   headers: { 'Content-Type': 'application/json' },
  //   body: JSON.stringify({ projectId, page: currentPageNum, notes })
  // });
}

export function initImageModalEvents() {
  $("close-modal")?.addEventListener("click", closeImageModal);

  $("image-modal")?.addEventListener("click", (e) => {
    if (e.target?.classList?.contains("modal-backdrop")) closeImageModal();
  });

  $("regen-btn")?.addEventListener("click", handleRegenerateIllustration);
  
  // Wire up "Use This Version" button
  $("use-version-btn")?.addEventListener("click", handleSetIllustration);
  
  // Wire up "Request Human" button
  $("request-human-btn")?.addEventListener("click", openHumanRequestModal);
  
  // Human request modal events
  $("close-human-request-modal")?.addEventListener("click", closeHumanRequestModal);
  
  $("human-request-modal")?.addEventListener("click", (e) => {
    if (e.target?.classList?.contains("modal-backdrop")) closeHumanRequestModal();
  });
  
  $("human-request-form")?.addEventListener("submit", handleHumanRequestSubmit);

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      closeImageModal();
      closeUploadModal();
      closeHumanRequestModal();
    }
  });
}

// =====================================================
// Upload Modal
// =====================================================

export function openUploadModal() {
  const modal = $("upload-modal");
  if (!modal) return;

  $("upload-status").textContent = "";
  $("upload-preview").classList.add("hidden");
  $("upload-preview").innerHTML = "";

  modal.classList.remove("hidden");
  modal.setAttribute("aria-hidden", "false");
}

export function closeUploadModal() {
  const modal = $("upload-modal");
  if (!modal) return;
  modal.classList.add("hidden");
  modal.setAttribute("aria-hidden", "true");
}

export function initUploadModal() {
  const modal = $("upload-modal");
  const closeBtn = $("close-upload-modal");
  const dropzone = $("dropzone");
  const fileInput = $("child-photo");
  const chooseBtn = $("choose-file-btn");

  if (!modal || !dropzone || !fileInput) return;

  // Only bind once
  if (modal.dataset.bound === "true") return;
  modal.dataset.bound = "true";

  closeBtn?.addEventListener("click", closeUploadModal);

  modal.addEventListener("click", (e) => {
    if (e.target?.classList?.contains("modal-backdrop")) closeUploadModal();
  });

  chooseBtn?.addEventListener("click", () => fileInput.click());
  dropzone.addEventListener("click", () => fileInput.click());

  // Drag states
  ["dragenter", "dragover"].forEach((evt) => {
    dropzone.addEventListener(evt, (e) => {
      e.preventDefault();
      e.stopPropagation();
      dropzone.classList.add("dragover");
    });
  });

  ["dragleave", "drop"].forEach((evt) => {
    dropzone.addEventListener(evt, (e) => {
      e.preventDefault();
      e.stopPropagation();
      dropzone.classList.remove("dragover");
    });
  });

  dropzone.addEventListener("drop", (e) => {
    const files = e.dataTransfer?.files;
    if (files && files.length) {
      fileInput.files = files;
      showUploadPreview(files[0]);
    }
  });

  fileInput.addEventListener("change", async () => {
    const f = fileInput.files?.[0];
    if (!f) return;
    showUploadPreview(f);
    await uploadPhoto();
  });

  $("upload-btn")?.addEventListener("click", uploadPhoto);
}

function showUploadPreview(file) {
  const box = $("upload-preview");
  if (!box) return;

  const url = URL.createObjectURL(file);
  box.innerHTML = `<img src="${url}" alt="preview">`;
  box.classList.remove("hidden");
}