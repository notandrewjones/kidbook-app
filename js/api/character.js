// js/api/character.js
// Character model generation and photo upload

import { $, showToast } from '../core/utils.js';
import { openProjectById } from './projects.js';
import { closeUploadModal } from '../ui/modals.js';

// Upload a child photo
export async function uploadPhoto() {
  const projectId = localStorage.getItem("projectId");
  const fileInput = $("child-photo");
  const status = $("upload-status");

  if (!projectId) {
    status.textContent = "Create or open a project first.";
    return;
  }
  if (!fileInput?.files?.length) {
    status.textContent = "Choose a photo first.";
    return;
  }

  status.textContent = "Uploading...";

  const formData = new FormData();
  formData.append("photo", fileInput.files[0]);
  formData.append("projectId", projectId);

  try {
    const res = await fetch("/api/upload-child-photo", { method: "POST", body: formData });
    const data = await res.json();

    if (data.photoUrl) {
      status.textContent = "Uploaded! You can now generate the character model.";
    } else {
      status.textContent = "Upload failed.";
    }
  } catch (e) {
    console.error(e);
    status.textContent = "Upload failed.";
  }
}

// Generate character model from uploaded photo
export async function generateCharacterModel() {
  const projectId = localStorage.getItem("projectId");
  const status = $("character-status") || $("panel-upload-status");

  if (!projectId) {
    showToast("No project loaded", "Open a project first", "error");
    return;
  }

  const kidName = $("kid-name").value.trim();
  if (status) status.textContent = "Generating character model…";

  showToast("Generating character", "This may take ~20 seconds", "success");

  try {
    const res = await fetch("/api/generate-character-model", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ projectId, kidName }),
    });

    const data = await res.json();

    if (!data.characterModelUrl) {
      throw new Error("No model URL returned");
    }

    if (status) status.textContent = "Character model ready!";
    showToast("Character model generated", "Applied to all scenes", "success");

    await openProjectById(projectId);
    closeUploadModal();

  } catch (err) {
    console.error(err);
    if (status) status.textContent = "Failed to generate character model.";
    showToast("Character generation failed", "See console", "error");
  }
}

// Handle file selection from the character panel dropzone
export async function handlePanelFileSelect(file) {
  const preview = $("panel-upload-preview");
  const status = $("panel-upload-status");
  const dropzone = $("panel-dropzone");
  const projectId = localStorage.getItem("projectId");

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

  // Upload the photo
  if (status) status.textContent = "Uploading photo...";

  const formData = new FormData();
  formData.append("photo", file);
  formData.append("projectId", projectId);

  try {
    const res = await fetch("/api/upload-child-photo", { method: "POST", body: formData });
    const data = await res.json();

    if (data.photoUrl) {
      if (status) status.textContent = "Photo uploaded! Generating character model...";
      showToast("Photo uploaded", "Now generating character model...", "success");
      await generateCharacterModel();
    } else {
      if (status) status.textContent = "Upload failed. Try again.";
      if (dropzone) dropzone.style.display = "block";
    }
  } catch (e) {
    console.error(e);
    if (status) status.textContent = "Upload failed. Try again.";
    if (dropzone) dropzone.style.display = "block";
  }
}