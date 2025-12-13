// script.js (UI overhaul + storyboard grid + custom upload modal)

let CURRENT_VIEW = "grid";
let CURRENT_FILTER = "all";
let CURRENT_PHASE = "dashboard";

function setPhase(phase) {
  CURRENT_PHASE = phase;
  document.body.dataset.phase = phase;
}

// -----------------------------------------------------
// Small utilities
// -----------------------------------------------------
function $(id) { return document.getElementById(id); }

function setWorkspaceTitle(title, subtitle) {
  const t = $("workspace-title");
  const s = $("workspace-subtitle");
  if (t) t.textContent = title || "Workspace";
  if (s) s.textContent = subtitle || "";
}

function showLoader(message) {
  const results = $("results");
  results.innerHTML = `
    <div class="loader">
      <div class="spinner"></div>
      <div>${message || "Loading..."}</div>
    </div>
  `;
}

// -----------------------------------------------------
// Account menu placeholder
// -----------------------------------------------------
function initAccountMenu() {
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

  // placeholder actions
  $("login-btn")?.addEventListener("click", () => alert("Login UI later"));
  $("logout-btn")?.addEventListener("click", () => alert("Logout later"));
  $("orders-btn")?.addEventListener("click", () => alert("Orders UI later"));
}

function showToast(title, message = "", type = "success") {
  const box = document.createElement("div");
  box.className = `toast ${type}`;
  box.innerHTML = `
    <div class="toast-title">${title}</div>
    ${message ? `<div class="toast-msg">${message}</div>` : ""}
  `;
  $("toast-container")?.appendChild(box);
  setTimeout(() => box.remove(), 3200);
}

// -----------------------------------------------------
// Dashboard
// -----------------------------------------------------
function projectStatusText(p) {
  if (!p.story_ideas || !p.story_ideas.length) return "No story ideas yet";
  if (p.story_ideas && !p.selected_idea) return "Ideas ready — pick one";
  if (p.selected_idea && (!p.story_json || !p.story_json.length)) return "Idea selected — story not written yet";
  if (p.story_json?.length && (!p.illustrations || !p.illustrations.length)) return "Story ready — no illustrations yet";
  if (p.story_json?.length && p.illustrations?.length) return `Story + ${p.illustrations.length} illustration(s)`;
  return "In progress";
}

async function loadDashboard() {
  setPhase("dashboard");
  setWorkspaceTitle("My Books", "Pick a project to continue, or start a new one.");
  showLoader("Loading your books...");

  try {
    const res = await fetch("/api/projects-list");
    const data = await res.json();
    renderDashboard(data.projects || []);
  } catch (e) {
    console.error(e);
    $("results").innerHTML = `<div class="loader">Couldn't load projects.</div>`;
  }
}

function renderDashboard(projects) {
  const results = $("results");

  if (!projects.length) {
    results.innerHTML = `
      <div class="loader">
        <div>No projects yet.</div>
      </div>
    `;
    return;
  }

  const cards = projects.map(p => {
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

  results.innerHTML = `<div class="grid">${cards}</div>`;

  results.querySelectorAll("[data-open-project]").forEach(el => {
    el.addEventListener("click", async () => {
      const id = el.getAttribute("data-open-project");
      await openProjectById(id);
    });
  });
}

// -----------------------------------------------------
// Project open + story / ideas
// -----------------------------------------------------
async function openProjectById(projectId) {
  localStorage.setItem("projectId", projectId);
  showLoader("Loading project...");

  const res = await fetch("/api/load-project", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ projectId })
  });
  const data = await res.json();

  const project = data?.project;
  if (!project) {
    $("results").innerHTML = `<div class="loader">Couldn't load that project.</div>`;
    return;
  }

  // populate inputs
  $("kid-name").value = project.kid_name || "";
  $("kid-interests").value = project.kid_interests || "";

  // state routing
  if (!project.story_ideas?.length) {
    setPhase("ideas");
    setWorkspaceTitle("Project", "Generate story ideas to begin.");
    $("results").innerHTML = `<div class="loader">This book has no ideas yet. Use the form to generate them.</div>`;
    return;
  }

  if (project.story_ideas?.length && !project.selected_idea) {
    setPhase("select-idea");
    setWorkspaceTitle("Select a Story Idea", "Pick one to write the full story.");
    renderIdeas(project.story_ideas);
    return;
  }

  if (project.story_json?.length) {
    setPhase("storyboard");
    const title =
      (project.selected_idea && project.selected_idea.title) ||
      (project.kid_name ? `Book for ${project.kid_name}` : "Your Book");
    setWorkspaceTitle(title, "Storyboard view");
    renderStoryboard(project);
    return;
  }

  setPhase("select-idea");
  renderIdeas(project.story_ideas);
}

