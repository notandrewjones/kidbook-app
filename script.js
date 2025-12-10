// script.js

// ---------------------------------------------------
// GLOBAL HELPERS
// ---------------------------------------------------

function showLoader(message) {
  const resultsDiv = document.getElementById("results");
  resultsDiv.innerHTML = `
    <div class="loader-container">
      <div class="spinner"></div>
      <p>${message}</p>
    </div>
  `;
}

/* ---------------------------------------------------
   DASHBOARD HELPERS
--------------------------------------------------- */

function projectStatusText(p) {
  if (!p.story_ideas || !p.story_ideas.length) return "No story ideas yet";
  if (p.story_ideas && !p.selected_idea) return "Ideas ready — pick one";
  if (p.selected_idea && (!p.story_json || !p.story_json.length))
    return "Idea selected — story not written yet";
  if (p.story_json && p.story_json.length && (!p.illustrations || !p.illustrations.length))
    return "Story ready — no illustrations yet";
  if (p.story_json && p.story_json.length && p.illustrations?.length)
    return `Story + ${p.illustrations.length} illustration(s)`;
  return "In progress";
}

function startNewBookFlow() {
  localStorage.removeItem("projectId");
  localStorage.removeItem("selectedStoryIdea");
  localStorage.removeItem("lastStoryPages");

  const nameInput = document.getElementById("kid-name");
  const interestsInput = document.getElementById("kid-interests");
  if (nameInput) nameInput.value = "";
  if (interestsInput) interestsInput.value = "";

  document.getElementById("results").innerHTML = `
    <p>Enter your child's name and interests, then click <strong>"Generate Story Ideas"</strong> to begin.</p>
  `;
}

function renderDashboard(projects) {
  const resultsDiv = document.getElementById("results");

  resultsDiv.innerHTML = `
    <h2>My Books</h2>
    <button id="new-book-btn" class="primary-btn" style="margin-bottom: 1rem;">
      Start New Book
    </button>
    <div id="projects-container" class="projects-grid"></div>
  `;

  const container = document.getElementById("projects-container");

  if (!projects || !projects.length) {
    container.innerHTML = `<p>You don't have any books yet.</p>`;
  } else {
    projects.forEach((p) => {
      const title =
        p.selected_idea?.title || (p.kid_name ? `Book for ${p.kid_name}` : "Untitled Book");

      container.innerHTML += `
        <div class="project-card" data-id="${p.id}">
          <h3>${title}</h3>
          <p class="project-meta">${p.kid_name}</p>
          <p class="project-status">${projectStatusText(p)}</p>
        </div>
      `;
    });
  }

  document.getElementById("new-book-btn").onclick = startNewBookFlow;
}

async function loadDashboard() {
  const resultsDiv = document.getElementById("results");
  showLoader("Loading your books...");

  try {
    const res = await fetch("/api/projects-list");
    const data = await res.json();
    renderDashboard(data.projects || []);
  } catch (err) {
    resultsDiv.innerHTML = "Couldn't load books. Try again later.";
  }
}

async function openExistingProject(project) {
  const nameInput = document.getElementById("kid-name");
  const interestsInput = document.getElementById("kid-interests");

  if (nameInput) nameInput.value = project.kid_name || "";
  if (interestsInput) interestsInput.value = project.kid_interests || "";

  localStorage.setItem("projectId", project.id);

  if (!project.story_ideas?.length) {
    document.getElementById("results").innerHTML = `
      <p>This book has no ideas yet. Enter child info above and click "Generate Ideas".</p>
    `;
    return;
  }

  if (project.story_ideas && !project.selected_idea) {
    renderIdeas(project.story_ideas);
    return;
  }

  if (project.story_json?.length) {
    const title = project.selected_idea?.title || `Book for ${project.kid_name}`;
    renderStory({ title, pages: project.story_json });

    if (project.character_model_url) {
      document.getElementById("character-preview").innerHTML = `
        <img src="${project.character_model_url}" style="width:250px;border-radius:14px;margin-top:10px;">
      `;
    }

    if (project.illustrations?.length) {
      project.illustrations.forEach((illus) => {
        showPageThumbnail(illus.page, illus.image_url);
      });
    }

    return;
  }

  // Fallback
  renderIdeas(project.story_ideas);
}

