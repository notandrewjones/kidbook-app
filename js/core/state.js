// js/core/state.js
// Global application state
// Uses sessionStorage for tab isolation (each tab has its own session)

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

// =====================================================
// Tab-isolated storage helpers (use sessionStorage)
// sessionStorage is per-tab, localStorage is shared
// =====================================================

export function getProjectId() {
  return sessionStorage.getItem("projectId");
}

export function setProjectId(id) {
  if (id) {
    sessionStorage.setItem("projectId", id);
  } else {
    sessionStorage.removeItem("projectId");
  }
}

export function getLastStoryPages() {
  const stored = sessionStorage.getItem("lastStoryPages");
  if (stored) {
    try {
      return JSON.parse(stored);
    } catch {
      return null;
    }
  }
  return null;
}

export function setLastStoryPages(pages) {
  if (pages) {
    sessionStorage.setItem("lastStoryPages", JSON.stringify(pages));
  } else {
    sessionStorage.removeItem("lastStoryPages");
  }
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
  sessionStorage.removeItem("projectId");
  sessionStorage.removeItem("lastStoryPages");
}

// Start a completely new project (clears projectId so a new one is created)
export function startNewProject() {
  clearAllState();
}