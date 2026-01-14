// js/ui/panels.js
// Side panels - Multi-character management

import { $, escapeHtml, showToast } from '../core/utils.js';
import { state, getProjectId } from '../core/state.js';
import { 
  uploadAndGenerateCharacterModel,
  deleteCharacterModel,
} from '../api/character.js';
import { openUploadModal } from './modals.js';
import { openProjectById } from '../api/projects.js';

// Track characters currently being generated
const generatingCharacters = new Set();

// Check if any character is generating (for disabling scene generation)
export function isCharacterGenerating() {
  return generatingCharacters.size > 0;
}

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

  // Detect characters from context_registry that don't have models yet
  const detectedCharacters = getDetectedCharactersNeedingModels(project, characterModels);

  // Get props from registry
  const props = getPropsFromRegistry(project);

  // Get groups from registry
  const groups = getGroupsFromRegistry(project);

  panel.innerHTML = `
    <div class="character-panel-inner">
      <div class="panel-section">
        <div class="panel-section-header">
          <span class="panel-section-title">Character Models</span>
          <span class="panel-section-count">${characterModels.length}</span>
        </div>
        
        ${protagonistModel ? renderCharacterCard(protagonistModel, true) : `
          <div class="no-protagonist-notice">
            <p>Upload a photo of the main character to start generating illustrations.</p>
            <button class="btn btn-primary btn-sm" id="add-protagonist-btn">
              Add ${escapeHtml(project.kid_name || 'Protagonist')}
            </button>
          </div>
        `}
        
        ${otherModels.length > 0 ? `
          <div class="other-characters-list">
            ${otherModels.map(cm => renderCharacterCard(cm, false)).join("")}
          </div>
        ` : ""}
      </div>
      
      ${detectedCharacters.length > 0 ? `
        <div class="panel-section">
          <div class="panel-section-header">
            <span class="panel-section-title">Detected in Story</span>
            <span class="panel-section-count">${detectedCharacters.length}</span>
          </div>
          <p class="panel-section-desc">
            These characters appear in your story. Add a photo reference or let AI generate them.
          </p>
          <div class="detected-characters-list">
            ${detectedCharacters.map(dc => renderDetectedCharacterCard(dc)).join("")}
          </div>
        </div>
      ` : ""}
      
      <div class="panel-section">
        <button class="btn btn-secondary btn-full" id="add-character-btn">
          <span class="btn-icon">+</span>
          Add Other Character
        </button>
      </div>
      
      ${groups.length > 0 ? `
        <div class="panel-section">
          <div class="panel-section-header">
            <span class="panel-section-title">👥 Groups</span>
            <span class="panel-section-count">${groups.length}</span>
          </div>
          <p class="panel-section-desc">
            Groups of people mentioned in the story. Add photos for each member.
          </p>
          <div class="groups-list">
            ${groups.map(group => renderGroupCard(group)).join("")}
          </div>
        </div>
      ` : ""}
      
      ${props.length > 0 ? `
        <div class="panel-section">
          <div class="panel-section-header">
            <span class="panel-section-title">Props & Objects</span>
            <span class="panel-section-count">${props.length}</span>
          </div>
          <p class="panel-section-desc">
            Upload reference photos for items in your story, or let AI generate them.
          </p>
          <div class="props-list">
            ${props.map(prop => renderPropCard(prop)).join("")}
          </div>
        </div>
      ` : ""}
      
      ${!protagonistModel ? `
        <div class="panel-section panel-section-muted">
          <div class="panel-tip panel-tip-warning">
            <strong>⚠️ Required:</strong> Add the protagonist's photo before generating illustrations.
          </div>
        </div>
      ` : `
        <div class="panel-section panel-section-muted">
          <div class="panel-tip">
            <strong>Tip:</strong> Characters, groups, and props without photos will be AI-generated.
            Max 12 total reference images per scene.
          </div>
        </div>
      `}
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
          const pid = getProjectId();
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

  // Wire up detected character actions
  panel.querySelectorAll("[data-upload-for-character]").forEach(btn => {
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      const key = btn.dataset.uploadForCharacter;
      const name = btn.dataset.characterName;
      const role = btn.dataset.characterRole;
      openAddCharacterModalPrefilled(name, role);
    });
  });

  panel.querySelectorAll("[data-generate-for-character]").forEach(btn => {
    btn.addEventListener("click", async (e) => {
      e.stopPropagation();
      const key = btn.dataset.generateForCharacter;
      const name = btn.dataset.characterName;
      showToast("AI Generation", `${name} will be AI-generated based on story context`, "success");
      // Mark as "use AI" in the UI - the actual generation happens during scene generation
    });
  });

  // Wire up prop actions
  panel.querySelectorAll("[data-upload-prop]").forEach(btn => {
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      const key = btn.dataset.uploadProp;
      const name = btn.dataset.propName;
      openPropUploadModal(key, name);
    });
  });

  panel.querySelectorAll("[data-ai-describe-prop]").forEach(btn => {
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      const key = btn.dataset.aiDescribeProp;
      const name = btn.dataset.propName;
      showToast("AI Description", `${name} will use AI-generated description`, "success");
    });
  });

  panel.querySelectorAll("[data-remove-prop-image]").forEach(btn => {
    btn.addEventListener("click", async (e) => {
      e.stopPropagation();
      const key = btn.dataset.removePropImage;
      const name = btn.dataset.propName;
      await removePropReferenceImage(key, name);
    });
  });

  // Wire up group actions
  panel.querySelectorAll("[data-add-group-member]").forEach(btn => {
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      const key = btn.dataset.addGroupMember;
      const name = btn.dataset.groupName;
      openAddGroupMemberModal(key, name);
    });
  });

  panel.querySelectorAll("[data-upload-member-photo]").forEach(btn => {
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      const groupKey = btn.dataset.groupKey;
      const memberId = btn.dataset.memberId;
      const memberName = btn.dataset.memberName;
      openMemberPhotoUploadModal(groupKey, memberId, memberName);
    });
  });

  panel.querySelectorAll("[data-remove-group-member]").forEach(btn => {
    btn.addEventListener("click", async (e) => {
      e.stopPropagation();
      const groupKey = btn.dataset.groupKey;
      const memberId = btn.dataset.memberId;
      const memberName = btn.dataset.memberName;
      if (confirm(`Remove ${memberName} from this group?`)) {
        await removeGroupMember(groupKey, memberId, memberName);
      }
    });
  });
}

// Get characters detected in story that don't have models
function getDetectedCharactersNeedingModels(project, existingModels) {
  const detected = [];
  
  // Get unified registry (stored in props_registry)
  let registry = {};
  if (Array.isArray(project.props_registry) && project.props_registry.length > 0) {
    registry = project.props_registry[0];
  } else if (project.props_registry && typeof project.props_registry === "object") {
    registry = project.props_registry;
  }
  
  // Characters are now in registry.characters
  const characters = registry.characters || {};
  
  const existingKeys = new Set(existingModels.map(cm => cm.character_key));
  const existingNames = new Set(existingModels.map(cm => cm.name?.toLowerCase()));

  // Generic terms that should NOT be prompted for character uploads
  const genericTerms = new Set([
    'friends', 'friend', 'family', 'everyone', 'somebody', 'someone',
    'people', 'kids', 'children', 'neighbors', 'neighbours', 'guests',
    'visitors', 'others', 'them', 'they', 'we', 'us', 'group',
    'classmates', 'teammates', 'siblings', 'parents', 'adults',
    'boys', 'girls', 'babies', 'toddlers', 'strangers'
  ]);

  // Helper to check if a name is a proper name (not generic)
  function isProperCharacterName(name) {
    if (!name) return false;
    const lowerName = name.toLowerCase().trim();
    
    // Filter out generic terms
    if (genericTerms.has(lowerName)) return false;
    
    // Filter out single-word generic descriptors
    if (lowerName.length < 2) return false;
    
    // A proper name typically starts with uppercase in the original
    const isCapitalized = name[0] === name[0].toUpperCase();
    
    // Check if it looks like a proper noun (specific name)
    return isCapitalized || 
           ['mom', 'dad', 'grandma', 'grandpa', 'grandmother', 'grandfather', 
            'mommy', 'daddy', 'nana', 'papa', 'granny', 'uncle', 'aunt',
            'teacher', 'coach'].includes(lowerName);
  }

  // Check all characters in unified registry
  for (const [key, char] of Object.entries(characters)) {
    const name = char.name || key;
    
    // Skip if already has a model
    if (char.has_model) continue;
    if (existingKeys.has(key)) continue;
    if (existingNames.has(name?.toLowerCase())) continue;
    if (!isProperCharacterName(name)) continue;
    
    // Skip protagonist - they're handled separately
    if (char.role === "protagonist") continue;
    
    detected.push({
      character_key: key,
      name: name,
      role: char.role || char.relationship || "other",
      type: char.type,
      source: "story",
    });
  }

  return detected;
}

// Render a detected character card (no model yet)
function renderDetectedCharacterCard(character) {
  const roleLabel = getRoleLabel(character.role);
  const typeInfo = character.type ? ` (${character.type})` : "";

  return `
    <div class="character-card detected">
      <div class="character-card-image clickable-upload" 
           data-upload-for-character="${character.character_key}"
           data-character-name="${escapeHtml(character.name)}"
           data-character-role="${character.role}"
           title="Click to upload photo">
        <div class="character-placeholder upload-icon">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
            <polyline points="17 8 12 3 7 8"/>
            <line x1="12" y1="3" x2="12" y2="15"/>
          </svg>
        </div>
      </div>
      <div class="character-card-info">
        <div class="character-card-name">${escapeHtml(character.name)}</div>
        <div class="character-card-role">${roleLabel}${typeInfo}</div>
      </div>
      <div class="character-card-actions">
        <button 
          class="btn btn-sm btn-secondary" 
          data-generate-for-character="${character.character_key}"
          data-character-name="${escapeHtml(character.name)}"
          title="Let AI generate this character"
        >Generate for me</button>
      </div>
    </div>
  `;
}

// Render a single character card
function renderCharacterCard(model, isProtagonist) {
  const roleLabel = getRoleLabel(model.role);
  const modelUrl = model.model_url;
  const isGenerating = generatingCharacters.has(model.character_key);

  return `
    <div class="character-card ${isProtagonist ? 'protagonist' : ''} ${isGenerating ? 'generating' : ''}" data-character-key="${model.character_key}">
      <div class="character-card-image">
        ${isGenerating ? `
          <div class="character-generating-overlay">
            <div class="spinner"></div>
            <div class="generating-text">Generating...</div>
          </div>
        ` : modelUrl 
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
          ${isGenerating ? 'disabled' : ''}
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
    const pid = getProjectId();
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
            <div class="custom-select" id="new-char-role-container">
              <button type="button" class="custom-select-trigger" id="new-char-role-trigger">
                <span class="custom-select-value">Other</span>
                <svg class="custom-select-arrow" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <polyline points="6 9 12 15 18 9"></polyline>
                </svg>
              </button>
              <div class="custom-select-dropdown" id="new-char-role-dropdown">
                <div class="custom-select-option" data-value="protagonist">Main Character (Protagonist)</div>
                <div class="custom-select-option" data-value="sibling">Sibling</div>
                <div class="custom-select-option" data-value="parent">Parent</div>
                <div class="custom-select-option" data-value="grandparent">Grandparent</div>
                <div class="custom-select-option" data-value="friend">Friend</div>
                <div class="custom-select-option" data-value="pet">Pet</div>
                <div class="custom-select-option" data-value="teacher">Teacher</div>
                <div class="custom-select-option selected" data-value="other">Other</div>
              </div>
              <input type="hidden" id="new-char-role" value="other" />
            </div>
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

    // Custom dropdown handling
    const roleContainer = modal.querySelector("#new-char-role-container");
    const roleTrigger = modal.querySelector("#new-char-role-trigger");
    const roleDropdown = modal.querySelector("#new-char-role-dropdown");
    const roleInput = modal.querySelector("#new-char-role");
    const roleValueDisplay = modal.querySelector(".custom-select-value");

    roleTrigger.addEventListener("click", (e) => {
      e.stopPropagation();
      roleContainer.classList.toggle("open");
    });

    roleDropdown.querySelectorAll(".custom-select-option").forEach(option => {
      option.addEventListener("click", (e) => {
        e.stopPropagation();
        const value = option.dataset.value;
        const text = option.textContent;
        
        // Update hidden input
        roleInput.value = value;
        
        // Update display
        roleValueDisplay.textContent = text;
        
        // Update selected state
        roleDropdown.querySelectorAll(".custom-select-option").forEach(o => o.classList.remove("selected"));
        option.classList.add("selected");
        
        // Close dropdown
        roleContainer.classList.remove("open");
      });
    });

    // Close dropdown when clicking outside
    document.addEventListener("click", (e) => {
      if (!roleContainer.contains(e.target)) {
        roleContainer.classList.remove("open");
      }
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
      let file = fileInput.files?.[0];
      const status = modal.querySelector("#new-char-status");

      if (!name || !file) return;

      createBtn.disabled = true;
      createBtn.textContent = "Processing...";
      
      // Compress image if needed
      if (status) status.textContent = "Processing image...";
      try {
        file = await compressImageIfNeeded(file, 4 * 1024 * 1024); // 4MB limit
      } catch (err) {
        console.error("Image compression failed:", err);
        if (status) status.textContent = "Failed to process image. Try a smaller file.";
        createBtn.disabled = false;
        createBtn.textContent = "Create Character Model";
        return;
      }
      
      // Generate a character key for tracking
      const characterKey = name.toLowerCase().replace(/\s+/g, '_') + '_' + Date.now();
      const isProtagonist = role === "protagonist";
      
      // Close modal immediately and start generation in background
      modal.classList.add("hidden");
      showToast("Generating character", `Creating model for ${name}...`, "success");
      
      // Mark as generating and update UI
      generatingCharacters.add(characterKey);
      
      // Create a temporary model entry so the card shows with spinner
      if (state.cachedProject) {
        const tempModel = {
          character_key: characterKey,
          name: name,
          role: role,
          is_protagonist: isProtagonist,
          model_url: null, // No URL yet
        };
        state.cachedProject.character_models = state.cachedProject.character_models || [];
        state.cachedProject.character_models.push(tempModel);
        
        // Re-render panel to show generating state
        renderCharacterPanel(state.cachedProject);
      }

      // Generate in background
      const result = await uploadAndGenerateCharacterModel(file, name, role, isProtagonist);
      
      // Remove from generating set
      generatingCharacters.delete(characterKey);

      if (result) {
        showToast("Character ready", `${name}'s model is complete`, "success");
        const pid = getProjectId();
        if (pid) await openProjectById(pid);
      } else {
        showToast("Generation failed", `Failed to create model for ${name}`, "error");
        // Remove temporary model
        if (state.cachedProject) {
          state.cachedProject.character_models = state.cachedProject.character_models.filter(
            cm => cm.character_key !== characterKey
          );
          renderCharacterPanel(state.cachedProject);
        }
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
  
  // Reset custom dropdown
  const roleValue = forProtagonist ? "protagonist" : "other";
  const roleLabels = {
    protagonist: "Main Character (Protagonist)",
    sibling: "Sibling",
    parent: "Parent",
    grandparent: "Grandparent",
    friend: "Friend",
    pet: "Pet",
    teacher: "Teacher",
    other: "Other"
  };
  roleSelect.value = roleValue;
  const roleValueDisplay = modal.querySelector(".custom-select-value");
  if (roleValueDisplay) roleValueDisplay.textContent = roleLabels[roleValue] || "Other";
  const roleDropdown = modal.querySelector("#new-char-role-dropdown");
  if (roleDropdown) {
    roleDropdown.querySelectorAll(".custom-select-option").forEach(o => {
      o.classList.toggle("selected", o.dataset.value === roleValue);
    });
  }
  modal.querySelector("#new-char-role-container")?.classList.remove("open");
  
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
      const roleValueDisplay = modal.querySelector(".custom-select-value");
      const roleDropdown = modal.querySelector("#new-char-role-dropdown");
      
      if (nameInput) nameInput.value = model.name;
      if (roleSelect) roleSelect.value = model.role;
      
      // Update custom dropdown display
      const roleLabels = {
        protagonist: "Main Character (Protagonist)",
        sibling: "Sibling",
        parent: "Parent",
        grandparent: "Grandparent",
        friend: "Friend",
        pet: "Pet",
        teacher: "Teacher",
        other: "Other"
      };
      if (roleValueDisplay) roleValueDisplay.textContent = roleLabels[model.role] || "Other";
      if (roleDropdown) {
        roleDropdown.querySelectorAll(".custom-select-option").forEach(o => {
          o.classList.toggle("selected", o.dataset.value === model.role);
        });
      }
      
      if (title) title.textContent = `Regenerate ${model.name}`;
    }
  }, 50);
}

