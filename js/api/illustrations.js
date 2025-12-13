// js/api/illustrations.js
// Illustration generation API calls

import { state } from '../core/state.js';
import { $, showToast } from '../core/utils.js';
import { reRenderCurrentView } from '../ui/render.js';
import { openProjectById } from './projects.js';

// Generate a single illustration for a page
export async function generateSingleIllustration(pageNum, pageText, isRegeneration = false) {
  const projectId = localStorage.getItem("projectId");
  if (!projectId) {
    showToast("No project loaded", "Open or create a project first.", "error");
    return;
  }

  const status = $("illustration-status");
  const actionLabel = isRegeneration ? "Regenerating" : "Generating";

  // Mark page as generating
  state.generatingPages.add(pageNum);
  reRenderCurrentView();

  showToast(`${actionLabel} illustration`, `Page ${pageNum}`, "success");

  if (status) {
    status.textContent = `${actionLabel} page ${pageNum}...`;
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

    // Remove from generating set
    state.generatingPages.delete(pageNum);

    if (!res.ok || data?.error) {
      console.error("Illustration error:", data);
      showToast("Illustration failed", `Page ${pageNum}`, "error");
      if (status) status.textContent = `Failed on page ${pageNum}.`;
      reRenderCurrentView();
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

    if (status) status.textContent = `Done: page ${pageNum}`;
    reRenderCurrentView();

  } catch (err) {
    console.error("Illustration request failed:", err);
    state.generatingPages.delete(pageNum);
    showToast("Network error", `Could not generate page ${pageNum}`, "error");
    if (status) status.textContent = `Failed on page ${pageNum}.`;
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

  showToast("Generating illustrations", "Missing pages only", "success");

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

  for (const p of pages) {
    if (!existing.has(Number(p.page))) {
      await generateSingleIllustration(p.page, p.text);
    }
  }

  showToast("Illustrations complete", "All missing pages generated", "success");
  await openProjectById(projectId);
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

  await generateSingleIllustration(pageNum, pageTextWithNotes, true);

  // Refresh modal image
  const pid = localStorage.getItem("projectId");
  if (pid) {
    const res = await fetch("/api/load-project", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ projectId: pid }),
    });
    const data = await res.json();
    const updated = data?.project?.illustrations?.find((i) => Number(i.page) === pageNum);
    if (updated?.image_url) {
      $("modal-image").src = updated.image_url;
    }
  }
}