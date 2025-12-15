// api/generate-scene.js
// Multi-character scene generation with smart shot composition

const OpenAI = require("openai");
const { createClient } = require("@supabase/supabase-js");

const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// Maximum character models to include in a single scene
// GPT-4.1 handles ~4-6 reference images well; beyond that quality degrades
const MAX_CHARACTER_MODELS_PER_SCENE = 4;

// -------------------------------------------------------
// Helper: Extract props (objects) from page text via GPT
// -------------------------------------------------------
async function extractPropsUsingAI(pageText) {
  console.log("=== PROP EXTRACTION — INPUT TEXT ===");
  console.log(pageText);

  const extraction = await client.responses.create({
    model: "gpt-4.1-mini",
    input: `
Extract ALL physical objects or props mentioned in this page text.
These are things that could appear visually in an illustration.

Return ONLY JSON in this exact format:
{
  "props": [
    { "name": "object-name", "context": "short reason or how it appears" }
  ]
}

Text: "${pageText}"
`,
  });

  const raw =
    extraction.output_text ??
    extraction.output?.[0]?.content?.[0]?.text;

  if (!raw) return [];

  try {
    const cleaned = raw.replace(/```json|```/g, "").trim();
    const obj = JSON.parse(cleaned);
    return obj.props || [];
  } catch (err) {
    console.error("PROP EXTRACTION PARSE ERROR:", err);
    return [];
  }
}

// -------------------------------------------------------
// Helper: Extract location/setting from page text via GPT
// -------------------------------------------------------
async function extractLocationUsingAI(pageText) {
  const extraction = await client.responses.create({
    model: "gpt-4.1-mini",
    input: `
Extract the primary LOCATION or SETTING described or implied in this page text.
Examples: "park", "bedroom", "zoo", "kitchen", "forest", "beach", "school", "backyard".

Return ONLY JSON:
{
  "location": "..."
}

If no location is directly mentioned, infer a simple, neutral setting
based on the activity (e.g., "backyard", "playground", "bedroom").

Text: "${pageText}"
`,
  });

  const raw =
    extraction.output_text ??
    extraction.output?.[0]?.content?.[0]?.text;

  if (!raw) return null;

  try {
    const cleaned = raw.replace(/```json|```/g, "").trim();
    const obj = JSON.parse(cleaned);
    return obj.location || null;
  } catch (err) {
    console.error("LOCATION EXTRACTION PARSE ERROR:", err);
    return null;
  }
}

// -------------------------------------------------------
// Helper: Infer implicit scene state from full story
// -------------------------------------------------------
async function inferSceneState(allPages, currentPageNumber) {
  if (!Array.isArray(allPages) || allPages.length === 0) {
    return { assumed_actions: [], assumed_positions: [], notes: "" };
  }

  const pagesText = allPages
    .map(p => `Page ${p.page}: ${p.text}`)
    .join("\n");

  const prompt = `
You are analyzing narrative continuity for a children's picture book.

Determine what MUST be true on the CURRENT PAGE for the story to make logical sense.

Return ONLY JSON:
{
  "assumed_actions": [],
  "assumed_positions": [],
  "notes": ""
}

Rules:
• Use future pages to infer intent
• Do NOT invent new actions
• Only include assumptions REQUIRED for continuity

CURRENT PAGE: ${currentPageNumber}

STORY:
${pagesText}
`;

  const response = await client.responses.create({
    model: "gpt-4.1-mini",
    input: prompt,
  });

  const raw =
    response.output_text ??
    response.output?.[0]?.content?.[0]?.text;

  if (!raw) {
    return { assumed_actions: [], assumed_positions: [], notes: "" };
  }

  try {
    return JSON.parse(raw.replace(/```json|```/g, "").trim());
  } catch {
    return { assumed_actions: [], assumed_positions: [], notes: "" };
  }
}