// Open modal pre-filled for a detected character
function openAddCharacterModalPrefilled(name, role) {
  openAddCharacterModal(role === "protagonist");
  
  setTimeout(() => {
    const modal = $("add-character-modal");
    if (modal) {
      const nameInput = modal.querySelector("#new-char-name");
      const roleSelect = modal.querySelector("#new-char-role");
      const title = modal.querySelector(".modal-title");
      const createBtn = modal.querySelector("#create-char-btn");
      
      if (nameInput) nameInput.value = name;
      if (roleSelect) roleSelect.value = role;
      if (title) title.textContent = `Add ${name}`;
      
      // Update button state since name is pre-filled
      if (createBtn && nameInput.value.trim()) {
        // Button will enable once file is selected
      }
    }
  }, 50);
}

// Export for modals.js
export function closeCharacterModal() {
  const modal = $("add-character-modal");
  if (modal) modal.classList.add("hidden");
}

// =====================================================
// PROPS FUNCTIONS
// =====================================================

// Get props from project registry
function getPropsFromRegistry(project) {
  let registry = {};
  if (Array.isArray(project.props_registry) && project.props_registry.length > 0) {
    registry = project.props_registry[0];
  } else if (project.props_registry && typeof project.props_registry === "object") {
    registry = project.props_registry;
  }
  
  const props = registry.props || {};
  
  return Object.entries(props).map(([key, prop]) => ({
    key,
    name: prop.name || key,
    description: prop.description || prop.visual || "",
    reference_image_url: prop.reference_image_url || null,
    image_source: prop.image_source || null,
    first_seen_page: prop.first_seen_page || 1,
  }));
}

