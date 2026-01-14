// script.js (UI overhaul + storyboard grid + custom upload modal)

let CURRENT_VIEW = "grid";
let CURRENT_FILTER = "all";
let CURRENT_PHASE = "dashboard";
let GENERATING_PAGES = new Set(); // Track pages currently being generated
let CACHED_PROJECT = null; // Cache the current project for view switching

// Flag to prevent pushing state when handling popstate
let HANDLING_POPSTATE = false;

function setPhase(phase) {
  CURRENT_PHASE = phase;
  document.body.dataset.phase = phase;
}

// -----------------------------------------------------
// History management
// -----------------------------------------------------
function pushHistoryState(phase, projectId = null) {
  if (HANDLING_POPSTATE) return; // Don't push when handling back/forward
  
  const state = { phase, projectId };
  const url = projectId ? `?project=${projectId}&phase=${phase}` : `?phase=${phase}`;
  
  // Only push if state is different from current
  const currentState = history.state;
  if (currentState?.phase === phase && currentState?.projectId === projectId) {
    return;
  }
  
  history.pushState(state, "", url);
}

function handlePopState(event) {
  HANDLING_POPSTATE = true;
  
  const state = event.state;
  
  if (!state) {
    // No state, go to dashboard
    loadDashboard();
  } else if (state.phase === "dashboard") {
    loadDashboard();
  } else if (state.phase === "storyboard" && state.projectId) {
    openProjectById(state.projectId);
  } else if (state.phase === "select-idea" && state.projectId) {
    openProjectById(state.projectId);
  } else if (state.phase === "ideas" && state.projectId) {
    openProjectById(state.projectId);
  } else {
    loadDashboard();
  }
  
  HANDLING_POPSTATE = false;
}

