// js/ui/panels.js
// Side panels (character panel)

import { $, escapeHtml } from '../core/utils.js';
import { generateCharacterModel, handlePanelFileSelect } from '../api/character.js';
import { openUploadModal } from './modals.js';

// Render the character panel in storyboard view
export function renderCharacterPanel(project) {
  const panel = $("character-panel-content");
  if (!panel) return;

  const characterUrl = project.character_model_url || project.characterModelUrl;
  const kidName = project.kid_name || "Character";

  if (characterUrl) {
    // Character model exists - show it
    panel.innerHTML = `
      <div style="display:flex; flex-direction:column; gap:14px;">
        <div style="font-weight:700;">Character Model</div>
        <div class="character-preview">
          <img src="${characterUrl}" alt="${escapeHtml(kidName)}'s character model">
          <div>
            <div style="font-weight:600;">${escapeHtml(kidName)}</div>
            <div style="color: rgba(255,255,255,0.62); font-size:12px;">Model ready</div>
          </div>
        </div>
        <button class="btn btn-secondary" id="open-upload-modal-side">Upload New Photo</button>
        <button class="btn btn-primary" id="regenerate-character-btn-side">Regenerate Model</button>
      </div>
    `;

    $("regenerate-character-btn-side")?.addEventListener("click", generateCharacterModel);
    $("open-upload-modal-side")?.addEventListener("click", openUploadModal);
  } else {
    // No character model yet - show embedded upload UI
    panel.innerHTML = `
      <div style="display:flex; flex-direction:column; gap:12px;">
        <div style="font-weight:700;">Character Model</div>
        <div style="color: rgba(255,255,255,0.62); font-size:13px;">
          Upload a photo to generate a consistent character model for all illustrations.
        </div>
        
        <div id="panel-dropzone" class="dropzone" tabindex="0">
          <div class="dropzone-inner">
            <div class="drop-icon">⬆︎</div>
            <div class="drop-title">Drop photo here</div>
            <div class="drop-sub">or click to choose</div>
            <div class="drop-hint">PNG / JPG</div>
          </div>
        </div>
        
        <input id="panel-photo-input" type="file" accept="image/*" class="hidden" />
        
        <div id="panel-upload-preview" class="upload-preview hidden"></div>
        <div id="panel-upload-status" class="status-line"></div>
      </div>
    `;

    initPanelUpload();
  }
}

// Initialize panel dropzone events
function initPanelUpload() {
  const dropzone = $("panel-dropzone");
  const fileInput = $("panel-photo-input");

  if (!dropzone || !fileInput) return;

  // Click to open file picker
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

  // Handle drop
  dropzone.addEventListener("drop", (e) => {
    const files = e.dataTransfer?.files;
    if (files && files.length) {
      fileInput.files = files;
      handlePanelFileSelect(files[0]);
    }
  });

  // Handle file input change
  fileInput.addEventListener("change", () => {
    const f = fileInput.files?.[0];
    if (f) handlePanelFileSelect(f);
  });
}