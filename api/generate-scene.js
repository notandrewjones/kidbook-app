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

Return ONLY JSON:
{
  "location": "..."
}

If no location is mentioned, infer a simple child-friendly place.

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
// Main handler
// -------------------------------------------------------
async function handler(req, res) {
  if (req.method !== "POST")
    return res.status(405).json({ error: "Method not allowed" });

  const { projectId, page, pageText, isRegeneration } = req.body;

  if (!projectId || !page || !pageText)
    return res.status(400).json({ error: "Missing projectId, page, or pageText" });

  try {
    // 1. Load project
    const { data: project, error: projectError } = await supabase
      .from("book_projects")
      .select("character_model_url, illustrations, props_registry, context_registry")
      .eq("id", projectId)
      .single();

    console.log("=== PROJECT LOADED ===");
    console.log(project);
    console.log("======================");

    if (projectError)
      return res.status(500).json({ error: "Could not load project." });

    if (!project.character_model_url)
      return res.status(400).json({ error: "Character model missing." });

    // ---------------------------------------------------
    //  REGENERATION LOGIC — enforce maximum 2 revisions
    // ---------------------------------------------------
    let currentIllustrations = project.illustrations || [];
    let existing = currentIllustrations.find((i) => i.page === page);
    let revisions = existing?.revisions || 0;

    if (isRegeneration) {
      console.log("=== REGENERATION REQUEST DETECTED ===");
      console.log("Current revisions:", revisions);

      if (revisions >= 2) {
        console.log("⚠ Max regeneration limit reached.");
        return res.status(400).json({
          error: "Max regeneration limit reached for this page.",
        });
      }

      revisions += 1;
    }

    // ---------------------------------------------------
    // Normalize props registry
    // ---------------------------------------------------
    let registry;
    if (Array.isArray(project.props_registry) && project.props_registry.length > 0) {
      registry = project.props_registry[0];
    } else if (project.props_registry && typeof project.props_registry === "object") {
      registry = project.props_registry;
    } else {
      registry = { characters: {}, props: {}, environments: {}, notes: "" };
    }

    const contextRegistry = project.context_registry || {};

    console.log("=== REGISTRY BEFORE UPDATE ===");
    console.log(registry);

    // ---------------------------------------------------
    // Prepare model image
    // ---------------------------------------------------
    const modelResp = await fetch(project.character_model_url);
    const arrayBuffer = await modelResp.arrayBuffer();
    const modelB64 = Buffer.from(arrayBuffer).toString("base64");

    // ---------------------------------------------------
    // Extract props + location BEFORE generation
    // ---------------------------------------------------
    const [aiProps, detectedLocation] = await Promise.all([
      extractPropsUsingAI(pageText),
      extractLocationUsingAI(pageText),
    ]);

    // ---------------------------------------------------
    // Build prompt (no change required)
    // ---------------------------------------------------
    const prompt = `
You MUST generate this illustration using the image_generation tool.
... (unchanged prompt body)
`;

    // ---------------------------------------------------
    // Call GPT for the image
    // ---------------------------------------------------
    const response = await client.responses.create({
      model: "gpt-4.1",
      input: [
        {
          role: "user",
          content: [
            { type: "input_text", text: prompt },
            { type: "input_image", image_url: `data:image/png;base64,${modelB64}` },
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
        },
      ],
    });

    const imgCall = response.output.find((o) => o.type === "image_generation_call");

    if (!imgCall?.result)
      return res.status(500).json({ error: "No image returned." });

    const sceneBuffer = Buffer.from(imgCall.result, "base64");

    // ---------------------------------------------------
    // UPLOAD IMAGE
    // Regenerations overwrite the same filename for now.
    // ---------------------------------------------------
    const filePath = `illustrations/${projectId}-page-${page}.png`;

    const { error: uploadError } = await supabase.storage
      .from("book_images")
      .upload(filePath, sceneBuffer, {
        contentType: "image/png",
        upsert: true,
      });

    if (uploadError) {
      console.error(uploadError);
      return res.status(500).json({ error: "Upload failed." });
    }

    const { data: urlData } = supabase.storage
      .from("book_images")
      .getPublicUrl(filePath);

    // ---------------------------------------------------
    // UPDATE CONTINUITY REGISTRY
    // ---------------------------------------------------
    const updatedRegistry = { ...registry };
    updatedRegistry.props = updatedRegistry.props || {};
    updatedRegistry.environments = updatedRegistry.environments || {};

    if (detectedLocation) {
      const key = detectedLocation.toLowerCase();
      updatedRegistry.environments[key] ??= {
        style: `Consistent depiction of ${key}`,
        first_seen_page: page,
      };
    }

    aiProps.forEach((p) => {
      const key = p.name.toLowerCase();
      updatedRegistry.props[key] ??= {
        context: p.context,
        first_seen_page: page,
      };
    });

    // Save updated registry
    await supabase
      .from("book_projects")
      .update({ props_registry: [updatedRegistry] })
      .eq("id", projectId);

    // ---------------------------------------------------
    // UPDATE ILLUSTRATIONS METADATA with revision count
    // ---------------------------------------------------
    const newIllustrationEntry = {
      page,
      image_url: urlData.publicUrl,
      revisions,
    };

    // Remove old entry for same page if regenerating
    const withoutThisPage = currentIllustrations.filter((i) => i.page !== page);

    const updatedIllustrations = [...withoutThisPage, newIllustrationEntry];

    await supabase
      .from("book_projects")
      .update({ illustrations: updatedIllustrations })
      .eq("id", projectId);

    console.log("=== ILLUSTRATION UPDATE SUCCESS ===");

    return res.status(200).json({
      page,
      image_url: urlData.publicUrl,
      revisions,
      props_registry: updatedRegistry,
      context_registry: contextRegistry,
    });
  } catch (err) {
    console.error("Illustration generation error:", err);
    return res.status(500).json({ error: "Failed to generate illustration." });
  }
}

module.exports = handler;
module.exports.config = {
  api: { bodyParser: { sizeLimit: "10mb" } },
};
