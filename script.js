// script.js

/* ---------------------------------------------------
   BASIC UI HELPERS
--------------------------------------------------- */

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
   DASHBOARD + PROJECT STATE HELPERS
--------------------------------------------------- */

function projectStatusText(p) {
  if (!p.story_ideas || !p.story_ideas.length) return "No story ideas yet";
  if (p.story_ideas && !p.selected_idea) return "Ideas ready — pick one";
  if (p.selected_idea && (!p.story_json || !p.story_json.length))
    return "Idea selected — story not written yet";
  if (p.story_json && p.story_json.length && (!p.illustrations || !p.illustrations.length))
    return "Story ready — no illustrations yet";
  if (p.story_json && p.story_json.length && p.illustrations && p.illustrations.length)
    return `Story + ${p.illustrations.length} illustration(s)`;
  return "In progress";
}

function startNewBookFlow() {
  localStorage.removeItem("projectId");
  localStorage.removeItem("selectedStoryIdea");
  localStorage.removeItem("lastStoryPages");
  localStorage.removeItem("projectIllustrations");

  document.getElementById("kid-name").value = "";
  document.getElementById("kid-interests").value = "";

  document.getElementById("results").innerHTML = `
    <p>Enter your child's name and interests, then click <strong>"Generate Story Ideas"</strong> to start a new book.</p>
  `;
}

function renderDashboard(projects) {
  const resultsDiv = document.getElementById("results");

  resultsDiv.innerHTML = `
    <h2>My Books</h2>
    <button id="new-book-btn" class="primary-btn" style="margin-bottom:1rem;">Start New Book</button>
    <div id="projects-container" class="projects-grid"></div>
  `;

  const container = document.getElementById("projects-container");

  if (!projects || !projects.length) {
    container.innerHTML = `<p>You don't have any books yet. Start a new one using the form above.</p>`;
    return;
  }

  projects.forEach((p) => {
    const card = document.createElement("div");
    const title =
      (p.selected_idea && p.selected_idea.title) ||
      (p.kid_name ? `Book for ${p.kid_name}` : "Untitled Book");

    card.className = "project-card";
    card.innerHTML = `
      <h3>${title}</h3>
      <p class="project-meta">${p.kid_name || "Unknown child"}</p>
      <p class="project-status">${projectStatusText(p)}</p>
    `;
    card.onclick = () => openExistingProject(p);
    container.appendChild(card);
  });

  document.getElementById("new-book-btn").onclick = startNewBookFlow;
}

async function loadDashboard() {
  showLoader("Loading your books...");
  try {
    const res = await fetch("/api/projects-list");
    const data = await res.json();
    if (data.error) {
      document.getElementById("results").innerHTML =
        "Couldn't load your books. Start a new one above.";
      return;
    }
    renderDashboard(data.projects || []);
  } catch (err) {
    console.error("Dashboard load error:", err);
    document.getElementById("results").innerHTML =
      "Couldn't load your books. Start a new one above.";
  }
}

function openExistingProject(project) {
  document.getElementById("kid-name").value = project.kid_name || "";
  document.getElementById("kid-interests").value = project.kid_interests || "";

  localStorage.setItem("projectId", project.id);

  // No ideas yet → go to idea step
  if (!project.story_ideas || !project.story_ideas.length) {
    document.getElementById("results").innerHTML = `
      <p>This book doesn't have story ideas yet. Enter info above and click <strong>"Generate Story Ideas"</strong>.</p>
    `;
    return;
  }

  // Ideas exist but none selected
  if (project.story_ideas && !project.selected_idea) {
    renderIdeas(project.story_ideas);
    return;
  }

  // Story exists → load full UI
  if (project.story_json && project.story_json.length) {
    renderStory({
      title:
        (project.selected_idea && project.selected_idea.title) ||
        `Book for ${project.kid_name}`,
      pages: project.story_json
    });

    // Load saved character model
    if (project.character_model_url) {
      document.getElementById("character-preview").innerHTML = `
        <img src="${project.character_model_url}" style="width:250px;border-radius:14px;margin-top:10px;">
      `;
    }

    // Load illustrations
    if (project.illustrations && project.illustrations.length) {
      localStorage.setItem("projectIllustrations", JSON.stringify(project.illustrations));
      project.illustrations.forEach((illus) => {
        showPageThumbnail(illus.page, illus.image_url);
      });
    }

    return;
  }

  // Story not written yet → return to idea selection
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
    const res = await fetch("/api/story-ideas", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name,
        interests,
        projectId: localStorage.getItem("projectId") || null
      })
    });

    const data = await res.json();
    if (data.error) {
      document.getElementById("results").innerHTML =
        "Something went wrong generating ideas.";
      return;
    }

    localStorage.setItem("projectId", data.projectId);
    renderIdeas(data.ideas);
  } catch (err) {
    console.error(err);
    document.getElementById("results").innerHTML = "Something went wrong.";
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
      showLoader("Writing your story...");

      try {
        const res = await fetch("/api/write-story", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: document.getElementById("kid-name").value,
            interests: document.getElementById("kid-interests").value,
            selectedIdea: idea,
            projectId: localStorage.getItem("projectId")
          })
        });

        const data = await res.json();

		if (data.error) {
			console.error(data.error);
			document.getElementById("results").innerHTML =
				"Something went wrong writing the story.";
			return;
			}

		// 🔑 Normalize API response into renderStory format
		renderStory({
			title:
				data.selected_idea?.title ||
				`Book for ${document.getElementById("kid-name").value}`,
				pages: data.story_json
		});

      } catch (err) {
        console.error(err);
      }
    };

    container.appendChild(card);
  });

  document.getElementById("regenerate").onclick = fetchIdeas;
}

