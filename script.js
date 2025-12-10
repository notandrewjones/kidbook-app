function renderStory(storyResponse) {
  const resultsDiv = document.getElementById("results");

  console.log("=== RENDER STORY INPUT ===", storyResponse);

  // Extract fields safely
  const pages = storyResponse.story_json || [];
  const selectedIdea = storyResponse.selected_idea || {};
  const title = selectedIdea.title || "Your Story";

  if (!Array.isArray(pages) || pages.length === 0) {
    resultsDiv.innerHTML = "<p>No story pages were returned.</p>";
    return;
  }

  // Save pages for illustration workflow
  localStorage.setItem("lastStoryPages", JSON.stringify(pages));

  // Build pages HTML
  const pagesHtml = pages
    .map(
      (p) => `
      <div class="story-page-block" id="page-block-${p.page}">
        <div class="page-text">
          <h3>Page ${p.page}</h3>
          <p>${p.text.replace(/\n/g, "<br>")}</p>
        </div>
        <div class="page-illustration">
          <div class="illustration-wrapper" id="illustration-wrapper-${p.page}">
            <!-- Spinner or thumbnail goes here -->
          </div>
        </div>
      </div>
    `
    )
    .join("");

  // Render layout
  resultsDiv.innerHTML = `
    <h2>${title}</h2>

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
