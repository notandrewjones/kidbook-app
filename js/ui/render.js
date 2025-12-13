// js/ui/render.js
// Rendering functions for dashboard, storyboard, and ideas

import { state } from '../core/state.js';
import { $, escapeHtml, showToast } from '../core/utils.js';
import { projectStatusText, openProjectById } from '../api/projects.js';
import { writeStoryFromIdeaIndex, fetchIdeas } from '../api/story.js';
import { generateSingleIllustration, generateIllustrations } from '../api/illustrations.js';
import { openImageModal, initUploadModal } from './modals.js';
import { renderCharacterPanel } from './panels.js';

// Re-render current view without fetching (for view/filter switching)
export function reRenderCurrentView() {
  if (state.currentPhase === "storyboard" && state.cachedProject) {
    renderStoryboard(state.cachedProject);
  } else if (state.currentPhase === "dashboard" && state.cachedDashboardProjects) {
    renderDashboard(state.cachedDashboardProjects);
  }
}

// Render the dashboard (project list)
export function renderDashboard(projects) {
  const results = $("results");

  if (!projects.length) {
    results.innerHTML = `
      <div class="loader">
        <div>No projects yet.</div>
      </div>
    `;
    return;
  }

  const cards = projects.map((p) => {
    const title =
      (p.selected_idea && p.selected_idea.title) ||
      (p.kid_name ? `Book for ${p.kid_name}` : "Untitled Book");

    const status = projectStatusText(p);

    const thumbImg = p.illustrations?.[0]?.image_url
      ? `<img src="${p.illustrations[0].image_url}" alt="thumb">`
      : "";

    return `
      <div class="story-card" data-open-project="${p.id}">
        <div class="thumb">
          <span class="badge">${status}</span>
          ${thumbImg}
        </div>
        <div class="card-body">
          <div class="card-title">${escapeHtml(title)}</div>
          <p class="card-sub">${escapeHtml(p.kid_name || "Unknown child")}</p>
          <div class="card-meta">
            <span>${escapeHtml(p.id.slice(0, 8))}</span>
            <span>Open</span>
          </div>
        </div>
      </div>
    `;
  }).join("");

  const containerClass = state.currentView === "list" ? "list" : "grid";
  results.innerHTML = `<div class="${containerClass}">${cards}</div>`;

  // Wire click events
  results.querySelectorAll("[data-open-project]").forEach((el) => {
    el.addEventListener("click", async () => {
      const id = el.getAttribute("data-open-project");
      await openProjectById(id);
    });
  });
}

// Render story ideas selection
export function renderIdeas(ideas) {
  const results = $("results");

  const cards = ideas.map((idea, idx) => `
    <div class="story-card" data-idea-index="${idx}">
      <div class="thumb">
        <span class="badge">Idea</span>
      </div>
      <div class="card-body">
        <div class="card-title">${escapeHtml(idea.title)}</div>
        <p class="card-sub">${escapeHtml(idea.description)}</p>
        <div class="card-meta">
          <span>#${idx + 1}</span>
          <span>Write story</span>
        </div>
      </div>
    </div>
  `).join("");

  results.innerHTML = `
    <div class="grid">${cards}</div>
    <div style="margin-top:14px; display:flex; gap:10px; flex-wrap:wrap;">
      <button id="regen-ideas" class="btn btn-secondary">Generate New Ideas</button>
    </div>
  `;

  // Wire click events
  results.querySelectorAll("[data-idea-index]").forEach((el) => {
    el.addEventListener("click", async () => {
      const idx = Number(el.getAttribute("data-idea-index"));
      await writeStoryFromIdeaIndex(idx);
    });
  });

  $("regen-ideas")?.addEventListener("click", fetchIdeas);
}

