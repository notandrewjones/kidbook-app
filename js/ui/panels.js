// js/ui/panels.js
// Side panels - Multi-character management

import { $, escapeHtml, showToast } from '../core/utils.js';
import { state } from '../core/state.js';
import { 
  uploadAndGenerateCharacterModel,
  deleteCharacterModel,
} from '../api/character.js';
import { openUploadModal } from './modals.js';
import { openProjectById } from '../api/projects.js';

// Render the character panel in storyboard view
export function renderCharacterPanel(project) {
  const panel = $("character-panel-content");
  if (!panel) return;

  const characterModels = project.character_models || [];
  const hasAnyModel = characterModels.length > 0;

  if (hasAnyModel) {
    renderMultiCharacterPanel(panel, project, characterModels);
  } else {
    renderEmptyCharacterPanel(panel, project);
  }
}

// Render panel with multiple character models
function renderMultiCharacterPanel(panel, project, characterModels) {
  const protagonistModel = characterModels.find(cm => cm.is_protagonist || cm.role === "protagonist");
  const otherModels = characterModels.filter(cm => !cm.is_protagonist && cm.role !== "protagonist");

  panel.innerHTML = `
    <div class="character-panel-inner">
      <div class="panel-section">
        <div class="panel-section-header">
          <span class="panel-section-title">Character Models</span>
          <span class="panel-section-count">${characterModels.length}</span>
        </div>
        
        ${protagonistModel ? renderCharacterCard(protagonistModel, true) : `
          <div class="no-protagonist-notice">
            <p>No protagonist model yet.</p>
            <button class="btn btn-primary btn-sm" id="add-protagonist-btn">
              Add Protagonist
            </button>
          </div>
        `}
        
        ${otherModels.length > 0 ? `
          <div class="other-characters-list">
            ${otherModels.map(cm => renderCharacterCard(cm, false)).join("")}
          </div>
        ` : ""}
      </div>
      
      <div class="panel-section">
        <button class="btn btn-secondary btn-full" id="add-character-btn">
          <span class="btn-icon">+</span>
          Add Character
        </button>
      </div>
      
      <div class="panel-section panel-section-muted">
        <div class="panel-tip">
          <strong>Tip:</strong> Add models for characters who appear frequently. 
          Max 4 characters per scene for best results.
        </div>
      </div>
    </div>
  `;

  // Wire up events
  $("add-character-btn")?.addEventListener("click", () => openAddCharacterModal());
  $("add-protagonist-btn")?.addEventListener("click", () => openAddCharacterModal(true));

  // Wire up character card actions
  panel.querySelectorAll("[data-delete-character]").forEach(btn => {
    btn.addEventListener("click", async (e) => {
      e.stopPropagation();
      const key = btn.dataset.deleteCharacter;
      if (confirm("Remove this character model?")) {
        const success = await deleteCharacterModel(key);
        if (success) {
          const pid = localStorage.getItem("projectId");
          if (pid) await openProjectById(pid);
        }
      }
    });
  });

  panel.querySelectorAll("[data-regenerate-character]").forEach(btn => {
    btn.addEventListener("click", async (e) => {
      e.stopPropagation();
      const key = btn.dataset.regenerateCharacter;
      const model = characterModels.find(cm => cm.character_key === key);
      if (model) {
        openRegenerateCharacterModal(model);
      }
    });
  });
}

// Render a single character card
function renderCharacterCard(model, isProtagonist) {
  const roleLabel = getRoleLabel(model.role);
  const modelUrl = model.model_url;

  return `
    <div class="character-card ${isProtagonist ? 'protagonist' : ''}">
      <div class="character-card-image">
        ${modelUrl 
          ? `<img src="${modelUrl}" alt="${escapeHtml(model.name)}'s character model">`
          : `<div class="character-placeholder">?</div>`
        }
      </div>
      <div class="character-card-info">
        <div class="character-card-name">${escapeHtml(model.name)}</div>
        <div class="character-card-role">${roleLabel}</div>
      </div>
      <div class="character-card-actions">
        <button 
          class="icon-btn icon-btn-sm" 
          data-regenerate-character="${model.character_key}"
          title="Regenerate model"
        >↻</button>
        ${!isProtagonist ? `
          <button 
            class="icon-btn icon-btn-sm icon-btn-danger" 
            data-delete-character="${model.character_key}"
            title="Remove"
          >×</button>
        ` : ""}
      </div>
    </div>
  `;
}