async function fetchIdeas() {
  const name = $("kid-name").value.trim();
  const interests = $("kid-interests").value.trim();
  if (!name) return;

  showLoader("Generating story ideas...");

  const existingProjectId = localStorage.getItem("projectId");
  const res = await fetch("/api/story-ideas", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name, interests, projectId: existingProjectId || null })
  });

  const data = await res.json();
  if (data.error) {
    $("results").innerHTML = `<div class="loader">Failed to generate ideas.</div>`;
    return;
  }

  localStorage.setItem("projectId", data.projectId);
  setPhase("select-idea");
  setWorkspaceTitle("Select a Story Idea", "Pick one to write the full story.");
  renderIdeas(data.ideas);
}

function renderIdeas(ideas) {
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

  results.querySelectorAll("[data-idea-index]").forEach(el => {
    el.addEventListener("click", async () => {
      const idx = Number(el.getAttribute("data-idea-index"));
      await writeStoryFromIdeaIndex(idx);
    });
  });

  $("regen-ideas")?.addEventListener("click", fetchIdeas);
}

async function writeStoryFromIdeaIndex(selectedIdeaIndex) {
  const projectId = localStorage.getItem("projectId");
  if (!projectId) return;

  showLoader("Writing the story...");

  const res = await fetch("/api/write-story", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ projectId, selectedIdeaIndex })
  });

  const data = await res.json();
  if (data.error) {
    console.error(data);
    $("results").innerHTML = `<div class="loader">Failed to write story.</div>`;
    return;
  }

  // Normalize into a "project-like" object for storyboard
  const project = {
    id: data.projectId,
    kid_name: $("kid-name").value.trim(),
    kid_interests: $("kid-interests").value.trim(),
    selected_idea: data.selected_idea || null,
    story_json: data.story_json || [],
    illustrations: [],
    context_registry: data.context_registry || {}
  };

  setWorkspaceTitle(project.selected_idea?.title || "Your Book", "Storyboard view");
  setPhase("storyboard");
  renderStoryboard(project);
}

