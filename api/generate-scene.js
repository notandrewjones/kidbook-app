// api/generate-scene.js
// Scene generation using unified story registry
// Simplified to use single registry for all data

const OpenAI = require("openai");
const { createClient } = require("@supabase/supabase-js");
const { uploadToR2 } = require("./_r2.js");

const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// Maximum character models per scene (quality degrades beyond 4)
const MAX_CHARACTER_MODELS_PER_SCENE = 4;

// -------------------------------------------------------
// Helper: Extract location from page text
// -------------------------------------------------------
async function extractLocationUsingAI(pageText) {
  const extraction = await client.responses.create({
    model: "gpt-4.1-mini",
    input: `
Extract the primary LOCATION or SETTING from this text.
Return ONLY JSON: { "location": "..." }
If none mentioned, infer from context (e.g., "backyard", "bedroom").

Text: "${pageText}"
`,
  });

  const raw = extraction.output_text ?? extraction.output?.[0]?.content?.[0]?.text;
  if (!raw) return null;

  try {
    const obj = JSON.parse(raw.replace(/```json|```/g, "").trim());
    return obj.location || null;
  } catch {
    return null;
  }
}

// -------------------------------------------------------
// Helper: Extract new props from page text
// -------------------------------------------------------
async function extractPropsUsingAI(pageText, existingProps) {
  const existingKeys = Object.keys(existingProps || {});
  
  const extraction = await client.responses.create({
    model: "gpt-4.1-mini",
    input: `
Extract physical objects/props from this text that could appear in an illustration.
EXCLUDE these already-known props: ${existingKeys.join(", ") || "none"}

Return ONLY JSON:
{
  "props": [
    { "name": "object-name", "description": "brief visual description" }
  ]
}

Text: "${pageText}"
`,
  });

  const raw = extraction.output_text ?? extraction.output?.[0]?.content?.[0]?.text;
  if (!raw) return [];

  try {
    const obj = JSON.parse(raw.replace(/```json|```/g, "").trim());
    return obj.props || [];
  } catch {
    return [];
  }
}

// -------------------------------------------------------
// Helper: Analyze which characters AND props appear in this scene
// -------------------------------------------------------
async function analyzeSceneComposition(pageText, registry, characterModels, allPages, currentPage) {
  // Build character list from registry
  const knownCharacters = Object.entries(registry.characters || {}).map(([key, char]) => ({
    key,
    name: char.name,
    role: char.role,
    type: char.type,
    has_model: char.has_model,
  }));

  // Build props list from registry
  const knownProps = Object.entries(registry.props || {}).map(([key, prop]) => ({
    key,
    name: prop.name,
    description: prop.description || prop.visual || "",
    has_reference_image: !!prop.reference_image_url,
  }));

  // Story context up to current page
  const storyContext = (allPages || [])
    .filter(p => Number(p.page) <= Number(currentPage))
    .map(p => `Page ${p.page}: ${p.text}`)
    .join("\n");

  const prompt = `
Analyze WHO and WHAT should appear in this illustration.

TRACK CHARACTER PRESENCE through narrative flow:
- "Harley visits Gary's house" → Gary is NOW PRESENT
- "They played together" → BOTH characters in scene
- Plural pronouns (they, them, we) after establishing characters → ALL present

TRACK PROPS/OBJECTS in the scene:
- Only include props that are ACTIVELY part of this scene
- Props being used, held, or visually important should be included
- Don't include props just because they exist in the story

STORY SO FAR:
${storyContext}

CURRENT PAGE (Page ${currentPage}):
"${pageText}"

KNOWN CHARACTERS:
${JSON.stringify(knownCharacters, null, 2)}

KNOWN PROPS:
${JSON.stringify(knownProps, null, 2)}

Return ONLY JSON:
{
  "characters_in_scene": [
    { "key": "character_key", "name": "Name", "prominence": "primary|secondary|background", "reason": "why present" }
  ],
  "props_in_scene": [
    { "key": "prop_key", "name": "Prop Name", "importance": "focal|supporting|background", "reason": "why included" }
  ],
  "shot_type": "close-up|medium|wide|establishing",
  "focal_point": "what viewer should focus on",
  "show_characters": true,
  "notes": "composition notes"
}

RULES FOR CHARACTERS:
1. Protagonist appears unless explicitly excluded
2. Going to someone's location means they're there
3. Plural pronouns = all recently mentioned characters
4. "Together", "with", "and" = multiple characters
5. If uncertain, INCLUDE the character
6. Max ${MAX_CHARACTER_MODELS_PER_SCENE} characters

RULES FOR PROPS:
1. Only include props that are MENTIONED or IMPLIED in this specific page
2. Props being actively used or interacted with = "focal" or "supporting"
3. Props in the background or setting = "background"
4. Max 4 props with reference images will be used
`;

  const response = await client.responses.create({
    model: "gpt-4.1-mini",
    input: prompt,
  });

  const raw = response.output_text ?? response.output?.[0]?.content?.[0]?.text;

  if (!raw) {
    const protagonist = knownCharacters.find(c => c.role === "protagonist");
    return {
      characters_in_scene: protagonist ? [{ ...protagonist, prominence: "primary" }] : [],
      props_in_scene: [],
      shot_type: "medium",
      focal_point: "the scene",
      show_characters: true,
      notes: "",
    };
  }

  try {
    const parsed = JSON.parse(raw.replace(/```json|```/g, "").trim());
    // Ensure props_in_scene exists
    if (!parsed.props_in_scene) parsed.props_in_scene = [];
    return parsed;
  } catch {
    const protagonist = knownCharacters.find(c => c.role === "protagonist");
    return {
      characters_in_scene: protagonist ? [{ ...protagonist, prominence: "primary" }] : [],
      props_in_scene: [],
      shot_type: "medium",
      focal_point: "the scene",
      show_characters: true,
      notes: "",
    };
  }
}

