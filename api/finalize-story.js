// api/finalize-story.js (CommonJS)
// Locks the story and extracts unified story registry
// Single API call for all narrative + visual data

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
 * Extract unified story registry - ALL data in ONE call
 * Combines narrative facts + visual descriptions + props + environments
 */
async function extractUnifiedRegistry(storyPages, kidInterests, kidName, existingCharacterModels) {
  const fullText = storyPages.map(p => p.text).join("\n");
  
  // Build list of characters that have uploaded models
  const modeledCharacters = (existingCharacterModels || []).map(cm => ({
    key: cm.character_key,
    name: cm.name,
    role: cm.role,
    is_protagonist: cm.is_protagonist,
  }));

  const prompt = `
You are extracting a UNIFIED STORY REGISTRY for a children's picture book.
This registry contains ALL information needed for consistent illustration generation.

ORIGINAL USER INPUT (AUTHORITATIVE - use exact details):
Child's name: "${kidName || 'Unknown'}"
User specified: "${kidInterests || 'None provided'}"

If the user specified a breed, color, name, or any specific detail, you MUST use that EXACT information.
Example: "golden retriever named Max" → breed MUST be "golden retriever", name MUST be "Max"

CHARACTERS WITH UPLOADED PHOTO MODELS (mark these with visual_source: "user", has_model: true):
${JSON.stringify(modeledCharacters, null, 2)}

STORY TEXT:
${fullText}

Return ONLY JSON in this exact format:

{
  "characters": {
    "character_key": {
      "name": "Character Name",
      "role": "protagonist | sibling | friend | parent | pet | other",
      "type": "human | dog | cat | etc",
      "gender": "boy | girl | male | female | unspecified",
      "breed": "specific breed if pet, from user input if specified",
      "traits": ["personality trait 1", "trait 2"],
      "relationship": "relationship to protagonist if not protagonist",
      "visual": {
        "age_range": "child | adult | elderly (for humans)",
        "hair": "hair description (humans)",
        "skin_tone": "skin tone (humans)",
        "build": "body type",
        "size": "small | medium | large (for pets)",
        "colors": "fur/feather colors (for pets)",
        "distinctive_features": "unique identifying features",
        "typical_clothing": "usual outfit (humans)"
      },
      "has_model": false,
      "visual_source": "user | auto",
      "first_seen_page": 1
    }
  },
  "props": {
    "prop_key": {
      "name": "Prop Name",
      "description": "what it looks like and its purpose",
      "visual": "specific visual description for consistency",
      "first_seen_page": 1
    }
  },
  "environments": {
    "environment_key": {
      "name": "Location Name",
      "description": "what this place is",
      "owner": "who this belongs to, if applicable",
      "style": "visual style description - colors, mood, key elements",
      "first_seen_page": 1
    }
  },
  "presence_notes": "Notes about which characters appear together and when"
}

CRITICAL RULES:

CHARACTERS:
• The protagonist (main character) should have role: "protagonist"
• Characters with uploaded models: set has_model: true, visual_source: "user", visual: null
• Characters WITHOUT models: set has_model: false, visual_source: "auto", generate full visual description
• Do NOT include generic groups like "friends", "family", "everyone" as characters
• Only include NAMED individuals or specific roles (Mom, Dad, Grandma, specific friend names)
• For pets: include type, breed (from user input!), size, colors, distinctive_features
• For humans: include age_range, hair, skin_tone, build, typical_clothing, distinctive_features
• Use character_key as lowercase underscore version of name (e.g., "grandma_rose")

PROPS:
• Only include significant props that appear multiple times or are important to the story
• Do NOT include characters as props
• Include enough visual detail to maintain consistency across illustrations

ENVIRONMENTS:
• Include locations that appear in the story
• Provide enough style detail to maintain visual consistency
• Note the owner if it's someone's home/yard/room

VISUAL CONSISTENCY:
• All descriptions should be specific enough to reproduce consistently
• Use concrete details, not vague descriptions
• For pets especially: be very specific about breed, size, colors, markings

STORY TEXT TO ANALYZE:
${fullText}
`;

  const response = await client.responses.create({
    model: "gpt-4.1",
    input: prompt,
  });

  const raw =
    response.output_text ??
    response.output?.[0]?.content?.[0]?.text;

  const registry = JSON.parse(cleanJsonOutput(raw));
  
  // Post-process: ensure characters with models have correct flags
  for (const modelChar of existingCharacterModels) {
    const key = modelChar.character_key;
    if (registry.characters[key]) {
      registry.characters[key].has_model = true;
      registry.characters[key].visual_source = "user";
      registry.characters[key].model_url = modelChar.model_url;
      // Keep visual null for user-uploaded models - we use the image directly
      if (modelChar.visual_source === "user") {
        registry.characters[key].visual = null;
      }
    } else {
      // Model exists but wasn't extracted - add it
      registry.characters[key] = {
        name: modelChar.name,
        role: modelChar.role || "other",
        type: modelChar.role === "pet" ? "unknown" : "human",
        has_model: true,
        visual_source: "user",
        model_url: modelChar.model_url,
        visual: null,
        first_seen_page: 1,
      };
    }
  }

  return registry;
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
      .select("kid_name, kid_interests, character_models, character_model_url")
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
       2. Extract unified registry (SINGLE API CALL)
    --------------------------------------------- */
    console.log("Extracting unified story registry...");
    const storyRegistry = await extractUnifiedRegistry(
      storyPages,
      kid_interests,
      kid_name,
      existingCharacterModels
    );

    console.log("=== UNIFIED REGISTRY EXTRACTED ===");
    console.log(JSON.stringify(storyRegistry, null, 2));
    console.log("==================================");

    /* ---------------------------------------------
       3. Persist everything with story_locked = true
       Store in props_registry for backward compatibility
       Clear context_registry (no longer needed separately)
    --------------------------------------------- */
    const { data: updated, error: updateError } = await supabase
      .from("book_projects")
      .update({
        story_json: storyPages,
        story_locked: true,
        props_registry: [storyRegistry],  // Unified registry stored here
        context_registry: null,            // Deprecated - clear it
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
       4. Respond with full project data
    --------------------------------------------- */
    return res.status(200).json({
      projectId: updated.id,
      story_json: updated.story_json,
      story_locked: true,
      story_registry: storyRegistry,       // New unified name
      props_registry: updated.props_registry, // For backward compat
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