/* ---------------------------------------------------
   STORY + ILLUSTRATION UI
--------------------------------------------------- */

function renderStory(story) {
  const resultsDiv = document.getElementById("results");

  localStorage.setItem("lastStoryPages", JSON.stringify(story.pages));

  const pagesHtml = story.pages
    .map(
      (p) => `
      <div class="story-page-block">
        <div class="page-text">
          <h3>Page ${p.page}</h3>
          <p>${p.text}</p>
        </div>
        <div class="page-illustration">
          <div class="illustration-wrapper" id="illustration-wrapper-${p.page}"></div>
        </div>
      </div>
    `
    )
    .join("");

  resultsDiv.innerHTML = `
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

/* --- Thumbnail helpers with cache-busting --- */

function showPageThumbnail(pageNum, imageUrl) {
  const wrapper = document.getElementById(`illustration-wrapper-${pageNum}`);
  if (!wrapper) return;

  const freshUrl = `${imageUrl}?v=${Date.now()}`;

  wrapper.innerHTML = `
    <img src="${freshUrl}" 
         class="illustration-thumb" 
         data-page="${pageNum}"
         alt="Illustration for page ${pageNum}" />
  `;
}

function showPageSpinner(pageNum) {
  const wrapper = document.getElementById(`illustration-wrapper-${pageNum}`);
  if (!wrapper) return;

  wrapper.innerHTML = `
    <div class="page-loader">
      <div class="spinner"></div>
      <p>Generating illustration...</p>
    </div>
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
  if (!pages.length) {
    status.textContent = "No story pages found.";
    return;
  }

  status.textContent = "Loading existing illustrations...";

  let existing = [];
  try {
    const res = await fetch("/api/load-project", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ projectId })
    });
    existing = (await res.json()).project?.illustrations || [];
  } catch (err) {
    console.error(err);
  }

  const completed = new Set(existing.map((e) => e.page));

  status.textContent = "Generating remaining illustrations...";

  for (const p of pages) {
    if (completed.has(p.page)) {
      const found = existing.find((e) => e.page === p.page);
      if (found) showPageThumbnail(found.page, found.image_url);
      continue;
    }

    showPageSpinner(p.page);

    try {
      const res = await fetch("/api/generate-scene", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          projectId,
          page: p.page,
          pageText: p.text
        })
      });

      const data = await res.json();
      if (data.image_url) {
        showPageThumbnail(p.page, data.image_url);
      }
    } catch (err) {
      console.error(err);
    }
  }

  status.textContent = "Illustrations complete!";
}

/* ---------------------------------------------------
   CHARACTER MODEL
--------------------------------------------------- */

async function uploadPhoto() {
  const projectId = localStorage.getItem("projectId");
  const fileInput = document.getElementById("child-photo");
  const uploadStatus = document.getElementById("upload-status");

  if (!fileInput || !fileInput.files.length) {
    uploadStatus.innerText = "Please choose a photo.";
    return;
  }

  const formData = new FormData();
  formData.append("photo", fileInput.files[0]);
  formData.append("projectId", projectId);

  uploadStatus.innerText = "Uploading...";

  try {
    const res = await fetch("/api/upload-child-photo", {
      method: "POST",
      body: formData
    });

    const data = await res.json();
    if (data.photoUrl) {
      uploadStatus.innerText = "Uploaded!";
      document.getElementById("character-preview").innerHTML = `
        <img src="${data.photoUrl}" style="width:200px;border-radius:10px;margin-top:10px;">
      `;
    } else {
      uploadStatus.innerText = "Upload failed.";
    }
  } catch (err) {
    console.error(err);
    uploadStatus.innerText = "Upload failed.";
  }
}

