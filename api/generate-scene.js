// api/generate-scene.js (CommonJS)

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
// Helper: Canonical continuity descriptions (props + envs)
// -------------------------------------------------------
async function buildCanonicalRegistryUpdates(pageText, registry, aiProps, detectedLocation, page) {
  console.log("=== CANONICAL REGISTRY — INPUTS ===");
  console.log("Current registry:", JSON.stringify(registry, null, 2));
  console.log("AI props:", JSON.stringify(aiProps, null, 2));
  console.log("Detected location:", detectedLocation);
  console.log("Page:", page);
  console.log("===================================");

  const propsPayload = aiProps.map((p) => ({
    name: p.name || "",
    context: p.context || "",
  }));

  const currentRegistrySnippet = {
    props: registry.props || {},
    environments: registry.environments || {},
    characters: registry.characters || {},
  };

  const extraction = await client.responses.create({
    model: "gpt-4.1-mini",
    input: `
You are maintaining a continuity registry for a children's picture book.

Your job is to create or refine concise, visual descriptions for any PROPS
and ENVIRONMENTS that appear on THIS PAGE.

You are NOT allowed to invent new main characters or ignore uploaded character models.
Focus only on props (objects) and environments (locations / settings).

PAGE TEXT:
"${pageText}"

NEW PROPS ON THIS PAGE:
${JSON.stringify(propsPayload, null, 2)}

DETECTED LOCATION FOR THIS PAGE:
${detectedLocation || "None — infer a simple, neutral setting that matches the action."}

CURRENT REGISTRY (for reference only):
${JSON.stringify(currentRegistrySnippet, null, 2)}

Return ONLY JSON in this exact format:
{
  "props": {
    "slug-key": {
      "name": "display name for the prop",
      "description": "clear, visual description so an illustrator can keep this prop consistent",
      "first_seen_page": 1
    }
  },
  "environments": {
    "slug-key": {
      "name": "display name for the environment",
      "description": "clear, visual description of the location, layout, and mood for consistency",
      "first_seen_page": 1
    }
  }
}

Rules:
- "slug-key" should be a lowercase slug version of the prop or location name (e.g., "blue hat" -> "blue-hat").
- Only include props and environments that appear on THIS PAGE.
- If a prop or environment already exists in CURRENT REGISTRY with a first_seen_page,
  KEEP the existing first_seen_page if you re-include it.
- Descriptions must be specific enough for visual continuity but still concise.
`,
  });

  const raw =
    extraction.output_text ??
    extraction.output?.[0]?.content?.[0]?.text;

  console.log("=== CANONICAL REGISTRY — RAW OUTPUT ===");
  console.log(raw);
  console.log("=======================================");

  if (!raw) {
    return { props: {}, environments: {} };
  }

  try {
    const cleaned = raw.replace(/```json|```/g, "").trim();
    const obj = JSON.parse(cleaned);

    console.log("=== CANONICAL REGISTRY — PARSED JSON ===");
    console.log(JSON.stringify(obj, null, 2));
    console.log("========================================");

    return {
      props: obj.props || {},
      environments: obj.environments || {},
    };
  } catch (err) {
    console.error("CANONICAL REGISTRY PARSE ERROR:", err);
    return { props: {}, environments: {} };
  }
}

