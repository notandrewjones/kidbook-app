// js/api/projects.js
// Project loading and listing API calls

import { state, setPhase } from '../core/state.js';
import { $, showLoader, setWorkspaceTitle, showToast } from '../core/utils.js';
import { navigate } from '../core/router.js';
import { renderDashboard, renderStoryboard, renderStoryEditor, renderIdeas } from '../ui/render.js';

// Track recently completed illustrations that may not be on server yet
const recentlyCompletedIllustrations = new Map(); // projectId -> [{page, image_url, revisions}]

// Called by illustrations.js when a generation completes
export function recordCompletedIllustration(projectId, illustration) {
  if (!recentlyCompletedIllustrations.has(projectId)) {
    recentlyCompletedIllustrations.set(projectId, []);
  }
  const list = recentlyCompletedIllustrations.get(projectId);
  // Remove existing entry for same page
  const filtered = list.filter(i => Number(i.page) !== Number(illustration.page));
  filtered.push(illustration);
  recentlyCompletedIllustrations.set(projectId, filtered);
}

// Clear recorded illustrations for a project (call after confirmed sync)
export function clearCompletedIllustrations(projectId) {
  recentlyCompletedIllustrations.delete(projectId);
}

// Fetch all projects for dashboard
export async function loadDashboard() {
  setPhase("dashboard");
  setWorkspaceTitle("My Books", "Pick a project to continue, or start a new one.");
  showLoader("Loading your books...");
  
  // Don't clear cachedProject if generations are running - we might come back
  const hasActiveGenerations = state.generatingPages.size > 0 || state.queuedPages.size > 0;
  if (!hasActiveGenerations) {
    state.cachedProject = null;
  }

  navigate("dashboard");

  try {
    const res = await fetch("/api/projects-list", {
      credentials: 'include' // Important for auth cookies
    });
    
    // Handle auth errors
    if (res.status === 401) {
      state.cachedDashboardProjects = [];
      $("results").innerHTML = `
        <div class="empty-state">
          <div class="empty-icon">📚</div>
          <h3>Welcome to Kids Book Creator!</h3>
          <p>Please log in to view your books or create a new one.</p>
          <button class="btn btn-primary" onclick="document.getElementById('login-btn').click()">
            Log In to Get Started
          </button>
        </div>
      `;
      return;
    }
    
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
  
  // Check if we already have this project cached with active generations
  const hasActiveGenerations = state.generatingPages.size > 0 || state.queuedPages.size > 0;
  const isSameProject = state.cachedProject?.id === projectId;
  
  // If same project with active generations, just re-render from cache
  if (isSameProject && hasActiveGenerations) {
    const project = state.cachedProject;
    
    // Determine phase and render
    let targetPhase = "storyboard";
    if (!project.story_ideas?.length) targetPhase = "ideas";
    else if (!project.selected_idea) targetPhase = "select-idea";
    else if (project.story_json?.length) targetPhase = "storyboard";
    
    if (phaseHint && isPhaseValidForProject(phaseHint, project)) {
      targetPhase = phaseHint;
    }
    
    setPhase(targetPhase);
    navigate(targetPhase, projectId);
    
    if (targetPhase === "storyboard") {
      const title = project.selected_idea?.title || 
        (project.kid_name ? `Book for ${project.kid_name}` : "Your Book");
      setWorkspaceTitle(title, "Storyboard view");
      renderStoryboard(project);
    }
    return;
  }
  
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

  // Merge any recently completed illustrations that server might not have yet
  const recentIllustrations = recentlyCompletedIllustrations.get(projectId) || [];
  if (recentIllustrations.length > 0) {
    const serverIllustrations = project.illustrations || [];
    const serverPages = new Set(serverIllustrations.map(i => Number(i.page)));
    
    // Add any recent illustrations not on server
    for (const recent of recentIllustrations) {
      if (!serverPages.has(Number(recent.page))) {
        serverIllustrations.push(recent);
      } else {
        // Server has it, update if our version is newer (has image)
        const idx = serverIllustrations.findIndex(i => Number(i.page) === Number(recent.page));
        if (idx !== -1 && recent.image_url) {
          serverIllustrations[idx] = recent;
        }
      }
    }
    project.illustrations = serverIllustrations;
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
    // Check if story is locked - if so, go to storyboard; otherwise, edit mode
    // Also treat projects with existing illustrations as "locked" (legacy projects)
    const hasIllustrations = project.illustrations?.length > 0;
    const hasCharacterModel = !!project.character_model_url;
    const isEffectivelyLocked = project.story_locked === true || hasIllustrations || hasCharacterModel;
    
    console.log("Phase detection:", {
      story_locked: project.story_locked,
      story_locked_type: typeof project.story_locked,
      hasIllustrations,
      hasCharacterModel,
      isEffectivelyLocked
    });
    
    if (isEffectivelyLocked) {
      targetPhase = "storyboard";
    } else {
      targetPhase = "edit-story";
    }
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
  } else if (targetPhase === "edit-story") {
    const title = project.selected_idea?.title || "Edit Your Story";
    setWorkspaceTitle(title, "Review and edit the story before continuing.");
    renderStoryEditor(project);
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
  
  // For edit-story, must have story but NOT be locked and have no illustrations/character
  if (phase === "edit-story") {
    const hasIllustrations = project.illustrations?.length > 0;
    const hasCharacterModel = !!project.character_model_url;
    return project.story_json?.length > 0 && !project.story_locked && !hasIllustrations && !hasCharacterModel;
  }
  
  // For storyboard, must have story and be locked OR have illustrations/character
  if (phase === "storyboard") {
    const hasIllustrations = project.illustrations?.length > 0;
    const hasCharacterModel = !!project.character_model_url;
    return project.story_json?.length > 0 && (project.story_locked || hasIllustrations || hasCharacterModel);
  }
  
  return false;
}

// Get project status text for dashboard cards
export function projectStatusText(p) {
  if (!p.story_ideas || !p.story_ideas.length) return "No story ideas yet";
  if (p.story_ideas && !p.selected_idea) return "Ideas ready — pick one";
  if (p.selected_idea && (!p.story_json || !p.story_json.length)) return "Idea selected — story not written yet";
  if (p.story_json?.length && !p.story_locked) return "Story draft — needs review";
  if (p.story_json?.length && (!p.illustrations || !p.illustrations.length)) return "Story ready — no illustrations yet";
  if (p.story_json?.length && p.illustrations?.length) return `Story + ${p.illustrations.length} illustration(s)`;
  return "In progress";
}