// Render a prop card
function renderPropCard(prop) {
  const hasImage = prop.reference_image_url && prop.image_source === "user";
  
  return `
    <div class="prop-card ${hasImage ? 'prop-card-has-image' : 'prop-card-ai-mode'}" data-prop-key="${escapeHtml(prop.key)}">
      <div class="prop-card-header">
        ${hasImage ? `
          <img class="prop-card-thumb" src="${prop.reference_image_url}" alt="${escapeHtml(prop.name)}">
        ` : `
          <div class="prop-card-thumb-placeholder">
            <span>📦</span>
          </div>
        `}
        <div class="prop-card-info">
          <div class="prop-card-name">${escapeHtml(prop.name)}</div>
          <div class="prop-card-desc">${escapeHtml(prop.description || "No description")}</div>
        </div>
      </div>
      <div class="prop-card-mode-indicator">
        ${hasImage ? `
          <span class="mode-badge mode-badge-image">
            <span class="mode-icon">📷</span> Using Reference Image
          </span>
        ` : `
          <span class="mode-badge mode-badge-ai">
            <span class="mode-icon">✨</span> Using AI Description
          </span>
        `}
      </div>
      <div class="prop-card-actions">
        ${hasImage ? `
          <button class="btn btn-xs btn-danger-subtle" data-remove-prop-image="${escapeHtml(prop.key)}" data-prop-name="${escapeHtml(prop.name)}">
            ✕ Remove
          </button>
          <button class="btn btn-xs btn-secondary" data-upload-prop="${escapeHtml(prop.key)}" data-prop-name="${escapeHtml(prop.name)}">
            Replace
          </button>
        ` : `
          <button class="btn btn-xs btn-primary" data-upload-prop="${escapeHtml(prop.key)}" data-prop-name="${escapeHtml(prop.name)}">
            <span class="btn-icon">📷</span> Upload Image
          </button>
        `}
      </div>
    </div>
  `;
}

