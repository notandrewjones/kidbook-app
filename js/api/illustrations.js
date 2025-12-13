// js/api/illustrations.js
// Illustration generation API calls with queue system

import { state } from '../core/state.js';
import { $, showToast } from '../core/utils.js';
import { reRenderCurrentView } from '../ui/render.js';
import { openProjectById } from './projects.js';

// Queue system
const MAX_CONCURRENT = 2;
const generationQueue = [];
let activeGenerations = 0;

// Add to state for UI tracking
state.queuedPages = new Set();

// Process the next item in queue if we have capacity
function processQueue() {
  while (activeGenerations < MAX_CONCURRENT && generationQueue.length > 0) {
    const next = generationQueue.shift();
    state.queuedPages.delete(next.pageNum);
    executeGeneration(next.pageNum, next.pageText, next.isRegeneration);
  }
  reRenderCurrentView();
}

// Actually run the generation (internal)
async function executeGeneration(pageNum, pageText, isRegeneration) {
  const projectId = localStorage.getItem("projectId");
  if (!projectId) return;

  const status = $("illustration-status");
  const actionLabel = isRegeneration ? "Regenerating" : "Generating";

  // Mark as actively generating
  activeGenerations++;
  state.generatingPages.add(pageNum);
  reRenderCurrentView();

  if (status) {
    const queuedCount = state.queuedPages.size;
    const activeCount = state.generatingPages.size;
    status.textContent = `${actionLabel} page ${pageNum}...` + 
      (queuedCount > 0 ? ` (${queuedCount} queued)` : '');
  }

  try {
    const res = await fetch("/api/generate-scene", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        projectId,
        page: pageNum,
        pageText,
        isRegeneration,
      }),
    });

    const data = await res.json();

    // Clean up
    state.generatingPages.delete(pageNum);
    activeGenerations--;

    if (!res.ok || data?.error) {
      console.error("Illustration error:", data);
      showToast("Illustration failed", `Page ${pageNum}`, "error");
      if (status) status.textContent = `Failed on page ${pageNum}.`;
      processQueue();
      return;
    }

    // Update cached project with new illustration
    if (state.cachedProject) {
      const existingIllus = state.cachedProject.illustrations || [];
      const filteredIllus = existingIllus.filter((i) => Number(i.page) !== pageNum);
      filteredIllus.push({
        page: pageNum,
        image_url: data.image_url,
        revisions: data.revisions || 0,
      });
      state.cachedProject.illustrations = filteredIllus;
    }

    showToast(
      isRegeneration ? "Illustration regenerated" : "Illustration generated",
      `Page ${pageNum}`,
      "success"
    );

    if (status) {
      const queuedCount = state.queuedPages.size;
      if (queuedCount > 0 || activeGenerations > 0) {
        status.textContent = `Done: page ${pageNum}. ${activeGenerations} generating, ${queuedCount} queued.`;
      } else {
        status.textContent = `Done: page ${pageNum}`;
      }
    }

    processQueue();

  } catch (err) {
    console.error("Illustration request failed:", err);
    state.generatingPages.delete(pageNum);
    activeGenerations--;
    showToast("Network error", `Could not generate page ${pageNum}`, "error");
    if (status) status.textContent = `Failed on page ${pageNum}.`;
    processQueue();
  }
}

// Public API: Generate a single illustration (queued)
export function generateSingleIllustration(pageNum, pageText, isRegeneration = false) {
  const projectId = localStorage.getItem("projectId");
  if (!projectId) {
    showToast("No project loaded", "Open or create a project first.", "error");
    return;
  }

  // Check if already generating or queued
  if (state.generatingPages.has(pageNum)) {
    showToast("Already generating", `Page ${pageNum} is being generated`, "warn");
    return;
  }
  if (state.queuedPages.has(pageNum)) {
    showToast("Already queued", `Page ${pageNum} is in the queue`, "warn");
    return;
  }

  // If we have capacity, start immediately
  if (activeGenerations < MAX_CONCURRENT) {
    showToast(
      isRegeneration ? "Regenerating illustration" : "Generating illustration",
      `Page ${pageNum}`,
      "success"
    );
    executeGeneration(pageNum, pageText, isRegeneration);
  } else {
    // Add to queue
    state.queuedPages.add(pageNum);
    generationQueue.push({ pageNum, pageText, isRegeneration });
    showToast("Queued", `Page ${pageNum} will generate next`, "success");
    reRenderCurrentView();
  }
}

// Generate all missing illustrations
export async function generateIllustrations() {
  const projectId = localStorage.getItem("projectId");
  if (!projectId) {
    showToast("No project loaded", "Open a project first", "error");
    return;
  }

  // Fetch fresh project data
  const res = await fetch("/api/load-project", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ projectId }),
  });

  const data = await res.json();
  const project = data?.project;
  if (!project?.story_json) return;

  // Update cache
  state.cachedProject = project;

  const pages = project.story_json;
  const existing = new Set((project.illustrations || []).map((i) => Number(i.page)));

  // Count how many we're adding
  const missingPages = pages.filter(p => !existing.has(Number(p.page)));
  
  if (missingPages.length === 0) {
    showToast("All done", "All pages already have illustrations", "success");
    return;
  }

  showToast("Generating illustrations", `${missingPages.length} pages to generate`, "success");

  // Queue all missing pages
  for (const p of missingPages) {
    if (!state.generatingPages.has(Number(p.page)) && !state.queuedPages.has(Number(p.page))) {
      if (activeGenerations < MAX_CONCURRENT) {
        executeGeneration(p.page, p.text, false);
      } else {
        state.queuedPages.add(Number(p.page));
        generationQueue.push({ pageNum: p.page, pageText: p.text, isRegeneration: false });
      }
    }
  }

  reRenderCurrentView();
}

// Handle regeneration from modal
export async function handleRegenerateIllustration() {
  const projectId = localStorage.getItem("projectId");
  const regenBtn = $("regen-btn");
  const notes = $("revision-notes");
  if (!projectId || !regenBtn) return;

  const pageNum = Number(regenBtn.dataset.page || "0");
  if (!pageNum) return;

  const pages = JSON.parse(localStorage.getItem("lastStoryPages") || "[]");
  const pageData = pages.find((p) => Number(p.page) === pageNum);
  if (!pageData) return;

  const revisionText = (notes?.value || "").trim();
  const pageTextWithNotes = revisionText
    ? `${pageData.text}\n\nArtist revision notes: ${revisionText}`
    : pageData.text;

  generateSingleIllustration(pageNum, pageTextWithNotes, true);

  // Close modal and let the queue system handle it
  // The UI will update via reRenderCurrentView
}

// Get queue status for UI
export function getQueueStatus() {
  return {
    active: activeGenerations,
    queued: state.queuedPages.size,
    total: activeGenerations + state.queuedPages.size,
  };
}