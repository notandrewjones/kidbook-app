// js/compositor/integration.js
// Integration helpers for connecting compositor to the Kids Book Creator app

import { state } from '../core/state.js';
import { $, showToast } from '../core/utils.js';
import { CompositorUI, projectToBookData, isProjectReadyForComposition } from './index.js';

let compositorInstance = null;

/**
 * Initialize compositor phase in the app
 * Call this after storyboard when user wants to export/layout their book
 */
export function initCompositorPhase() {
  const project = state.cachedProject;
  
  if (!project) {
    showToast("No project", "Load a project first", "error");
    return false;
  }
  
  if (!isProjectReadyForComposition(project)) {
    showToast("Not ready", "Generate more illustrations first", "warn");
    return false;
  }
  
  // Convert project to book data format
  const bookData = projectToBookData(project);
  
  // Create or reuse compositor
  const container = $("results");
  if (!container) return false;
  
  compositorInstance = new CompositorUI("results");
  compositorInstance.initialize(bookData);
  
  // Set up callbacks
  compositorInstance.onExportComplete = (format) => {
    showToast("Export complete", `Your book has been exported as ${format.toUpperCase()}`, "success");
    // Could save export history to Supabase here
  };
  
  compositorInstance.onTemplateChange = (templateId) => {
    // Could save preferred template to project
    console.log("Template changed to:", templateId);
  };
  
  return true;
}

/**
 * Add "Layout & Export" button to storyboard
 * Call this from renderStoryboard() in render.js
 */
export function renderCompositorButton(project) {
  const isReady = isProjectReadyForComposition(project);
  
  return `
    <button 
      id="open-compositor-btn" 
      class="btn ${isReady ? 'btn-secondary' : 'btn-ghost'}"
      ${!isReady ? 'disabled title="Generate more illustrations first"' : ''}
    >
      <svg class="btn-icon" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor">
        <path stroke-linecap="round" stroke-linejoin="round" d="M12 6.042A8.967 8.967 0 0 0 6 3.75c-1.052 0-2.062.18-3 .512v14.25A8.987 8.987 0 0 1 6 18c2.305 0 4.408.867 6 2.292m0-14.25a8.966 8.966 0 0 1 6-2.292c1.052 0 2.062.18 3 .512v14.25A8.987 8.987 0 0 0 18 18a8.967 8.967 0 0 0-6 2.292m0-14.25v14.25" />
      </svg>
      <span>Layout & Export</span>
    </button>
  `;
}

/**
 * Bind compositor button event
 */
export function bindCompositorButton() {
  $("open-compositor-btn")?.addEventListener("click", () => {
    const success = initCompositorPhase();
    if (success) {
      // Update phase
      document.body.dataset.phase = "compositor";
      
      // Update workspace title
      const title = $("workspace-title");
      const subtitle = $("workspace-subtitle");
      if (title) title.textContent = "Book Layout";
      if (subtitle) subtitle.textContent = "Choose a template and export your book";
    }
  });
}

/**
 * Get the current compositor instance
 */
export function getCompositorInstance() {
  return compositorInstance;
}

/**
 * Update compositor with new book data
 * (e.g., after new illustrations are generated)
 */
export function updateCompositorData() {
  if (!compositorInstance) return;
  
  const project = state.cachedProject;
  if (!project) return;
  
  const bookData = projectToBookData(project);
  compositorInstance.updateBookData(bookData);
}

/**
 * Clean up compositor when leaving the phase
 */
export function cleanupCompositor() {
  compositorInstance = null;
}

// Export for use in render.js
export { isProjectReadyForComposition, projectToBookData };