// Open modal to upload a prop reference image
function openPropUploadModal(propKey, propName) {
  // Remove any existing prop upload modal
  const existingModal = $("prop-upload-modal");
  if (existingModal) existingModal.remove();

  const modal = document.createElement("div");
  modal.id = "prop-upload-modal";
  modal.className = "modal";
  modal.innerHTML = `
    <div class="modal-backdrop"></div>
    <div class="modal-dialog modal-dialog-sm">
      <div class="modal-header">
        <div class="modal-header-left">
          <div class="modal-title">Upload Reference: ${escapeHtml(propName)}</div>
          <div class="modal-subtitle">Upload a photo of the actual item for visual consistency.</div>
        </div>
        <button class="icon-btn close-modal-btn" title="Close">✕</button>
      </div>
      <div class="modal-body modal-body-col">
        <div id="prop-dropzone" class="dropzone" tabindex="0">
          <div class="dropzone-inner">
            <div class="drop-icon">📦</div>
            <div class="drop-title">Drop prop photo here</div>
            <div class="drop-sub">or click to choose a file</div>
            <div class="drop-hint">PNG / JPG • Max 4MB</div>
          </div>
        </div>
        <input id="prop-file-input" type="file" accept="image/*" class="hidden" />
        <div id="prop-upload-preview" class="upload-preview hidden"></div>
        <div id="prop-upload-status" class="status-line"></div>
      </div>
    </div>
  `;

  document.body.appendChild(modal);

  // Wire up events
  const closeBtn = modal.querySelector(".close-modal-btn");
  const backdrop = modal.querySelector(".modal-backdrop");
  const dropzone = modal.querySelector("#prop-dropzone");
  const fileInput = modal.querySelector("#prop-file-input");
  const preview = modal.querySelector("#prop-upload-preview");
  const status = modal.querySelector("#prop-upload-status");

  const closeModal = () => modal.remove();
  closeBtn.addEventListener("click", closeModal);
  backdrop.addEventListener("click", closeModal);

  dropzone.addEventListener("click", () => fileInput.click());

  ["dragenter", "dragover"].forEach(evt => {
    dropzone.addEventListener(evt, (e) => {
      e.preventDefault();
      e.stopPropagation();
      dropzone.classList.add("dragover");
    });
  });

  ["dragleave", "drop"].forEach(evt => {
    dropzone.addEventListener(evt, (e) => {
      e.preventDefault();
      e.stopPropagation();
      dropzone.classList.remove("dragover");
    });
  });

  dropzone.addEventListener("drop", (e) => {
    const files = e.dataTransfer?.files;
    if (files && files.length) {
      handlePropFileSelect(files[0], propKey, propName, modal);
    }
  });

  fileInput.addEventListener("change", () => {
    const f = fileInput.files?.[0];
    if (f) handlePropFileSelect(f, propKey, propName, modal);
  });
}

