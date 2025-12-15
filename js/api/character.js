// js/api/character.js
// Character model generation and photo upload - Multi-character support

import { $, showToast } from '../core/utils.js';
import { state, getProjectId } from '../core/state.js';
import { openProjectById } from './projects.js';
import { closeUploadModal, closeCharacterModal } from '../ui/modals.js';

/**
 * Upload a photo for a specific character
 * @param {File} file - The image file
 * @param {string} characterName - Name of the character
 * @param {string} characterRole - Role: protagonist, sibling, parent, friend, pet, other
 * @param {boolean} isProtagonist - Is this the main character?
 */
export async function uploadCharacterPhoto(file, characterName, characterRole = "other", isProtagonist = false) {
  const projectId = getProjectId();

  if (!projectId) {
    showToast("No project loaded", "Open or create a project first", "error");
    return null;
  }

  if (!file) {
    showToast("No file", "Select a photo to upload", "error");
    return null;
  }

  if (!characterName?.trim()) {
    showToast("No name", "Enter a name for this character", "error");
    return null;
  }

  const formData = new FormData();
  formData.append("photo", file);
  formData.append("projectId", projectId);
  formData.append("characterName", characterName.trim());
  formData.append("characterRole", characterRole);

  try {
    const res = await fetch("/api/upload-character-photo", { 
      method: "POST", 
      body: formData 
    });
    const data = await res.json();

    if (data.error) {
      showToast("Upload failed", data.error, "error");
      return null;
    }

    showToast("Photo uploaded", `Ready to generate model for ${characterName}`, "success");
    return data;

  } catch (e) {
    console.error("Upload error:", e);
    showToast("Upload failed", "Network error", "error");
    return null;
  }
}

/**
 * Generate character model from uploaded photo
 * @param {string} characterName - Name of the character
 * @param {string} characterRole - Role of the character
 * @param {boolean} isProtagonist - Is this the main character?
 * @param {string} photoUrl - Optional: URL of already uploaded photo
 */
export async function generateCharacterModel(characterName = null, characterRole = null, isProtagonist = false, photoUrl = null) {
  const projectId = getProjectId();

  if (!projectId) {
    showToast("No project loaded", "Open a project first", "error");
    return null;
  }

  // If no character name provided, try to use the kid name (backward compatibility)
  const name = characterName || $("kid-name")?.value?.trim() || "Character";
  const role = characterRole || (isProtagonist ? "protagonist" : "other");

  showToast("Generating character model", `Creating model for ${name}...`, "success");

  try {
    const res = await fetch("/api/generate-character-model", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ 
        projectId, 
        characterName: name,
        characterRole: role,
        isProtagonist,
        photoUrl,
      }),
    });

    const data = await res.json();

    if (data.error) {
      showToast("Generation failed", data.error, "error");
      return null;
    }

    showToast("Character model generated", `${name} is ready`, "success");

    // Update cached project with new character models
    if (state.cachedProject && data.characterModels) {
      state.cachedProject.character_models = data.characterModels;
    }

    return data;

  } catch (err) {
    console.error("Character model generation error:", err);
    showToast("Generation failed", "See console for details", "error");
    return null;
  }
}

/**
 * Upload photo and immediately generate model for a character
 */
export async function uploadAndGenerateCharacterModel(file, characterName, characterRole, isProtagonist = false) {
  const uploadResult = await uploadCharacterPhoto(file, characterName, characterRole, isProtagonist);
  
  if (!uploadResult?.photoUrl) {
    return null;
  }

  const modelResult = await generateCharacterModel(
    characterName, 
    characterRole, 
    isProtagonist, 
    uploadResult.photoUrl
  );

  return modelResult;
}

/**
 * Fetch list of character models and suggestions for the project
 */
export async function fetchCharacterModels() {
  const projectId = getProjectId();
  if (!projectId) return null;

  try {
    const res = await fetch(`/api/character-models?projectId=${projectId}`);
    const data = await res.json();
    
    if (data.error) {
      console.error("Error fetching character models:", data.error);
      return null;
    }

    return data;

  } catch (err) {
    console.error("Fetch character models error:", err);
    return null;
  }
}

/**
 * Delete a character model
 */
export async function deleteCharacterModel(characterKey) {
  const projectId = getProjectId();
  if (!projectId || !characterKey) return false;

  try {
    const res = await fetch(`/api/character-models`, {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ projectId, characterKey }),
    });

    // Check if response is OK before parsing
    if (!res.ok) {
      const text = await res.text();
      console.error("Delete failed:", res.status, text);
      showToast("Delete failed", `Server error: ${res.status}`, "error");
      return false;
    }

    const data = await res.json();

    if (data.error) {
      showToast("Delete failed", data.error, "error");
      return false;
    }

    showToast("Character removed", "Model deleted", "success");

    // Update cached project
    if (state.cachedProject && data.character_models) {
      state.cachedProject.character_models = data.character_models;
    }

    return true;

  } catch (err) {
    console.error("Delete character model error:", err);
    showToast("Delete failed", "Network error", "error");
    return false;
  }
}

// Legacy function for backward compatibility
export async function uploadPhoto() {
  const projectId = getProjectId();
  const fileInput = $("child-photo");
  const status = $("upload-status");

  if (!projectId) {
    if (status) status.textContent = "Create or open a project first.";
    return;
  }
  if (!fileInput?.files?.length) {
    if (status) status.textContent = "Choose a photo first.";
    return;
  }

  if (status) status.textContent = "Uploading...";

  // Use the new function with protagonist defaults
  const kidName = $("kid-name")?.value?.trim() || "Child";
  const result = await uploadCharacterPhoto(fileInput.files[0], kidName, "protagonist", true);

  if (result) {
    if (status) status.textContent = "Uploaded! You can now generate the character model.";
  } else {
    if (status) status.textContent = "Upload failed.";
  }
}

// Handle file selection from the character panel dropzone (legacy support)
export async function handlePanelFileSelect(file) {
  const preview = $("panel-upload-preview");
  const status = $("panel-upload-status");
  const dropzone = $("panel-dropzone");
  const projectId = getProjectId();

  if (!projectId) {
    if (status) status.textContent = "No project loaded.";
    return;
  }

  // Show preview
  if (preview) {
    const url = URL.createObjectURL(file);
    preview.innerHTML = `<img src="${url}" alt="preview">`;
    preview.classList.remove("hidden");
  }

  // Hide dropzone
  if (dropzone) dropzone.style.display = "none";

  // Upload and generate model for protagonist
  if (status) status.textContent = "Uploading photo...";

  const kidName = $("kid-name")?.value?.trim() || 
                  state.cachedProject?.kid_name || 
                  "Child";

  const result = await uploadAndGenerateCharacterModel(file, kidName, "protagonist", true);

  if (result) {
    if (status) status.textContent = "Character model ready!";
    const pid = getProjectId();
    if (pid) await openProjectById(pid);
    closeUploadModal();
  } else {
    if (status) status.textContent = "Failed. Try again.";
    if (dropzone) dropzone.style.display = "block";
  }
}