// Get human-readable role label
function getRoleLabel(role) {
  const labels = {
    protagonist: "Main Character",
    sibling: "Sibling",
    parent: "Parent",
    friend: "Friend",
    pet: "Pet",
    grandparent: "Grandparent",
    teacher: "Teacher",
    other: "Character",
  };
  return labels[role] || "Character";
}

// Render empty character panel
function renderEmptyCharacterPanel(panel, project) {
  const kidName = project.kid_name || "your character";

  panel.innerHTML = `
    <div class="character-panel-inner">
      <div class="panel-section">
        <div class="panel-section-title">Character Models</div>
        <p class="panel-section-desc">
          Upload photos to create consistent character models for your illustrations.
        </p>
      </div>
      
      <div id="panel-dropzone" class="dropzone" tabindex="0">
        <div class="dropzone-inner">
          <div class="drop-icon">⬆︎</div>
          <div class="drop-title">Add ${escapeHtml(kidName)}</div>
          <div class="drop-sub">Drop photo or click</div>
          <div class="drop-hint">PNG / JPG</div>
        </div>
      </div>
      
      <input id="panel-photo-input" type="file" accept="image/*" class="hidden" />
      
      <div id="panel-upload-preview" class="upload-preview hidden"></div>
      <div id="panel-upload-status" class="status-line"></div>
      
      <div class="panel-section panel-section-muted">
        <div class="panel-tip">
          Start by adding the main character. You can add more characters later.
        </div>
      </div>
    </div>
  `;

  initPanelUpload(project);
}

// Initialize panel dropzone events
function initPanelUpload(project) {
  const dropzone = $("panel-dropzone");
  const fileInput = $("panel-photo-input");

  if (!dropzone || !fileInput) return;

  dropzone.addEventListener("click", () => fileInput.click());

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
      handleProtagonistUpload(files[0], project);
    }
  });

  fileInput.addEventListener("change", () => {
    const f = fileInput.files?.[0];
    if (f) handleProtagonistUpload(f, project);
  });
}

// Handle protagonist upload from panel
async function handleProtagonistUpload(file, project) {
  const preview = $("panel-upload-preview");
  const status = $("panel-upload-status");
  const dropzone = $("panel-dropzone");

  if (preview) {
    const url = URL.createObjectURL(file);
    preview.innerHTML = `<img src="${url}" alt="preview">`;
    preview.classList.remove("hidden");
  }

  if (dropzone) dropzone.style.display = "none";

  if (status) status.textContent = "Uploading and generating model...";

  const kidName = project?.kid_name || "Child";
  const result = await uploadAndGenerateCharacterModel(file, kidName, "protagonist", true);

  if (result) {
    if (status) status.textContent = "Character model ready!";
    const pid = localStorage.getItem("projectId");
    if (pid) await openProjectById(pid);
  } else {
    if (status) status.textContent = "Failed. Try again.";
    if (dropzone) dropzone.style.display = "block";
  }
}

