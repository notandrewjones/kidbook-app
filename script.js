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
  const resultsDiv = document.getElementById("results");

  resultsDiv.innerHTML = `
    <h2>Select a Story Idea</h2>
    <div id="ideas-container"></div>
    <button id="regenerate">Generate New Ideas</button>
  `;

  const ideasContainer = document.getElementById("ideas-container");

  ideas.forEach((idea, index) => {
    const card = document.createElement("div");
    card.className = "idea-card";
    card.innerHTML = `
      <h3>${idea.title}</h3>
      <p>${idea.description}</p>
    `;

    card.onclick = () => {
      alert(`You chose: ${idea.title}`);
      localStorage.setItem("selectedStoryIdea", JSON.stringify(idea));
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
