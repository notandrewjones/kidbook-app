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

/* -------------------------------------------------
   Helpers
------------------------------------------------- */

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

/**
 * Extract canonical world context from full story
 */
async function extractContextFromStory(storyPages) {
  const fullText = storyPages.map(p => p.text).join("\n");

  const prompt = `
Extract canonical world facts from the following children's picture-book story.

Return ONLY JSON in this exact format:

{
  "child": {},
  "pets": {},
  "people": {},
  "items": {},
  "locations": {},
  "notes": ""
}

Rules:
• Preserve specific names, breeds, relationships, and traits
• Do NOT invent new entities
• If something is implied clearly, include it
• This data will be used for illustration consistency

STORY TEXT:
${fullText}
`;

  console.log("=== CONTEXT EXTRACTION PROMPT ===");
  console.log(prompt);
  console.log("=================================");

  const response = await client.responses.create({
    model: "gpt-4.1",
    input: prompt,
  });

  let raw =
    response.output_text ??
    response.output?.[0]?.content?.[0]?.text;

  console.log("=== RAW CONTEXT EXTRACTION OUTPUT ===");
  console.log(raw);
  console.log("====================================");

  if (!raw) {
    throw new Error("Context extraction returned no output.");
  }

  const cleaned = cleanJsonOutput(raw);
  return JSON.parse(cleaned);
}

/* -------------------------------------------------
   Main Handler
------------------------------------------------- */

async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const {
    projectId,
    selectedIdeaIndex,
    selectedIdea,
  } = req.body;

  console.log("=== WRITE-STORY REQUEST BODY ===");
  console.log(req.body);
  console.log("=================================");

  if (!projectId) {
    return res.status(400).json({ error: "Missing projectId" });
  }

  try {
    /* ---------------------------------------------
       1. Load project
    --------------------------------------------- */
    const { data: project, error: projectError } = await supabase
      .from("book_projects")
      .select("kid_name, kid_interests, story_ideas")
      .eq("id", projectId)
      .single();

    if (projectError) {
      console.error("WRITE-STORY: project fetch error:", projectError);
      return res.status(500).json({ error: "Could not load project." });
    }

    const { kid_name, kid_interests, story_ideas } = project;

    /* ---------------------------------------------
       2. Resolve selected idea
    --------------------------------------------- */
    let ideaToUse = selectedIdea;

    if (
      !ideaToUse &&
      typeof selectedIdeaIndex === "number" &&
      Array.isArray(story_ideas)
    ) {
      ideaToUse = story_ideas[selectedIdeaIndex];
    }

    if (!ideaToUse && Array.isArray(story_ideas)) {
      ideaToUse = story_ideas[0];
    }

    if (!ideaToUse) {
      return res.status(400).json({ error: "No story idea selected." });
    }

    console.log("=== IDEA SELECTED ===");
    console.log(ideaToUse);
    console.log("=====================");

    /* ---------------------------------------------
       3. Generate story
    --------------------------------------------- */
    const prompt = `
You are a children's author writing a short, rhyming picture book
for a child aged 4–7.

CHILD:
- Name: ${kid_name || "the child"}
- Interests: ${kid_interests || "not specified"}

STORY IDEA:
- Title: ${ideaToUse.title}
- Description: ${ideaToUse.description}

Return ONLY JSON:

{
  "story": [
    { "page": 1, "text": "..." }
  ]
}
`;

    const response = await client.responses.create({
      model: "gpt-4.1-mini",
      input: prompt,
    });

    let raw =
      response.output_text ??
      response.output?.[0]?.content?.[0]?.text;

    if (!raw) {
      throw new Error("Story generation returned no text.");
    }

    const parsed = JSON.parse(cleanJsonOutput(raw));
    const storyPages = parsed.story;

    if (!Array.isArray(storyPages) || !storyPages.length) {
      throw new Error("Story has no pages.");
    }

    /* ---------------------------------------------
       4. Extract context AFTER story exists
    --------------------------------------------- */
    console.log("=== EXTRACTING CONTEXT FROM STORY ===");

    const contextRegistry = await extractContextFromStory(storyPages);

    console.log("=== CONTEXT REGISTRY (FINAL) ===");
    console.log(contextRegistry);
    console.log("================================");

    /* ---------------------------------------------
       5. Persist everything
    --------------------------------------------- */
    const { data: updated, error: updateError } = await supabase
      .from("book_projects")
      .update({
        selected_idea: ideaToUse,
        story_json: storyPages,
        context_registry: contextRegistry,
      })
      .eq("id", projectId)
      .select("id, selected_idea, story_json, context_registry")
      .single();

    if (updateError) {
      console.error("WRITE-STORY UPDATE ERROR:", updateError);
      return res.status(500).json({ error: "Failed to save story." });
    }

    /* ---------------------------------------------
       6. Respond cleanly (NO UI HANG)
    --------------------------------------------- */
    return res.status(200).json({
      projectId: updated.id,
      selected_idea: updated.selected_idea,
      story_json: updated.story_json,
      context_registry: updated.context_registry,
    });

  } catch (err) {
    console.error("WRITE-STORY ERROR:", err);
    return res.status(500).json({
      error: "Failed to generate story.",
      details: err.message,
    });
  }
}

module.exports = handler;
module.exports.config = {
  api: { bodyParser: { sizeLimit: "2mb" } },
};
