const OpenAI = require("openai").default;
const { createClient } = require("@supabase/supabase-js");

module.exports.config = {
  api: { bodyParser: { sizeLimit: "10mb" } }
};

// Initialize OpenAI + Supabase
const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// -----------------------------------------------------------------------------
// LOGGING HELPERS
// -----------------------------------------------------------------------------
function logSection(title, data) {
  console.log(`\n==================== ${title} ====================`);
  console.log(data);
  console.log("====================================================\n");
}

// -----------------------------------------------------------------------------
// Helper: Extract props from page text
// -----------------------------------------------------------------------------
async function extractPropsUsingAI(pageText) {
  logSection("PROP EXTRACTION — INPUT TEXT", pageText);

  const extraction = await client.responses.create({
    model: "gpt-4.1-mini",
    input: `
Extract ALL physical objects or props mentioned in this page text.
Return ONLY JSON:
{
  "props": [
    { "name": "object-name", "context": "short reason" }
  ]
}

Text: "${pageText}"
    `
  });

  const raw =
    extraction.output_text ??
    extraction.output?.[0]?.content?.[0]?.text;

  logSection("PROP EXTRACTION — RAW AI OUTPUT", raw);

  if (!raw) {
    logSection("PROP EXTRACTION — EMPTY RAW", "AI returned no text");
    return [];
  }

  try {
    const cleaned = raw.replace(/```json|```/g, "").trim();
    const obj = JSON.parse(cleaned);
    logSection("PROP EXTRACTION — PARSED JSON", obj);
    return obj.props || [];
  } catch (err) {
    logSection("PROP EXTRACTION — JSON PARSE ERROR", err);
    return [];
  }
}

// -----------------------------------------------------------------------------
// Helper: Extract location from page text
// -----------------------------------------------------------------------------
async function extractLocationUsingAI(pageText) {
  logSection("LOCATION EXTRACTION — INPUT TEXT", pageText);

  const extraction = await client.responses.create({
    model: "gpt-4.1-mini",
    input: `
Extract the primary LOCATION or SETTING in this text.
Return ONLY:
{
  "location": "..."
}
Text: "${pageText}"
    `
  });

  const raw =
    extraction.output_text ??
    extraction.output?.[0]?.content?.[0]?.text;

  logSection("LOCATION EXTRACTION — RAW AI OUTPUT", raw);

  if (!raw) {
    logSection("LOCATION EXTRACTION — EMPTY RAW", "AI returned no text");
    return null;
  }

  try {
    const cleaned = raw.replace(/```json|```/g, "").trim();
    const obj = JSON.parse(cleaned);
    logSection("LOCATION EXTRACTION — PARSED JSON", obj);
    return obj.location || null;
  } catch (err) {
    logSection("LOCATION EXTRACTION — JSON PARSE ERROR", err);
    return null;
  }
}