// -------------------------------------------------------
// NEW: Analyze which characters appear in this scene
// -------------------------------------------------------
async function analyzeSceneComposition(pageText, contextRegistry, characterModels, allPages, currentPage) {
  // Build character list from available models
  const availableCharacters = (characterModels || []).map(cm => ({
    key: cm.character_key,
    name: cm.name,
    role: cm.role,
    is_protagonist: cm.is_protagonist,
  }));

  // Also include characters from context registry that may not have models
  const contextCharacters = [];
  if (contextRegistry?.child?.name) {
    contextCharacters.push({ name: contextRegistry.child.name, role: "protagonist" });
  }
  if (contextRegistry?.pets) {
    for (const [key, pet] of Object.entries(contextRegistry.pets)) {
      contextCharacters.push({ name: pet.name || key, role: "pet", type: pet.type || pet.species });
    }
  }
  if (contextRegistry?.people) {
    for (const [key, person] of Object.entries(contextRegistry.people)) {
      contextCharacters.push({ name: person.name || key, role: person.relationship || "person" });
    }
  }

  const prompt = `
You are a children's book illustrator planning a scene composition.

Analyze this page text and determine:
1. Which characters should APPEAR in this illustration
2. What type of SHOT would work best (close-up, medium, wide, establishing)
3. What is the FOCAL POINT of the scene

PAGE TEXT:
"${pageText}"

AVAILABLE CHARACTERS WITH MODELS:
${JSON.stringify(availableCharacters, null, 2)}

STORY CONTEXT (all known characters):
${JSON.stringify(contextCharacters, null, 2)}

Return ONLY JSON:
{
  "characters_in_scene": [
    { "key": "character_key", "name": "Name", "prominence": "primary|secondary|background" }
  ],
  "shot_type": "close-up|medium|wide|establishing",
  "focal_point": "description of what the viewer's eye should focus on",
  "show_characters": true,
  "notes": "any special composition notes"
}

RULES:
• If the text focuses on an object, action, or setting rather than characters, set show_characters to false
• Characters mentioned by name or pronoun should appear
• The protagonist typically appears unless the scene specifically excludes them
• Limit to maximum ${MAX_CHARACTER_MODELS_PER_SCENE} characters for visual clarity
• Consider the narrative: a "close-up of the birthday cake" means no characters in frame
• "primary" = character is the focus; "secondary" = supporting; "background" = visible but not focus
`;

  const response = await client.responses.create({
    model: "gpt-4.1-mini",
    input: prompt,
  });

  const raw =
    response.output_text ??
    response.output?.[0]?.content?.[0]?.text;

  if (!raw) {
    // Default: show protagonist if available
    const protagonist = availableCharacters.find(c => c.is_protagonist || c.role === "protagonist");
    return {
      characters_in_scene: protagonist ? [{ ...protagonist, prominence: "primary" }] : [],
      shot_type: "medium",
      focal_point: "the scene",
      show_characters: true,
      notes: "",
    };
  }

  try {
    return JSON.parse(raw.replace(/```json|```/g, "").trim());
  } catch (err) {
    console.error("SCENE COMPOSITION PARSE ERROR:", err);
    const protagonist = availableCharacters.find(c => c.is_protagonist || c.role === "protagonist");
    return {
      characters_in_scene: protagonist ? [{ ...protagonist, prominence: "primary" }] : [],
      shot_type: "medium",
      focal_point: "the scene",
      show_characters: true,
      notes: "",
    };
  }
}

// -------------------------------------------------------
// NEW: Build character visual rules for prompt
// -------------------------------------------------------
function buildCharacterVisualRules(characterModels, propsRegistry, sceneComposition) {
  const rules = [];
  const charactersInScene = sceneComposition.characters_in_scene || [];

  for (const sceneChar of charactersInScene) {
    // Find the character model
    const model = (characterModels || []).find(
      cm => cm.character_key === sceneChar.key || 
            cm.name?.toLowerCase() === sceneChar.name?.toLowerCase()
    );

    // Find character in props registry for additional visual info
    const registryChar = propsRegistry?.characters?.[sceneChar.key];

    if (model) {
      // Character has an uploaded model - STRICT visual match required
      rules.push(`• ${sceneChar.name} (${sceneChar.prominence}): MUST match the uploaded character model EXACTLY. Reference image #${sceneChar.key} provided. Do NOT change appearance, proportions, or colors.`);
    } else if (registryChar?.visual) {
      // Character has AI-generated visual description
      const v = registryChar.visual;
      rules.push(`• ${sceneChar.name} (${sceneChar.prominence}): Use consistent visual:
      - Species: ${v.species || 'human'}
      - Appearance: ${v.colors || 'unspecified'}
      - Size: ${v.size || 'unspecified'}
      - Features: ${v.distinctive_features || 'none specified'}`);
    } else {
      // Character has no locked visual - provide guidance
      rules.push(`• ${sceneChar.name} (${sceneChar.prominence}): No locked visual. Depict in a style consistent with other characters.`);
    }
  }

  if (!sceneComposition.show_characters) {
    rules.push("\n• NOTE: This scene should NOT prominently feature characters. Focus on the focal point instead.");
  }

  return rules.join("\n");
}

