// js/core/state.js
// Global application state

export const state = {
  currentView: "grid",
  currentFilter: "all",
  currentPhase: "dashboard",
  generatingPages: new Set(),
  queuedPages: new Set(),
  cachedProject: null,
  cachedDashboardProjects: null,
  handlingPopstate: false,
};

// Phase setter that also updates body data attribute
export function setPhase(phase) {
  state.currentPhase = phase;
  document.body.dataset.phase = phase;
}

// Helper to clear project-related state
export function clearProjectState() {
  state.cachedProject = null;
  state.generatingPages.clear();
  state.queuedPages.clear();
}

// Helper to clear all state (for session reset)
export function clearAllState() {
  state.cachedProject = null;
  state.cachedDashboardProjects = null;
  state.generatingPages.clear();
  state.queuedPages.clear();
  localStorage.removeItem("projectId");
  localStorage.removeItem("lastStoryPages");
}

// Start a completely new project (clears projectId so a new one is created)
export function startNewProject() {
  clearAllState();
}