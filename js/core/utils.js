// js/core/utils.js
// DOM utilities and helper functions

// Shorthand for getElementById
export function $(id) {
  return document.getElementById(id);
}

// Escape HTML to prevent XSS
export function escapeHtml(str) {
  if (str == null) return "";
  return String(str)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

// Set workspace title and subtitle
export function setWorkspaceTitle(title, subtitle) {
  const t = $("workspace-title");
  const s = $("workspace-subtitle");
  if (t) t.textContent = title || "Workspace";
  if (s) s.textContent = subtitle || "";
}

// Show loading spinner in results area
export function showLoader(message) {
  const results = $("results");
  if (results) {
    results.innerHTML = `
      <div class="loader">
        <div class="spinner"></div>
        <div>${message || "Loading..."}</div>
      </div>
    `;
  }
}

// Toast notification system
export function showToast(title, message = "", type = "success") {
  const container = $("toast-container");
  if (!container) return;

  const box = document.createElement("div");
  box.className = `toast ${type}`;
  box.innerHTML = `
    <div class="toast-title">${title}</div>
    ${message ? `<div class="toast-msg">${message}</div>` : ""}
  `;
  container.appendChild(box);
  setTimeout(() => box.remove(), 3200);
}