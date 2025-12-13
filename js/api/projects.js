// js/api/projects.js
// Project loading and listing API calls

import { state, setPhase } from '../core/state.js';
import { $, showLoader, setWorkspaceTitle, showToast } from '../core/utils.js';
import { navigate } from '../core/router.js';
import { renderDashboard, renderStoryboard, renderIdeas } from '../ui/render.js';

// Fetch all projects for dashboard
export async function loadDashboard() {
  setPhase("dashboard");
  setWorkspaceTitle("My Books", "Pick a project to continue, or start a new one.");
  showLoader("Loading your books...");
  state.cachedProject = null;

  navigate("dashboard");

  try {
    const res = await fetch("/api/projects-list");
    const data = await res.json();
    state.cachedDashboardProjects = data.projects || [];
    renderDashboard(state.cachedDashboardProjects);
  } catch (e) {
    console.error(e);
    state.cachedDashboardProjects = null;
    $("results").innerHTML = `<div class="loader">Couldn't load projects.</div>`;
  }
}

// Load a specific project by ID
export async function openProjectById(projectId, phaseHint = null) {
  localStorage.setItem("projectId", projectId);
  showLoader("Loading project...");

  const res = await fetch("/api/load-project", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ projectId }),
  });
  const data = await res.json();

  const project = data?.project;
  if (!project) {
    $("results").innerHTML = `<div class="loader">Couldn't load that project.</div>`;
    return;
  }

  // Cache the project
  state.cachedProject = project;

  // Populate form inputs
  $("kid-name").value = project.kid_name || "";
  $("kid-interests").value = project.kid_interests || "";

  // Determine appropriate phase based on project state
  let targetPhase;

  if (!project.story_ideas?.length) {
    targetPhase = "ideas";
  } else if (project.story_ideas?.length && !project.selected_idea) {
    targetPhase = "select-idea";
  } else if (project.story_json?.length) {
    targetPhase = "storyboard";
  } else {
    targetPhase = "select-idea";
  }

  // Honor phaseHint if valid
  if (phaseHint && isPhaseValidForProject(phaseHint, project)) {
    targetPhase = phaseHint;
  }

  // Navigate and render
  setPhase(targetPhase);
  navigate(targetPhase, projectId);

  if (targetPhase === "ideas") {
    setWorkspaceTitle("Project", "Generate story ideas to begin.");
    $("results").innerHTML = `<div class="loader">This book has no ideas yet. Use the form to generate them.</div>`;
  } else if (targetPhase === "select-idea") {
    setWorkspaceTitle("Select a Story Idea", "Pick one to write the full story.");
    renderIdeas(project.story_ideas);
  } else if (targetPhase === "storyboard") {
    const title =
      (project.selected_idea && project.selected_idea.title) ||
      (project.kid_name ? `Book for ${project.kid_name}` : "Your Book");
    setWorkspaceTitle(title, "Storyboard view");
    renderStoryboard(project);
  }
}

// Check if a phase is valid for the current project state
function isPhaseValidForProject(phase, project) {
  if (phase === "ideas") return true;
  if (phase === "select-idea") return project.story_ideas?.length > 0;
  if (phase === "storyboard") return project.story_json?.length > 0;
  return false;
}

// Get project status text for dashboard cards
export function projectStatusText(p) {
  if (!p.story_ideas || !p.story_ideas.length) return "No story ideas yet";
  if (p.story_ideas && !p.selected_idea) return "Ideas ready — pick one";
  if (p.selected_idea && (!p.story_json || !p.story_json.length)) return "Idea selected — story not written yet";
  if (p.story_json?.length && (!p.illustrations || !p.illustrations.length)) return "Story ready — no illustrations yet";
  if (p.story_json?.length && p.illustrations?.length) return `Story + ${p.illustrations.length} illustration(s)`;
  return "In progress";
}