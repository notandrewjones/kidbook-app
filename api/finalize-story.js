// api/finalize-story.js (CommonJS)
// Locks the story, extracts context registry, and generates character visuals

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

  const { projectId, storyPages } = req.body;

  if (!projectId) {
    return res.status(400).json({ error: "Missing projectId" });
  }

  if (!storyPages || !Array.isArray(storyPages) || storyPages.length === 0) {
    return res.status(400).json({ error: "Missing or invalid storyPages" });
  }

  try {
    /* ---------------------------------------------
       1. Load project for kid_name
    --------------------------------------------- */
    const { data: project, error: projectError } = await supabase
      .from("book_projects")
      .select("kid_name, props_registry")
      .eq("id", projectId)
      .single();

    if (projectError) {
      return res.status(500).json({ error: "Could not load project." });
    }

    const { kid_name } = project;

    /* ---------------------------------------------
       2. Extract context + visuals from final story
    --------------------------------------------- */
    console.log("Extracting context from finalized story...");
    const contextRegistry = await extractContextFromStory(storyPages);
    
    console.log("Extracting character visuals...");
    const visualCharacters = await extractCharacterVisuals(
      storyPages,
      contextRegistry,
      kid_name
    );

    /* ---------------------------------------------
       3. Merge into props_registry SAFELY
    --------------------------------------------- */
    let propsRegistry =
      project?.props_registry?.[0] || {
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
       4. Persist everything with story_locked = true
    --------------------------------------------- */
    const { data: updated, error: updateError } = await supabase
      .from("book_projects")
      .update({
        story_json: storyPages,
        story_locked: true,
        context_registry: contextRegistry,
        props_registry: [propsRegistry],
      })
      .eq("id", projectId)
      .select("*")
      .single();

    if (updateError) {
      console.error("FINALIZE UPDATE ERROR:", updateError);
      return res.status(500).json({ error: "Failed to finalize story." });
    }

    /* ---------------------------------------------
       5. Respond with full project data
    --------------------------------------------- */
    return res.status(200).json({
      projectId: updated.id,
      story_json: updated.story_json,
      story_locked: true,
      context_registry: updated.context_registry,
      props_registry: updated.props_registry,
    });

  } catch (err) {
    console.error("FINALIZE-STORY ERROR:", err);
    return res.status(500).json({
      error: "Failed to finalize story.",
      details: err.message,
    });
  }
}

module.exports = handler;
module.exports.config = {
  api: { bodyParser: { sizeLimit: "2mb" } },
};