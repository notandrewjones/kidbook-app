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
 * Combines narrative facts + visual descriptions + props + environments + groups
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

═══════════════════════════════════════════════════════════════════════════════
CRITICAL: ORIGINAL USER INPUT - THIS IS THE SOURCE OF TRUTH
═══════════════════════════════════════════════════════════════════════════════
Child's name: "${kidName || 'Unknown'}"
User's description: "${kidInterests || 'None provided'}"

THE USER'S DESCRIPTION ABOVE CONTAINS AUTHORITATIVE DETAILS ABOUT:
- Pet breeds (e.g., "miniature dachshund", "golden retriever", "tabby cat")
- Pet names (e.g., "named Max", "called Fluffy")
- Pet colors (e.g., "brown", "black and white")
- Other specific details

YOU MUST EXTRACT AND USE THESE EXACT DETAILS. DO NOT INVENT DIFFERENT BREEDS OR NAMES.

Example: If user says "brown miniature dachshund named Abby"
- breed MUST be "miniature dachshund" (NOT "terrier-mix", NOT "labrador")
- colors MUST include "brown"
- name MUST be "Abby"
- type MUST be "dog"
═══════════════════════════════════════════════════════════════════════════════

CHARACTERS WITH UPLOADED PHOTO MODELS (mark these with visual_source: "user", has_model: true):
${JSON.stringify(modeledCharacters, null, 2)}

STORY TEXT (use this to understand the narrative, but user input overrides for specific details):
${fullText}

Return ONLY JSON in this exact format:

{
  "characters": {
    "character_key": {
      "name": "Character Name",
      "role": "protagonist | sibling | friend | parent | pet | other",
      "type": "human | dog | cat | etc",
      "gender": "boy | girl | male | female | unspecified",
      "breed": "EXACT breed from user input if pet",
      "traits": ["personality trait 1", "trait 2"],
      "relationship": "relationship to protagonist if not protagonist",
      "visual": {
        "age_range": "child | adult | elderly (for humans)",
        "hair": "hair description (humans)",
        "skin_tone": "skin tone (humans)",
        "build": "body type",
        "size": "small | medium | large (for pets)",
        "colors": "fur/feather colors - USE USER INPUT",
        "distinctive_features": "unique identifying features",
        "typical_clothing": "usual outfit (humans)"
      },
      "has_model": false,
      "visual_source": "user | auto",
      "first_seen_page": 1
    }
  },
  "groups": {
    "group_key": {
      "name": "Display Name (e.g., 'The Grandkids')",
      "singular": "grandkid",
      "detected_term": "the exact term used in story (e.g., 'grandkids', 'cousins')",
      "detected_count": 3,
      "count_source": "explicit | implied | unknown",
      "relationship": "relationship to protagonist",
      "members": [],
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

CHARACTERS (individual, named people/animals):
• First, parse the USER'S DESCRIPTION to identify any pets, their breeds, names, and colors
• The protagonist (main character, the child) should have role: "protagonist" and key based on their name
• If user mentioned a pet with specific breed/name/color, USE THOSE EXACT DETAILS
• Do NOT invent breeds - if user says "dachshund", it's a dachshund, not a "terrier-mix"
• Do NOT invent extra characters that aren't in the story or user input
• Characters with uploaded models: set has_model: true, visual_source: "user", visual: null
• Characters WITHOUT models: set has_model: false, visual_source: "auto", generate visual
• Only include characters that are ACTUALLY IN THE STORY or USER INPUT
• Use character_key as lowercase underscore version of name (e.g., "hannah", "abby")
• DO NOT put group references (grandkids, cousins, siblings) in characters - they go in groups

GROUPS (collective references to multiple unnamed people):
• Detect terms like: grandkids, grandchildren, cousins, siblings, brothers and sisters, teammates, classmates, friends (plural without names)
• DO NOT create a group if individual names are given (e.g., "Emma and Jake" = two characters, not a group)
• Extract count if mentioned: "three grandkids" → detected_count: 3, count_source: "explicit"
• If count not specified: detected_count: null, count_source: "unknown"
• The members array starts empty - users will add members later
• Use group_key as lowercase underscore version (e.g., "grandkids", "cousins")

PROPS:
• Only include significant props that appear multiple times or are important to the story
• Do NOT include characters as props
• Include enough visual detail to maintain consistency across illustrations

ENVIRONMENTS:
• Include locations mentioned or implied in the story
• Provide enough style detail to maintain visual consistency
• Note the owner if it's someone's home/yard/room

VISUAL CONSISTENCY:
• All descriptions should be specific enough to reproduce consistently
• Use concrete details, not vague descriptions
• For pets especially: USE THE EXACT BREED FROM USER INPUT
`;

  console.log("=== FINALIZE PROMPT DEBUG ===");
  console.log("Kid name:", kidName);
  console.log("Kid interests:", kidInterests);
  console.log("Story pages:", storyPages.length);
  console.log("=============================");

  const response = await client.responses.create({
    model: "gpt-4.1",
    input: prompt,
  });

  const raw =
    response.output_text ??
    response.output?.[0]?.content?.[0]?.text;

  const registry = JSON.parse(cleanJsonOutput(raw));
  
  // Ensure groups section exists
  if (!registry.groups) {
    registry.groups = {};
  }
  
  // Post-process groups: ensure members array exists for each
  for (const [key, group] of Object.entries(registry.groups)) {
    if (!group.members) {
      group.members = [];
    }
    // Add key to group object for easier access
    group.key = key;
  }
  
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