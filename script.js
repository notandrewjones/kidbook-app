document.getElementById("kid-form").addEventListener("submit", async (e) => {
  e.preventDefault();

  const name = document.getElementById("kid-name").value;
  const interests = document.getElementById("kid-interests").value;

  const resultsDiv = document.getElementById("results");
  resultsDiv.innerHTML = "Generating story ideas...";

  try {
    const res = await fetch("/api/story-ideas", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, interests }),
    });

    if (!res.ok) {
      throw new Error("Request failed");
    }

    const data = await res.json();
    // Expect data to be { ideas: [...] }
    resultsDiv.innerHTML = `
      <h2>Story Ideas</h2>
      <ul>
        ${data.ideas.map((idea) => `<li><strong>${idea.title}</strong> - ${idea.description}</li>`).join("")}
      </ul>
    `;
  } catch (err) {
    console.error(err);
    resultsDiv.innerHTML = "Something went wrong.";
  }
});
