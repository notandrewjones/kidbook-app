// js/api/story.js
// Story ideas and story writing API calls

import { state, setPhase } from '../core/state.js';
import { $, showLoader, setWorkspaceTitle, showToast } from '../core/utils.js';

// Generate story ideas from child info
export async function fetchIdeas() {
  const name = $("kid-name").value.trim();
  const interests = $("kid-interests").value.trim();
  if (!name) return;

  showLoader("Generating story ideas...");

  // IMPORTANT: Only pass projectId if we're editing an existing project
  // If projectId is null/undefined, a NEW project will be created
  const existingProjectId = localStorage.getItem("projectId");
  
  // Check if we're intentionally starting fresh (no cached project means new)
  // If there's a cached project with the same ID, we're editing
  const shouldUseExistingProject = existingProjectId && 
    state.cachedProject?.id === existingProjectId;

  const res = await fetch("/api/story-ideas", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ 
      name, 
      interests, 
      projectId: shouldUseExistingProject ? existingProjectId : null 
    }),
  });

  const data = await res.json();
  if (data.error) {
    $("results").innerHTML = `<div class="loader">Failed to generate ideas.</div>`;
    return;
  }

  // Store the new/existing project ID
  localStorage.setItem("projectId", data.projectId);
  
  // Update cached project reference
  state.cachedProject = {
    id: data.projectId,
    kid_name: name,
    kid_interests: interests,
    story_ideas: data.ideas,
  };

  setPhase("select-idea");
  setWorkspaceTitle("Select a Story Idea", "Pick one to write the full story.");
  
  // Dynamic import to avoid circular dependency
  const { renderIdeas } = await import('../ui/render.js');
  renderIdeas(data.ideas);
}

// Write a full story from a selected idea (goes to edit phase, not storyboard)
export async function writeStoryFromIdeaIndex(selectedIdeaIndex) {
  const projectId = localStorage.getItem("projectId");
  if (!projectId) return;

  showLoader("Writing the story...");

  const res = await fetch("/api/write-story", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ projectId, selectedIdeaIndex }),
  });

  const data = await res.json();
  if (data.error) {
    console.error(data);
    $("results").innerHTML = `<div class="loader">Failed to write story.</div>`;
    return;
  }

  // Build project object for editor
  const project = {
    id: data.projectId,
    kid_name: $("kid-name").value.trim(),
    kid_interests: $("kid-interests").value.trim(),
    selected_idea: data.selected_idea || null,
    story_json: data.story_json || [],
    story_locked: false,
    illustrations: [],
    character_models: [],
  };

  state.cachedProject = project;
  localStorage.setItem("lastStoryPages", JSON.stringify(project.story_json));
  
  setWorkspaceTitle(project.selected_idea?.title || "Edit Your Story", "Review and edit the story before continuing.");
  setPhase("edit-story");
  
  // Dynamic import to avoid circular dependency
  const { renderStoryEditor } = await import('../ui/render.js');
  renderStoryEditor(project);
}

// Save story edits (without finalizing)
export async function saveStoryEdits(storyPages) {
  const projectId = localStorage.getItem("projectId");
  if (!projectId) return { success: false };

  try {
    const res = await fetch("/api/save-story", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ projectId, storyPages }),
    });

    const data = await res.json();
    if (data.error) {
      console.error(data);
      showToast("Save failed", data.error, "error");
      return { success: false };
    }

    // Update cached project
    if (state.cachedProject) {
      state.cachedProject.story_json = data.story_json;
    }
    localStorage.setItem("lastStoryPages", JSON.stringify(data.story_json));

    return { success: true, story_json: data.story_json };
  } catch (err) {
    console.error("Save error:", err);
    showToast("Save failed", "Network error", "error");
    return { success: false };
  }
}

// Finalize story and proceed to storyboard
export async function finalizeStory(storyPages) {
  const projectId = localStorage.getItem("projectId");
  if (!projectId) return;

  showLoader("Finalizing story and extracting characters...");

  try {
    const res = await fetch("/api/finalize-story", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ projectId, storyPages }),
    });

    const data = await res.json();
    if (data.error) {
      console.error(data);
      $("results").innerHTML = `<div class="loader">Failed to finalize story.</div>`;
      showToast("Finalize failed", data.error, "error");
      return;
    }

    // Update cached project with full data
    if (state.cachedProject) {
      state.cachedProject.story_json = data.story_json;
      state.cachedProject.story_locked = true;
      state.cachedProject.context_registry = data.context_registry;
      state.cachedProject.props_registry = data.props_registry;
      state.cachedProject.character_models = data.character_models || [];
    }
    localStorage.setItem("lastStoryPages", JSON.stringify(data.story_json));

    setWorkspaceTitle(state.cachedProject?.selected_idea?.title || "Your Book", "Storyboard view");
    setPhase("storyboard");
    
    // Dynamic import to avoid circular dependency
    const { renderStoryboard } = await import('../ui/render.js');
    renderStoryboard(state.cachedProject);

    showToast("Story finalized", "Now add character models to generate illustrations", "success");
  } catch (err) {
    console.error("Finalize error:", err);
    $("results").innerHTML = `<div class="loader">Failed to finalize story.</div>`;
    showToast("Finalize failed", "Network error", "error");
  }
}