// js/api/story.js
// Story ideas and story writing API calls

import { state, setPhase } from '../core/state.js';
import { $, showLoader, setWorkspaceTitle } from '../core/utils.js';
import { renderIdeas, renderStoryboard } from '../ui/render.js';

// Generate story ideas from child info
export async function fetchIdeas() {
  const name = $("kid-name").value.trim();
  const interests = $("kid-interests").value.trim();
  if (!name) return;

  showLoader("Generating story ideas...");

  const existingProjectId = localStorage.getItem("projectId");
  const res = await fetch("/api/story-ideas", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name, interests, projectId: existingProjectId || null }),
  });

  const data = await res.json();
  if (data.error) {
    $("results").innerHTML = `<div class="loader">Failed to generate ideas.</div>`;
    return;
  }

  localStorage.setItem("projectId", data.projectId);
  setPhase("select-idea");
  setWorkspaceTitle("Select a Story Idea", "Pick one to write the full story.");
  renderIdeas(data.ideas);
}

// Write a full story from a selected idea
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

  // Build project object for storyboard
  const project = {
    id: data.projectId,
    kid_name: $("kid-name").value.trim(),
    kid_interests: $("kid-interests").value.trim(),
    selected_idea: data.selected_idea || null,
    story_json: data.story_json || [],
    illustrations: [],
    context_registry: data.context_registry || {},
  };

  state.cachedProject = project;
  setWorkspaceTitle(project.selected_idea?.title || "Your Book", "Storyboard view");
  setPhase("storyboard");
  renderStoryboard(project);
}