// -------------------------------------------------------
// NEW: Prepare character model images for the API call
// -------------------------------------------------------
async function prepareCharacterModelImages(characterModels, sceneComposition) {
  const images = [];
  const charactersInScene = sceneComposition.characters_in_scene || [];

  // Sort by prominence (primary first) and limit to MAX
  const sortedCharacters = [...charactersInScene].sort((a, b) => {
    const order = { primary: 0, secondary: 1, background: 2 };
    return (order[a.prominence] || 2) - (order[b.prominence] || 2);
  });

  const limitedCharacters = sortedCharacters.slice(0, MAX_CHARACTER_MODELS_PER_SCENE);

  for (const sceneChar of limitedCharacters) {
    const model = (characterModels || []).find(
      cm => cm.character_key === sceneChar.key ||
            cm.name?.toLowerCase() === sceneChar.name?.toLowerCase()
    );

    if (model?.model_url) {
      try {
        const modelResp = await fetch(model.model_url);
        const arrayBuffer = await modelResp.arrayBuffer();
        const base64Image = Buffer.from(arrayBuffer).toString("base64");

        images.push({
          character_key: model.character_key,
          name: model.name,
          data_url: `data:image/png;base64,${base64Image}`,
        });

        console.log(`📷 Loaded character model: ${model.name} (${model.character_key})`);
      } catch (err) {
        console.error(`Failed to load character model for ${model.name}:`, err);
      }
    }
  }

  return images;
}