// Handle prop file selection and upload
async function handlePropFileSelect(file, propKey, propName, modal) {
  const preview = modal.querySelector("#prop-upload-preview");
  const status = modal.querySelector("#prop-upload-status");
  const dropzone = modal.querySelector("#prop-dropzone");
  const projectId = getProjectId();

  if (!projectId) {
    if (status) status.textContent = "No project loaded.";
    return;
  }

  // Compress image if needed
  if (status) status.textContent = "Processing image...";
  
  let processedFile = file;
  try {
    processedFile = await compressImageIfNeeded(file, 4 * 1024 * 1024); // 4MB limit
  } catch (err) {
    console.error("Image compression failed:", err);
    if (status) status.textContent = "Failed to process image. Try a smaller file.";
    return;
  }

  // Show preview
  if (preview) {
    const url = URL.createObjectURL(processedFile);
    preview.innerHTML = `<img src="${url}" alt="preview">`;
    preview.classList.remove("hidden");
  }

  if (dropzone) dropzone.style.display = "none";
  if (status) status.textContent = "Uploading prop reference...";

  const formData = new FormData();
  formData.append("photo", processedFile);
  formData.append("projectId", projectId);
  formData.append("propKey", propKey);
  formData.append("propName", propName);

  try {
    const res = await fetch("/api/upload-prop-photo", { method: "POST", body: formData });
    
    if (!res.ok) {
      const text = await res.text();
      console.error("Upload failed:", res.status, text);
      if (status) status.textContent = `Upload failed: ${res.status}`;
      if (dropzone) dropzone.style.display = "block";
      return;
    }
    
    const data = await res.json();

    if (data.photoUrl) {
      if (status) status.textContent = "Reference uploaded!";
      showToast("Prop reference uploaded", `${propName} will now use this image`, "success");

      // Close modal and refresh
      setTimeout(async () => {
        modal.remove();
        const pid = getProjectId();
        if (pid) await openProjectById(pid);
      }, 800);
    } else {
      if (status) status.textContent = "Upload failed. Try again.";
      if (dropzone) dropzone.style.display = "block";
    }
  } catch (e) {
    console.error("Prop upload error:", e);
    if (status) status.textContent = "Upload failed. Try again.";
    if (dropzone) dropzone.style.display = "block";
  }
}

// Remove prop reference image
async function removePropReferenceImage(propKey, propName) {
  const projectId = getProjectId();
  if (!projectId) return;

  try {
    const res = await fetch("/api/remove-prop-image", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ projectId, propKey }),
    });

    if (res.ok) {
      showToast("Reference removed", `${propName} will use AI description`, "success");
      const pid = getProjectId();
      if (pid) await openProjectById(pid);
    } else {
      showToast("Failed to remove", "Try again", "error");
    }
  } catch (e) {
    console.error("Remove prop image error:", e);
    showToast("Failed to remove", "Try again", "error");
  }
}

// =====================================================
// IMAGE COMPRESSION
// =====================================================

/**
 * Compress an image file if it exceeds the size limit
 * @param {File} file - The original file
 * @param {number} maxSizeBytes - Maximum file size in bytes (default 4MB)
 * @returns {Promise<File>} - Compressed file or original if already small enough
 */