/* ---------------------------------------------------
   STORY IDEA GENERATION
--------------------------------------------------- */

async function fetchIdeas() {
  const name = document.getElementById("kid-name").value;
  const interests = document.getElementById("kid-interests").value;

  showLoader("Generating story ideas...");

  try {
    const existingProjectId = localStorage.getItem("projectId");

    const res = await fetch("/api/story-ideas", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, interests, projectId: existingProjectId })
    });

    const data = await res.json();
    if (data.error) throw new Error(data.error);

    localStorage.setItem("projectId", data.projectId);
    renderIdeas(data.ideas);
  } catch (err) {
    document.getElementById("results").innerHTML = "Failed to generate ideas.";
  }
}

function renderIdeas(ideas) {
  const resultsDiv = document.getElementById("results");

  resultsDiv.innerHTML = `
    <h2>Select a Story Idea</h2>
    <div id="ideas-container"></div>
    <button id="regenerate" class="secondary-btn">Generate New Ideas</button>
  `;

  const container = document.getElementById("ideas-container");

  ideas.forEach((idea) => {
    const card = document.createElement("div");
    card.className = "idea-card";
    card.innerHTML = `<h3>${idea.title}</h3><p>${idea.description}</p>`;

    card.onclick = async () => {
      showLoader("Writing the story...");

      const name = document.getElementById("kid-name").value;
      const interests = document.getElementById("kid-interests").value;
      const projectId = localStorage.getItem("projectId");

      const res = await fetch("/api/write-story", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, interests, selectedIdea: idea, projectId })
      });

      const story = await res.json();
      if (story.error) {
        document.getElementById("results").innerHTML = "Story generation failed.";
        return;
      }

      renderStory(story);
    };

    container.appendChild(card);
  });

  document.getElementById("regenerate").onclick = fetchIdeas;
}

/* ---------------------------------------------------
   STORY + ILLUSTRATION RENDERING
--------------------------------------------------- */

function renderStory(story) {
  localStorage.setItem("lastStoryPages", JSON.stringify(story.pages));

  const pagesHtml = story.pages
    .map(
      (p) => `
      <div class="story-page-block" id="page-block-${p.page}">
        <div class="page-text">
          <h3>Page ${p.page}</h3>
          <p>${p.text}</p>
        </div>
        <div class="page-illustration">
          <div class="illustration-wrapper" id="illustration-wrapper-${p.page}">
          </div>
        </div>
      </div>`
    )
    .join("");

  document.getElementById("results").innerHTML = `
    <h2>${story.title}</h2>
    <div class="story-layout">${pagesHtml}</div>

    <div class="story-actions">
      <div class="character-section">
        <h3>Upload & Generate Character Model</h3>
        <input type="file" id="child-photo" accept="image/*">
        <button id="upload-btn" class="primary-btn">Upload Photo</button>
        <div id="upload-status"></div>

        <button id="generate-character-btn" class="primary-btn">Generate Character Model</button>
        <div id="character-status"></div>
        <div id="character-preview"></div>
      </div>

      <div class="illustration-controls">
        <h3>Scene Illustrations</h3>
        <button id="generate-illustrations-btn" class="primary-btn">Generate Illustrations</button>
        <div id="illustration-status"></div>
      </div>
    </div>
  `;
}

/* ---------------------------------------------------
   PAGE ILLUSTRATION UI
--------------------------------------------------- */

function showPageSpinner(page) {
  document.getElementById(`illustration-wrapper-${page}`).innerHTML = `
    <div class="page-loader"><div class="spinner"></div><p>Generating...</p></div>
  `;
}

function showPageThumbnail(page, url) {
  document.getElementById(`illustration-wrapper-${page}`).innerHTML = `
    <img src="${url}" class="illustration-thumb" data-page="${page}">
  `;
}

