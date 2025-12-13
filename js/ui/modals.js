// js/ui/modals.js
// Modal dialogs for image preview and file upload

import { state } from '../core/state.js';
import { $ } from '../core/utils.js';
import { handleRegenerateIllustration } from '../api/illustrations.js';
import { uploadPhoto } from '../api/character.js';

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

  if (!modal || !img || !notes || !regen) return;

  img.src = imageUrl;
  notes.value = "";
  regen.dataset.page = String(pageNum);
  subtitle.textContent = `Page ${pageNum}`;

  // Get revision history from cached project
  const illustration = state.cachedProject?.illustrations?.find(
    i => Number(i.page) === pageNum
  );
  
  const revisionHistory = illustration?.revision_history || [];
  const currentRevision = illustration?.revisions || 0;

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
              <span class="revision-label">r${rev.revision}</span>
            </div>
          `;
        })
        .join("");

      historyContainer.innerHTML = `
        <div class="revision-history-label">Previous versions</div>
        <div class="revision-thumbs">
          ${historyHtml}
        </div>
      `;
      historyContainer.classList.remove("hidden");

      // Wire click events for history thumbnails
      historyContainer.querySelectorAll(".revision-thumb").forEach(thumb => {
        thumb.addEventListener("click", () => {
          const url = thumb.dataset.url;
          img.src = url;
          
          // Update active state
          historyContainer.querySelectorAll(".revision-thumb").forEach(t => 
            t.classList.remove("active")
          );
          thumb.classList.add("active");
          
          // Remove active from current indicator if exists
          $("current-version-indicator")?.querySelector(".revision-thumb")?.classList.remove("active");
        });
      });
    } else {
      historyContainer.innerHTML = "";
      historyContainer.classList.add("hidden");
    }
  }

  // Add current version indicator if there's history
  const currentIndicator = $("current-version-indicator");
  if (currentIndicator) {
    if (revisionHistory.length > 0) {
      currentIndicator.innerHTML = `
        <div class="revision-thumb active current" data-url="${imageUrl}">
          <img src="${imageUrl}" alt="Current version">
          <span class="revision-label">r${currentRevision} (current)</span>
        </div>
      `;
      currentIndicator.classList.remove("hidden");
      
      currentIndicator.querySelector(".revision-thumb")?.addEventListener("click", () => {
        img.src = imageUrl;
        
        // Update active states
        historyContainer?.querySelectorAll(".revision-thumb").forEach(t => 
          t.classList.remove("active")
        );
        currentIndicator.querySelector(".revision-thumb")?.classList.add("active");
      });
    } else {
      currentIndicator.innerHTML = "";
      currentIndicator.classList.add("hidden");
    }
  }

  modal.classList.remove("hidden");
  modal.setAttribute("aria-hidden", "false");
}

export function closeImageModal() {
  const modal = $("image-modal");
  if (!modal) return;
  modal.classList.add("hidden");
  modal.setAttribute("aria-hidden", "true");
}

export function initImageModalEvents() {
  $("close-modal")?.addEventListener("click", closeImageModal);

  $("image-modal")?.addEventListener("click", (e) => {
    if (e.target?.classList?.contains("modal-backdrop")) closeImageModal();
  });

  $("regen-btn")?.addEventListener("click", handleRegenerateIllustration);

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      closeImageModal();
      closeUploadModal();
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