async function fetchIdeas() {
  const name = document.getElementById("kid-name").value;
  const interests = document.getElementById("kid-interests").value;

  const resultsDiv = document.getElementById("results");
  resultsDiv.innerHTML = "Generating story ideas...";

  const existingProjectId = localStorage.getItem("projectId");

  try {
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
    localStorage.setItem("projectId", data.projectId);
    renderIdeas(data.ideas);

  } catch (err) {
    console.error(err);
    resultsDiv.innerHTML = "Something went wrong.";
  }
}

function renderStory(story) {
  const resultsDiv = document.getElementById("results");

  const pagesHtml = story.pages
    .map(p => `<div class="story-page"><h3>Page ${p.page}</h3><p>${p.text}</p></div>`)
    .join("");

  resultsDiv.innerHTML = `
    <h2>${story.title}</h2>
    ${pagesHtml}
  `;

  resultsDiv.innerHTML += `
    <h3>Upload a photo of your child</h3>
    <input type="file" id="child-photo" accept="image/*">
    <button id="upload-btn">Upload Photo</button>
    <div id="upload-status"></div>
    <div id="character-preview"></div>
  `;
}

function renderIdeas(ideas) {
  const resultsDiv = document.getElementById("results");

  resultsDiv.innerHTML = `
    <h2>Select a Story Idea</h2>
    <div id="ideas-container"></div>
    <button id="regenerate">Generate New Ideas</button>
  `;

  const ideasContainer = document.getElementById("ideas-container");

  ideas.forEach((idea) => {
    const card = document.createElement("div");
    card.className = "idea-card";
    card.innerHTML = `
      <h3>${idea.title}</h3>
      <p>${idea.description}</p>
    `;

    card.onclick = async () => {
      const projectId = localStorage.getItem("projectId");
      localStorage.setItem("selectedStoryIdea", JSON.stringify(idea));

      resultsDiv.innerHTML = "Writing the story...";

      const name = document.getElementById("kid-name").value;
      const interests = document.getElementById("kid-interests").value;

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
      renderStory(story);
    };

    ideasContainer.appendChild(card);
  });

  document.getElementById("regenerate").onclick = fetchIdeas;
}

// Handle form submit
document.getElementById("kid-form").addEventListener("submit", (e) => {
  e.preventDefault();
  fetchIdeas();
});

// Handle photo upload button
document.addEventListener("change", () => {
  const uploadBtn = document.getElementById("upload-btn");
  if (uploadBtn) {
    uploadBtn.onclick = uploadPhoto;
  }
});

async function uploadPhoto() {
  const projectId = localStorage.getItem("projectId");
  const fileInput = document.getElementById("child-photo");
  const uploadStatus = document.getElementById("upload-status");

  if (!fileInput.files.length) {
    uploadStatus.innerText = "Please choose a photo.";
    return;
  }

  const file = fileInput.files[0];

  const formData = new FormData();
  formData.append("photo", file);
  formData.append("projectId", projectId);

  uploadStatus.innerText = "Uploading...";

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
}
