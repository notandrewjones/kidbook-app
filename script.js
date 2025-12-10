// script.js

// Simple loader for full-area actions (ideas, story, etc.)
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
  if (!p.story_ideas || !p.story_ideas.length) {
    return "No story ideas yet";
  }

  if (p.story_ideas && !p.selected_idea) {
    return "Ideas ready — pick one";
  }

  if (p.selected_idea && (!p.story_json || !p.story_json.length)) {
    return "Idea selected — story not written yet";
  }

  if (p.story_json && p.story_json.length && (!p.illustrations || !p.illustrations.length)) {
    return "Story ready — no illustrations yet";
  }

  if (p.story_json && p.story_json.length && p.illustrations && p.illustrations.length) {
    return `Story + ${p.illustrations.length} illustration(s)`;
  }

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

  const resultsDiv = document.getElementById("results");
  resultsDiv.innerHTML = `
    <p>Enter your child's name and interests, then click <strong>"Generate Story Ideas"</strong> to start a new book.</p>
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
    container.innerHTML = `<p>You don't have any books yet. Start a new one using the form above.</p>`;
  } else {
    projects.forEach((project) => {
      const title =
        (project.selected_idea && project.selected_idea.title) ||
        (project.kid_name ? `Book for ${project.kid_name}` : "Untitled Book");

      const status = projectStatusText(project);

      const card = document.createElement("div");
      card.className = "project-card";
      card.innerHTML = `
        <h3>${title}</h3>
        <p class="project-meta">${project.kid_name || "Unknown child"}</p>
        <p class="project-status">${status}</p>
      `;

      card.onclick = () => {
        openExistingProject(project);
      };

      container.appendChild(card);
    });
  }

  const newBookBtn = document.getElementById("new-book-btn");
  if (newBookBtn) {
    newBookBtn.onclick = startNewBookFlow;
  }
}

async function loadDashboard() {
  const resultsDiv = document.getElementById("results");
  showLoader("Loading your books...");

  try {
    const res = await fetch("/api/projects-list");
    const data = await res.json();

    if (data.error) {
      console.error(data.error);
      resultsDiv.innerHTML =
        "Couldn't load your books. You can still start a new one using the form.";
      return;
    }

    renderDashboard(data.projects || []);
  } catch (err) {
    console.error("Dashboard load error:", err);
    resultsDiv.innerHTML =
      "Couldn't load your books. You can still start a new one using the form.";
  }
}

// Open an existing project and jump to the correct step
function openExistingProject(project) {
  const nameInput = document.getElementById("kid-name");
  const interestsInput = document.getElementById("kid-interests");
  if (nameInput) nameInput.value = project.kid_name || "";
  if (interestsInput) interestsInput.value = project.kid_interests || "";

  localStorage.setItem("projectId", project.id);

  // STATE 1: no ideas yet
  if (!project.story_ideas || !project.story_ideas.length) {
    const resultsDiv = document.getElementById("results");
    resultsDiv.innerHTML = `
      <p>This book doesn't have story ideas yet. Update the child's info above and click <strong>"Generate Story Ideas"</strong> to continue.</p>
    `;
    return;
  }

  // STATE 2: ideas but no selected idea
  if (project.story_ideas && !project.selected_idea) {
    renderIdeas(project.story_ideas);
    return;
  }

  // STATE 3 / 4: selected idea + story (with or without illustrations)
  if (project.story_json && project.story_json.length) {
    const title =
      (project.selected_idea && project.selected_idea.title) ||
      (project.kid_name ? `Book for ${project.kid_name}` : "Your Book");

    renderStory({
      title,
      pages: project.story_json
    });

    // ⭐ AUTO-LOAD EXISTING CHARACTER MODEL
    if (project.character_model_url) {
      const preview = document.getElementById("character-preview");
      if (preview) {
        preview.innerHTML = `
          <img src="${project.character_model_url}"
               style="width:250px;border-radius:14px;margin-top:10px;">
        `;
      }
    }

    // ⭐ AUTO-LOAD ANY EXISTING ILLUSTRATIONS
    if (project.illustrations && project.illustrations.length) {
      project.illustrations.forEach((illus) => {
        if (illus.page && illus.image_url) {
          showPageThumbnail(illus.page, illus.image_url);
        }
      });
    }

    return;
  }
  
  

  // Fallback: ideas and selected idea but no story_json yet
  if (project.selected_idea && (!project.story_json || !project.story_json.length)) {
    // In this case, we could auto-kickoff story writing, but for now:
    renderIdeas(project.story_ideas);
  }
}