async function generateCharacterModel() {
  const projectId = localStorage.getItem("projectId");
  const characterStatus = document.getElementById("character-status");

  if (!projectId) {
    characterStatus.innerText = "No project found.";
    return;
  }

  characterStatus.innerText = "Generating...";

  try {
    const res = await fetch("/api/generate-character-model", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        projectId,
        kidName: document.getElementById("kid-name").value
      })
    });

    const data = await res.json();

    if (data.characterModelUrl) {
      characterStatus.innerText = "Done!";
      document.getElementById("character-preview").innerHTML = `
        <img src="${data.characterModelUrl}" 
             style="width:250px;border-radius:14px;margin-top:10px;">
      `;
    } else {
      characterStatus.innerText = "Failed.";
    }
  } catch (err) {
    console.error(err);
    characterStatus.innerText = "Failed.";
  }
}

/* ---------------------------------------------------
   MODAL + REGENERATION
--------------------------------------------------- */

function openImageModal(pageNum, imageUrl) {
  const modal = document.getElementById("image-modal");
  const img = document.getElementById("modal-image");
  const regenBtn = document.getElementById("regen-btn");

  img.src = `${imageUrl}?v=${Date.now()}`; // fresh
  regenBtn.dataset.page = pageNum;
  document.getElementById("revision-notes").value = "";

  modal.classList.remove("hidden");
}

function closeImageModal() {
  document.getElementById("image-modal").classList.add("hidden");
}

async function handleRegenerateIllustration() {
  const projectId = localStorage.getItem("projectId");
  const pageNum = Number(document.getElementById("regen-btn").dataset.page);
  const revisionNotes = document.getElementById("revision-notes").value.trim();

  // Get existing revisions
  const res = await fetch("/api/load-project", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ projectId })
  });
  const project = (await res.json()).project;
  const illus = project.illustrations || [];
  const current = illus.find((i) => i.page === pageNum);
  const revisions = current?.revisions || 0;

  if (revisions >= 2) {
    alert("Maximum regeneration limit reached for this page.");
    return;
  }

  const pages = JSON.parse(localStorage.getItem("lastStoryPages"));
  const pageData = pages.find((p) => p.page === pageNum);

  const combinedText = revisionNotes
    ? `${pageData.text}\n\nArtist revision notes: ${revisionNotes}`
    : pageData.text;

  showPageSpinner(pageNum);

  const regenRes = await fetch("/api/generate-scene", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      projectId,
      page: pageNum,
      pageText: combinedText,
      isRegeneration: true
    })
  });

  const data = await regenRes.json();

  if (!data.image_url) {
    alert("Regeneration failed.");
    return;
  }

  // Update thumbnail
  showPageThumbnail(pageNum, data.image_url);

  // Update modal image
  document.getElementById("modal-image").src = `${data.image_url}?v=${Date.now()}`;
}

/* ---------------------------------------------------
   GLOBAL CLICK DELEGATION
--------------------------------------------------- */

document.addEventListener("click", (e) => {
  const t = e.target;

  if (t.id === "upload-btn") uploadPhoto();
  if (t.id === "generate-character-btn") generateCharacterModel();
  if (t.id === "generate-illustrations-btn") generateIllustrations();

  if (t.classList.contains("illustration-thumb")) {
    const pageNum = Number(t.dataset.page);
    openImageModal(pageNum, t.src);
  }

  if (t.id === "close-modal") closeImageModal();
  if (t.id === "regen-btn") handleRegenerateIllustration();

  if (t.id === "image-modal" && t.classList.contains("modal")) {
    closeImageModal();
  }
});

/* ---------------------------------------------------
   FORM + LOADING DASHBOARD
--------------------------------------------------- */

document.getElementById("kid-form").addEventListener("submit", (e) => {
  e.preventDefault();
  fetchIdeas();
});

document.getElementById("reset-session").addEventListener("click", startNewBookFlow);

// Load dashboard on startup
document.addEventListener("DOMContentLoaded", loadDashboard);
