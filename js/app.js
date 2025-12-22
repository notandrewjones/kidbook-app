// js/app.js
// Main application entry point

// Core
import { state, clearAllState, setPhase, startNewProject } from './core/state.js';
import { $, setWorkspaceTitle } from './core/utils.js';
import { initRouter, setRouteHandlers } from './core/router.js';
import { checkSession, onAuthChange } from './core/auth.js';

// API
import { loadDashboard, openProjectById } from './api/projects.js';

// UI
import { initViewControls, initAccountMenu, initSearch } from './ui/controls.js';
import { initImageModalEvents } from './ui/modals.js';
import { initAuthUI } from './ui/auth.js';
import { closeNewStoryModal } from './ui/render.js';
import { initQueueUI } from './ui/queue.js';
import { initCart, refreshCart } from './ui/cart.js';
import { initOrderConfirmation } from './ui/order-confirmation.js';

// =====================================================
// App Initialization
// =====================================================

async function initApp() {
  // Check authentication session on load
  await checkSession();
  
  // Subscribe to auth changes to refresh dashboard on login
  onAuthChange(async ({ isAuthenticated }) => {
    // If user just logged in
    if (isAuthenticated) {
      // Load generation history from server
      const { loadHistoryFromServer } = await import('./ui/queue.js');
      loadHistoryFromServer();
      
      // Refresh cart
      refreshCart();
      
      // Refresh dashboard if we're on it
      if (state.currentPhase === "dashboard") {
        loadDashboard();
      }
    }
  });
  
  // Register route handlers (avoids circular imports in router.js)
  setRouteHandlers({
    dashboard: loadDashboard,
    project: openProjectById,
  });

  // Initialize UI components
  initAccountMenu();
  initImageModalEvents();
  initViewControls();
  initSearch();
  initQueueUI();
  initCart();
  initOrderConfirmation();
  
  // Initialize auth UI (login/logout buttons, etc.)
  initAuthUI();

  // Form submission - generate ideas (use dynamic import to avoid circular dependency)
  $("kid-form")?.addEventListener("submit", async (e) => {
    e.preventDefault();
    const { fetchIdeas } = await import('./api/story.js');
    await fetchIdeas();
  });

  // New story modal form submission
  $("new-story-form")?.addEventListener("submit", async (e) => {
    e.preventDefault();
    const nameInput = $("new-story-name");
    const topicInput = $("new-story-topic");
    
    // Copy values to the sidebar form (which the fetchIdeas function reads from)
    const sidebarName = $("kid-name");
    const sidebarInterests = $("kid-interests");
    
    if (sidebarName) sidebarName.value = nameInput?.value || "";
    if (sidebarInterests) sidebarInterests.value = topicInput?.value || "";
    
    // Close modal
    closeNewStoryModal();
    
    // Start a new project and generate ideas
    startNewProject();
    const { fetchIdeas } = await import('./api/story.js');
    await fetchIdeas();
  });

  // Close new story modal
  $("close-new-story-modal")?.addEventListener("click", closeNewStoryModal);
  
  // Close modal on backdrop click
  $("new-story-modal")?.addEventListener("click", (e) => {
    if (e.target?.classList?.contains("modal-backdrop")) closeNewStoryModal();
  });
  
  // Close new story modal on Escape key
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      closeNewStoryModal();
    }
  });

  // Reset session button - IMPORTANT: Clear projectId so new project is created
  $("reset-session")?.addEventListener("click", () => {
    startNewProject(); // This clears localStorage.projectId
    $("kid-name").value = "";
    $("kid-interests").value = "";
    setPhase("dashboard");
    setWorkspaceTitle("Workspace", "Start a new book or open an existing one.");
    $("results").innerHTML = `<div class="loader">Session cleared. Generate ideas to begin.</div>`;
  });

  // Dashboard button (sidebar)
  $("go-dashboard")?.addEventListener("click", loadDashboard);

  // Brand logo click - navigate to dashboard
  $("brand-link")?.addEventListener("click", (e) => {
    e.preventDefault();
    loadDashboard();
  });

  // Dashboard button (topbar)
  $("nav-dashboard")?.addEventListener("click", loadDashboard);

  // Initialize router (parses URL and navigates to correct view)
  initRouter();
}

// =====================================================
// Boot
// =====================================================

document.addEventListener("DOMContentLoaded", initApp);