/* ---------------------------------------------------
   STORY IDEAS FLOW
--------------------------------------------------- */

// Fetch story ideas from backend
async function fetchIdeas() {
  const name = document.getElementById("kid-name").value;
  const interests = document.getElementById("kid-interests").value;

  const resultsDiv = document.getElementById("results");
  showLoader("Generating story ideas...");

  try {
    const existingProjectId = localStorage.getItem("projectId");
    const res = await fetch("/api/story-ideas", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name,
        interests,
        projectId: existingProjectId || null
      })
    });

    const data = await res.json();

    if (data.error) {
      console.error(data.error);
      resultsDiv.innerHTML = "Something went wrong generating ideas.";
      return;
    }

    localStorage.setItem("projectId", data.projectId);
    renderIdeas(data.ideas);
  } catch (err) {
    console.error(err);
    resultsDiv.innerHTML = "Something went wrong.";
  }
}

// Render the list of story ideas as selectable cards
function renderIdeas(ideas) {
  const resultsDiv = document.getElementById("results");

  resultsDiv.innerHTML = `
    <h2>Select a Story Idea</h2>
    <div id="ideas-container"></div>
    <button id="regenerate" class="secondary-btn">Generate New Ideas</button>
  `;

  const ideasContainer = document.getElementById("ideas-container");

  ideas.forEach((idea) => {
    const card = document.createElement("div");
    card.className = "idea-card";
    card.innerHTML = `
      <h3>${idea.title}</h3>
      <p>${idea.description}</p>
    `;

    // When they click a card, immediately write the story
    card.onclick = async () => {
      const projectId = localStorage.getItem("projectId");
      localStorage.setItem("selectedStoryIdea", JSON.stringify(idea));

      showLoader("Writing the story...");

      const name = document.getElementById("kid-name").value;
      const interests = document.getElementById("kid-interests").value;

      try {
        const res = await fetch("/api/write-story", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name,
            interests,
            selectedIdea: idea,
            projectId
          })
        });

        const story = await res.json();

        if (story.error) {
          console.error(story.error);
          document.getElementById("results").innerHTML =
            "Something went wrong writing the story.";
          return;
        }

        renderStory(story);
      } catch (err) {
        console.error(err);
        document.getElementById("results").innerHTML =
          "Something went wrong writing the story.";
      }
    };

    ideasContainer.appendChild(card);
  });

  // Regenerate ideas
  document.getElementById("regenerate").onclick = fetchIdeas;
}

/* ---------------------------------------------------
   STORY RENDERING + ILLUSTRATIONS
--------------------------------------------------- */

