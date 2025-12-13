// js/ui/controls.js
// UI controls (view toggle, filters, account menu)

import { state } from '../core/state.js';
import { $ } from '../core/utils.js';
import { reRenderCurrentView } from './render.js';

// Initialize view toggle (grid/list) and filter controls
export function initViewControls() {
  $("view-grid")?.addEventListener("click", () => {
    state.currentView = "grid";
    $("view-grid").classList.add("active");
    $("view-list").classList.remove("active");
    reRenderCurrentView();
  });

  $("view-list")?.addEventListener("click", () => {
    state.currentView = "list";
    $("view-list").classList.add("active");
    $("view-grid").classList.remove("active");
    reRenderCurrentView();
  });

  $("page-filter")?.addEventListener("change", (e) => {
    state.currentFilter = e.target.value;
    reRenderCurrentView();
  });
}

// Initialize account menu (placeholder)
export function initAccountMenu() {
  const btn = $("account-btn");
  const menu = $("account-menu");
  if (!btn || !menu) return;

  btn.addEventListener("click", (e) => {
    e.stopPropagation();
    menu.classList.toggle("hidden");
  });

  document.addEventListener("click", () => {
    menu.classList.add("hidden");
  });

  // Placeholder actions
  $("login-btn")?.addEventListener("click", () => alert("Login UI later"));
  $("logout-btn")?.addEventListener("click", () => alert("Logout later"));
  $("orders-btn")?.addEventListener("click", () => alert("Orders UI later"));
}