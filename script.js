async function fetchIdeas() {
  const name = document.getElementById("kid-name").value;
  const interests = document.getElementById("kid-interests").value;

  const resultsDiv = document.getElementById("results");
  resultsDiv.innerHTML = "Generating story ideas...";

  try {
    const res = await fetch("/api/story-ideas", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, interests })
    });

    const data = await res.json();
    renderIdeas(data.ideas);

  } catch (err) {
    console.error(err);
    resultsDiv.innerHTML = "Something went wrong.";
  }
}

function renderIdeas(ideas) {
	
function renderStory(story) {
  const resultsDiv = document.getElementById("results");

  const pagesHtml = story.pages
    .map(p => `<div class="story-page"><h3>Page ${p.page}</h3><p>${p.text}</p></div>`)
    .join("");

  resultsDiv.innerHTML = `
    <h2>${story.title}</h2>
    ${pagesHtml}
  `;
}

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

    // THIS IS THE IMPORTANT PART:
    // When they click a card, immediately write the story
    card.onclick = async () => {
      localStorage.setItem("selectedStoryIdea", JSON.stringify(idea));

      // Start writing the story
      resultsDiv.innerHTML = "Writing the story...";

      const name = document.getElementById("kid-name").value;
      const interests = document.getElementById("kid-interests").value;

      const res = await fetch("/api/write-story", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          interests,
          selectedIdea: idea
        })
      });

      const story = await res.json();
      renderStory(story);
    };

    ideasContainer.appendChild(card);
  });

  // Regenerate button
  document.getElementById("regenerate").onclick = fetchIdeas;
}


// Handle form submit
document.getElementById("kid-form").addEventListener("submit", (e) => {
  e.preventDefault();
  fetchIdeas();
});