// -------------------------------------------------------
// Main handler
// -------------------------------------------------------
async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { projectId, page, pageText, isRegeneration, allPages } = req.body || {};

  if (!projectId || !page || !pageText) {
    return res
      .status(400)
      .json({ error: "Missing projectId, page, or pageText" });
  }

  try {
    // 1. Load project with all character data
    const { data: project, error: projectError } = await supabase
      .from("book_projects")
      .select(
        "character_model_url, character_models, illustrations, props_registry, context_registry"
      )
      .eq("id", projectId)
      .single();

    console.log("=== PROJECT LOADED ===");
    console.log("Character models count:", project?.character_models?.length || 0);

    if (projectError) {
      console.error("Project fetch error:", projectError);
      return res.status(500).json({ error: "Could not load project." });
    }

    // Normalize props_registry
    let registry;
    if (Array.isArray(project.props_registry) && project.props_registry.length > 0) {
      registry = project.props_registry[0];
    } else if (project.props_registry && typeof project.props_registry === "object") {
      registry = project.props_registry;
    } else {
      registry = { characters: {}, props: {}, environments: {}, notes: "" };
    }

    const characterRegistry = registry.characters || {};
    const contextRegistry = project.context_registry || {};
    const characterModels = project.character_models || [];

    // Handle legacy: if only character_model_url exists, treat as protagonist model
    if (project.character_model_url && characterModels.length === 0) {
      const protagonistName = contextRegistry?.child?.name || "Child";
      characterModels.push({
        character_key: "protagonist",
        name: protagonistName,
        role: "protagonist",
        model_url: project.character_model_url,
        is_protagonist: true,
        visual_source: "user",
      });
    }

    const existingIllustrations = Array.isArray(project.illustrations)
      ? project.illustrations
      : [];

    const existingForPage = existingIllustrations.find(
      (i) => Number(i.page) === Number(page)
    );
    const previousRevisions =
      existingForPage && typeof existingForPage.revisions === "number"
        ? existingForPage.revisions
        : 0;
    const existingHistory = existingForPage?.revision_history || [];
    const isRegen = !!isRegeneration;

    // 2. Analyze scene composition - which characters appear?
    console.log("=== ANALYZING SCENE COMPOSITION ===");
    const sceneComposition = await analyzeSceneComposition(
      pageText,
      contextRegistry,
      characterModels,
      allPages,
      page
    );
    console.log("Scene composition:", JSON.stringify(sceneComposition, null, 2));

    // 3. Prepare character model images for this scene
    const characterImages = await prepareCharacterModelImages(characterModels, sceneComposition);
    console.log(`=== ${characterImages.length} CHARACTER MODELS FOR SCENE ===`);

    // 4. Extract props + location
    const [aiProps, detectedLocation] = await Promise.all([
      extractPropsUsingAI(pageText),
      extractLocationUsingAI(pageText),
    ]);

    // 5. Infer scene state for continuity
    const sceneState = await inferSceneState(allPages, page);

    // 6. Build the generation prompt
    const environmentsJson = JSON.stringify(registry.environments || {}, null, 2);
    const propsJson = JSON.stringify(registry.props || {}, null, 2);
    const contextJson = JSON.stringify(contextRegistry || {}, null, 2);

    // Build character visual rules based on scene composition
    const characterVisualRules = buildCharacterVisualRules(
      characterModels,
      registry,
      sceneComposition
    );

    // Build character reference instructions
    const characterReferenceInstructions = characterImages.length > 0
      ? `
CHARACTER REFERENCE IMAGES PROVIDED:
${characterImages.map((img, idx) => `• Image ${idx + 1}: ${img.name} (${img.character_key})`).join("\n")}

You MUST use these reference images to ensure visual consistency.
Each character with a reference image must match that image EXACTLY.
`
      : `
NO CHARACTER REFERENCE IMAGES PROVIDED.
Generate characters based on the visual descriptions in CHARACTER VISUAL RULES.
`;

    const prompt = `
You MUST generate this illustration using the image_generation tool.
DO NOT respond with normal text.

Return ONLY a tool call.

SCENE COMPOSITION ANALYSIS:
Shot type: ${sceneComposition.shot_type}
Focal point: ${sceneComposition.focal_point}
Show characters: ${sceneComposition.show_characters}
Characters in scene: ${sceneComposition.characters_in_scene.map(c => `${c.name} (${c.prominence})`).join(", ") || "None"}
Composition notes: ${sceneComposition.notes || "None"}

PAGE TEXT:
"${pageText}"

LOCATION DETECTED:
${detectedLocation || "Infer a simple, neutral setting that fits the action."}

${characterReferenceInstructions}

CHARACTER VISUAL RULES:
${characterVisualRules}

CONTEXT REGISTRY (world facts - child, pets, people, locations, items):
${contextJson}

ENVIRONMENT REGISTRY (location continuity):
${environmentsJson}

PROP REGISTRY (prop continuity):
${propsJson}

IMPLICIT SCENE STATE:
${JSON.stringify(sceneState, null, 2)}

STRICT RULES:
• Do NOT invent new characters not in the story
• Characters with reference images MUST match those images exactly
• If show_characters is false, focus on the focal_point without prominent characters
• Respect shot_type: close-up = tight framing, wide = environmental context
• Primary characters should be visually prominent; background characters smaller/less detailed

CONTEXT CONTINUITY RULES:
• If context registry defines a specific pet/person/item, use those exact details
• Generic references ("her dog") should match specific registry entries ("Cricket the beagle")

STYLE REQUIREMENTS:
• Soft pastel children's-book illustration style
• Clean rounded outlines
• Gentle shading, simple shapes
• Warm daylight color palette (5000–5500K)
• Simple, uncluttered backgrounds
• Full-body characters when shown, never cropped awkwardly
• No text inside the image
• Output: 1024×1024 PNG

Now call the image_generation tool.
`;

    console.log("=== FINAL GENERATION PROMPT ===");
    console.log(prompt.substring(0, 500) + "...[truncated]");

    // 7. Build input content array with character model images
    const inputContent = [
      { type: "input_text", text: prompt },
    ];

    // Add character reference images
    for (const charImg of characterImages) {
      inputContent.push({
        type: "input_image",
        image_url: charImg.data_url,
      });
    }

    // 8. Call GPT-4.1 with image_generation tool
    const response = await client.responses.create({
      model: "gpt-4.1",
      input: [
        {
          role: "user",
          content: inputContent,
        },
      ],
      tools: [
        {
          type: "image_generation",
          model: "gpt-image-1",
          size: "1024x1024",
          quality: "low",
          background: "opaque",
          output_format: "png",
          output_compression: 100,
          moderation: "auto",
        },
      ],
    });

    console.log("=== IMAGE GENERATION RESPONSE RECEIVED ===");

    const imgCall = response.output.find(
      (o) => o.type === "image_generation_call"
    );

    if (!imgCall || !imgCall.result) {
      console.log("=== ERROR: NO IMAGE GENERATED ===");
      return res.status(500).json({ error: "Model produced no scene." });
    }

    const base64Scene = imgCall.result;
    const sceneBuffer = Buffer.from(base64Scene, "base64");

    // 9. Upload scene image
    const newRevisions = isRegen ? previousRevisions + 1 : 0;
    const filePath = `illustrations/${projectId}-page-${page}-r${newRevisions}.png`;

    const { error: uploadError } = await supabase.storage
      .from("book_images")
      .upload(filePath, sceneBuffer, {
        contentType: "image/png",
        upsert: true,
      });

    if (uploadError) {
      console.error("UPLOAD ERROR:", uploadError);
      return res.status(500).json({ error: "Failed to upload illustration." });
    }

    const { data: urlData } = supabase.storage
      .from("book_images")
      .getPublicUrl(filePath);

    // 10. Update registries
    const updatedRegistry = { ...registry };

    if (!updatedRegistry.props) updatedRegistry.props = {};
    if (!updatedRegistry.environments) updatedRegistry.environments = {};

    if (detectedLocation) {
      const envKey = detectedLocation.toLowerCase().trim();
      if (!updatedRegistry.environments[envKey]) {
        updatedRegistry.environments[envKey] = {
          style: `Consistent depiction of a ${envKey}`,
          first_seen_page: page,
        };
      }
    }

    for (const p of aiProps) {
      const key = (p.name || "").toLowerCase().trim();
      if (!key) continue;
      if (characterRegistry[key]) continue;
      if (!updatedRegistry.props[key]) {
        updatedRegistry.props[key] = {
          context: p.context || "Appears in this scene",
          first_seen_page: page,
        };
      }
    }

    const { error: registryUpdateError } = await supabase
      .from("book_projects")
      .update({ props_registry: [updatedRegistry] })
      .eq("id", projectId);

    if (registryUpdateError) {
      console.error("REGISTRY UPDATE ERROR:", registryUpdateError);
    }

    // 11. Build revision history
    let newHistory = [...existingHistory];
    if (isRegen && existingForPage?.image_url) {
      newHistory.push({
        revision: previousRevisions,
        image_url: existingForPage.image_url,
        created_at: existingForPage.last_updated || new Date().toISOString(),
        notes: existingForPage.revision_notes || null,
      });
      if (newHistory.length > 2) {
        newHistory = newHistory.slice(-2);
      }
    }

    // 12. Save illustration metadata
    let updatedIllustrations = existingIllustrations.filter(
      (i) => Number(i.page) !== Number(page)
    );

    updatedIllustrations.push({
      page,
      image_url: urlData.publicUrl,
      revisions: newRevisions,
      last_updated: new Date().toISOString(),
      revision_history: newHistory,
      scene_composition: sceneComposition, // Store composition for reference
    });

    const { error: illusUpdateError } = await supabase
      .from("book_projects")
      .update({ illustrations: updatedIllustrations })
      .eq("id", projectId);

    if (illusUpdateError) {
      console.error("ILLUSTRATIONS UPDATE ERROR:", illusUpdateError);
    }

    // 13. Done
    return res.status(200).json({
      page,
      image_url: urlData.publicUrl,
      props_registry: updatedRegistry,
      context_registry: contextRegistry,
      revisions: newRevisions,
      revision_history: newHistory,
      scene_composition: sceneComposition,
    });

  } catch (err) {
    console.error("❌ Illustration generation error:");
    console.error("Message:", err?.message);
    console.error("Stack:", err?.stack);

    return res.status(500).json({
      error: "Failed to generate illustration.",
      details: err?.message || String(err),
    });
  }
}

module.exports = handler;
module.exports.config = {
  api: { bodyParser: { sizeLimit: "10mb" } },
};