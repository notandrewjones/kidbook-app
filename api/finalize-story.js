// api/finalize-story.js (CommonJS)
// Locks the story, extracts context registry, and generates character visuals
// Updated to support multiple character models

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
 * Enhanced to capture multiple characters properly and their relationships
 */
async function extractContextFromStory(storyPages, kidInterests) {
  const fullText = storyPages.map(p => p.text).join("\n");

  const prompt = `
Extract canonical world facts from the following children's picture-book story.

IMPORTANT: Only extract NAMED characters - not generic groups like "friends", "everyone", "family".
A named character is someone with a specific name (Gary, Mom, Fluffy) or a specific role that's addressed directly.

CRITICAL - ORIGINAL USER INPUT:
The user provided these details when creating the book: "${kidInterests || 'None provided'}"
These details are AUTHORITATIVE. If the user specified a specific breed, name, color, or detail,
you MUST use that EXACT information, even if the story text is more generic.

For example:
- User input: "golden retriever named Max" → breed MUST be "golden retriever", name MUST be "Max"
- User input: "black labrador" → breed MUST be "black labrador"
- User input: "tabby cat called Whiskers" → type MUST be "tabby cat", name MUST be "Whiskers"

Return ONLY JSON in this exact format:

{
  "child": {
    "name": "protagonist name",
    "gender": "boy/girl/unspecified",
    "traits": []
  },
  "additional_children": {
    "character_key": {
      "name": "specific name like Gary, Emma, etc - NOT generic terms like 'friends'",
      "relationship": "friend/sibling/cousin/neighbor",
      "traits": [],
      "appears_with_protagonist": true
    }
  },
  "pets": {
    "pet_key": {
      "name": "",
      "type": "dog/cat/etc",
      "breed": "EXACT breed from user input if specified",
      "traits": []
    }
  },
  "people": {
    "person_key": {
      "name": "specific name or role like Mom, Grandpa Joe, Teacher Mrs. Smith",
      "relationship": "mom/dad/grandma/teacher/etc",
      "traits": [],
      "location": "where they are typically found in the story"
    }
  },
  "items": {
    "item_key": {
      "name": "",
      "description": ""
    }
  },
  "locations": {
    "location_key": {
      "name": "",
      "description": "",
      "owner": "who this location belongs to, if mentioned (e.g., 'Gary' for 'Gary's house')"
    }
  },
  "character_presence_notes": "Notes about which characters appear together, e.g., 'When at Gary's house, Gary is present with protagonist'",
  "notes": ""
}

CRITICAL RULES:
• "child" is the protagonist (main character the story is about)
• Do NOT include generic terms like "friends", "family", "everyone", "kids" as characters
• Only include NAMED individuals or specific roles (Mom, Dad, Grandma, etc.)
• "additional_children" are OTHER named children (siblings, specific friends with names)
• If the story says "visits Gary's house", Gary should be extracted as a character
• Track location ownership - "Gary's yard" means Gary is associated with that location
• Note when characters appear together (for illustration purposes)
• ALWAYS prefer specific details from ORIGINAL USER INPUT over generic story text

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
 * Enhanced to handle multiple characters with proper model linking
 */
async function extractCharacterVisuals(storyPages, contextRegistry, characterModels) {
  const storyText = storyPages.map(p => p.text).join("\n");

  // Build a list of characters that already have uploaded models
  const modeledCharacters = (characterModels || []).map(cm => ({
    key: cm.character_key,
    name: cm.name,
    role: cm.role,
    is_protagonist: cm.is_protagonist,
  }));

  const prompt = `
You are defining VISUAL CONSISTENCY for illustrated characters
in a children's picture book.

CHARACTERS WITH UPLOADED MODELS (do NOT generate visuals for these):
${JSON.stringify(modeledCharacters, null, 2)}

For characters with uploaded models, set:
- visual_source: "user"
- visual: null

For characters WITHOUT models, generate consistent visual descriptions.

Return ONLY JSON in this exact format:

{
  "characters": {
    "character_key": {
      "name": "",
      "role": "protagonist | sibling | friend | parent | pet | other",
      "visual_source": "user | auto",
      "has_model": true | false,
      "visual": null | {
        "species": "",
        "age_range": "child | adult | elderly",
        "hair": "",
        "skin_tone": "",
        "build": "",
        "distinctive_features": "",
        "typical_clothing": ""
      }
    }
  }
}

Rules:
• Match character keys to context registry keys where possible
• Characters with uploaded models: visual_source = "user", visual = null, has_model = true
• Characters without models: visual_source = "auto", has_model = false, generate visual
• For pets: use species, breed, size, colors, distinctive_features instead of human attributes
• Be consistent and specific enough to reuse across all illustrations
• Do NOT invent new characters not in the story

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
       1. Load project
    --------------------------------------------- */
    const { data: project, error: projectError } = await supabase
      .from("book_projects")
      .select("kid_name, kid_interests, props_registry, character_models, character_model_url")
      .eq("id", projectId)
      .single();

    if (projectError) {
      return res.status(500).json({ error: "Could not load project." });
    }

    const { kid_name, kid_interests, character_models } = project;

    // Handle legacy: create character_models array if only old field exists
    let existingCharacterModels = Array.isArray(character_models) ? character_models : [];
    
    if (project.character_model_url && existingCharacterModels.length === 0) {
      existingCharacterModels.push({
        character_key: kid_name?.toLowerCase().replace(/[^a-z0-9]+/g, "_") || "protagonist",
        name: kid_name || "Child",
        role: "protagonist",
        model_url: project.character_model_url,
        is_protagonist: true,
        visual_source: "user",
        created_at: new Date().toISOString(),
      });
    }

    /* ---------------------------------------------
       2. Extract context + visuals from final story
    --------------------------------------------- */
    console.log("Extracting context from finalized story...");
    const contextRegistry = await extractContextFromStory(storyPages, kid_interests);
    
    console.log("Extracting character visuals...");
    const visualCharacters = await extractCharacterVisuals(
      storyPages,
      contextRegistry,
      existingCharacterModels
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
        // But DO update non-visual fields
        propsRegistry.characters[key] = {
          ...existing,
          name: character.name || existing.name,
          role: character.role || existing.role,
        };
        continue;
      }

      // Check if this character has an uploaded model
      const hasModel = existingCharacterModels.some(
        cm => cm.character_key === key || 
              cm.name?.toLowerCase() === character.name?.toLowerCase()
      );

      propsRegistry.characters[key] = {
        ...existing,
        ...character,
        has_model: hasModel || character.has_model,
        visual_source: hasModel ? "user" : (character.visual_source || "auto"),
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
        character_models: existingCharacterModels,
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
      character_models: updated.character_models,
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