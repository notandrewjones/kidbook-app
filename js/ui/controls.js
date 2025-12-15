// js/ui/controls.js
// UI controls (view toggle, filters, account menu, search)

import { state } from '../core/state.js';
import { $, escapeHtml } from '../core/utils.js';
import { reRenderCurrentView } from './render.js';
import { openProjectById } from '../api/projects.js';

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

// Initialize global search
export function initSearch() {
  const input = $("global-search");
  const dropdown = $("search-dropdown");
  if (!input || !dropdown) return;

  let debounceTimer = null;
  let activeIndex = -1;
  let currentResults = [];

  // Search on input
  input.addEventListener("input", () => {
    clearTimeout(debounceTimer);
    const query = input.value.trim();
    
    if (!query) {
      hideDropdown();
      return;
    }

    debounceTimer = setTimeout(() => {
      performSearch(query);
    }, 200);
  });

  // Keyboard navigation
  input.addEventListener("keydown", (e) => {
    if (dropdown.classList.contains("hidden")) {
      if (e.key === "Enter" && input.value.trim()) {
        performSearch(input.value.trim());
      }
      return;
    }

    if (e.key === "ArrowDown") {
      e.preventDefault();
      activeIndex = Math.min(activeIndex + 1, currentResults.length - 1);
      updateActiveResult();
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      activeIndex = Math.max(activeIndex - 1, 0);
      updateActiveResult();
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (activeIndex >= 0 && currentResults[activeIndex]) {
        selectResult(currentResults[activeIndex]);
      }
    } else if (e.key === "Escape") {
      hideDropdown();
      input.blur();
    }
  });

  // Hide on blur (with delay to allow click)
  input.addEventListener("blur", () => {
    setTimeout(() => hideDropdown(), 150);
  });

  // Show on focus if there's a query
  input.addEventListener("focus", () => {
    if (input.value.trim() && currentResults.length > 0) {
      dropdown.classList.remove("hidden");
    }
  });

  // Cmd/Ctrl+K shortcut
  document.addEventListener("keydown", (e) => {
    if ((e.metaKey || e.ctrlKey) && e.key === "k") {
      e.preventDefault();
      input.focus();
      input.select();
    }
  });

  async function performSearch(query) {
    try {
      // Fetch projects if not cached
      let projects = state.cachedDashboardProjects;
      if (!projects) {
        const res = await fetch("/api/projects-list");
        const data = await res.json();
        projects = data.projects || [];
      }

      // Filter projects by query
      const lowerQuery = query.toLowerCase();
      currentResults = projects.filter(p => {
        const title = p.selected_idea?.title || p.kid_name || "";
        const kidName = p.kid_name || "";
        const storyText = (p.story_json || []).map(page => page.text || "").join(" ");
        
        return title.toLowerCase().includes(lowerQuery) ||
               kidName.toLowerCase().includes(lowerQuery) ||
               storyText.toLowerCase().includes(lowerQuery);
      }).slice(0, 6); // Limit to 6 results

      activeIndex = -1;
      renderResults();
    } catch (err) {
      console.error("Search error:", err);
      currentResults = [];
      renderResults();
    }
  }

  function renderResults() {
    if (currentResults.length === 0) {
      dropdown.innerHTML = `<div class="search-dropdown-empty">No projects found</div>`;
      dropdown.classList.remove("hidden");
      return;
    }

    const html = currentResults.map((p, idx) => {
      const title = p.selected_idea?.title || 
                    (p.kid_name ? `Book for ${p.kid_name}` : "Untitled Book");
      const kidName = p.kid_name || "Unknown child";
      const thumbUrl = p.illustrations?.[0]?.image_url;
      
      // Check if draft
      const isDraft = p.story_json?.length > 0 && 
                      !p.story_locked && 
                      (!p.illustrations || p.illustrations.length === 0);

      return `
        <div class="search-result${idx === activeIndex ? ' active' : ''}" data-index="${idx}">
          <div class="search-result-thumb">
            ${thumbUrl ? `<img src="${thumbUrl}" alt="">` : "📖"}
          </div>
          <div class="search-result-info">
            <div class="search-result-title">${escapeHtml(title)}</div>
            <div class="search-result-sub">${escapeHtml(kidName)}</div>
          </div>
          ${isDraft ? `<span class="search-result-badge">Draft</span>` : ""}
        </div>
      `;
    }).join("");

    dropdown.innerHTML = html;
    dropdown.classList.remove("hidden");

    // Wire click events
    dropdown.querySelectorAll(".search-result").forEach(el => {
      el.addEventListener("mousedown", (e) => {
        e.preventDefault(); // Prevent blur
        const idx = parseInt(el.dataset.index);
        if (currentResults[idx]) {
          selectResult(currentResults[idx]);
        }
      });
    });
  }

  function updateActiveResult() {
    dropdown.querySelectorAll(".search-result").forEach((el, idx) => {
      el.classList.toggle("active", idx === activeIndex);
    });
  }

  function selectResult(project) {
    hideDropdown();
    input.value = "";
    openProjectById(project.id);
  }

  function hideDropdown() {
    dropdown.classList.add("hidden");
    activeIndex = -1;
  }
}