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
// Enhanced to track implicit presence through story flow
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
    contextCharacters.push({ 
      name: contextRegistry.child.name, 
      role: "protagonist",
      key: contextRegistry.child.name.toLowerCase().replace(/[^a-z0-9]+/g, "_")
    });
  }
  if (contextRegistry?.additional_children) {
    for (const [key, child] of Object.entries(contextRegistry.additional_children)) {
      contextCharacters.push({ 
        name: child.name || key, 
        role: child.relationship || "friend",
        key: key
      });
    }
  }
  if (contextRegistry?.pets) {
    for (const [key, pet] of Object.entries(contextRegistry.pets)) {
      contextCharacters.push({ 
        name: pet.name || key, 
        role: "pet", 
        type: pet.type || pet.species,
        key: key
      });
    }
  }
  if (contextRegistry?.people) {
    for (const [key, person] of Object.entries(contextRegistry.people)) {
      contextCharacters.push({ 
        name: person.name || key, 
        role: person.relationship || "person",
        key: key
      });
    }
  }

  // Build story context up to and including current page
  // This helps track who is "present" in the scene based on narrative flow
  const storyContextUpToPage = (allPages || [])
    .filter(p => Number(p.page) <= Number(currentPage))
    .map(p => `Page ${p.page}: ${p.text}`)
    .join("\n");

  const prompt = `
You are a children's book illustrator analyzing WHO should appear in an illustration.

CRITICAL: Track character presence through the NARRATIVE FLOW, not just explicit mentions on this page.

For example:
- "Harley visits Gary's house" → Gary is now PRESENT with Harley
- "They played together" → BOTH Harley AND Gary should be in the scene
- "She ran to the park" → Only the female character mentioned earlier
- Plural pronouns (they, them, we) after establishing multiple characters → ALL those characters

STORY SO FAR (for context of who is present):
${storyContextUpToPage}

CURRENT PAGE TO ILLUSTRATE (Page ${currentPage}):
"${pageText}"

ALL KNOWN CHARACTERS:
${JSON.stringify([...availableCharacters, ...contextCharacters], null, 2)}

Analyze and return ONLY JSON:
{
  "characters_in_scene": [
    { "key": "character_key", "name": "Name", "prominence": "primary|secondary|background", "reason": "why they should appear" }
  ],
  "shot_type": "close-up|medium|wide|establishing",
  "focal_point": "what the viewer's eye should focus on",
  "show_characters": true,
  "notes": "composition notes"
}

RULES FOR CHARACTER PRESENCE:
1. The protagonist appears unless the text explicitly excludes them
2. If the story established Character A went to Character B's location, Character B is PRESENT
3. Plural pronouns (they, them, their, we, us) mean ALL recently mentioned characters are present
4. "Together", "with", "and" indicate multiple characters
5. Going to someone's house/place means that person is there
6. If uncertain whether a character is present, INCLUDE them rather than exclude
7. Maximum ${MAX_CHARACTER_MODELS_PER_SCENE} characters per scene for visual clarity
8. Characters mentioned by possessive ("Gary's yard") implies Gary owns/is at that location

SHOT TYPE RULES:
- "close-up": Focus on an object, emotion, or single detail (may exclude characters)
- "medium": Standard scene showing characters from waist up or full body
- "wide": Environmental shot showing characters in their setting
- "establishing": Scene-setting shot, often at beginning of a sequence
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
    const parsed = JSON.parse(raw.replace(/```json|```/g, "").trim());
    
    // Log for debugging
    console.log("=== SCENE COMPOSITION ANALYSIS ===");
    console.log("Page:", currentPage);
    console.log("Characters detected:", parsed.characters_in_scene?.map(c => `${c.name} (${c.reason})`));
    
    return parsed;
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
    
    // Extract character presence notes if available
    const presenceNotes = contextRegistry?.character_presence_notes || "";

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
Characters in scene: ${sceneComposition.characters_in_scene.map(c => `${c.name} (${c.prominence}${c.reason ? ': ' + c.reason : ''})`).join(", ") || "None"}
Composition notes: ${sceneComposition.notes || "None"}

PAGE TEXT:
"${pageText}"

LOCATION DETECTED:
${detectedLocation || "Infer a simple, neutral setting that fits the action."}

${presenceNotes ? `
CHARACTER PRESENCE NOTES (from story analysis):
${presenceNotes}
` : ''}

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
• If multiple characters are listed in "Characters in scene", draw ALL of them

CONTEXT CONTINUITY RULES:
• If context registry defines a specific pet/person/item, use those exact details
• Generic references ("her dog") should match specific registry entries ("Cricket the beagle")
• If at a character's location (e.g., "Gary's house"), that character should typically be present

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