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
 * Extract canonical narrative context
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
• Preserve names, relationships, and facts
• Do NOT invent entities
• If a detail is implied clearly, include it
• This data is for narrative + visual consistency

STORY TEXT:
${fullText}
`;

  const response = await client.responses.create({
    model: "gpt-4.1",
    input: prompt,
  });

  const raw =
    response.output_text ??
    response.output?.[0]?.content?.[0]?.text;

  return JSON.parse(cleanJsonOutput(raw));
}

/**
 * Extract visual character profiles
 */
async function extractCharacterVisuals(storyPages, contextRegistry) {
  const fullText = storyPages.map(p => p.text).join("\n");
  const contextJson = JSON.stringify(contextRegistry, null, 2);

  const prompt = `
From the following story, identify ALL recurring characters
(children, pets, named animals, or implied companions).

For EACH character, generate a stable visual profile
to be used consistently across all illustrations.

Return ONLY JSON in this exact format:

{
  "characters": {
    "character_key": {
      "name": "",
      "role": "",
      "first_seen_page": 1,
      "visual": {
        "species": "",
        "breed": "",
        "size": "",
        "colors": "",
        "coat_or_clothing": "",
        "distinctive_features": ""
      }
    }
  }
}

Rules:
• Use existing names when available
• If breed or details are NOT specified, choose a reasonable default
• Defaults must remain consistent across pages
• Do NOT invent extra characters
• Visuals should be child-friendly and illustration-ready

STORY TEXT:
${fullText}

WORLD CONTEXT:
${contextJson}
`;

  const response = await client.responses.create({
    model: "gpt-4.1",
    input: prompt,
  });

  const raw =
    response.output_text ??
    response.output?.[0]?.content?.[0]?.text;

  return JSON.parse(cleanJsonOutput(raw));
}

/* -------------------------------------------------
   Main Handler
------------------------------------------------- */

async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { projectId, selectedIdeaIndex, selectedIdea } = req.body;

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
      return res.status(500).json({ error: "Could not load project." });
    }

    const { kid_name, kid_interests, story_ideas } = project;

    /* ---------------------------------------------
       2. Resolve idea
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

    /* ---------------------------------------------
       3. Generate story
    --------------------------------------------- */
    const storyPrompt = `
You are a children's author writing a short, rhyming picture book
for a child aged 4–7.

CHILD:
- Name: ${kid_name}
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
      input: storyPrompt,
    });

    const raw =
      response.output_text ??
      response.output?.[0]?.content?.[0]?.text;

    const parsed = JSON.parse(cleanJsonOutput(raw));
    const storyPages = parsed.story;

    /* ---------------------------------------------
       4. Extract context + visuals
    --------------------------------------------- */
    const contextRegistry = await extractContextFromStory(storyPages);
    const visualCharacters = await extractCharacterVisuals(
      storyPages,
      contextRegistry
    );

    /* ---------------------------------------------
       5. Build props_registry
    --------------------------------------------- */
    const propsRegistry = {
      characters: visualCharacters.characters || {},
      props: {},
      environments: {},
      notes: "",
    };

    /* ---------------------------------------------
       6. Persist everything
    --------------------------------------------- */
    const { data: updated, error: updateError } = await supabase
      .from("book_projects")
      .update({
        selected_idea: ideaToUse,
        story_json: storyPages,
        context_registry: contextRegistry,
        props_registry: [propsRegistry],
      })
      .eq("id", projectId)
      .select("*")
      .single();

    if (updateError) {
      return res.status(500).json({ error: "Failed to save story." });
    }

    /* ---------------------------------------------
       7. Respond cleanly
    --------------------------------------------- */
    return res.status(200).json({
      projectId: updated.id,
      story_json: updated.story_json,
      context_registry: updated.context_registry,
      props_registry: updated.props_registry,
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