async function compressImageIfNeeded(file, maxSizeBytes = 4 * 1024 * 1024) {
  // If file is already small enough, return as-is
  if (file.size <= maxSizeBytes) {
    console.log(`Image ${file.name} is ${(file.size / 1024 / 1024).toFixed(2)}MB - no compression needed`);
    return file;
  }

  console.log(`Image ${file.name} is ${(file.size / 1024 / 1024).toFixed(2)}MB - compressing...`);

  return new Promise((resolve, reject) => {
    const img = new Image();
    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d");

    img.onload = () => {
      // Calculate new dimensions - max 2048px on longest side
      let { width, height } = img;
      const maxDimension = 2048;

      if (width > maxDimension || height > maxDimension) {
        if (width > height) {
          height = Math.round((height * maxDimension) / width);
          width = maxDimension;
        } else {
          width = Math.round((width * maxDimension) / height);
          height = maxDimension;
        }
      }

      canvas.width = width;
      canvas.height = height;

      // Draw and compress
      ctx.drawImage(img, 0, 0, width, height);

      // Try different quality levels until we're under the limit
      const tryCompress = (quality) => {
        canvas.toBlob(
          (blob) => {
            if (!blob) {
              reject(new Error("Canvas toBlob failed"));
              return;
            }

            console.log(`Compressed to ${(blob.size / 1024 / 1024).toFixed(2)}MB at quality ${quality}`);

            if (blob.size <= maxSizeBytes || quality <= 0.3) {
              // Good enough, or we've reached minimum quality
              const compressedFile = new File([blob], file.name, {
                type: "image/jpeg",
                lastModified: Date.now(),
              });
              resolve(compressedFile);
            } else {
              // Still too big, try lower quality
              tryCompress(quality - 0.1);
            }
          },
          "image/jpeg",
          quality
        );
      };

      // Start with 0.8 quality
      tryCompress(0.8);
    };

    img.onerror = () => reject(new Error("Failed to load image"));
    img.src = URL.createObjectURL(file);
  });
}

// =====================================================
// GROUPS FUNCTIONS
// =====================================================

// Get groups from project registry
function getGroupsFromRegistry(project) {
  let registry = {};
  if (Array.isArray(project.props_registry) && project.props_registry.length > 0) {
    registry = project.props_registry[0];
  } else if (project.props_registry && typeof project.props_registry === "object") {
    registry = project.props_registry;
  }
  
  const groups = registry.groups || {};
  
  return Object.entries(groups).map(([key, group]) => ({
    key,
    name: group.name || key,
    singular: group.singular || key,
    detected_term: group.detected_term || key,
    detected_count: group.detected_count || null,
    count_source: group.count_source || "unknown",
    members: group.members || [],
    first_seen_page: group.first_seen_page || 1,
  }));
}

// Render a group card with expandable member list
function renderGroupCard(group) {
  const memberCount = group.members?.length || 0;
  const membersWithImages = (group.members || []).filter(m => m.reference_image_url).length;
  const expectedCount = group.detected_count;
  const hasMismatch = expectedCount && memberCount !== expectedCount;
  
  return `
    <div class="group-card" data-group-key="${escapeHtml(group.key)}">
      <div class="group-card-header">
        <div class="group-card-icon">👥</div>
        <div class="group-card-info">
          <div class="group-card-name">${escapeHtml(group.name)}</div>
          <div class="group-card-meta">
            ${memberCount} member${memberCount !== 1 ? 's' : ''} added
            ${membersWithImages > 0 ? ` • ${membersWithImages} with photos` : ''}
          </div>
        </div>
        <button class="btn btn-xs btn-primary" data-add-group-member="${escapeHtml(group.key)}" data-group-name="${escapeHtml(group.name)}">
          + Add
        </button>
      </div>
      
      ${hasMismatch ? `
        <div class="group-card-warning">
          ⚠️ Story mentions "${expectedCount} ${group.detected_term}" but you have ${memberCount} member${memberCount !== 1 ? 's' : ''}
        </div>
      ` : ''}
      
      ${memberCount > 0 ? `
        <div class="group-members-list">
          ${group.members.map(member => renderGroupMemberCard(group.key, member)).join("")}
        </div>
      ` : `
        <div class="group-empty-notice">
          No members added yet. Add photos for each ${group.singular || 'person'} in this group.
        </div>
      `}
    </div>
  `;
}

// Render a single group member
function renderGroupMemberCard(groupKey, member) {
  const hasImage = member.reference_image_url && member.image_source === "user";
  
  return `
    <div class="group-member-card ${hasImage ? 'has-image' : ''}" data-member-id="${escapeHtml(member.id)}">
      <div class="group-member-thumb">
        ${hasImage ? `
          <img src="${member.reference_image_url}" alt="${escapeHtml(member.name)}">
        ` : `
          <div class="group-member-thumb-placeholder">👤</div>
        `}
      </div>
      <div class="group-member-info">
        <div class="group-member-name">${escapeHtml(member.name)}</div>
        <div class="group-member-status">
          ${hasImage ? '📷 Photo uploaded' : '✨ Using AI'}
        </div>
      </div>
      <div class="group-member-actions">
        ${hasImage ? `
          <button class="btn btn-xs btn-secondary" data-upload-member-photo data-group-key="${escapeHtml(groupKey)}" data-member-id="${escapeHtml(member.id)}" data-member-name="${escapeHtml(member.name)}">
            Replace
          </button>
        ` : `
          <button class="btn btn-xs btn-primary" data-upload-member-photo data-group-key="${escapeHtml(groupKey)}" data-member-id="${escapeHtml(member.id)}" data-member-name="${escapeHtml(member.name)}">
            📷 Upload
          </button>
        `}
        <button class="btn btn-xs btn-danger-subtle" data-remove-group-member data-group-key="${escapeHtml(groupKey)}" data-member-id="${escapeHtml(member.id)}" data-member-name="${escapeHtml(member.name)}">
          ✕
        </button>
      </div>
    </div>
  `;
}