// -------------------------------------------------------
// Main handler (CommonJS export)
// -------------------------------------------------------
async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { projectId, page, pageText } = req.body;

  if (!projectId || !page || !pageText) {
    return res
      .status(400)
      .json({ error: "Missing projectId, page, or pageText" });
  }

  try {
    // 1. Load project
    const { data: project, error: projectError } = await supabase
      .from("book_projects")
      .select("character_model_url, illustrations, props_registry")
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

    // Ensure flat registry object exists
    const registry = project.props_registry || {
      characters: {},
      props: {},
      environments: {},
      notes: "",
    };

    console.log("=== REGISTRY — BEFORE UPDATE ===");
    console.log(JSON.stringify(registry, null, 2));
    console.log("================================");

    // 2. Extract props + location for this page
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

    // 3. Build canonical continuity descriptions and merge into registry
    let updatedRegistry = {
      characters: registry.characters || {},
      props: registry.props || {},
      environments: registry.environments || {},
      notes: registry.notes || "",
    };

    try {
      const canonicalUpdates = await buildCanonicalRegistryUpdates(
        pageText,
        updatedRegistry,
        aiProps,
        detectedLocation,
        page
      );

      const newProps = canonicalUpdates.props || {};
      const newEnvs = canonicalUpdates.environments || {};

      // Merge props
      updatedRegistry.props = updatedRegistry.props || {};
      for (const [slug, value] of Object.entries(newProps)) {
        const existing = updatedRegistry.props[slug] || {};
        const firstSeen =
          existing.first_seen_page ??
          value.first_seen_page ??
          page;

        updatedRegistry.props[slug] = {
          ...existing,
          ...value,
          first_seen_page: firstSeen,
        };
      }

      // Merge environments
      updatedRegistry.environments = updatedRegistry.environments || {};
      for (const [slug, value] of Object.entries(newEnvs)) {
        const existing = updatedRegistry.environments[slug] || {};
        const firstSeen =
          existing.first_seen_page ??
          value.first_seen_page ??
          page;

        updatedRegistry.environments[slug] = {
          ...existing,
          ...value,
          first_seen_page: firstSeen,
        };
      }
    } catch (err) {
      console.error("CANONICAL MERGE ERROR, falling back to simple entries:", err);

      // Fallback: simple environment + props if canonical step fails
      updatedRegistry.props = updatedRegistry.props || {};
      updatedRegistry.environments = updatedRegistry.environments || {};

      if (detectedLocation) {
        const envKey = detectedLocation.toLowerCase().trim();
        if (!updatedRegistry.environments[envKey]) {
          updatedRegistry.environments[envKey] = {
            name: detectedLocation,
            description: `Consistent depiction of a ${detectedLocation}`,
            first_seen_page: page,
          };
        }
      }

      for (const p of aiProps) {
        const key = (p.name || "").toLowerCase().trim();
        if (!key) continue;

        if (!updatedRegistry.props[key]) {
          updatedRegistry.props[key] = {
            name: p.name || key,
            description: p.context || "Appears in this scene",
            first_seen_page: page,
          };
        }
      }
    }

    console.log("=== REGISTRY — AFTER CANONICAL UPDATE ===");
    console.log(JSON.stringify(updatedRegistry, null, 2));
    console.log("=========================================");

    // 4. Persist registry to Supabase (flat JSONB, not array)
    const { error: registryUpdateError } = await supabase
      .from("book_projects")
      .update({ props_registry: updatedRegistry })
      .eq("id", projectId);

    if (registryUpdateError) {
      console.error("REGISTRY UPDATE ERROR:", registryUpdateError);
    } else {
      console.log("REGISTRY UPDATE SUCCESS");
    }

    // 5. Load character model as base64 (after registry is updated)
    const modelResp = await fetch(project.character_model_url);
    const arrayBuffer = await modelResp.arrayBuffer();
    const base64Image = Buffer.from(arrayBuffer).toString("base64");
    const modelDataUrl = `data:image/png;base64,${base64Image}`;

    // 6. Build the generation prompt using UPDATED registry
    const environmentsJson = JSON.stringify(
      updatedRegistry.environments || {},
      null,
      2
    );
    const propsJson = JSON.stringify(updatedRegistry.props || {}, null, 2);

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
• Use the continuity REGISTRY to keep props and environments visually consistent  
• Maintain a simple, kid-friendly composition  

PAGE TEXT:
"${pageText}"

LOCATION DETECTED FOR THIS PAGE:
${detectedLocation || "None explicitly detected — choose a simple, neutral setting that fits the action."}

ENVIRONMENT REGISTRY (canonical descriptions):
${environmentsJson}

PROP REGISTRY (canonical descriptions):
${propsJson}

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
• Props must match the canonical descriptions in the registry  
• Environment must match the canonical descriptions in the registry  
• Use soft, warm daylight tones  

Now call the image_generation tool.
`;

    console.log("=== FINAL GENERATION PROMPT ===");
    console.log(prompt);
    console.log("================================");

    // 7. Call GPT-4.1 with image_generation tool (tool-call enforced)
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
          quality: "high",
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

    // 8. Upload scene image to Supabase
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

    // 9. Save illustration metadata
    const updatedIllustrations = [
      ...(project.illustrations || []),
      { page, image_url: urlData.publicUrl },
    ];

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
    });
  } catch (err) {
    console.error("Illustration generation error:", err);
    return res
      .status(500)
      .json({ error: "Failed to generate illustration." });
  }
}

// Export handler + config in CommonJS
module.exports = handler;
module.exports.config = {
  api: { bodyParser: { sizeLimit: "10mb" } },
};
