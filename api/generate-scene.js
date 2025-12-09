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

    // Ensure registry exists
    const registry = project.props_registry || {
      characters: {},
      props: {},
      environments: {},
      notes: "",
    };

    console.log("=== REGISTRY — BEFORE UPDATE ===");
    console.log(registry);
    console.log("================================");

    // 2. Load character model as base64
    const modelResp = await fetch(project.character_model_url);
    const arrayBuffer = await modelResp.arrayBuffer();
    const base64Image = Buffer.from(arrayBuffer).toString("base64");
    const modelDataUrl = `data:image/png;base64,${base64Image}`;

    // 3. Extract props + location for this page
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

    // 4. Build the generation prompt (no Jett references)
    const environmentsJson = JSON.stringify(
      registry.environments || {},
      null,
      2
    );
    const propsJson = JSON.stringify(registry.props || {}, null, 2);

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
• Use previously seen props + environments  
• Maintain visual continuity  

PAGE TEXT:
"${pageText}"

LOCATION DETECTED:
${detectedLocation || "None explicitly detected — choose a simple, neutral setting that fits the action."}

ENVIRONMENT REGISTRY:
${environmentsJson}

PROP REGISTRY:
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
• Props must match prior pages if already introduced  
• Environment must be consistent with the detected or previously used location  
• Use soft, warm daylight tones  
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

    // 8. Persist registry to Supabase
    const { error: registryUpdateError } = await supabase
      .from("book_projects")
      .update({ props_registry: [updatedRegistry] })   // <-- FIXED HERE
      .eq("id", projectId);

    if (registryUpdateError) {
      console.error("REGISTRY UPDATE ERROR:", registryUpdateError);
    } else {
      console.log("REGISTRY UPDATE SUCCESS");
    }
    

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
