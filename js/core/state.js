// js/core/state.js
// Global application state

export const state = {
  currentView: "grid",
  currentFilter: "all",
  currentPhase: "dashboard",
  generatingPages: new Set(),
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
}

// Helper to clear all state (for session reset)
export function clearAllState() {
  state.cachedProject = null;
  state.cachedDashboardProjects = null;
  state.generatingPages.clear();
  localStorage.removeItem("projectId");
  localStorage.removeItem("lastStoryPages");
}