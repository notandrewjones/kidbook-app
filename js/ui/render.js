// js/ui/render.js
// Rendering functions for dashboard, storyboard, ideas, and story editor

import { state } from '../core/state.js';
import { $, escapeHtml, showToast } from '../core/utils.js';
import { projectStatusText, openProjectById } from '../api/projects.js';
import { generateSingleIllustration, generateIllustrations } from '../api/illustrations.js';
import { openImageModal, initUploadModal } from './modals.js';
import { renderCharacterPanel } from './panels.js';

// Re-render current view without fetching (for view/filter switching)
export function reRenderCurrentView() {
  if (state.currentPhase === "storyboard" && state.cachedProject) {
    renderStoryboard(state.cachedProject);
  } else if (state.currentPhase === "edit-story" && state.cachedProject) {
    renderStoryEditor(state.cachedProject);
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
    
    // Check if this is a draft (has story but not locked, no illustrations)
    const isDraft = p.story_json?.length > 0 && 
                    !p.story_locked && 
                    (!p.illustrations || p.illustrations.length === 0);

    const thumbImg = p.illustrations?.[0]?.image_url
      ? `<img src="${p.illustrations[0].image_url}" alt="thumb">`
      : "";
    
    // Add draft class and badge
    const cardClass = isDraft ? "story-card draft" : "story-card";
    const draftBadge = isDraft ? `<span class="badge badge-draft">Draft</span>` : "";

    return `
      <div class="${cardClass}" data-open-project="${p.id}">
        <div class="thumb">
          <span class="badge">${status}</span>
          ${draftBadge}
          ${thumbImg}
        </div>
        <div class="card-body">
          <div class="card-title">${escapeHtml(title)}</div>
          <p class="card-sub">${escapeHtml(p.kid_name || "Unknown child")}</p>
          <div class="card-meta">
            <span>${escapeHtml(p.id.slice(0, 8))}</span>
            <span>${isDraft ? "Edit Draft" : "Open"}</span>
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

  // Wire click events (use dynamic import to avoid circular dependency)
  results.querySelectorAll("[data-idea-index]").forEach((el) => {
    el.addEventListener("click", async () => {
      const idx = Number(el.getAttribute("data-idea-index"));
      const { writeStoryFromIdeaIndex } = await import('../api/story.js');
      await writeStoryFromIdeaIndex(idx);
    });
  });

  $("regen-ideas")?.addEventListener("click", async () => {
    const { fetchIdeas } = await import('../api/story.js');
    await fetchIdeas();
  });
}

// Render the story editor (edit phase before finalization)
export function renderStoryEditor(project) {
  const results = $("results");
  const pages = project.story_json || [];
  
  // Store current state for editing
  let editedPages = JSON.parse(JSON.stringify(pages)); // Deep clone
  
  // Header with actions
  const headerHtml = `
    <div class="editor-header">
      <div class="editor-info">
        <p>Review and edit your story below. Click on any page text to edit it. When you're happy with the story, click "Finalize & Continue" to proceed to illustration generation.</p>
      </div>
      <div class="editor-actions">
        <button id="save-draft-btn" class="btn btn-secondary">Save Draft</button>
        <button id="add-page-btn" class="btn btn-secondary">+ Add Page</button>
        <button id="finalize-btn" class="btn btn-primary">Finalize & Continue →</button>
      </div>
    </div>
    <div id="editor-status" class="status-line"></div>
  `;
  
  // Build page editor cards (horizontal layout: textarea left, actions right)
  const pageCards = editedPages.map((p, idx) => `
    <div class="editor-card" data-page-index="${idx}">
      <div class="editor-card-main">
        <span class="editor-page-num">Page ${p.page}</span>
        <textarea class="editor-textarea" data-page-index="${idx}" rows="3" placeholder="Enter page text...">${escapeHtml(p.text)}</textarea>
      </div>
      <div class="editor-card-actions">
        ${idx > 0 ? `<button class="icon-btn move-up" title="Move up">↑</button>` : `<button class="icon-btn" disabled style="opacity:0.3">↑</button>`}
        ${idx < editedPages.length - 1 ? `<button class="icon-btn move-down" title="Move down">↓</button>` : `<button class="icon-btn" disabled style="opacity:0.3">↓</button>`}
        <button class="icon-btn delete-page" title="Delete page">🗑</button>
      </div>
    </div>
  `).join("");
  
  results.innerHTML = `
    ${headerHtml}
    <div class="editor-grid">
      ${pageCards}
    </div>
  `;
  
  // Helper to get current edited pages from DOM
  function collectEditedPages() {
    const textareas = results.querySelectorAll(".editor-textarea");
    const collected = [];
    textareas.forEach((ta, idx) => {
      collected.push({
        page: idx + 1,
        text: ta.value.trim()
      });
    });
    return collected;
  }
  
  // Helper to re-render editor with current state
  function refreshEditor() {
    editedPages = collectEditedPages();
    // Re-number pages
    editedPages = editedPages.map((p, idx) => ({ ...p, page: idx + 1 }));
    
    // Update project in state
    if (state.cachedProject) {
      state.cachedProject.story_json = editedPages;
    }
    
    renderStoryEditor({ ...project, story_json: editedPages });
  }
  
  // Wire up text editing (auto-save on blur)
  results.querySelectorAll(".editor-textarea").forEach(ta => {
    ta.addEventListener("input", () => {
      // Mark as dirty
      const status = $("editor-status");
      if (status) status.textContent = "Unsaved changes...";
    });
  });
  
  // Move up
  results.querySelectorAll(".move-up").forEach(btn => {
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      const card = btn.closest(".editor-card");
      const idx = Number(card.dataset.pageIndex);
      if (idx > 0) {
        editedPages = collectEditedPages();
        [editedPages[idx - 1], editedPages[idx]] = [editedPages[idx], editedPages[idx - 1]];
        editedPages = editedPages.map((p, i) => ({ ...p, page: i + 1 }));
        if (state.cachedProject) state.cachedProject.story_json = editedPages;
        renderStoryEditor({ ...project, story_json: editedPages });
      }
    });
  });
  
  // Move down
  results.querySelectorAll(".move-down").forEach(btn => {
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      const card = btn.closest(".editor-card");
      const idx = Number(card.dataset.pageIndex);
      editedPages = collectEditedPages();
      if (idx < editedPages.length - 1) {
        [editedPages[idx], editedPages[idx + 1]] = [editedPages[idx + 1], editedPages[idx]];
        editedPages = editedPages.map((p, i) => ({ ...p, page: i + 1 }));
        if (state.cachedProject) state.cachedProject.story_json = editedPages;
        renderStoryEditor({ ...project, story_json: editedPages });
      }
    });
  });
  
  // Delete page
  results.querySelectorAll(".delete-page").forEach(btn => {
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      const card = btn.closest(".editor-card");
      const idx = Number(card.dataset.pageIndex);
      editedPages = collectEditedPages();
      if (editedPages.length > 1) {
        editedPages.splice(idx, 1);
        editedPages = editedPages.map((p, i) => ({ ...p, page: i + 1 }));
        if (state.cachedProject) state.cachedProject.story_json = editedPages;
        renderStoryEditor({ ...project, story_json: editedPages });
        showToast("Page deleted", "", "success");
      } else {
        showToast("Cannot delete", "Story must have at least one page", "warn");
      }
    });
  });
  
  // Add page
  $("add-page-btn")?.addEventListener("click", () => {
    editedPages = collectEditedPages();
    editedPages.push({
      page: editedPages.length + 1,
      text: ""
    });
    if (state.cachedProject) state.cachedProject.story_json = editedPages;
    renderStoryEditor({ ...project, story_json: editedPages });
    showToast("Page added", "", "success");
    
    // Focus the new textarea
    setTimeout(() => {
      const textareas = results.querySelectorAll(".editor-textarea");
      textareas[textareas.length - 1]?.focus();
    }, 100);
  });
  
  // Save draft (use dynamic import to avoid circular dependency)
  $("save-draft-btn")?.addEventListener("click", async () => {
    const btn = $("save-draft-btn");
    btn.disabled = true;
    btn.textContent = "Saving...";
    
    const currentPages = collectEditedPages();
    const { saveStoryEdits } = await import('../api/story.js');
    const result = await saveStoryEdits(currentPages);
    
    btn.disabled = false;
    btn.textContent = "Save Draft";
    
    if (result.success) {
      const status = $("editor-status");
      if (status) status.textContent = "Draft saved!";
      showToast("Draft saved", "", "success");
    }
  });
  
  // Finalize and continue (use dynamic import to avoid circular dependency)
  $("finalize-btn")?.addEventListener("click", async () => {
    const currentPages = collectEditedPages();
    
    // Validate
    const emptyPages = currentPages.filter(p => !p.text.trim());
    if (emptyPages.length > 0) {
      showToast("Empty pages", "Please fill in all pages before finalizing", "warn");
      return;
    }
    
    const { finalizeStory } = await import('../api/story.js');
    await finalizeStory(currentPages);
  });
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
    const lastUpdated = i?.last_updated || "";
    const isGenerating = state.generatingPages.has(Number(p.page));
    const isQueued = state.queuedPages?.has(Number(p.page));

    // Add cache-busting param to prevent browser from showing stale images
    const cacheBuster = lastUpdated || rev || Date.now();
    const imageUrl = url ? `${url}?v=${cacheBuster}` : "";

    let badge, thumbContent, cardClass;

    if (isGenerating) {
      badge = `Generating...`;
      cardClass = "generating";
      thumbContent = `
        <div class="generating-overlay">
          <div class="spinner"></div>
          <div>Generating...</div>
        </div>
        ${imageUrl ? `<img src="${imageUrl}" alt="Page ${p.page}" style="opacity: 0.5;">` : ""}
      `;
    } else if (isQueued) {
      badge = `Queued`;
      cardClass = "queued";
      thumbContent = `
        <div class="queued-overlay">
          <div class="queue-icon">⏳</div>
          <div>Queued</div>
        </div>
        ${imageUrl ? `<img src="${imageUrl}" alt="Page ${p.page}" style="opacity: 0.5;">` : ""}
      `;
    } else {
      badge = url ? `Ready • r${rev}` : "Missing";
      cardClass = "";
      thumbContent = imageUrl
        ? `<img src="${imageUrl}" alt="Page ${p.page}">`
        : `<div class="thumb-placeholder">Click to generate</div>`;
    }

    return `
      <div class="story-card ${cardClass}" data-page="${p.page}" data-image="${imageUrl}">
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