// Render the story pages + character upload + illustration controls
function renderStory(story) {
  const resultsDiv = document.getElementById("results");

  // Save pages so we can generate illustrations later
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
          <!-- Spinner or thumbnail will go here -->
        </div>
      </div>
    </div>
  `
    )
    .join("");

  resultsDiv.innerHTML = `
    <h2>${story.title}</h2>

    <div class="story-layout">
      ${pagesHtml}
    </div>

    <div class="story-actions">
      <div class="character-section">
        <h3>Upload & Generate Character Model</h3>

        <h4>Upload a photo of your child</h4>
        <input type="file" id="child-photo" accept="image/*">
        <button id="upload-btn" class="primary-btn">Upload Photo</button>
        <div id="upload-status"></div>

        <h4>Character Model</h4>
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

// Helpers for per-page illustration UI
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

function showPageThumbnail(pageNum, imageUrl) {
  const wrapper = document.getElementById(`illustration-wrapper-${pageNum}`);
  if (!wrapper) return;

  wrapper.innerHTML = `
    <img 
      src="${imageUrl}" 
      class="illustration-thumb" 
      data-page="${pageNum}"
      alt="Illustration for page ${pageNum}"
    />
  `;
}

// Generate all illustrations (button-triggered)
async function generateIllustrations() {
  const projectId = localStorage.getItem("projectId");
  const status = document.getElementById("illustration-status");

  if (!projectId) {
    status.textContent = "No project found. Please generate a story first.";
    return;
  }

  const pages = JSON.parse(localStorage.getItem("lastStoryPages") || "[]");
  if (!pages.length) {
    status.textContent = "No story pages found.";
    return;
  }

  status.textContent = "Checking existing illustrations...";

  // Load existing illustrations from backend
  let existing = [];
  try {
    const res = await fetch("/api/load-project", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ projectId })
    });
    const data = await res.json();
    existing = data?.project?.illustrations || [];
  } catch (err) {
    console.error("Error loading previous illustrations:", err);
  }

  // Build a quick lookup table for pages already completed
  const completedPages = new Set(existing.map((i) => i.page));

  status.textContent = "Generating remaining illustrations...";

  // Loop through pages, but skip ones already completed
  for (const p of pages) {
    if (completedPages.has(p.page)) {
      // Already done — show the thumbnail again
      const existingIllustration = existing.find((i) => i.page === p.page);
      if (existingIllustration?.image_url) {
        showPageThumbnail(p.page, existingIllustration.image_url);
      }
      continue; // <-- Skip regeneration
    }

    // Not completed — generate now
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

      if (data && data.image_url) {
        showPageThumbnail(p.page, data.image_url);
      } else {
        const wrapper = document.getElementById(
          `illustration-wrapper-${p.page}`
        );
        if (wrapper) {
          wrapper.innerHTML =
            "<p>Failed to generate illustration for this page.</p>";
        }
      }
    } catch (err) {
      console.error("Illustration error:", err);
      const wrapper = document.getElementById(
        `illustration-wrapper-${p.page}`
      );
      if (wrapper) {
        wrapper.innerHTML =
          "<p>Something went wrong generating this illustration.</p>";
      }
    }
  }

  status.textContent = "Illustrations complete!";
}



/* ---------------------------------------------------
   PHOTO UPLOAD + CHARACTER MODEL
--------------------------------------------------- */

// Upload child photo
async function uploadPhoto() {
  const projectId = localStorage.getItem("projectId");
  const fileInput = document.getElementById("child-photo");
  const uploadStatus = document.getElementById("upload-status");

  if (!fileInput || !fileInput.files.length) {
    uploadStatus.innerText = "Please choose a photo.";
    return;
  }

  const file = fileInput.files[0];

  const formData = new FormData();
  formData.append("photo", file);
  formData.append("projectId", projectId);

  uploadStatus.innerText = "Uploading...";

  try {
    const res = await fetch("/api/upload-child-photo", {
      method: "POST",
      body: formData
    });

    const data = await res.json();

    if (data.photoUrl) {
      uploadStatus.innerText = "Photo uploaded!";
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

// Generate character model
async function generateCharacterModel() {
  const projectId = localStorage.getItem("projectId");
  const characterStatus = document.getElementById("character-status");

  if (!projectId) {
    characterStatus.innerText = "No project found. Please generate a story first.";
    return;
  }

  characterStatus.innerText = "Generating character model...";

  const kidName = document.getElementById("kid-name").value;

  try {
    const res = await fetch("/api/generate-character-model", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        projectId,
        kidName
      })
    });

    const data = await res.json();

    if (data.characterModelUrl) {
      characterStatus.innerText = "Character model generated!";
      document.getElementById("character-preview").innerHTML = `
        <img src="${data.characterModelUrl}" style="width:250px;border-radius:14px;margin-top:10px;">
      `;
    } else {
      characterStatus.innerText = "Failed to generate character model.";
    }
  } catch (err) {
    console.error(err);
    characterStatus.innerText = "Failed to generate character model.";
  }
}

/* ---------------------------------------------------
   IMAGE MODAL + REVISIONS
--------------------------------------------------- */

function openImageModal(pageNum, imageUrl) {
  const modal = document.getElementById("image-modal");
  const modalImg = document.getElementById("modal-image");
  const notes = document.getElementById("revision-notes");
  const regenBtn = document.getElementById("regen-btn");

  if (!modal || !modalImg || !notes || !regenBtn) return;

  modalImg.src = imageUrl;
  notes.value = "";
  regenBtn.dataset.page = String(pageNum);

  modal.classList.remove("hidden");
}

