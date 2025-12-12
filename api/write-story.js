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
• Preserve names, relationships, and factual traits
• Do NOT invent new entities
• Do NOT describe visual appearance here
• Visual details belong elsewhere
• This data is narrative truth ONLY

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
async function extractCharacterVisuals(storyPages, contextRegistry, kidName) {
  const storyText = storyPages.map(p => p.text).join("\n");

  const prompt = `
You are defining VISUAL CONSISTENCY for illustrated characters
in a children's picture book.

Return ONLY JSON in this exact format:

{
  "characters": {
    "character_key": {
      "name": "",
      "role": "protagonist | pet | side_character",
      "visual_source": "pending | auto",
      "visual": null | {
        "species": "",
        "breed": "",
        "size": "",
        "colors": "",
        "distinctive_features": ""
      }
    }
  }
}

Rules:
• If the character matches the CHILD (name: "${kidName}"):
  - role MUST be "protagonist"
  - visual_source MUST be "pending"
  - visual MUST be null
• Pets and non-protagonist characters MUST receive visual descriptions
• Do NOT invent new characters
• Be consistent and reusable
• This data will be reused across all illustrations

STORY TEXT:
${storyText}

WORLD CONTEXT:
${JSON.stringify(contextRegistry, null, 2)}
`;

  const response = await client.responses.create({
    model: "gpt-4.1",
    input: prompt,
  });

  const raw =
    response.output_text ??
    response.output?.[0]?.content?.[0]?.text;

  if (!raw) throw new Error("Character visual extraction returned no output");

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
   5. Merge into props_registry SAFELY
--------------------------------------------- */

// Load existing props_registry if it exists
const { data: existingProject } = await supabase
  .from("book_projects")
  .select("props_registry")
  .eq("id", projectId)
  .single();

let propsRegistry =
  existingProject?.props_registry?.[0] || {
    notes: "",
    characters: {},
    props: {},
    environments: {},
  };

// Merge characters WITHOUT overwriting locked/user visuals
for (const [key, character] of Object.entries(
  visualCharacters.characters || {}
)) {
  const existing = propsRegistry.characters[key];

  // HARD PROTECTION: never overwrite user or locked visuals
  if (
    existing &&
    (existing.visual_source === "user" ||
     existing.visual_source === "locked")
  ) {
    continue;
  }

  propsRegistry.characters[key] = {
    ...existing,
    ...character,
    first_seen_page:
      existing?.first_seen_page ?? character.first_seen_page ?? 1,
  };
}


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