// -----------------------------------------------------
// Storyboard rendering
// -----------------------------------------------------
function renderStoryboard(project) {
  setPhase("storyboard");
  renderCharacterPanel(project);
  const results = $("results");
  localStorage.setItem("lastStoryPages", JSON.stringify(project.story_json || []));

  const pages = project.story_json || [];
  const illus = Array.isArray(project.illustrations) ? project.illustrations : [];
  const illusMap = new Map(illus.map(i => [Number(i.page), i]));

  // -------------------------------
  // Header actions
  // -------------------------------
  const topActions = `
    <div style="display:flex; gap:10px; flex-wrap:wrap; margin-bottom:14px;">
      <button id="open-upload-modal" class="btn btn-secondary">Upload Photo</button>
      <button id="generate-character-btn" class="btn btn-primary">Generate Character Model</button>
      <button id="generate-illustrations-btn" class="btn btn-primary">Generate Illustrations</button>
    </div>
    <div id="character-status" class="status-line"></div>
    <div id="illustration-status" class="status-line"></div>
  `;

  // -------------------------------
  // Filter pages FIRST
  // -------------------------------
  const filtered = pages.filter(p => {
    const i = illusMap.get(Number(p.page));
    const has = !!i?.image_url;
    if (CURRENT_FILTER === "missing") return !has;
    if (CURRENT_FILTER === "ready") return has;
    if (CURRENT_FILTER === "errors") return false;
    return true;
  });

  // -------------------------------
  // Build cards SECOND
  // -------------------------------
  const cards = filtered.map(p => {
    const i = illusMap.get(Number(p.page));
    const url = i?.image_url || "";
    const rev = typeof i?.revisions === "number" ? i.revisions : 0;
    const badge = url ? `Ready • r${rev}` : "Missing";

    return `
      <div class="story-card" data-page="${p.page}" data-image="${url}">
        <div class="thumb">
          <span class="badge">Page ${p.page} • ${badge}</span>
          ${url
            ? `<img src="${url}" alt="Page ${p.page}">`
            : `<div class="thumb-placeholder">Click to generate</div>`
          }
        </div>
        <div class="card-body">
          <div class="card-title">Page ${p.page}</div>
          <p class="card-sub">${escapeHtml(p.text)}</p>
          <div class="card-meta">
            <span>${url ? "Preview / Regenerate" : "Generate"}</span>
            <span>${url ? "✓" : "+"}</span>
          </div>
        </div>
      </div>
    `;
  }).join("");

  // -------------------------------
  // Decide layout LAST
  // -------------------------------
  const containerClass = CURRENT_VIEW === "list" ? "list" : "grid";

  results.innerHTML = `
    ${topActions}
    <div class="${containerClass}">
      ${cards}
    </div>
  `;

  // -------------------------------
  // Wire events
  // -------------------------------
  results.querySelectorAll("[data-page]").forEach(el => {
    el.addEventListener("click", async () => {
      const pageNum = Number(el.getAttribute("data-page"));
      const url = el.getAttribute("data-image");

      if (url) {
        openImageModal(pageNum, url);
      } else {
        const pageObj = pages.find(x => Number(x.page) === pageNum);
        if (!pageObj) return;

        await generateSingleIllustration(pageNum, pageObj.text);
        const pid = localStorage.getItem("projectId");
        if (pid) await openProjectById(pid);
      }
    });
  });

  $("open-upload-modal")?.addEventListener("click", openUploadModal);
  $("generate-character-btn")?.addEventListener("click", generateCharacterModel);
  $("generate-illustrations-btn")?.addEventListener("click", generateIllustrations);

  initUploadModal();
}

function renderCharacterPanel(project) {
  const panel = $("character-panel-content");
  if (!panel) return;

  panel.innerHTML = `
    <div style="display:flex; flex-direction:column; gap:10px;">
      <div style="font-weight:700;">Character</div>
      <div style="color: rgba(255,255,255,0.62); font-size:13px;">
        Upload a photo and generate a character model.
      </div>
      <button class="btn btn-secondary" id="open-upload-modal-side">Upload Photo</button>
      <button class="btn btn-primary" id="generate-character-btn-side">Generate Character Model</button>
    </div>
  `;

  $("open-upload-modal-side")?.addEventListener("click", openUploadModal);
  $("generate-character-btn-side")?.addEventListener("click", generateCharacterModel);
}

// -----------------------------------------------------
// Modal: illustration preview + regenerate
// -----------------------------------------------------
function openImageModal(pageNum, imageUrl) {
  const modal = $("image-modal");
  const img = $("modal-image");
  const notes = $("revision-notes");
  const regen = $("regen-btn");
  const subtitle = $("modal-subtitle");

  if (!modal || !img || !notes || !regen) return;

  img.src = imageUrl;
  notes.value = "";
  regen.dataset.page = String(pageNum);
  subtitle.textContent = `Page ${pageNum}`;

  modal.classList.remove("hidden");
  modal.setAttribute("aria-hidden", "false");
}

function closeImageModal() {
  const modal = $("image-modal");
  if (!modal) return;
  modal.classList.add("hidden");
  modal.setAttribute("aria-hidden", "true");
}

async function handleRegenerateIllustration() {
  const projectId = localStorage.getItem("projectId");
  const regenBtn = $("regen-btn");
  const notes = $("revision-notes");
  if (!projectId || !regenBtn) return;

  const pageNum = Number(regenBtn.dataset.page || "0");
  if (!pageNum) return;

  const pages = JSON.parse(localStorage.getItem("lastStoryPages") || "[]");
  const pageData = pages.find(p => Number(p.page) === pageNum);
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
      body: JSON.stringify({ projectId: pid })
    });
    const data = await res.json();
    const updated = data?.project?.illustrations?.find(i => Number(i.page) === pageNum);
    if (updated?.image_url) $("modal-image").src = updated.image_url;
  }
}