function closeImageModal() {
  const modal = document.getElementById("image-modal");
  if (!modal) return;
  modal.classList.add("hidden");
}


async function handleRegenerateIllustration() {
  const projectId = localStorage.getItem("projectId");
  const regenBtn = document.getElementById("regen-btn");
  const notes = document.getElementById("revision-notes");

  if (!projectId || !regenBtn) return;

  const pageNum = Number(regenBtn.dataset.page || "0");
  if (!pageNum) return;

  // Load existing illustrations to check revision count
  let existing = [];
  try {
    const res = await fetch("/api/load-project", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ projectId })
    });
    const data = await res.json();
    existing = data?.project?.illustrations || [];
  } catch (err) {
    console.error("Error loading project for regeneration:", err);
  }

  // Find the illustration entry
  const illustration = existing.find(i => i.page === pageNum);

  const revisions = illustration?.revisions || 0;

  // Reject if more than 2 regenerations
  if (revisions >= 2) {
    alert("You've reached the regeneration limit for this page (max 2).");
    return;
  }

  const wrapper = document.getElementById(`illustration-wrapper-${pageNum}`);
  if (wrapper) {
    wrapper.innerHTML = `
      <div class="page-loader">
        <div class="spinner"></div>
        <p>Regenerating illustration...</p>
      </div>
    `;
  }

  // Add revision notes
  const revisionText = notes.value.trim();
  const pages = JSON.parse(localStorage.getItem("lastStoryPages") || "[]");
  const pageData = pages.find(p => p.page === pageNum);

  const pageTextWithNotes = revisionText
    ? `${pageData.text}\n\nArtist revision notes: ${revisionText}`
    : pageData.text;

  try {
    const res = await fetch("/api/generate-scene", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        projectId,
        page: pageNum,
        pageText: pageTextWithNotes,
        isRegeneration: true
      })
    });

    const data = await res.json();

    if (data && data.image_url) {
      // Update thumbnail
      showPageThumbnail(pageNum, data.image_url);

      // Update modal image
      const modalImg = document.getElementById("modal-image");
      if (modalImg) modalImg.src = data.image_url;

      // Update regeneration count in local storage preview
      illustration.revisions = revisions + 1;

    } else {
      if (wrapper) {
        wrapper.innerHTML = "<p>Failed to regenerate illustration.</p>";
      }
    }
  } catch (err) {
    console.error("Regeneration error:", err);
    if (wrapper) {
      wrapper.innerHTML = "<p>Something went wrong regenerating.</p>";
    }
  }
}


/* ---------------------------------------------------
   GLOBAL EVENT LISTENERS
--------------------------------------------------- */

// Handle form submit
document.getElementById("kid-form").addEventListener("submit", (e) => {
  e.preventDefault();
  fetchIdeas();
});

// Reset session button
document.getElementById("reset-session").addEventListener("click", () => {
  localStorage.removeItem("projectId");
  localStorage.removeItem("selectedStoryIdea");
  localStorage.removeItem("lastStoryPages");
  window.location.reload();
});

// Delegate clicks for buttons & thumbnails
document.addEventListener("click", (e) => {
  const target = e.target;

  if (target.id === "upload-btn") {
    uploadPhoto();
  }

  if (target.id === "generate-character-btn") {
    generateCharacterModel();
  }

  if (target.id === "generate-illustrations-btn") {
    generateIllustrations();
  }

  if (target.classList && target.classList.contains("illustration-thumb")) {
    const pageNum = Number(target.dataset.page || "0");
    if (pageNum) {
      openImageModal(pageNum, target.src);
    }
  }
  
  
  //Regeneration modal
  if (target.id === "regen-btn") {
    handleRegenerateIllustration();
  }
  

  if (target.id === "close-modal") {
    closeImageModal();
  }

  if (target.id === "regen-btn") {
    handleRegenerateIllustration();
  }

  if (target.id === "image-modal" && target.classList.contains("modal")) {
    closeImageModal();
  }
  
});

// On load: show dashboard of saved books
document.addEventListener("DOMContentLoaded", () => {
  loadDashboard();
});