// Open modal to add a new character
export function openAddCharacterModal(forProtagonist = false) {
  let modal = $("add-character-modal");
  if (!modal) {
    modal = document.createElement("div");
    modal.id = "add-character-modal";
    modal.className = "modal hidden";
    modal.innerHTML = `
      <div class="modal-backdrop"></div>
      <div class="modal-dialog modal-dialog-sm">
        <div class="modal-header">
          <div class="modal-header-left">
            <div class="modal-title">Add Character</div>
            <div class="modal-subtitle">Upload a photo to create a character model</div>
          </div>
          <button class="icon-btn close-modal-btn" title="Close">✕</button>
        </div>
        <div class="modal-body modal-body-col">
          <div class="form-group">
            <label class="label">Character Name</label>
            <input id="new-char-name" class="input" type="text" placeholder="e.g., Emma, Dad, Fluffy" />
          </div>
          
          <div class="form-group">
            <label class="label">Role</label>
            <select id="new-char-role" class="select select-full">
              <option value="protagonist">Main Character (Protagonist)</option>
              <option value="sibling">Sibling</option>
              <option value="parent">Parent</option>
              <option value="grandparent">Grandparent</option>
              <option value="friend">Friend</option>
              <option value="pet">Pet</option>
              <option value="teacher">Teacher</option>
              <option value="other">Other</option>
            </select>
          </div>
          
          <div id="new-char-dropzone" class="dropzone" tabindex="0">
            <div class="dropzone-inner">
              <div class="drop-icon">⬆︎</div>
              <div class="drop-title">Drop photo here</div>
              <div class="drop-sub">or click to choose</div>
              <div class="drop-hint">PNG / JPG</div>
            </div>
          </div>
          
          <input id="new-char-file" type="file" accept="image/*" class="hidden" />
          
          <div id="new-char-preview" class="upload-preview hidden"></div>
          <div id="new-char-status" class="status-line"></div>
          
          <button id="create-char-btn" class="btn btn-primary btn-full" disabled>
            Create Character Model
          </button>
        </div>
      </div>
    `;
    document.body.appendChild(modal);

    // Wire up modal events
    modal.querySelector(".close-modal-btn").addEventListener("click", () => {
      modal.classList.add("hidden");
    });

    modal.querySelector(".modal-backdrop").addEventListener("click", () => {
      modal.classList.add("hidden");
    });

    const dropzone = modal.querySelector("#new-char-dropzone");
    const fileInput = modal.querySelector("#new-char-file");
    const preview = modal.querySelector("#new-char-preview");
    const createBtn = modal.querySelector("#create-char-btn");
    const nameInput = modal.querySelector("#new-char-name");

    dropzone.addEventListener("click", () => fileInput.click());

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
        showNewCharPreview(files[0]);
      }
    });

    fileInput.addEventListener("change", () => {
      const f = fileInput.files?.[0];
      if (f) showNewCharPreview(f);
    });

    function showNewCharPreview(file) {
      const url = URL.createObjectURL(file);
      preview.innerHTML = `<img src="${url}" alt="preview">`;
      preview.classList.remove("hidden");
      dropzone.style.display = "none";
      updateCreateBtnState();
    }

    function updateCreateBtnState() {
      const hasName = nameInput.value.trim().length > 0;
      const hasFile = fileInput.files?.length > 0;
      createBtn.disabled = !(hasName && hasFile);
    }

    nameInput.addEventListener("input", updateCreateBtnState);

    createBtn.addEventListener("click", async () => {
      const name = nameInput.value.trim();
      const role = modal.querySelector("#new-char-role").value;
      const file = fileInput.files?.[0];
      const status = modal.querySelector("#new-char-status");

      if (!name || !file) return;

      createBtn.disabled = true;
      createBtn.textContent = "Creating...";
      if (status) status.textContent = "Uploading and generating model...";

      const isProtagonist = role === "protagonist";
      const result = await uploadAndGenerateCharacterModel(file, name, role, isProtagonist);

      if (result) {
        modal.classList.add("hidden");
        showToast("Character added", `${name} is ready`, "success");
        const pid = localStorage.getItem("projectId");
        if (pid) await openProjectById(pid);
      } else {
        createBtn.disabled = false;
        createBtn.textContent = "Create Character Model";
        if (status) status.textContent = "Failed. Try again.";
      }
    });
  }

  // Reset modal state
  const nameInput = modal.querySelector("#new-char-name");
  const roleSelect = modal.querySelector("#new-char-role");
  const fileInput = modal.querySelector("#new-char-file");
  const preview = modal.querySelector("#new-char-preview");
  const dropzone = modal.querySelector("#new-char-dropzone");
  const status = modal.querySelector("#new-char-status");
  const createBtn = modal.querySelector("#create-char-btn");

  nameInput.value = forProtagonist ? (state.cachedProject?.kid_name || "") : "";
  roleSelect.value = forProtagonist ? "protagonist" : "other";
  fileInput.value = "";
  preview.innerHTML = "";
  preview.classList.add("hidden");
  dropzone.style.display = "block";
  status.textContent = "";
  createBtn.disabled = true;
  createBtn.textContent = "Create Character Model";

  modal.classList.remove("hidden");
}

// Open modal to regenerate a character model
function openRegenerateCharacterModal(model) {
  openAddCharacterModal(model.is_protagonist);
  
  setTimeout(() => {
    const modal = $("add-character-modal");
    if (modal) {
      const nameInput = modal.querySelector("#new-char-name");
      const roleSelect = modal.querySelector("#new-char-role");
      const title = modal.querySelector(".modal-title");
      
      if (nameInput) nameInput.value = model.name;
      if (roleSelect) roleSelect.value = model.role;
      if (title) title.textContent = `Regenerate ${model.name}`;
    }
  }, 50);
}

// Export for modals.js
export function closeCharacterModal() {
  const modal = $("add-character-modal");
  if (modal) modal.classList.add("hidden");
}