// -------------------------------------------------------
// Helper: Build character visual rules for the prompt
// -------------------------------------------------------
function buildCharacterVisualRules(registry, sceneComposition) {
  const rules = [];
  const charactersInScene = sceneComposition.characters_in_scene || [];

  for (const sceneChar of charactersInScene) {
    const char = registry.characters?.[sceneChar.key];
    
    if (!char) {
      rules.push(`• ${sceneChar.name}: No registry data. Depict consistently with story context.`);
      continue;
    }

    if (char.has_model && char.visual_source === "user") {
      rules.push(`• ${sceneChar.name} (${sceneChar.prominence}): MUST match uploaded reference image EXACTLY.`);
    } else if (char.visual) {
      const v = char.visual;
      if (char.type === "human") {
        rules.push(`• ${sceneChar.name} (${sceneChar.prominence}): ${v.age_range || ''} ${char.gender || ''}.
  Hair: ${v.hair || 'unspecified'}
  Skin: ${v.skin_tone || 'unspecified'}
  Build: ${v.build || 'unspecified'}
  Clothing: ${v.typical_clothing || 'casual children\'s clothes'}
  Features: ${v.distinctive_features || 'none'}`);
      } else {
        // Pet or animal
        rules.push(`• ${sceneChar.name} (${sceneChar.prominence}): ${char.breed || char.type || 'animal'}.
  Size: ${v.size || 'medium'}
  Colors: ${v.colors || 'unspecified'}
  Features: ${v.distinctive_features || 'none'}`);
      }
    } else {
      rules.push(`• ${sceneChar.name} (${sceneChar.prominence}): ${char.type || 'character'}. Depict consistently.`);
    }
  }

  return rules.join("\n\n");
}

// -------------------------------------------------------
// Helper: Load character model images
// -------------------------------------------------------
async function prepareCharacterModelImages(registry, sceneComposition) {
  const images = [];
  const charactersInScene = sceneComposition.characters_in_scene || [];

  // Sort by prominence and limit
  const sorted = [...charactersInScene].sort((a, b) => {
    const order = { primary: 0, secondary: 1, background: 2 };
    return (order[a.prominence] || 2) - (order[b.prominence] || 2);
  }).slice(0, MAX_CHARACTER_MODELS_PER_SCENE);

  for (const sceneChar of sorted) {
    const char = registry.characters?.[sceneChar.key];
    
    if (char?.has_model && char?.model_url) {
      try {
        const resp = await fetch(char.model_url);
        
        if (!resp.ok) {
          console.error(`Failed to fetch model for ${char.name}: ${resp.status}`);
          continue;
        }
        
        // Detect content type from response or URL
        let contentType = resp.headers.get('content-type') || 'image/png';
        
        // If content-type is generic, try to detect from URL
        if (contentType === 'application/octet-stream' || !contentType.startsWith('image/')) {
          const url = char.model_url.toLowerCase();
          if (url.includes('.jpg') || url.includes('.jpeg')) {
            contentType = 'image/jpeg';
          } else if (url.includes('.webp')) {
            contentType = 'image/webp';
          } else if (url.includes('.gif')) {
            contentType = 'image/gif';
          } else {
            contentType = 'image/png';
          }
        }
        
        const buffer = await resp.arrayBuffer();
        const base64 = Buffer.from(buffer).toString("base64");
        
        images.push({
          key: sceneChar.key,
          name: char.name,
          data_url: `data:${contentType};base64,${base64}`,
        });
        console.log(`📷 Loaded model: ${char.name} (${contentType})`);
      } catch (err) {
        console.error(`Failed to load model for ${char.name}:`, err.message);
      }
    }
  }

  return images;
}