/* ---------------------------------------------------
   ILLUSTRATION GENERATION
--------------------------------------------------- */

async function generateIllustrations() {
  const projectId = localStorage.getItem("projectId");
  const status = document.getElementById("illustration-status");

  if (!projectId) {
    status.textContent = "No project found.";
    return;
  }

  const pages = JSON.parse(localStorage.getItem("lastStoryPages") || "[]");
  status.textContent = "Loading existing illustrations...";

  let existing = [];
  try {
    const res = await fetch("/api/load-project", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ projectId })
    });
    existing = (await res.json()).project.illustrations || [];
  } catch {
    console.warn("Could not load previous illustrations");
  }

  const donePages = new Set(existing.map((x) => x.page));

  status.textContent = "Generating remaining illustrations...";

  for (const pageObj of pages) {
    const page = pageObj.page;

    if (donePages.has(page)) {
      showPageThumbnail(page, existing.find((x) => x.page === page).image_url);
      continue;
    }

    showPageSpinner(page);

    const res = await fetch("/api/generate-scene", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        projectId,
        page,
        pageText: pageObj.text
      })
    });

    const data = await res.json();
    if (data.image_url) showPageThumbnail(page, data.image_url);
  }

  status.textContent = "Illustrations complete!";
}

/* ---------------------------------------------------
   IMAGE MODAL + REVISION LOGIC
--------------------------------------------------- */

function openImageModal(page, url) {
  const modal = document.getElementById("image-modal");
  document.getElementById("modal-image").src = url;
  document.getElementById("revision-notes").value = "";
  document.getElementById("regen-btn").dataset.page = page;

  modal.classList.remove("hidden");
}

function closeImageModal() {
  document.getElementById("image-modal").classList.add("hidden");
}

async function handleRegenerateIllustration() {
  const projectId = localStorage.getItem("projectId");
  const page = Number(document.getElementById("regen-btn").dataset.page);

  // Prevent unlimited regenerations
  let existing = [];
  try {
    const res = await fetch("/api/load-project", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ projectId })
    });
    existing = (await res.json()).project.illustrations || [];
  } catch {}

  const record = existing.find((i) => i.page === page);
  const revisions = record?.revisions || 0;

  if (revisions >= 2) {
    alert("You've reached the maximum of 2 regenerations.");
    return;
  }

  const revisionText = document.getElementById("revision-notes").value.trim();
  const storyPages = JSON.parse(localStorage.getItem("lastStoryPages"));
  const pageData = storyPages.find((p) => p.page === page);

  const combinedText = revisionText
    ? `${pageData.text}\n\nArtist revision notes: ${revisionText}`
    : pageData.text;

  showPageSpinner(page);

  const res = await fetch("/api/generate-scene", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      projectId,
      page,
      pageText: combinedText,
      isRegeneration: true
    })
  });

  const data = await res.json();

  if (data.image_url) {
    showPageThumbnail(page, data.image_url);
    document.getElementById("modal-image").src = data.image_url;
  }
}

/* ---------------------------------------------------
   GLOBAL CLICK DELEGATION (FIXED)
--------------------------------------------------- */

document.addEventListener("click", (e) => {
  const t = e.target;

  if (t.id === "upload-btn") return uploadPhoto();
  if (t.id === "generate-character-btn") return generateCharacterModel();
  if (t.id === "generate-illustrations-btn") return generateIllustrations();

  if (t.classList.contains("project-card")) {
    const id = t.dataset.id;
    fetch("/api/load-project", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ projectId: id })
    })
      .then((res) => res.json())
      .then((data) => openExistingProject(data.project));
  }

  if (t.classList.contains("illustration-thumb")) {
    return openImageModal(Number(t.dataset.page), t.src);
  }

  if (t.id === "regen-btn") return handleRegenerateIllustration();
  if (t.id === "close-modal") return closeImageModal();

  if (t.id === "image-modal") return closeImageModal();
});

/* ---------------------------------------------------
   INIT
--------------------------------------------------- */

document.addEventListener("DOMContentLoaded", loadDashboard);