function initImageModalEvents() {
  $("close-modal")?.addEventListener("click", closeImageModal);

  $("image-modal")?.addEventListener("click", (e) => {
    if (e.target?.classList?.contains("modal-backdrop")) closeImageModal();
  });

  $("regen-btn")?.addEventListener("click", handleRegenerateIllustration);

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      closeImageModal();
      closeUploadModal();
    }
  });
}

// -----------------------------------------------------
// Custom Upload Modal (pretty UI + hidden input)
// -----------------------------------------------------
function openUploadModal() {
  const modal = $("upload-modal");
  if (!modal) return;

  $("upload-status").textContent = "";
  $("upload-preview").classList.add("hidden");
  $("upload-preview").innerHTML = "";

  modal.classList.remove("hidden");
  modal.setAttribute("aria-hidden", "false");
}

function closeUploadModal() {
  const modal = $("upload-modal");
  if (!modal) return;
  modal.classList.add("hidden");
  modal.setAttribute("aria-hidden", "true");
}

function initUploadModal() {
  const modal = $("upload-modal");
  const closeBtn = $("close-upload-modal");
  const dropzone = $("dropzone");
  const fileInput = $("child-photo");
  const chooseBtn = $("choose-file-btn");

  if (!modal || !dropzone || !fileInput) return;

  // only bind once
  if (modal.dataset.bound === "true") return;
  modal.dataset.bound = "true";

  closeBtn?.addEventListener("click", closeUploadModal);

  modal.addEventListener("click", (e) => {
    if (e.target?.classList?.contains("modal-backdrop")) closeUploadModal();
  });

  chooseBtn?.addEventListener("click", () => fileInput.click());
  dropzone.addEventListener("click", () => fileInput.click());

  // drag states
  ["dragenter", "dragover"].forEach(evt => {
    dropzone.addEventListener(evt, (e) => {
      e.preventDefault();
      e.stopPropagation();
      dropzone.classList.add("dragover");
    });
  });

  ["dragleave", "drop"].forEach(evt => {
    dropzone.addEventListener(evt, (e) => {
      e.preventDefault();
      e.stopPropagation();
      dropzone.classList.remove("dragover");
    });
  });

  dropzone.addEventListener("drop", (e) => {
    const files = e.dataTransfer?.files;
    if (files && files.length) {
      fileInput.files = files;
      showUploadPreview(files[0]);
    }
  });

  fileInput.addEventListener("change", async () => {
    const f = fileInput.files?.[0];
    if (!f) return;
    showUploadPreview(f);
    await uploadPhoto();
  });

  $("upload-btn")?.addEventListener("click", uploadPhoto);
}

function showUploadPreview(file) {
  const box = $("upload-preview");
  if (!box) return;

  const url = URL.createObjectURL(file);
  box.innerHTML = `<img src="${url}" alt="preview">`;
  box.classList.remove("hidden");
}

// -----------------------------------------------------
// API: Upload + Character model + Illustrations
// -----------------------------------------------------
async function uploadPhoto() {
  const projectId = localStorage.getItem("projectId");
  const fileInput = $("child-photo");
  const status = $("upload-status");

  if (!projectId) {
    status.textContent = "Create or open a project first.";
    return;
  }
  if (!fileInput?.files?.length) {
    status.textContent = "Choose a photo first.";
    return;
  }

  status.textContent = "Uploading...";

  const formData = new FormData();
  formData.append("photo", fileInput.files[0]);
  formData.append("projectId", projectId);

  try {
    const res = await fetch("/api/upload-child-photo", { method: "POST", body: formData });
    const data = await res.json();

    if (data.photoUrl) {
      status.textContent = "Uploaded! You can now generate the character model.";
    } else {
      status.textContent = "Upload failed.";
    }
  } catch (e) {
    console.error(e);
    status.textContent = "Upload failed.";
  }
}

async function generateCharacterModel() {
  const projectId = localStorage.getItem("projectId");
  const status = $("character-status");

  if (!projectId) {
    showToast("No project loaded", "Open a project first", "error");
    return;
  }

  const kidName = $("kid-name").value.trim();
  status.textContent = "Generating character model…";

  showToast("Generating character", "This may take ~20 seconds", "success");

  try {
    const res = await fetch("/api/generate-character-model", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ projectId, kidName })
    });

    const data = await res.json();

    if (!data.characterModelUrl) {
      throw new Error("No model URL returned");
    }

    status.textContent = "Character model ready!";
    showToast("Character model generated", "Applied to all scenes", "success");

    await openProjectById(projectId);
    closeUploadModal();

  } catch (err) {
    console.error(err);
    status.textContent = "Failed to generate character model.";
    showToast("Character generation failed", "See console", "error");
  }
}