// -------------------------------------------------------
// Helper: Load prop reference images
// -------------------------------------------------------
const MAX_PROP_IMAGES_PER_SCENE = 4;

async function preparePropReferenceImages(registry, sceneComposition) {
  const images = [];
  const propsInScene = sceneComposition.props_in_scene || [];

  // Sort by importance and limit
  const sorted = [...propsInScene].sort((a, b) => {
    const order = { focal: 0, supporting: 1, background: 2 };
    return (order[a.importance] || 2) - (order[b.importance] || 2);
  }).slice(0, MAX_PROP_IMAGES_PER_SCENE);

  for (const sceneProp of sorted) {
    const prop = registry.props?.[sceneProp.key];
    
    // Only include props that have user-uploaded reference images
    if (prop?.reference_image_url && prop?.image_source === "user") {
      try {
        const resp = await fetch(prop.reference_image_url);
        
        if (!resp.ok) {
          console.error(`Failed to fetch prop image for ${prop.name}: ${resp.status}`);
          continue;
        }
        
        // Detect content type from response or URL
        let contentType = resp.headers.get('content-type') || 'image/png';
        
        // If content-type is generic, try to detect from URL
        if (contentType === 'application/octet-stream' || !contentType.startsWith('image/')) {
          const url = prop.reference_image_url.toLowerCase();
          if (url.includes('.jpg') || url.includes('.jpeg')) {
            contentType = 'image/jpeg';
          } else if (url.includes('.webp')) {
            contentType = 'image/webp';
          } else if (url.includes('.gif')) {
            contentType = 'image/gif';
          } else {
            contentType = 'image/png';
          }
        }
        
        const buffer = await resp.arrayBuffer();
        const base64 = Buffer.from(buffer).toString("base64");
        
        images.push({
          key: sceneProp.key,
          name: prop.name,
          importance: sceneProp.importance,
          data_url: `data:${contentType};base64,${base64}`,
        });
        console.log(`📦 Loaded prop reference: ${prop.name} (${contentType})`);
      } catch (err) {
        console.error(`Failed to load prop image for ${prop.name}:`, err.message);
      }
    }
  }

  return images;
}

