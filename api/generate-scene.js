// api/generate-scene.js (CommonJS, with regeneration + registries)

const OpenAI = require("openai");
const { createClient } = require("@supabase/supabase-js");

const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// -------------------------------------------------------
// Helper: Extract props (objects) from page text via GPT
// -------------------------------------------------------
async function extractPropsUsingAI(pageText) {
  console.log("=== PROP EXTRACTION — INPUT TEXT ===");
  console.log(pageText);
  console.log("====================================");

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

  console.log("=== PROP EXTRACTION — RAW AI OUTPUT ===");
  console.log(raw);
  console.log("=======================================");

  if (!raw) return [];

  try {
    const cleaned = raw.replace(/```json|```/g, "").trim();
    const obj = JSON.parse(cleaned);

    console.log("=== PROP EXTRACTION — PARSED JSON ===");
    console.log(obj);
    console.log("====================================");

    const props = obj.props || [];
    console.log("=== AI PROPS (final parsed) ===");
    console.log(props);
    console.log("================================");

    return props;
  } catch (err) {
    console.error("PROP EXTRACTION PARSE ERROR:", err);
    return [];
  }
}

// -------------------------------------------------------
// Helper: Extract location/setting from page text via GPT
// -------------------------------------------------------
async function extractLocationUsingAI(pageText) {
  console.log("=== LOCATION EXTRACTION — INPUT TEXT ===");
  console.log(pageText);
  console.log("========================================");

  const extraction = await client.responses.create({
    model: "gpt-4.1-mini",
    input: `
Extract the primary LOCATION or SETTING described or implied in this page text.
Examples: "park", "bedroom", "zoo", "kitchen", "forest", "beach", "school", "backyard", "yard", "home".

Return ONLY JSON:
{
  "location": "..."
}

If no location is directly mentioned, infer a simple, neutral setting
based on the child's activity (e.g., "backyard", "playground", "bedroom").

Text: "${pageText}"
`,
  });

  const raw =
    extraction.output_text ??
    extraction.output?.[0]?.content?.[0]?.text;

  console.log("=== LOCATION EXTRACTION — RAW AI OUTPUT ===");
  console.log(raw);
  console.log("==========================================");

  if (!raw) return null;

  try {
    const cleaned = raw.replace(/```json|```/g, "").trim();
    const obj = JSON.parse(cleaned);

    console.log("=== LOCATION EXTRACTION — PARSED JSON ===");
    console.log(obj);
    console.log("=========================================");

    return obj.location || null;
  } catch (err) {
    console.error("LOCATION EXTRACTION PARSE ERROR:", err);
    return null;
  }
}