// -----------------------------------------------------------------------------
// MAIN HANDLER
// -----------------------------------------------------------------------------
module.exports = async function handler(req, res) {
  if (req.method !== "POST")
    return res.status(405).json({ error: "Method not allowed" });

  const { projectId, page, pageText } = req.body;

  if (!projectId || !page || !pageText) {
    return res.status(400).json({ error: "Missing required fields" });
  }

  try {
    // -------------------------------------------------------------------------
    // Load project
    // -------------------------------------------------------------------------
    const { data: project, error: projectError } = await supabase
      .from("book_projects")
      .select("character_model_url, illustrations, props_registry")
      .eq("id", projectId)
      .single();

    logSection("PROJECT LOADED", project);

    if (projectError) {
      console.error("Project fetch error:", projectError);
      return res.status(500).json({ error: "Could not load project." });
    }

    if (!project?.character_model_url) {
      return res.status(400).json({ error: "Character model not found." });
    }

    // Normalize registry
    const registry = project.props_registry || {
      characters: {},
      props: {},
      environments: {},
      notes: ""
    };

    logSection("REGISTRY — BEFORE UPDATE", registry);

    // -------------------------------------------------------------------------
    // Load character model
    // -------------------------------------------------------------------------
    const modelResp = await fetch(project.character_model_url);
    const arrBuf = await modelResp.arrayBuffer();
    const base64Model = Buffer.from(arrBuf).toString("base64");
    const modelDataUrl = `data:image/png;base64,${base64Model}`;

    // -------------------------------------------------------------------------
    // AI: Extract props + location
    // -------------------------------------------------------------------------
    const [aiProps, detectedLocation] = await Promise.all([
      extractPropsUsingAI(pageText),
      extractLocationUsingAI(pageText)
    ]);

    logSection("AI PROPS (final parsed)", aiProps);
    logSection("DETECTED LOCATION", detectedLocation);

    // -------------------------------------------------------------------------
    // Build generation prompt
    // -------------------------------------------------------------------------
    const prompt = `
PAGE TEXT:
"${pageText}"

LOCATION DETECTED:
${detectedLocation || "None — choose neutral setting"}

CURRENT REGISTRY:
${JSON.stringify(registry, null, 2)}
`;

    logSection("FINAL GENERATION PROMPT", prompt);

    // -------------------------------------------------------------------------
    // Generate image
    // -------------------------------------------------------------------------
    const response = await client.responses.create({
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

    logSection("RAW IMAGE GENERATION RESPONSE", response.output);

    const imgCall = response.output.find(
      o => o.type === "image_generation_call"
    );

    logSection("IMAGE GENERATION CALL SELECTED", imgCall);

    if (!imgCall?.result) {
      logSection("ERROR: NO IMAGE GENERATED", response);
      return res.status(500).json({ error: "Model produced no scene." });
    }

    const sceneBuffer = Buffer.from(imgCall.result, "base64");

    // -------------------------------------------------------------------------
    // Upload image
    // -------------------------------------------------------------------------
    const filePath = `illustrations/${projectId}-page-${page}.png`;

    const { error: uploadError } = await supabase.storage
      .from("book_images")
      .upload(filePath, sceneBuffer, {
        contentType: "image/png",
        upsert: true
      });

    logSection("UPLOAD RESULT", uploadError || "Upload succeeded");

    const { data: urlData } = supabase.storage
      .from("book_images")
      .getPublicUrl(filePath);

    // -------------------------------------------------------------------------
    // Update continuity registry
    // -------------------------------------------------------------------------

    // Location
    if (detectedLocation) {
      const key = detectedLocation.toLowerCase().trim();
      if (!registry.environments[key]) {
        registry.environments[key] = {
          style: `Consistent depiction of ${key}.`,
          first_seen_page: page
        };
      }
    }

    // Props
    aiProps.forEach((p) => {
      const key = (p.name || "").toLowerCase().trim();
      if (!key) return;

      if (!registry.props[key]) {
        registry.props[key] = {
          context: p.context || "Appears in this scene",
          first_seen_page: page
        };
      }
    });

    logSection("REGISTRY — AFTER UPDATE", registry);

    // Write registry back
    const { error: regError } = await supabase
      .from("book_projects")
      .update({ props_registry: registry })
      .eq("id", projectId);

    logSection("SUPABASE REGISTRY UPDATE RESULT", regError || "Success");

    // -------------------------------------------------------------------------
    // Save illustration metadata
    // -------------------------------------------------------------------------
    const updatedIllustrations = [
      ...(project.illustrations || []),
      { page, image_url: urlData.publicUrl }
    ];

    const { error: illError } = await supabase
      .from("book_projects")
      .update({ illustrations: updatedIllustrations })
      .eq("id", projectId);

    logSection("SUPABASE ILLUSTRATION UPDATE RESULT", illError || "Success");

    // -------------------------------------------------------------------------
    // Done
    // -------------------------------------------------------------------------
    return res.status(200).json({
      page,
      image_url: urlData.publicUrl
    });

  } catch (err) {
    logSection("FATAL ERROR", err);
    return res.status(500).json({ error: "Failed to generate illustration." });
  }
};