// -------------------------------------------------------
// Helper: Build prop visual rules for the prompt
// Props with reference images should NOT get text descriptions (avoid conflicts)
// -------------------------------------------------------
function buildPropVisualRules(registry, sceneComposition) {
  const rules = [];
  const propsInScene = sceneComposition.props_in_scene || [];

  for (const sceneProp of propsInScene) {
    const prop = registry.props?.[sceneProp.key];
    
    if (!prop) {
      rules.push(`• ${sceneProp.name}: Depict based on story context.`);
      continue;
    }

    // Props with reference images: ONLY say to match the image, no text description
    if (prop.reference_image_url && prop.image_source === "user") {
      rules.push(`• ${prop.name} (${sceneProp.importance}): Match the uploaded reference image exactly. (See reference images below)`);
    } 
    // Props WITHOUT reference images: include text description
    else if (prop.description || prop.visual) {
      rules.push(`• ${prop.name} (${sceneProp.importance}): ${prop.description || prop.visual}`);
    } else {
      rules.push(`• ${prop.name} (${sceneProp.importance}): Depict consistently with story.`);
    }
  }

  return rules.join("\n");
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
    return res.status(400).json({ error: "Missing projectId, page, or pageText" });
  }

  try {
    // 1. Load project
    const { data: project, error: projectError } = await supabase
      .from("book_projects")
      .select("character_model_url, character_models, illustrations, props_registry")
      .eq("id", projectId)
      .single();

    if (projectError) {
      console.error("Project fetch error:", projectError);
      return res.status(500).json({ error: "Could not load project." });
    }

    // 2. Get unified registry
    let registry;
    if (Array.isArray(project.props_registry) && project.props_registry.length > 0) {
      registry = project.props_registry[0];
    } else if (project.props_registry && typeof project.props_registry === "object") {
      registry = project.props_registry;
    } else {
      registry = { characters: {}, props: {}, environments: {} };
    }

    // Ensure registry has all sections
    if (!registry.characters) registry.characters = {};
    if (!registry.props) registry.props = {};
    if (!registry.environments) registry.environments = {};

    // Handle legacy character_model_url
    if (project.character_model_url && Object.keys(registry.characters).length === 0) {
      registry.characters.protagonist = {
        name: "Child",
        role: "protagonist",
        type: "human",
        has_model: true,
        visual_source: "user",
        model_url: project.character_model_url,
      };
    }

    // Merge character_models into registry if needed
    for (const cm of (project.character_models || [])) {
      if (!registry.characters[cm.character_key]) {
        registry.characters[cm.character_key] = {
          name: cm.name,
          role: cm.role,
          type: cm.role === "pet" ? "animal" : "human",
          has_model: true,
          visual_source: "user",
          model_url: cm.model_url,
        };
      } else if (cm.model_url) {
        registry.characters[cm.character_key].has_model = true;
        registry.characters[cm.character_key].model_url = cm.model_url;
        registry.characters[cm.character_key].visual_source = "user";
      }
    }

    const existingIllustrations = Array.isArray(project.illustrations) ? project.illustrations : [];
    const existingForPage = existingIllustrations.find(i => Number(i.page) === Number(page));
    const previousRevisions = existingForPage?.revisions || 0;
    const existingHistory = existingForPage?.revision_history || [];
    const isRegen = !!isRegeneration;

    // 3. Analyze scene composition (now includes props)
    console.log("=== ANALYZING SCENE ===");
    const sceneComposition = await analyzeSceneComposition(
      pageText, registry, project.character_models, allPages, page
    );
    console.log("Characters:", sceneComposition.characters_in_scene?.map(c => c.name));
    console.log("Props:", sceneComposition.props_in_scene?.map(p => p.name));

    // 4. Prepare character images
    const characterImages = await prepareCharacterModelImages(registry, sceneComposition);

    // 4b. Prepare prop reference images
    const propImages = await preparePropReferenceImages(registry, sceneComposition);

    // 5. Extract location and new props
    const [detectedLocation, newProps] = await Promise.all([
      extractLocationUsingAI(pageText),
      extractPropsUsingAI(pageText, registry.props),
    ]);

    // 6. Build the prompt
    const characterRules = buildCharacterVisualRules(registry, sceneComposition);
    const propRules = buildPropVisualRules(registry, sceneComposition);
    
    // Combine all reference images (characters first, then props)
    const allReferenceImages = [...characterImages, ...propImages];
    
    const prompt = `
You MUST generate this illustration using the image_generation tool.
Return ONLY a tool call.

=== SCENE INFO ===
Page text: "${pageText}"
Location: ${detectedLocation || "infer from context"}
Shot type: ${sceneComposition.shot_type}
Focal point: ${sceneComposition.focal_point}

=== CHARACTERS IN SCENE ===
${sceneComposition.characters_in_scene?.map(c => `${c.name} (${c.prominence}): ${c.reason || ''}`).join("\n") || "None specified"}

=== CHARACTER VISUAL RULES ===
${characterRules}

=== PROPS IN SCENE ===
${sceneComposition.props_in_scene?.map(p => `${p.name} (${p.importance}): ${p.reason || ''}`).join("\n") || "None specified"}

=== PROP VISUAL RULES ===
${propRules || "Depict props consistently with story context."}

${allReferenceImages.length > 0 ? `
=== REFERENCE IMAGES PROVIDED ===
${allReferenceImages.map((img, i) => `Image ${i + 1}: ${img.name}${img.importance ? ` (prop - ${img.importance})` : ' (character)'}`).join("\n")}
Characters and props with reference images MUST match them EXACTLY. Do not deviate from the reference images.
` : ''}

=== ENVIRONMENT STYLE ===
${registry.environments?.[detectedLocation?.toLowerCase()]?.style || "Child-friendly, bright, simple"}

=== STYLE REQUIREMENTS ===
• Soft pastel children's-book illustration
• Clean rounded outlines, gentle shading
• Warm daylight colors (5000-5500K)
• Simple uncluttered backgrounds
• Full-body characters, never awkwardly cropped
• No text in image
• 1024×1024 PNG

=== STRICT RULES ===
• Match reference images EXACTLY for characters and props with uploaded images
• Keep characters visually consistent with their descriptions
• Include ALL characters listed in "Characters in Scene"
• Include ALL props listed in "Props in Scene"
• Props should match their reference images or registry descriptions
• Environments should be consistent across pages

Generate the illustration now.
`;

    // 7. Build input with images (characters + props)
    const inputContent = [{ type: "input_text", text: prompt }];
    for (const img of allReferenceImages) {
      // Log the data URL prefix to debug content type issues
      const prefix = img.data_url.substring(0, 50);
      const imgType = img.importance ? 'prop' : 'character';
      console.log(`Adding ${imgType} image for ${img.name}: ${prefix}...`);
      inputContent.push({ type: "input_image", image_url: img.data_url });
    }

    // 8. Generate image
    const response = await client.responses.create({
      model: "gpt-4.1", 
      input: [{ role: "user", content: inputContent }],
      tools: [{
        type: "image_generation",
        model: "gpt-image-1-mini", //CHANGED TO TEST IF CHEAPER MODEL IS STILL GOOD LOOKING. WAS: gpt-image-1. Consider changing to gpt-image-1.5 if visual fidelity or context isn't working right on image-1-mini
        size: "1024x1024",
        quality: "low",  // Change to "high" for production
        background: "opaque",
        output_format: "png",
        output_compression: 100,
        moderation: "auto",
      }],
    });

    const imgCall = response.output.find(o => o.type === "image_generation_call");
    if (!imgCall?.result) {
      return res.status(500).json({ error: "Model produced no image." });
    }

    const sceneBuffer = Buffer.from(imgCall.result, "base64");

    // 9. Upload image to R2
    const newRevisions = isRegen ? previousRevisions + 1 : 0;
    const filePath = `illustrations/${projectId}-page-${page}-r${newRevisions}.png`;

    const uploadResult = await uploadToR2(filePath, sceneBuffer, "image/png");

    if (!uploadResult.success) {
      console.error("R2 upload error:", uploadResult.error);
      return res.status(500).json({ error: "Failed to upload illustration." });
    }

    const imageUrl = uploadResult.publicUrl;

    // 10. Update registry with new props/environments
    if (detectedLocation) {
      const envKey = detectedLocation.toLowerCase().trim();
      if (!registry.environments[envKey]) {
        registry.environments[envKey] = {
          name: detectedLocation,
          style: `Consistent ${detectedLocation} setting`,
          first_seen_page: page,
        };
      }
    }

    for (const p of newProps) {
      const key = (p.name || "").toLowerCase().trim().replace(/\s+/g, "_");
      if (key && !registry.props[key] && !registry.characters[key]) {
        registry.props[key] = {
          name: p.name,
          description: p.description,
          first_seen_page: page,
        };
      }
    }

    await supabase
      .from("book_projects")
      .update({ props_registry: [registry] })
      .eq("id", projectId);

    // 11. Update illustrations (re-fetch to avoid race conditions with parallel generation)
    const { data: currentProject } = await supabase
      .from("book_projects")
      .select("illustrations")
      .eq("id", projectId)
      .single();
    
    const currentIllustrations = Array.isArray(currentProject?.illustrations) 
      ? currentProject.illustrations 
      : [];
    
    // Build revision history
    let newHistory = [...existingHistory];
    if (isRegen && existingForPage?.image_url) {
      newHistory.push({
        revision: previousRevisions,
        image_url: existingForPage.image_url,
        created_at: existingForPage.last_updated || new Date().toISOString(),
      });
      if (newHistory.length > 2) newHistory = newHistory.slice(-2);
    }

    // Filter out old entry for this page and add new one
    const updatedIllustrations = currentIllustrations.filter(i => Number(i.page) !== Number(page));
    updatedIllustrations.push({
      page,
      image_url: imageUrl,
      revisions: newRevisions,
      last_updated: new Date().toISOString(),
      revision_history: newHistory,
      scene_composition: sceneComposition,
    });

    const { error: updateError } = await supabase
      .from("book_projects")
      .update({ illustrations: updatedIllustrations })
      .eq("id", projectId);
    
    if (updateError) {
      console.error("Failed to save illustration:", updateError);
      // Don't fail the request - image was generated and uploaded successfully
    }

    // 12. Done
    return res.status(200).json({
      page,
      image_url: imageUrl,
      revisions: newRevisions,
      revision_history: newHistory,
      scene_composition: sceneComposition,
    });

  } catch (err) {
    console.error("Generation error:", err?.message, err?.stack);
    return res.status(500).json({
      error: "Failed to generate illustration.",
      details: err?.message,
    });
  }
}

module.exports = handler;
module.exports.config = {
  api: { bodyParser: { sizeLimit: "10mb" } },
};