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

  status.textContent = "Generating illustrations...";

  for (const p of pages) {
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

// Upload child photo (existing functionality)
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

// Generate character model (existing functionality)
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

// Modal: open/close and regenerate

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
  if (modal) modal.classList.add("hidden");
}

async function handleRegenerateIllustration() {
  const projectId = localStorage.getItem("projectId");
  const regenBtn = document.getElementById("regen-btn");
  const notes = document.getElementById("revision-notes");

  if (!projectId || !regenBtn) return;

  const pageNum = Number(regenBtn.dataset.page || "0");
  if (!pageNum) return;

  const pages = JSON.parse(localStorage.getItem("lastStoryPages") || "[]");
  const pageData = pages.find((p) => p.page === pageNum);
  if (!pageData) return;

  const wrapper = document.getElementById(`illustration-wrapper-${pageNum}`);
  if (wrapper) {
    wrapper.innerHTML = `
      <div class="page-loader">
        <div class="spinner"></div>
        <p>Regenerating illustration...</p>
      </div>
    `;
  }

  const revisionText = notes.value.trim();
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
        pageText: pageTextWithNotes
      })
    });

    const data = await res.json();

    if (data && data.image_url) {
      showPageThumbnail(pageNum, data.image_url);

      const modalImg = document.getElementById("modal-image");
      if (modalImg) {
        modalImg.src = data.image_url;
      }
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

// FORM + GLOBAL EVENT LISTENERS

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

  if (target.id === "close-modal") {
    closeImageModal();
  }

  if (target.id === "regen-btn") {
    handleRegenerateIllustration();
  }

  if (target.id === "image-modal") {
    // Click outside inner content closes modal
    if (target.classList.contains("modal")) {
      closeImageModal();
    }
  }
});
