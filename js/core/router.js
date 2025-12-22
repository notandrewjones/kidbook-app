// js/core/router.js
// Path-based client-side router

import { state } from './state.js';

// Route patterns
const ROUTES = {
  dashboard: /^\/(?:dashboard)?$/,
  orders: /^\/orders$/,
  project: /^\/p\/([a-zA-Z0-9-]+)$/,
  projectPhase: /^\/p\/([a-zA-Z0-9-]+)\/(storyboard|ideas|select-idea|compositor)$/,
};

// Route handlers (set by app.js to avoid circular imports)
let routeHandlers = {
  dashboard: null,
  project: null,
  orders: null,
};

// Register route handlers
export function setRouteHandlers(handlers) {
  routeHandlers = { ...routeHandlers, ...handlers };
}

// Parse current URL path into route info
export function parseRoute(path) {
  path = path || window.location.pathname;

  // Dashboard: / or /dashboard
  if (ROUTES.dashboard.test(path)) {
    return { route: "dashboard", projectId: null, phase: "dashboard" };
  }

  // Orders: /orders
  if (ROUTES.orders.test(path)) {
    return { route: "orders", projectId: null, phase: "orders" };
  }

  // Project with phase: /p/:projectId/:phase
  let match = path.match(ROUTES.projectPhase);
  if (match) {
    return { route: "projectPhase", projectId: match[1], phase: match[2] };
  }

  // Project root: /p/:projectId
  match = path.match(ROUTES.project);
  if (match) {
    return { route: "project", projectId: match[1], phase: null };
  }

  // Fallback to dashboard
  return { route: "dashboard", projectId: null, phase: "dashboard" };
}

// Build URL path from phase and projectId
export function buildPath(phase, projectId = null) {
  if (phase === "orders") {
    return "/orders";
  }

  if (!projectId || phase === "dashboard") {
    return "/dashboard";
  }

  if (phase === "storyboard" || phase === "ideas" || phase === "select-idea" || phase === "compositor") {
    return `/p/${projectId}/${phase}`;
  }

  return `/p/${projectId}`;
}

// Navigate to a new route (pushes history state)
export function navigate(phase, projectId = null, replace = false) {
  if (state.handlingPopstate) return;

  const path = buildPath(phase, projectId);
  const historyState = { phase, projectId };

  // Don't push if already at this path
  if (window.location.pathname === path) {
    return;
  }

  if (replace) {
    history.replaceState(historyState, "", path);
  } else {
    history.pushState(historyState, "", path);
  }
}

// Handle browser back/forward
function handlePopState(event) {
  state.handlingPopstate = true;
  routeFromCurrentURL();
  state.handlingPopstate = false;
}

// Route based on current URL
export function routeFromCurrentURL() {
  const parsed = parseRoute(window.location.pathname);

  if (parsed.route === "dashboard") {
    routeHandlers.dashboard?.();
  } else if (parsed.route === "orders") {
    routeHandlers.orders?.();
  } else if (parsed.projectId) {
    routeHandlers.project?.(parsed.projectId, parsed.phase);
  } else {
    routeHandlers.dashboard?.();
  }
}

// Initialize router
export function initRouter() {
  // Listen for browser back/forward
  window.addEventListener("popstate", handlePopState);

  // Set initial state without navigation
  const parsed = parseRoute(window.location.pathname);
  const historyState = { phase: parsed.phase || "dashboard", projectId: parsed.projectId };
  history.replaceState(historyState, "", window.location.pathname);

  // Route to correct view
  routeFromCurrentURL();
}