// Render the storyboard
export function renderStoryboard(project) {
  renderCharacterPanel(project);
  
  const results = $("results");
  localStorage.setItem("lastStoryPages", JSON.stringify(project.story_json || []));

  const pages = project.story_json || [];
  const illus = Array.isArray(project.illustrations) ? project.illustrations : [];
  const illusMap = new Map(illus.map((i) => [Number(i.page), i]));

  // Header actions
  const topActions = `
    <div style="display:flex; gap:10px; flex-wrap:wrap; margin-bottom:14px;">
      <button id="generate-illustrations-btn" class="btn btn-primary">Generate Illustrations</button>
    </div>
    <div id="character-status" class="status-line"></div>
    <div id="illustration-status" class="status-line"></div>
  `;

  // Filter pages
  const filtered = pages.filter((p) => {
    const i = illusMap.get(Number(p.page));
    const has = !!i?.image_url;
    if (state.currentFilter === "missing") return !has;
    if (state.currentFilter === "ready") return has;
    if (state.currentFilter === "errors") return false;
    return true;
  });

  // Build cards
  const cards = filtered.map((p) => {
    const i = illusMap.get(Number(p.page));
    const url = i?.image_url || "";
    const rev = typeof i?.revisions === "number" ? i.revisions : 0;
    const isGenerating = state.generatingPages.has(Number(p.page));
    const isQueued = state.queuedPages?.has(Number(p.page));

    let badge, thumbContent, cardClass;

    if (isGenerating) {
      badge = `Generating...`;
      cardClass = "generating";
      thumbContent = `
        <div class="generating-overlay">
          <div class="spinner"></div>
          <div>Generating...</div>
        </div>
        ${url ? `<img src="${url}" alt="Page ${p.page}" style="opacity: 0.5;">` : ""}
      `;
    } else if (isQueued) {
      badge = `Queued`;
      cardClass = "queued";
      thumbContent = `
        <div class="queued-overlay">
          <div class="queue-icon">⏳</div>
          <div>Queued</div>
        </div>
        ${url ? `<img src="${url}" alt="Page ${p.page}" style="opacity: 0.5;">` : ""}
      `;
    } else {
      badge = url ? `Ready • r${rev}` : "Missing";
      cardClass = "";
      thumbContent = url
        ? `<img src="${url}" alt="Page ${p.page}">`
        : `<div class="thumb-placeholder">Click to generate</div>`;
    }

    return `
      <div class="story-card ${cardClass}" data-page="${p.page}" data-image="${url}">
        <div class="thumb">
          <span class="badge">${`Page ${p.page} • ${badge}`}</span>
          ${thumbContent}
        </div>
        <div class="card-body">
          <div class="card-title">Page ${p.page}</div>
          <p class="card-sub">${escapeHtml(p.text)}</p>
          <div class="card-meta">
            <span>${isGenerating ? "Generating..." : isQueued ? "Queued" : url ? "Preview / Regenerate" : "Generate"}</span>
            <span>${isGenerating ? "⚙️" : isQueued ? "⏳" : url ? "✓" : "+"}</span>
          </div>
        </div>
      </div>
    `;
  }).join("");

  const containerClass = state.currentView === "list" ? "list" : "grid";

  results.innerHTML = `
    ${topActions}
    <div class="${containerClass}">
      ${cards}
    </div>
  `;

  // Wire events
  results.querySelectorAll("[data-page]").forEach((el) => {
    el.addEventListener("click", () => {
      const pageNum = Number(el.getAttribute("data-page"));

      // Don't allow interaction while generating or queued
      if (state.generatingPages.has(pageNum)) {
        showToast("Please wait", "This page is currently being generated", "warn");
        return;
      }
      if (state.queuedPages?.has(pageNum)) {
        showToast("Already queued", "This page is waiting to generate", "warn");
        return;
      }

      const url = el.getAttribute("data-image");

      if (url) {
        openImageModal(pageNum, url);
      } else {
        const pageObj = pages.find((x) => Number(x.page) === pageNum);
        if (!pageObj) return;
        generateSingleIllustration(pageNum, pageObj.text);
      }
    });
  });

  $("generate-illustrations-btn")?.addEventListener("click", generateIllustrations);

  initUploadModal();
}