// Open modal to add a new group member
function openAddGroupMemberModal(groupKey, groupName) {
  const existingModal = $("add-group-member-modal");
  if (existingModal) existingModal.remove();

  const modal = document.createElement("div");
  modal.id = "add-group-member-modal";
  modal.className = "modal";
  modal.innerHTML = `
    <div class="modal-backdrop"></div>
    <div class="modal-dialog modal-dialog-sm">
      <div class="modal-header">
        <div class="modal-header-left">
          <div class="modal-title">Add to ${escapeHtml(groupName)}</div>
          <div class="modal-subtitle">Add a member with an optional photo reference</div>
        </div>
        <button class="icon-btn close-modal-btn" title="Close">✕</button>
      </div>
      <div class="modal-body modal-body-col">
        <div class="form-group">
          <label class="label">Name</label>
          <input id="new-member-name" class="input" type="text" placeholder="e.g., Emma, Grandpa Joe" />
        </div>
        
        <div id="member-dropzone" class="dropzone" tabindex="0">
          <div class="dropzone-inner">
            <div class="drop-icon">👤</div>
            <div class="drop-title">Drop photo here (optional)</div>
            <div class="drop-sub">or click to choose</div>
            <div class="drop-hint">PNG / JPG • Max 4MB</div>
          </div>
        </div>
        
        <input id="member-file-input" type="file" accept="image/*" class="hidden" />
        <div id="member-upload-preview" class="upload-preview hidden"></div>
        <div id="member-upload-status" class="status-line"></div>
        
        <button id="add-member-btn" class="btn btn-primary btn-full" disabled>
          Add Member
        </button>
      </div>
    </div>
  `;

  document.body.appendChild(modal);

  // Wire up events
  const closeBtn = modal.querySelector(".close-modal-btn");
  const backdrop = modal.querySelector(".modal-backdrop");
  const nameInput = modal.querySelector("#new-member-name");
  const dropzone = modal.querySelector("#member-dropzone");
  const fileInput = modal.querySelector("#member-file-input");
  const preview = modal.querySelector("#member-upload-preview");
  const addBtn = modal.querySelector("#add-member-btn");
  const status = modal.querySelector("#member-upload-status");

  const closeModal = () => modal.remove();
  closeBtn.addEventListener("click", closeModal);
  backdrop.addEventListener("click", closeModal);

  // Enable button when name is entered
  nameInput.addEventListener("input", () => {
    addBtn.disabled = !nameInput.value.trim();
  });

  // Dropzone events
  dropzone.addEventListener("click", () => fileInput.click());

  ["dragenter", "dragover"].forEach(evt => {
    dropzone.addEventListener(evt, (e) => {
      e.preventDefault();
      e.stopPropagation();
      dropzone.classList.add("dragover");
    });
  });

  ["dragleave", "drop"].forEach(evt => {
    dropzone.addEventListener(evt, (e) => {
      e.preventDefault();
      e.stopPropagation();
      dropzone.classList.remove("dragover");
    });
  });

  let selectedFile = null;

  dropzone.addEventListener("drop", async (e) => {
    const files = e.dataTransfer?.files;
    if (files && files.length) {
      selectedFile = await compressImageIfNeeded(files[0]);
      showMemberPreview(selectedFile, preview, dropzone);
    }
  });

  fileInput.addEventListener("change", async () => {
    const f = fileInput.files?.[0];
    if (f) {
      selectedFile = await compressImageIfNeeded(f);
      showMemberPreview(selectedFile, preview, dropzone);
    }
  });

  // Add button click
  addBtn.addEventListener("click", async () => {
    const name = nameInput.value.trim();
    if (!name) return;

    addBtn.disabled = true;
    addBtn.textContent = "Adding...";
    if (status) status.textContent = "Adding member...";

    await addGroupMember(groupKey, name, selectedFile, modal);
  });
}

// Show preview of selected member photo
function showMemberPreview(file, preview, dropzone) {
  if (preview) {
    const url = URL.createObjectURL(file);
    preview.innerHTML = `<img src="${url}" alt="preview">`;
    preview.classList.remove("hidden");
  }
  if (dropzone) {
    dropzone.style.display = "none";
  }
}

// Add a new group member via API
async function addGroupMember(groupKey, memberName, file, modal) {
  const projectId = getProjectId();
  if (!projectId) {
    showToast("Error", "No project loaded", "error");
    return;
  }

  const formData = new FormData();
  formData.append("projectId", projectId);
  formData.append("groupKey", groupKey);
  formData.append("memberName", memberName);
  if (file) {
    formData.append("photo", file);
  }

  try {
    const res = await fetch("/api/group-members", {
      method: "POST",
      body: formData,
    });

    if (!res.ok) {
      const text = await res.text();
      console.error("Add member failed:", res.status, text);
      showToast("Failed", "Could not add member", "error");
      return;
    }

    const data = await res.json();

    if (data.success) {
      showToast("Member added", `${memberName} added to group`, "success");
      if (modal) modal.remove();
      
      // Refresh the panel
      const pid = getProjectId();
      if (pid) await openProjectById(pid);
    } else {
      showToast("Failed", data.error || "Could not add member", "error");
    }
  } catch (err) {
    console.error("Add member error:", err);
    showToast("Error", "Network error", "error");
  }
}

