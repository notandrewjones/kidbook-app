const OpenAI = require("openai");
const { createClient } = require("@supabase/supabase-js");

// Allow large request bodies (for images)
module.exports.config = {
  api: { bodyParser: { sizeLimit: "10mb" } }
};

const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// -------------------------------------------------------
// Helper: Extract props (objects) using GPT
// -------------------------------------------------------
async function extractPropsUsingAI(pageText) {
  const extraction = await client.responses.create({
    model: "gpt-4.1-mini",
    input: `
Extract ALL physical objects or props mentioned in this page text.
Return ONLY JSON:
{
  "props": [
    { "name": "object-name", "context": "short reason or how it appears" }
  ]
}

Text: "${pageText}"
`
  });

  const raw = extraction.output_text ??
    extraction.output?.[0]?.content?.[0]?.text;

  if (!raw) return [];

  try {
    const cleaned = raw.replace(/```json|```/g, "").trim();
    const json = JSON.parse(cleaned);
    return json.props || [];
  } catch {
    return [];
  }
}

// -------------------------------------------------------
// Helper: Extract location/setting using GPT
// -------------------------------------------------------
async function extractLocationUsingAI(pageText) {
  const extraction = await client.responses.create({
    model: "gpt-4.1-mini",
    input: `
Extract the primary LOCATION or SETTING from this text.

Return ONLY JSON:
{ "location": "..." }

Infer a simple kid-friendly environment if not explicitly stated.

Text: "${pageText}"
`
  });

  const raw = extraction.output_text ??
    extraction.output?.[0]?.content?.[0]?.text;

  if (!raw) return null;

  try {
    const cleaned = raw.replace(/```json|```/g, "").trim();
    const json = JSON.parse(cleaned);
    return json.location || null;
  } catch {
    return null;
  }
}

// -------------------------------------------------------
// MAIN HANDLER
// -------------------------------------------------------
module.exports = async function handler(req, res) {
  if (req.method !== "POST")
    return res.status(405).json({ error: "Method not allowed" });

  const { projectId, page, pageText } = req.body;

  if (!projectId || !page || !pageText)
    return res.status(400).json({ error: "Missing projectId, page, or pageText" });

  try {
    // -------------------------------------------------------
    // Fetch project
    // -------------------------------------------------------
    const { data: project, error: projectError } = await supabase
      .from("book_projects")
      .select("character_model_url, illustrations, props_registry")
      .eq("id", projectId)
      .single();

    if (projectError || !project) {
      console.error("Project fetch error:", projectError);
      return res.status(500).json({ error: "Could not load project." });
    }

    if (!project.character_model_url)
      return res.status(400).json({ error: "Character model missing." });

    // Ensure registry exists
    const registry = project.props_registry || {
      characters: {},
      props: {},
      environments: {},
      notes: ""
    };

    // -------------------------------------------------------
    // Load character model into base64 data URL
    // -------------------------------------------------------
    const imgResp = await fetch(project.character_model_url);
    const buffer = await imgResp.arrayBuffer();
    const base64Model = Buffer.from(buffer).toString("base64");
    const modelDataUrl = `data:image/png;base64,${base64Model}`;

    // -------------------------------------------------------
    // AI: Extract props + location
    // -------------------------------------------------------
    const [aiProps, detectedLocation] = await Promise.all([
      extractPropsUsingAI(pageText),
      extractLocationUsingAI(pageText)
    ]);

    // -------------------------------------------------------
    // Build prompt for continuity & scene generation
    // -------------------------------------------------------
    const environmentsJson = JSON.stringify(registry.environments || {}, null, 2);
    const propsJson = JSON.stringify(registry.props || {}, null, 2);

    const prompt = `
Generate a children's book illustration for this page:

PAGE TEXT:
"${pageText}"

DETECTED LOCATION:
${detectedLocation || "None — choose a simple location that fits."}

ENVIRONMENT CONTINUITY:
${environmentsJson}

PROP CONTINUITY:
${propsJson}

AMBIGUOUS PROP HANDLING:
• If a phrase like “the board”, “his toy”, or “the thing” appears, resolve it using:
  1. Previously seen props
  2. This page's context
  3. Logical inference suitable for a kids book
• Never redesign props already shown.
• New props should be simple and reusable.

LOCATION CONTINUITY:
• If location exists in registry: match its look + feel.
• If new: create a simple, friendly background that could repeat later.

STYLE REQUIREMENTS:
• EXACT same character model (use attached image)
• Never alter the face, clothes, or proportions
• Full-body character, head-to-toe
• 10% margin on all sides
• Soft pastel “Jett book” illustration style
• No text inside image
• 1024×1024 PNG output
`;

    // -------------------------------------------------------
    // GPT-4.1 Image Generation
    // -------------------------------------------------------
    const aiResponse = await client.responses.create({
      model: "gpt-4.1",
      input: [
        {
          role: "user",
          content: [
            { type: "input_text", text: prompt },
            { type: "input_image", image_url: modelDataUrl }
          ]
        }
      ],
      tools: [{ type: "image_generation" }]
    });

    const imgCall = aiResponse.output.find(o => o.type === "image_generation_call");

    if (!imgCall || !imgCall.result) {
      console.error("NO IMAGE GENERATED:", aiResponse);
      return res.status(500).json({ error: "Model produced no scene." });
    }

    const sceneBuffer = Buffer.from(imgCall.result, "base64");

    // -------------------------------------------------------
    // Upload to Supabase Storage
    // -------------------------------------------------------
    const filePath = `illustrations/${projectId}-page-${page}.png`;

    const { error: uploadError } = await supabase.storage
      .from("book_images")
      .upload(filePath, sceneBuffer, {
        contentType: "image/png",
        upsert: true
      });

    if (uploadError) {
      console.error("UPLOAD ERROR:", uploadError);
      return res.status(500).json({ error: "Failed to upload illustration." });
    }

    const { data: urlData } = supabase.storage
      .from("book_images")
      .getPublicUrl(filePath);

    // -------------------------------------------------------
    // Update continuity registry
    // -------------------------------------------------------
    const updatedRegistry = { ...registry };

    if (!updatedRegistry.props) updatedRegistry.props = {};
    if (!updatedRegistry.environments) updatedRegistry.environments = {};

    // Add or confirm location
    if (detectedLocation) {
      const key = detectedLocation.toLowerCase().trim();
      if (!updatedRegistry.environments[key]) {
        updatedRegistry.environments[key] = {
          style: `Consistent depiction of a ${key} environment.`,
          first_seen_page: page
        };
      }
    }

    // Add props
    for (const p of aiProps) {
      const key = (p.name || "").toLowerCase().trim();
      if (!key) continue;

      if (!updatedRegistry.props[key]) {
        updatedRegistry.props[key] = {
          context: p.context || "Appears on this page",
          first_seen_page: page
        };
      }
    }

    await supabase
      .from("book_projects")
      .update({ props_registry: updatedRegistry })
      .eq("id", projectId);

    // -------------------------------------------------------
    // Save illustration metadata
    // -------------------------------------------------------
    const updatedIllustrations = [
      ...(project.illustrations || []),
      { page, image_url: urlData.publicUrl }
    ];

    await supabase
      .from("book_projects")
      .update({ illustrations: updatedIllustrations })
      .eq("id", projectId);

    // -------------------------------------------------------
    // Return success
    // -------------------------------------------------------
    return res.status(200).json({
      page,
      image_url: urlData.publicUrl
    });

  } catch (err) {
    console.error("Illustration generation error:", err);
    return res.status(500).json({ error: "Failed to generate illustration." });
  }
};
