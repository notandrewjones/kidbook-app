// js/app.js
// Main application entry point

// Core
import { state, clearAllState, setPhase } from './core/state.js';
import { $, setWorkspaceTitle } from './core/utils.js';
import { initRouter, setRouteHandlers } from './core/router.js';

// API
import { loadDashboard, openProjectById } from './api/projects.js';
import { fetchIdeas } from './api/story.js';

// UI
import { initViewControls, initAccountMenu } from './ui/controls.js';
import { initImageModalEvents } from './ui/modals.js';

// =====================================================
// App Initialization
// =====================================================

function initApp() {
  // Register route handlers (avoids circular imports in router.js)
  setRouteHandlers({
    dashboard: loadDashboard,
    project: openProjectById,
  });

  // Initialize UI components
  initAccountMenu();
  initImageModalEvents();
  initViewControls();

  // Form submission - generate ideas
  $("kid-form")?.addEventListener("submit", (e) => {
    e.preventDefault();
    fetchIdeas();
  });

  // Reset session button
  $("reset-session")?.addEventListener("click", () => {
    clearAllState();
    $("kid-name").value = "";
    $("kid-interests").value = "";
    setPhase("dashboard");
    setWorkspaceTitle("Workspace", "Start a new book or open an existing one.");
    $("results").innerHTML = `<div class="loader">Session cleared. Generate ideas to begin.</div>`;
  });

  // Dashboard button
  $("go-dashboard")?.addEventListener("click", loadDashboard);

  // Initialize router (parses URL and navigates to correct view)
  initRouter();
}

// =====================================================
// Boot
// =====================================================

document.addEventListener("DOMContentLoaded", initApp);