// -------------------------------------------------------
// Main handler (CommonJS export)
// -------------------------------------------------------
async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { projectId, page, pageText, isRegeneration } = req.body || {};

  if (!projectId || !page || !pageText) {
    return res
      .status(400)
      .json({ error: "Missing projectId, page, or pageText" });
  }

  try {
    // 1. Load project (now includes context_registry & illustrations)
    const { data: project, error: projectError } = await supabase
      .from("book_projects")
      .select(
        "character_model_url, illustrations, props_registry, context_registry"
      )
      .eq("id", projectId)
      .single();

    console.log("=== PROJECT LOADED ===");
    console.log(project);
    console.log("======================");

    if (projectError) {
      console.error("Project fetch error:", projectError);
      return res.status(500).json({ error: "Could not load project." });
    }

    if (!project || !project.character_model_url) {
      return res.status(400).json({ error: "Character model not found." });
    }

    // Normalize props_registry (may be null, an object, or an array)
    let registry;
    if (Array.isArray(project.props_registry) && project.props_registry.length > 0) {
      registry = project.props_registry[0];
    } else if (
      project.props_registry &&
      typeof project.props_registry === "object"
    ) {
      registry = project.props_registry;
    } else {
      registry = {
        characters: {},
        props: {},
        environments: {},
        notes: "",
      };
    }

	const characterRegistry = registry.characters || {};
    const contextRegistry = project.context_registry || {};
	
	// Identify protagonist (child)
const protagonistName =
  contextRegistry?.child?.name?.toLowerCase?.() || null;

const protagonistKey = Object.keys(characterRegistry).find(
  key =>
    characterRegistry[key]?.role === "protagonist" ||
    characterRegistry[key]?.name?.toLowerCase?.() === protagonistName
);

const protagonist =
  protagonistKey ? characterRegistry[protagonistKey] : null;

	
    const existingIllustrations = Array.isArray(project.illustrations)
      ? project.illustrations
      : [];

    // Find existing illustration for this page (for revision counting)
    const existingForPage = existingIllustrations.find(
      (i) => Number(i.page) === Number(page)
    );
    const previousRevisions =
      existingForPage && typeof existingForPage.revisions === "number"
        ? existingForPage.revisions
        : 0;

    const isRegen = !!isRegeneration;

    console.log("=== REGENERATION FLAG ===");
    console.log({ isRegen, previousRevisions });
    console.log("=========================");

    // NOTE: frontend is enforcing max 2 regenerations,
    // but we could hard-stop here too if desired:
    // if (isRegen && previousRevisions >= 2) { ... }

    console.log("=== REGISTRY BEFORE UPDATE ===");
    console.log(registry);
    console.log("================================");
    console.log("=== CONTEXT REGISTRY (WORLD FACTS) ===");
    console.log(contextRegistry);
    console.log("======================================");

    // 2. Load character model as base64
    const modelResp = await fetch(project.character_model_url);
    const arrayBuffer = await modelResp.arrayBuffer();
    const base64Image = Buffer.from(arrayBuffer).toString("base64");
    const modelDataUrl = `data:image/png;base64,${base64Image}`;

    // 3. Extract props + location for this page (BEFORE generation)
    const [aiProps, detectedLocation] = await Promise.all([
      extractPropsUsingAI(pageText),
      extractLocationUsingAI(pageText),
    ]);

    console.log("=== AI PROPS (final parsed) ===");
    console.log(aiProps);
    console.log("================================");
    console.log("=== DETECTED LOCATION ===");
    console.log(detectedLocation);
    console.log("===========================");

    // 4. Build the generation prompt with context + registry
    const environmentsJson = JSON.stringify(
      registry.environments || {},
      null,
      2
    );
    const propsJson = JSON.stringify(registry.props || {}, null, 2);
    const contextJson = JSON.stringify(contextRegistry || {}, null, 2);
	
	const characterVisualRules = Object.entries(characterRegistry)
  .map(([key, char]) => {
    if (char.role === "protagonist") {
      if (char.visual_source === "user") {
        return `• ${char.name} (protagonist): MUST match the uploaded character model exactly. Do NOT change appearance.`;
      }

      return `• ${char.name} (protagonist): Visual appearance is intentionally unspecified. Keep depiction neutral and child-generic.`;
    }

    return `• ${char.name} (${char.role}): Must be visually consistent across all pages.
      Species: ${char.visual?.species || "unknown"}
      Breed: ${char.visual?.breed || "unspecified"}
      Size: ${char.visual?.size || "unspecified"}
      Colors: ${char.visual?.colors || "unspecified"}
      Distinctive features: ${char.visual?.distinctive_features || "none"}`;
  })
  .join("\n");


    const prompt = `
You MUST generate this illustration using the image_generation tool.
DO NOT respond with normal text.

Return ONLY a tool call, using this exact structure:

<tool>
{
  "prompt": "A complete description of the children's book scene to generate"
}
</tool>

Your task:
• Read the PAGE TEXT  
• If PAGE TEXT contains "Artist revision notes:", treat those as strict revision instructions  
• Use persistent world facts from CONTEXT REGISTRY  
• Use previously seen props + environments  
• Maintain visual continuity  

PAGE TEXT:
"${pageText}"

LOCATION DETECTED:
${detectedLocation || "None explicitly detected — choose a simple, neutral setting that fits the action."}

CONTEXT REGISTRY (child, pets, people, locations, items, notes):
${contextJson}

ENVIRONMENT REGISTRY (for location continuity across pages):
${environmentsJson}

PROP REGISTRY (for prop continuity across pages):
${propsJson}

CHARACTER VISUAL RULES:
${characterVisualRules}

STRICT CHARACTER RULES:
• Do NOT invent new characters
• Do NOT change a character’s appearance once defined
• The protagonist’s appearance must NEVER be inferred or redesigned
• Pets must remain visually identical across all pages


CONTEXT CONTINUITY RULES:
• If the context registry defines a specific pet, person, place, or item
  (e.g. a "beagle named Cricket" as the child's dog),
  and the page text refers more generically (e.g. "her dog", "the dog"),
  you MUST visually depict the specific entity from the context registry
  (correct type, name, and any described traits).
• Do NOT rename or swap these entities for something else.
• When in doubt, prefer the more specific information in the context registry.

PROP CONTINUITY RULES:
• If a prop name matches an entry in the prop registry, keep it visually consistent
  (same general shape, type, and purpose) across pages.
• New props should be simple, recognizable, and easy to reuse.

LOCATION CONTINUITY RULES:
• If the detected location matches an environment in the environment registry,
  keep the overall look/feel consistent (colors, general layout, mood).
• New locations should be simple, child-friendly, and reusable.

STYLE REQUIREMENTS:
• Soft pastel children’s-book illustration style  
• Clean rounded outlines  
• Gentle shading, simple shapes  
• Warm daylight color palette (around 5000–5500K)  
• Backgrounds simple and readable, not cluttered  
• Character must match the provided model exactly — same proportions, colors, clothing  
• Full-body character, never cropped  
• No text inside the image  
• Output must be a 1024×1024 PNG  

ILLUSTRATION RULES:
• Character is the visual focus of the scene  
• Props must match prior pages if already introduced  
• Environment must be consistent with the detected or previously used location  
• Always respect specific details in the CONTEXT REGISTRY (names, breeds, relationships)  
Now call the image_generation tool.
`;

    console.log("=== FINAL GENERATION PROMPT ===");
    console.log(prompt);
    console.log("================================");

    // 5. Call GPT-4.1 with image_generation tool
    const response = await client.responses.create({
      model: "gpt-4.1",
      input: [
        {
          role: "user",
          content: [
            { type: "input_text", text: prompt },
            { type: "input_image", image_url: modelDataUrl },
          ],
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

    console.log("=== RAW IMAGE GENERATION RESPONSE ===");
    console.log(JSON.stringify(response.output, null, 2));
    console.log("======================================");

    const imgCall = response.output.find(
      (o) => o.type === "image_generation_call"
    );

    console.log("=== IMAGE GENERATION CALL SELECTED ===");
    console.log(imgCall);
    console.log("======================================");

    if (!imgCall || !imgCall.result) {
      console.log("=== ERROR: NO IMAGE GENERATED ===");
      console.log(response);
      console.log("=================================");
      return res.status(500).json({ error: "Model produced no scene." });
    }

    const base64Scene = imgCall.result;
    const sceneBuffer = Buffer.from(base64Scene, "base64");

    // 6. Upload scene image to Supabase
    const filePath = `illustrations/${projectId}-page-${page}.png`;

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

    // 7. Update continuity registry (props + environments) in memory
    const updatedRegistry = { ...registry };

    if (!updatedRegistry.props) updatedRegistry.props = {};
    if (!updatedRegistry.environments) updatedRegistry.environments = {};

    // Environments
    if (detectedLocation) {
      const envKey = detectedLocation.toLowerCase().trim();
      if (!updatedRegistry.environments[envKey]) {
        updatedRegistry.environments[envKey] = {
          style: `Consistent depiction of a ${envKey}`,
          first_seen_page: page,
        };
      }
    }

    // Props
    for (const p of aiProps) {
  const key = (p.name || "").toLowerCase().trim();
  if (!key) continue;

  // Never treat characters as props
  if (characterRegistry[key]) continue;

  if (!updatedRegistry.props[key]) {
    updatedRegistry.props[key] = {
      context: p.context || "Appears in this scene",
      first_seen_page: page,
    };
  }
}


    console.log("=== REGISTRY — AFTER UPDATE ===");
    console.log(updatedRegistry);
    console.log("================================");

    // 8. Persist registry to Supabase (as JSON array, per your schema)
    const { error: registryUpdateError } = await supabase
      .from("book_projects")
      .update({ props_registry: [updatedRegistry] })
      .eq("id", projectId);

    if (registryUpdateError) {
      console.error("REGISTRY UPDATE ERROR:", registryUpdateError);
    } else {
      console.log("REGISTRY UPDATE SUCCESS");
    }

    // 9. Save illustration metadata — overwrite existing entry for this page
    let updatedIllustrations = [...existingIllustrations];

    // Remove any prior entries for this page to avoid duplicates
    updatedIllustrations = updatedIllustrations.filter(
      (i) => Number(i.page) !== Number(page)
    );

    const newRevisions = isRegen ? previousRevisions + 1 : previousRevisions;

    updatedIllustrations.push({
      page,
      image_url: urlData.publicUrl,
      revisions: newRevisions,
      last_updated: new Date().toISOString(),
    });

    const { error: illusUpdateError } = await supabase
      .from("book_projects")
      .update({ illustrations: updatedIllustrations })
      .eq("id", projectId);

    if (illusUpdateError) {
      console.error("ILLUSTRATIONS UPDATE ERROR:", illusUpdateError);
    } else {
      console.log("ILLUSTRATIONS UPDATE SUCCESS");
    }

    // 10. Done
    return res.status(200).json({
      page,
      image_url: urlData.publicUrl,
      props_registry: updatedRegistry,
      context_registry: contextRegistry,
      revisions: newRevisions,
    });
  } catch (err) {
    console.error("❌ Illustration generation error:");
    console.error("Message:", err?.message);
    console.error("Stack:", err?.stack);
    try {
      console.error("Full error object:", JSON.stringify(err, null, 2));
    } catch (jsonErr) {
      console.error("Could not JSON.stringify error object:", jsonErr);
    }

    return res.status(500).json({
      error: "Failed to generate illustration.",
      details: err?.message || String(err),
    });
  }
}

// Export handler + config in CommonJS
module.exports = handler;
module.exports.config = {
  api: { bodyParser: { sizeLimit: "10mb" } },
};