async function generateSingleIllustration(pageNum, pageText, isRegeneration = false) {
  const projectId = localStorage.getItem("projectId");
  if (!projectId) {
    showToast("No project loaded", "Open or create a project first.", "error");
    return;
  }

  const status = $("illustration-status");
  const actionLabel = isRegeneration ? "Regenerating" : "Generating";

  showToast(
    `${actionLabel} illustration`,
    `Page ${pageNum}`,
    "success"
  );

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
        isRegeneration
      })
    });

    const data = await res.json();

    if (!res.ok || data?.error) {
      console.error("Illustration error:", data);

      showToast(
        "Illustration failed",
        `Page ${pageNum}`,
        "error"
      );

      if (status) {
        status.textContent = `Failed on page ${pageNum}.`;
      }

      return;
    }

    showToast(
      isRegeneration ? "Illustration regenerated" : "Illustration generated",
      `Page ${pageNum}`,
      "success"
    );

    if (status) {
      status.textContent = `Done: page ${pageNum}`;
    }

  } catch (err) {
    console.error("Illustration request failed:", err);

    showToast(
      "Network error",
      `Could not generate page ${pageNum}`,
      "error"
    );

    if (status) {
      status.textContent = `Failed on page ${pageNum}.`;
    }
  }
}

async function generateIllustrations() {
  const projectId = localStorage.getItem("projectId");
  if (!projectId) {
    showToast("No project loaded", "Open a project first", "error");
    return;
  }

  showToast("Generating illustrations", "Missing pages only", "success");

  const res = await fetch("/api/load-project", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ projectId })
  });

  const data = await res.json();
  const project = data?.project;
  if (!project?.story_json) return;

  const pages = project.story_json;
  const existing = new Set(
    (project.illustrations || []).map(i => Number(i.page))
  );

  for (const p of pages) {
    if (!existing.has(Number(p.page))) {
      await generateSingleIllustration(p.page, p.text);
    }
  }

  showToast("Illustrations complete", "All missing pages generated", "success");
  await openProjectById(projectId);
}

// -----------------------------------------------------
// View controls
// -----------------------------------------------------
function initViewControls() {
  $("view-grid")?.addEventListener("click", () => {
    CURRENT_VIEW = "grid";
    $("view-grid").classList.add("active");
    $("view-list").classList.remove("active");
    const pid = localStorage.getItem("projectId");
    if (pid) openProjectById(pid);
  });

  $("view-list")?.addEventListener("click", () => {
    CURRENT_VIEW = "list";
    $("view-list").classList.add("active");
    $("view-grid").classList.remove("active");
    const pid = localStorage.getItem("projectId");
    if (pid) openProjectById(pid);
  });

  $("page-filter")?.addEventListener("change", (e) => {
    CURRENT_FILTER = e.target.value;
    const pid = localStorage.getItem("projectId");
    if (pid) openProjectById(pid);
  });
}

// -----------------------------------------------------
// Helpers
// -----------------------------------------------------
function escapeHtml(str) {
  if (str == null) return "";
  return String(str)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

// -----------------------------------------------------
// Boot
// -----------------------------------------------------
document.addEventListener("DOMContentLoaded", () => {
  initAccountMenu();
  initImageModalEvents();
  initViewControls();

  $("kid-form")?.addEventListener("submit", (e) => {
    e.preventDefault();
    fetchIdeas();
  });

  $("reset-session")?.addEventListener("click", () => {
    localStorage.removeItem("projectId");
    localStorage.removeItem("lastStoryPages");
    $("kid-name").value = "";
    $("kid-interests").value = "";
    setWorkspaceTitle("Workspace", "Start a new book or open an existing one.");
    $("results").innerHTML = `<div class="loader">Session cleared. Generate ideas to begin.</div>`;
  });

  $("go-dashboard")?.addEventListener("click", loadDashboard);

  // Start on dashboard by default
  loadDashboard();
});