// Open modal to upload/replace a member's photo
function openMemberPhotoUploadModal(groupKey, memberId, memberName) {
  const existingModal = $("member-photo-modal");
  if (existingModal) existingModal.remove();

  const modal = document.createElement("div");
  modal.id = "member-photo-modal";
  modal.className = "modal";
  modal.innerHTML = `
    <div class="modal-backdrop"></div>
    <div class="modal-dialog modal-dialog-sm">
      <div class="modal-header">
        <div class="modal-header-left">
          <div class="modal-title">Photo for ${escapeHtml(memberName)}</div>
          <div class="modal-subtitle">Upload a reference photo</div>
        </div>
        <button class="icon-btn close-modal-btn" title="Close">✕</button>
      </div>
      <div class="modal-body modal-body-col">
        <div id="member-photo-dropzone" class="dropzone" tabindex="0">
          <div class="dropzone-inner">
            <div class="drop-icon">📷</div>
            <div class="drop-title">Drop photo here</div>
            <div class="drop-sub">or click to choose</div>
            <div class="drop-hint">PNG / JPG • Max 4MB</div>
          </div>
        </div>
        <input id="member-photo-input" type="file" accept="image/*" class="hidden" />
        <div id="member-photo-preview" class="upload-preview hidden"></div>
        <div id="member-photo-status" class="status-line"></div>
      </div>
    </div>
  `;

  document.body.appendChild(modal);

  const closeBtn = modal.querySelector(".close-modal-btn");
  const backdrop = modal.querySelector(".modal-backdrop");
  const dropzone = modal.querySelector("#member-photo-dropzone");
  const fileInput = modal.querySelector("#member-photo-input");
  const preview = modal.querySelector("#member-photo-preview");
  const status = modal.querySelector("#member-photo-status");

  const closeModal = () => modal.remove();
  closeBtn.addEventListener("click", closeModal);
  backdrop.addEventListener("click", closeModal);

  dropzone.addEventListener("click", () => fileInput.click());

  ["dragenter", "dragover"].forEach(evt => {
    dropzone.addEventListener(evt, (e) => {
      e.preventDefault();
      e.stopPropagation();
      dropzone.classList.add("dragover");
    });
  });

  ["dragleave", "drop"].forEach(evt => {
    dropzone.addEventListener(evt, (e) => {
      e.preventDefault();
      e.stopPropagation();
      dropzone.classList.remove("dragover");
    });
  });

  dropzone.addEventListener("drop", async (e) => {
    const files = e.dataTransfer?.files;
    if (files && files.length) {
      await handleMemberPhotoUpload(files[0], groupKey, memberId, memberName, modal, preview, dropzone, status);
    }
  });

  fileInput.addEventListener("change", async () => {
    const f = fileInput.files?.[0];
    if (f) {
      await handleMemberPhotoUpload(f, groupKey, memberId, memberName, modal, preview, dropzone, status);
    }
  });
}

// Handle member photo upload
async function handleMemberPhotoUpload(file, groupKey, memberId, memberName, modal, preview, dropzone, status) {
  const projectId = getProjectId();
  if (!projectId) return;

  if (status) status.textContent = "Processing...";

  let processedFile;
  try {
    processedFile = await compressImageIfNeeded(file);
  } catch (err) {
    if (status) status.textContent = "Failed to process image";
    return;
  }

  // Show preview
  if (preview) {
    const url = URL.createObjectURL(processedFile);
    preview.innerHTML = `<img src="${url}" alt="preview">`;
    preview.classList.remove("hidden");
  }
  if (dropzone) dropzone.style.display = "none";
  if (status) status.textContent = "Uploading...";

  const formData = new FormData();
  formData.append("projectId", projectId);
  formData.append("groupKey", groupKey);
  formData.append("memberId", memberId);
  formData.append("photo", processedFile);

  try {
    const res = await fetch("/api/group-members", {
      method: "PUT",
      body: formData,
    });

    if (res.ok) {
      showToast("Photo uploaded", `Updated photo for ${memberName}`, "success");
      if (modal) modal.remove();
      const pid = getProjectId();
      if (pid) await openProjectById(pid);
    } else {
      if (status) status.textContent = "Upload failed";
      if (dropzone) dropzone.style.display = "block";
    }
  } catch (err) {
    console.error("Member photo upload error:", err);
    if (status) status.textContent = "Upload failed";
    if (dropzone) dropzone.style.display = "block";
  }
}

// Remove a group member
async function removeGroupMember(groupKey, memberId, memberName) {
  const projectId = getProjectId();
  if (!projectId) return;

  try {
    const res = await fetch("/api/group-members", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ projectId, groupKey, memberId }),
    });

    if (res.ok) {
      showToast("Member removed", `${memberName} removed from group`, "success");
      const pid = getProjectId();
      if (pid) await openProjectById(pid);
    } else {
      showToast("Failed", "Could not remove member", "error");
    }
  } catch (err) {
    console.error("Remove member error:", err);
    showToast("Error", "Network error", "error");
  }
}