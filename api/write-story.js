// api/write-story.js (CommonJS)

const OpenAI = require("openai");
const { createClient } = require("@supabase/supabase-js");

const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// Helper: clean JSON from model output
function cleanJsonOutput(text) {
  if (!text) return text;

  text = text.replace(/```json/gi, "");
  text = text.replace(/```/g, "");
  text = text.trim();

  const firstBrace = text.indexOf("{");
  const lastBrace = text.lastIndexOf("}");

  if (firstBrace === -1 || lastBrace === -1) {
    throw new Error("No JSON object found in model output.");
  }

  return text.substring(firstBrace, lastBrace + 1);
}

async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const {
    projectId,
    selectedIdeaIndex, // optional: index of idea in story_ideas[]
    selectedIdea,      // optional: idea object sent from frontend
  } = req.body;

  console.log("=== WRITE-STORY REQUEST BODY ===");
  console.log(req.body);
  console.log("=================================");

  if (!projectId) {
    return res.status(400).json({ error: "Missing projectId" });
  }

  try {
    // 1. Load the project (get ideas + context)
    const { data: project, error: projectError } = await supabase
      .from("book_projects")
      .select(
        "kid_name, kid_interests, story_ideas, selected_idea, context_registry"
      )
      .eq("id", projectId)
      .single();

    if (projectError) {
      console.error("WRITE-STORY: project fetch error:", projectError);
      return res.status(500).json({
        error: "Could not load project in write-story",
        details: projectError,
      });
    }

    console.log("=== PROJECT LOADED IN WRITE-STORY ===");
    console.log(project);
    console.log("=====================================");

    const { kid_name, kid_interests, story_ideas, context_registry } = project;

    // 2. Resolve which idea we're using
    let ideaToUse = null;

    if (selectedIdea) {
      // frontend passed the idea explicitly
      ideaToUse = selectedIdea;
    } else if (
      typeof selectedIdeaIndex === "number" &&
      Array.isArray(story_ideas) &&
      story_ideas[selectedIdeaIndex]
    ) {
      ideaToUse = story_ideas[selectedIdeaIndex];
    } else if (Array.isArray(story_ideas) && story_ideas.length > 0) {
      // fallback: first idea
      ideaToUse = story_ideas[0];
    }

    if (!ideaToUse) {
      console.error("WRITE-STORY: No idea resolved to generate story from.");
      return res.status(400).json({
        error:
          "No valid story idea found. Generate story ideas first and select one.",
      });
    }

    console.log("=== IDEA TO USE FOR STORY ===");
    console.log(ideaToUse);
    console.log("================================");

    const { title, description } = ideaToUse;

    // 3. Build prompt for full story (page-by-page), using context_registry
    const contextJson = JSON.stringify(context_registry || {}, null, 2);

    const prompt = `
You are a children's author writing a short, fun, rhyming picture-book story
for a child aged 4–7.

CHILD:
- Name: ${kid_name || "the child"}
- Interests: ${kid_interests || "not specified"}

SELECTED STORY IDEA:
- Title: ${title || ""}
- Description: ${description || ""}

WORLD CONTEXT (facts that must stay consistent):
${contextJson}

Your job:
- Write a complete story broken into pages.
- Each page should be 1–3 short lines of text, suitable for a picture book.
- Keep language simple, rhythmic, and fun.
- Respect and preserve ALL specific details in the WORLD CONTEXT.
  For example, if the pet is "a chihuahua named Bittle", do NOT change it
  to a different breed or a generic "dog". Keep names, relationships, and
  important descriptors consistent throughout the story.

Return ONLY JSON in this exact shape:

{
  "story": [
    { "page": 1, "text": "..." },
    { "page": 2, "text": "..." }
  ]
}
`;

    console.log("=== WRITE-STORY PROMPT ===");
    console.log(prompt);
    console.log("================================");

    // 4. Call model to generate story
    const response = await client.responses.create({
      model: "gpt-4.1-mini",
      input: prompt,
    });

    let raw = response.output_text;
    if (!raw && response.output?.[0]?.content?.[0]?.text) {
      raw = response.output[0].content[0].text;
    }

    console.log("=== RAW STORY OUTPUT ===");
    console.log(raw);
    console.log("================================");

    if (!raw) {
      console.error("WRITE-STORY: Model returned no text.");
      return res
        .status(500)
        .json({ error: "Story generation returned no text." });
    }

    // 5. Clean + parse JSON
    let parsed;
    try {
      const cleaned = cleanJsonOutput(raw);
      parsed = JSON.parse(cleaned);
    } catch (err) {
      console.error("WRITE-STORY: JSON parse error:", err);
      return res.status(500).json({
        error: "Failed to parse story JSON from model.",
        details: err.message,
        raw,
      });
    }

    console.log("=== PARSED STORY JSON ===");
    console.log(parsed);
    console.log("================================");

    const storyPages = parsed.story || [];

    if (!Array.isArray(storyPages) || storyPages.length === 0) {
      console.error("WRITE-STORY: Parsed story has no pages.");
      return res.status(500).json({
        error: "Generated story has no pages.",
        parsed,
      });
    }

    // 6. Update project with selected_idea + story_json
    const { data: updated, error: updateError } = await supabase
      .from("book_projects")
      .update({
        selected_idea: ideaToUse,
        story_json: storyPages,
      })
      .eq("id", projectId)
      .select("id, selected_idea, story_json")
      .single();

    if (updateError) {
      console.error("WRITE-STORY: Supabase update error:", updateError);
      return res.status(500).json({
        error: "Failed to save story to project.",
        details: updateError,
      });
    }

    console.log("=== WRITE-STORY: UPDATE SUCCESS ===");
    console.log(updated);
    console.log("===================================");

    // 7. Respond to client
    return res.status(200).json({
      projectId: updated.id,
      selected_idea: updated.selected_idea,
      story_json: updated.story_json,
    });
  } catch (err) {
    console.error("WRITE-STORY: Unexpected error:", err);
    return res.status(500).json({
      error: "Failed to generate story.",
      details: err.message,
    });
  }
}

// Export for Next.js / Vercel
module.exports = handler;
module.exports.config = {
  api: { bodyParser: { sizeLimit: "2mb" } },
};