function initHistoryFromURL() {
  const params = new URLSearchParams(window.location.search);
  const phase = params.get("phase");
  const projectId = params.get("project");
  
  // Set initial state without pushing
  const initialState = { phase: phase || "dashboard", projectId };
  history.replaceState(initialState, "", window.location.href);
  
  if (projectId && (phase === "storyboard" || phase === "select-idea" || phase === "ideas")) {
    openProjectById(projectId);
  } else {
    loadDashboard();
  }
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
  CACHED_PROJECT = null; // Clear project cache when going to dashboard
  
  // Push history state
  pushHistoryState("dashboard");

  try {
    const res = await fetch("/api/projects-list");
    const data = await res.json();
    CACHED_DASHBOARD_PROJECTS = data.projects || [];
    renderDashboard(CACHED_DASHBOARD_PROJECTS);
  } catch (e) {
    console.error(e);
    CACHED_DASHBOARD_PROJECTS = null;
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

  // Use current view setting
  const containerClass = CURRENT_VIEW === "list" ? "list" : "grid";
  results.innerHTML = `<div class="${containerClass}">${cards}</div>`;

  results.querySelectorAll("[data-open-project]").forEach(el => {
    el.addEventListener("click", async () => {
      const id = el.getAttribute("data-open-project");
      await openProjectById(id);
    });
  });
}

// Cache for dashboard projects (for view switching)
let CACHED_DASHBOARD_PROJECTS = null;

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

  // Cache the project for view switching
  CACHED_PROJECT = project;

  // populate inputs
  $("kid-name").value = project.kid_name || "";
  $("kid-interests").value = project.kid_interests || "";

  // state routing
  if (!project.story_ideas?.length) {
    setPhase("ideas");
    pushHistoryState("ideas", projectId);
    setWorkspaceTitle("Project", "Generate story ideas to begin.");
    $("results").innerHTML = `<div class="loader">This book has no ideas yet. Use the form to generate them.</div>`;
    return;
  }

  if (project.story_ideas?.length && !project.selected_idea) {
    setPhase("select-idea");
    pushHistoryState("select-idea", projectId);
    setWorkspaceTitle("Select a Story Idea", "Pick one to write the full story.");
    renderIdeas(project.story_ideas);
    return;
  }

  if (project.story_json?.length) {
    setPhase("storyboard");
    pushHistoryState("storyboard", projectId);
    const title =
      (project.selected_idea && project.selected_idea.title) ||
      (project.kid_name ? `Book for ${project.kid_name}` : "Your Book");
    setWorkspaceTitle(title, "Storyboard view");
    renderStoryboard(project);
    return;
  }

  setPhase("select-idea");
  pushHistoryState("select-idea", projectId);
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

  CACHED_PROJECT = project;
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
    const isGenerating = GENERATING_PAGES.has(Number(p.page));
    
    let badge, thumbContent;
    
    if (isGenerating) {
      badge = `Generating...`;
      thumbContent = `
        <div class="generating-overlay">
          <div class="spinner"></div>
          <div>Generating...</div>
        </div>
        ${url ? `<img src="${url}" alt="Page ${p.page}" style="opacity: 0.5;">` : ''}
      `;
    } else {
      badge = url ? `Ready • r${rev}` : "Missing";
      thumbContent = url
        ? `<img src="${url}" alt="Page ${p.page}">`
        : `<div class="thumb-placeholder">Click to generate</div>`;
    }

    return `
      <div class="story-card ${isGenerating ? 'generating' : ''}" data-page="${p.page}" data-image="${url}">
        <div class="thumb">
          <span class="badge">${`Page ${p.page} • ${badge}`}</span>
          ${thumbContent}
        </div>
        <div class="card-body">
          <div class="card-title">Page ${p.page}</div>
          <p class="card-sub">${escapeHtml(p.text)}</p>
          <div class="card-meta">
            <span>${isGenerating ? 'Generating...' : (url ? "Preview / Regenerate" : "Generate")}</span>
            <span>${isGenerating ? '⏳' : (url ? "✓" : "+")}</span>
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
      
      // Don't allow interaction while generating
      if (GENERATING_PAGES.has(pageNum)) {
        showToast("Please wait", "This page is currently being generated", "warn");
        return;
      }
      
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

  $("generate-illustrations-btn")?.addEventListener("click", generateIllustrations);

  initUploadModal();
}

// -----------------------------------------------------
// Re-render current view without fetching (for view switching)
// -----------------------------------------------------
function reRenderCurrentView() {
  if (CURRENT_PHASE === "storyboard" && CACHED_PROJECT) {
    renderStoryboard(CACHED_PROJECT);
  } else if (CURRENT_PHASE === "dashboard" && CACHED_DASHBOARD_PROJECTS) {
    renderDashboard(CACHED_DASHBOARD_PROJECTS);
  }
}

// Alias for backward compatibility
function reRenderStoryboard() {
  reRenderCurrentView();
}

// -----------------------------------------------------
// Character & Props Panel (unified reference management)
// -----------------------------------------------------
function renderCharacterPanel(project) {
  const panel = $("character-panel-content");
  if (!panel) return;

  // Get registry data
  const registry = Array.isArray(project.props_registry) && project.props_registry.length
    ? project.props_registry[0]
    : { characters: {}, props: {}, environments: {} };

  const characters = Object.entries(registry.characters || {});
  const props = Object.entries(registry.props || {});
  const characterModels = project.character_models || [];

  // Build character model lookup
  const modelLookup = {};
  for (const cm of characterModels) {
    modelLookup[cm.character_key] = cm;
  }

  // Also check legacy character_model_url
  const legacyCharacterUrl = project.character_model_url || project.characterModelUrl;

  let html = `<div class="reference-panel">`;

  // =====================
  // CHARACTERS SECTION
  // =====================
  html += `
    <div class="reference-section">
      <div class="reference-section-header">
        <span class="reference-section-title">Characters</span>
        <span class="reference-count">${characters.length}</span>
      </div>
  `;

  if (characters.length === 0) {
    html += `
      <div class="reference-empty">
        No characters detected yet. Generate the story first.
      </div>
    `;
  } else {
    for (const [key, char] of characters) {
      const model = modelLookup[key];
      const hasModel = char.has_model || !!model?.model_url || (key === 'protagonist' && legacyCharacterUrl);
      const modelUrl = model?.model_url || (key === 'protagonist' ? legacyCharacterUrl : null);
      
      html += `
        <div class="reference-item" data-type="character" data-key="${escapeHtml(key)}">
          <div class="reference-item-header">
            ${hasModel && modelUrl ? `
              <img class="reference-thumb" src="${modelUrl}" alt="${escapeHtml(char.name)}">
            ` : `
              <div class="reference-thumb-placeholder">
                <span>${escapeHtml((char.name || key).charAt(0).toUpperCase())}</span>
              </div>
            `}
            <div class="reference-item-info">
              <div class="reference-item-name">${escapeHtml(char.name || key)}</div>
              <div class="reference-item-meta">${escapeHtml(char.role || 'character')} ${char.type ? `• ${char.type}` : ''}</div>
            </div>
          </div>
          <div class="reference-item-actions">
            <button class="btn btn-sm btn-secondary upload-character-btn" data-key="${escapeHtml(key)}" data-name="${escapeHtml(char.name || key)}" data-role="${escapeHtml(char.role || 'other')}">
              <span class="btn-icon">📷</span> Upload
            </button>
            <button class="btn btn-sm btn-primary generate-character-btn" data-key="${escapeHtml(key)}" data-name="${escapeHtml(char.name || key)}" data-role="${escapeHtml(char.role || 'other')}" ${!hasModel ? '' : 'title="Regenerate model"'}>
              <span class="btn-icon">✨</span> ${hasModel ? 'Regenerate' : 'Generate'}
            </button>
          </div>
          ${hasModel ? `<div class="reference-status reference-status-ready">Model ready</div>` : `<div class="reference-status reference-status-pending">No model yet</div>`}
        </div>
      `;
    }
  }

  html += `</div>`; // End characters section

  // =====================
  // PROPS SECTION
  // =====================
  html += `
    <div class="reference-section">
      <div class="reference-section-header">
        <span class="reference-section-title">Props & Objects</span>
        <span class="reference-count">${props.length}</span>
      </div>
  `;

  if (props.length === 0) {
    html += `
      <div class="reference-empty">
        No props detected yet. Props will appear after story finalization.
      </div>
    `;
  } else {
    for (const [key, prop] of props) {
      const hasImage = prop.reference_image_url && prop.image_source === 'user';
      
      html += `
        <div class="reference-item" data-type="prop" data-key="${escapeHtml(key)}">
          <div class="reference-item-header">
            ${hasImage ? `
              <img class="reference-thumb" src="${prop.reference_image_url}" alt="${escapeHtml(prop.name)}">
            ` : `
              <div class="reference-thumb-placeholder prop-placeholder">
                <span>📦</span>
              </div>
            `}
            <div class="reference-item-info">
              <div class="reference-item-name">${escapeHtml(prop.name || key)}</div>
              <div class="reference-item-meta">${escapeHtml(prop.description || 'prop')}</div>
            </div>
          </div>
          <div class="reference-item-actions">
            <button class="btn btn-sm btn-secondary upload-prop-btn" data-key="${escapeHtml(key)}" data-name="${escapeHtml(prop.name || key)}">
              <span class="btn-icon">📷</span> Upload
            </button>
            <button class="btn btn-sm btn-ai-generate skip-prop-btn" data-key="${escapeHtml(key)}" data-name="${escapeHtml(prop.name || key)}" title="Use AI description instead of reference image">
              <span class="btn-icon">✨</span> AI Describe
            </button>
          </div>
          ${hasImage ? `<div class="reference-status reference-status-ready">Reference uploaded</div>` : `<div class="reference-status reference-status-optional">Optional - AI will describe</div>`}
        </div>
      `;
    }
  }

  html += `</div>`; // End props section

  html += `</div>`; // End reference-panel

  panel.innerHTML = html;

  // Attach event listeners
  initReferenceItemListeners();
}

function initReferenceItemListeners() {
  // Character upload buttons
  document.querySelectorAll('.upload-character-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const key = btn.dataset.key;
      const name = btn.dataset.name;
      const role = btn.dataset.role;
      openCharacterUploadModal(key, name, role);
    });
  });

  // Character generate buttons
  document.querySelectorAll('.generate-character-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      const key = btn.dataset.key;
      const name = btn.dataset.name;
      const role = btn.dataset.role;
      await generateCharacterModelForKey(key, name, role);
    });
  });

  // Prop upload buttons
  document.querySelectorAll('.upload-prop-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const key = btn.dataset.key;
      const name = btn.dataset.name;
      openPropUploadModal(key, name);
    });
  });

  // Prop "AI Describe" buttons (skip/clear reference image)
  document.querySelectorAll('.skip-prop-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      const key = btn.dataset.key;
      const name = btn.dataset.name;
      await clearPropReferenceImage(key, name);
    });
  });
}

// Open modal for uploading character photo
function openCharacterUploadModal(characterKey, characterName, characterRole) {
  // Store context for the upload
  window.pendingCharacterUpload = { characterKey, characterName, characterRole };
  
  // Update modal title
  const modalTitle = document.querySelector('#upload-modal .modal-title');
  const modalSubtitle = document.querySelector('#upload-modal .modal-subtitle');
  if (modalTitle) modalTitle.textContent = `Upload Photo: ${characterName}`;
  if (modalSubtitle) modalSubtitle.textContent = `Upload a reference photo for ${characterName} to generate a character model.`;
  
  openUploadModal();
}

// Open modal for uploading prop photo
function openPropUploadModal(propKey, propName) {
  // Create a simple file input modal for props
  const modal = document.createElement('div');
  modal.id = 'prop-upload-modal';
  modal.className = 'modal';
  modal.innerHTML = `
    <div class="modal-backdrop"></div>
    <div class="modal-dialog" role="dialog" aria-modal="true">
      <div class="modal-header">
        <div class="modal-header-left">
          <div class="modal-title">Upload Reference: ${escapeHtml(propName)}</div>
          <div class="modal-subtitle">Upload a photo of the actual item for visual consistency.</div>
        </div>
        <button class="icon-btn modal-close-btn" title="Close">✕</button>
      </div>
      <div class="modal-body">
        <div id="prop-dropzone" class="dropzone" tabindex="0">
          <div class="dropzone-inner">
            <div class="drop-icon">📦</div>
            <div class="drop-title">Drop prop photo here</div>
            <div class="drop-sub">or click to choose a file</div>
            <div class="drop-hint">PNG / JPG • The actual item photo</div>
          </div>
        </div>
        <input id="prop-photo-input" type="file" accept="image/*" class="hidden" />
        <div id="prop-upload-preview" class="upload-preview hidden"></div>
        <div id="prop-upload-status" class="status-line"></div>
      </div>
    </div>
  `;
  
  document.body.appendChild(modal);
  
  // Event listeners
  const closeBtn = modal.querySelector('.modal-close-btn');
  const backdrop = modal.querySelector('.modal-backdrop');
  const dropzone = modal.querySelector('#prop-dropzone');
  const fileInput = modal.querySelector('#prop-photo-input');
  
  const closeModal = () => {
    modal.remove();
  };
  
  closeBtn.addEventListener('click', closeModal);
  backdrop.addEventListener('click', closeModal);
  
  dropzone.addEventListener('click', () => fileInput.click());
  
  // Drag and drop
  ['dragenter', 'dragover'].forEach(evt => {
    dropzone.addEventListener(evt, (e) => {
      e.preventDefault();
      e.stopPropagation();
      dropzone.classList.add('dragover');
    });
  });
  
  ['dragleave', 'drop'].forEach(evt => {
    dropzone.addEventListener(evt, (e) => {
      e.preventDefault();
      e.stopPropagation();
      dropzone.classList.remove('dragover');
    });
  });
  
  dropzone.addEventListener('drop', (e) => {
    const files = e.dataTransfer?.files;
    if (files && files.length) {
      handlePropFileSelect(files[0], propKey, propName, modal);
    }
  });
  
  fileInput.addEventListener('change', () => {
    const f = fileInput.files?.[0];
    if (f) handlePropFileSelect(f, propKey, propName, modal);
  });
}

// Handle prop file selection and upload
async function handlePropFileSelect(file, propKey, propName, modal) {
  const preview = modal.querySelector('#prop-upload-preview');
  const status = modal.querySelector('#prop-upload-status');
  const dropzone = modal.querySelector('#prop-dropzone');
  const projectId = localStorage.getItem('projectId');
  
  if (!projectId) {
    if (status) status.textContent = 'No project loaded.';
    return;
  }
  
  // Show preview
  if (preview) {
    const url = URL.createObjectURL(file);
    preview.innerHTML = `<img src="${url}" alt="preview">`;
    preview.classList.remove('hidden');
  }
  
  if (dropzone) dropzone.style.display = 'none';
  if (status) status.textContent = 'Uploading prop reference...';
  
  const formData = new FormData();
  formData.append('photo', file);
  formData.append('projectId', projectId);
  formData.append('propKey', propKey);
  formData.append('propName', propName);
  
  try {
    const res = await fetch('/api/upload-prop-photo', { method: 'POST', body: formData });
    const data = await res.json();
    
    if (data.photoUrl) {
      if (status) status.textContent = 'Reference uploaded!';
      showToast('Prop reference uploaded', `${propName} will now use this image`, 'success');
      
      // Close modal and refresh
      setTimeout(() => {
        modal.remove();
        // Refresh the project to update the panel
        const projectId = localStorage.getItem('projectId');
        if (projectId) openProjectById(projectId);
      }, 800);
    } else {
      if (status) status.textContent = 'Upload failed. Try again.';
      if (dropzone) dropzone.style.display = 'block';
    }
  } catch (e) {
    console.error(e);
    if (status) status.textContent = 'Upload failed. Try again.';
    if (dropzone) dropzone.style.display = 'block';
  }
}

// Clear prop reference image (use AI description instead)
async function clearPropReferenceImage(propKey, propName) {
  const projectId = localStorage.getItem('projectId');
  if (!projectId) return;
  
  showToast('AI Description', `${propName} will use AI-generated description`, 'success');
  
  // TODO: Implement API to clear reference_image_url if needed
  // For now, the AI describe button just confirms the user wants AI description
}

// Generate character model for a specific character key
async function generateCharacterModelForKey(characterKey, characterName, characterRole) {
  const projectId = localStorage.getItem('projectId');
  
  if (!projectId) {
    showToast('No project loaded', 'Open a project first', 'error');
    return;
  }
  
  // Check if there's a pending photo for this character
  const { data: project } = await fetch('/api/load-project', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ projectId })
  }).then(r => r.json());
  
  const pendingPhotos = project?.project?.pending_character_photos || [];
  const pendingPhoto = pendingPhotos.find(p => p.character_key === characterKey);
  
  if (!pendingPhoto) {
    showToast('No photo uploaded', `Please upload a photo for ${characterName} first`, 'error');
    openCharacterUploadModal(characterKey, characterName, characterRole);
    return;
  }
  
  showToast('Generating character model', `Creating model for ${characterName}...`, 'success');
  
  try {
    const res = await fetch('/api/generate-character-model', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        projectId,
        characterName,
        characterRole,
        photoUrl: pendingPhoto.photo_url,
        isProtagonist: characterRole === 'protagonist'
      })
    });
    
    const data = await res.json();
    
    if (data.characterModel) {
      showToast('Character model ready', `${characterName} model generated`, 'success');
      // Refresh project
      await openProjectById(projectId);
    } else {
      throw new Error('No model returned');
    }
  } catch (err) {
    console.error(err);
    showToast('Generation failed', 'See console for details', 'error');
  }
}

function initPanelUpload() {
  const dropzone = $("panel-dropzone");
  const fileInput = $("panel-photo-input");

  if (!dropzone || !fileInput) return;

  // Click to open file picker
  dropzone.addEventListener("click", () => fileInput.click());

  // Drag states
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

  // Handle drop
  dropzone.addEventListener("drop", (e) => {
    const files = e.dataTransfer?.files;
    if (files && files.length) {
      fileInput.files = files;
      handlePanelFileSelect(files[0]);
    }
  });

  // Handle file input change
  fileInput.addEventListener("change", () => {
    const f = fileInput.files?.[0];
    if (f) handlePanelFileSelect(f);
  });
}

async function handlePanelFileSelect(file) {
  const preview = $("panel-upload-preview");
  const status = $("panel-upload-status");
  const dropzone = $("panel-dropzone");
  const projectId = localStorage.getItem("projectId");

  if (!projectId) {
    if (status) status.textContent = "No project loaded.";
    return;
  }

  // Show preview
  if (preview) {
    const url = URL.createObjectURL(file);
    preview.innerHTML = `<img src="${url}" alt="preview">`;
    preview.classList.remove("hidden");
  }

  // Hide dropzone after selection
  if (dropzone) dropzone.style.display = "none";

  // Upload the photo
  if (status) status.textContent = "Uploading photo...";

  const formData = new FormData();
  formData.append("photo", file);
  formData.append("projectId", projectId);

  try {
    const res = await fetch("/api/upload-child-photo", { method: "POST", body: formData });
    const data = await res.json();

    if (data.photoUrl) {
      if (status) status.textContent = "Photo uploaded! Generating character model...";
      showToast("Photo uploaded", "Now generating character model...", "success");
      
      // Automatically generate character model
      await generateCharacterModel();
    } else {
      if (status) status.textContent = "Upload failed. Try again.";
      if (dropzone) dropzone.style.display = "block";
    }
  } catch (e) {
    console.error(e);
    if (status) status.textContent = "Upload failed. Try again.";
    if (dropzone) dropzone.style.display = "block";
  }
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

  // Check if we have a pending character upload context
  const pendingUpload = window.pendingCharacterUpload;
  if (pendingUpload) {
    formData.append("characterName", pendingUpload.characterName);
    formData.append("characterRole", pendingUpload.characterRole);
  }

  try {
    // Use character-specific upload endpoint if we have context
    const endpoint = pendingUpload ? "/api/upload-character-photo" : "/api/upload-child-photo";
    const res = await fetch(endpoint, { method: "POST", body: formData });
    const data = await res.json();

    if (data.photoUrl) {
      status.textContent = "Uploaded! Generating character model...";
      showToast("Photo uploaded", `Now generating model for ${pendingUpload?.characterName || 'character'}...`, "success");
      
      // Generate the character model
      if (pendingUpload) {
        await generateCharacterModelForKey(
          pendingUpload.characterKey || data.characterKey,
          pendingUpload.characterName,
          pendingUpload.characterRole
        );
        // Clear the pending context
        window.pendingCharacterUpload = null;
      } else {
        await generateCharacterModel();
      }
      
      closeUploadModal();
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
  const status = $("character-status") || $("panel-upload-status");

  if (!projectId) {
    showToast("No project loaded", "Open a project first", "error");
    return;
  }

  const kidName = $("kid-name").value.trim();
  if (status) status.textContent = "Generating character model…";

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

    if (status) status.textContent = "Character model ready!";
    showToast("Character model generated", "Applied to all scenes", "success");

    await openProjectById(projectId);
    closeUploadModal();

  } catch (err) {
    console.error(err);
    if (status) status.textContent = "Failed to generate character model.";
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

  // Mark this page as generating
  GENERATING_PAGES.add(pageNum);
  
  // Re-render to show the spinner
  reRenderStoryboard();

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

    // Remove from generating set
    GENERATING_PAGES.delete(pageNum);

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

      // Re-render to remove spinner
      reRenderStoryboard();
      return;
    }

    // Update the cached project with the new illustration
    if (CACHED_PROJECT) {
      const existingIllus = CACHED_PROJECT.illustrations || [];
      const filteredIllus = existingIllus.filter(i => Number(i.page) !== pageNum);
      filteredIllus.push({
        page: pageNum,
        image_url: data.image_url,
        revisions: data.revisions || 0
      });
      CACHED_PROJECT.illustrations = filteredIllus;
    }

    showToast(
      isRegeneration ? "Illustration regenerated" : "Illustration generated",
      `Page ${pageNum}`,
      "success"
    );

    if (status) {
      status.textContent = `Done: page ${pageNum}`;
    }

    // Re-render to show the new image
    reRenderStoryboard();

  } catch (err) {
    console.error("Illustration request failed:", err);

    // Remove from generating set
    GENERATING_PAGES.delete(pageNum);

    showToast(
      "Network error",
      `Could not generate page ${pageNum}`,
      "error"
    );

    if (status) {
      status.textContent = `Failed on page ${pageNum}.`;
    }

    // Re-render to remove spinner
    reRenderStoryboard();
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

  // Update cache
  CACHED_PROJECT = project;

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
    // Re-render without full reload to preserve state
    reRenderCurrentView();
  });

  $("view-list")?.addEventListener("click", () => {
    CURRENT_VIEW = "list";
    $("view-list").classList.add("active");
    $("view-grid").classList.remove("active");
    // Re-render without full reload to preserve state
    reRenderCurrentView();
  });

  $("page-filter")?.addEventListener("change", (e) => {
    CURRENT_FILTER = e.target.value;
    // Re-render without full reload to preserve state
    reRenderCurrentView();
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
  
  // Listen for browser back/forward
  window.addEventListener("popstate", handlePopState);

  $("kid-form")?.addEventListener("submit", (e) => {
    e.preventDefault();
    fetchIdeas();
  });

  $("reset-session")?.addEventListener("click", () => {
    localStorage.removeItem("projectId");
    localStorage.removeItem("lastStoryPages");
    $("kid-name").value = "";
    $("kid-interests").value = "";
    CACHED_PROJECT = null;
    GENERATING_PAGES.clear();
    setWorkspaceTitle("Workspace", "Start a new book or open an existing one.");
    $("results").innerHTML = `<div class="loader">Session cleared. Generate ideas to begin.</div>`;
  });

  $("go-dashboard")?.addEventListener("click", loadDashboard);

  // Initialize from URL (supports refresh and direct links)
  initHistoryFromURL();
});