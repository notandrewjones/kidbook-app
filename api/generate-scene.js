// api/generate-scene.js (CommonJS Version with Tool-Call Enforcement)

const OpenAI = require("openai");
const { createClient } = require("@supabase/supabase-js");

exports.config = {
  api: { bodyParser: { sizeLimit: "10mb" } }
};

// --------------------------------------
// OpenAI + Supabase Clients
// --------------------------------------
const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// -------------------------------------------------------
// Helper: Extract props from page text (AI)
// -------------------------------------------------------
async function extractPropsUsingAI(pageText) {
  console.log("=== PROP EXTRACTION — INPUT TEXT ===");
  console.log(pageText);
  console.log("====================================");

  const extraction = await client.responses.create({
    model: "gpt-4.1-mini",
    input: `
Extract ALL physical objects or props mentioned in this page text.
Return ONLY JSON:
{
  "props": [
    { "name": "object-name", "context": "short how/why it appears" }
  ]
}
Text: "${pageText}"
`
  });

  const raw = extraction.output_text ??
              extraction.output?.[0]?.content?.[0]?.text ??
              "";

  console.log("=== PROP EXTRACTION — RAW AI OUTPUT ===");
  console.log(raw);
  console.log("=======================================");

  try {
    const cleaned = raw.replace(/```json|```/g, "").trim();
    const parsed = JSON.parse(cleaned);

    console.log("=== PROP EXTRACTION — PARSED JSON ===");
    console.log(parsed);
    console.log("====================================");

    return parsed.props || [];
  } catch (err) {
    console.log("PROP JSON PARSE ERROR:", err);
    return [];
  }
}

// -------------------------------------------------------
// Helper: Extract location from page text
// -------------------------------------------------------
async function extractLocationUsingAI(pageText) {
  console.log("=== LOCATION EXTRACTION — INPUT TEXT ===");
  console.log(pageText);
  console.log("========================================");

  const extraction = await client.responses.create({
    model: "gpt-4.1-mini",
    input: `
Extract the primary LOCATION or SETTING described or implied.
Return ONLY JSON:
{
  "location": "..."
}
Text: "${pageText}"
`
  });

  const raw = extraction.output_text ??
              extraction.output?.[0]?.content?.[0]?.text ??
              "";

  console.log("=== LOCATION EXTRACTION — RAW AI OUTPUT ===");
  console.log(raw);
  console.log("==========================================");

  try {
    const cleaned = raw.replace(/```json|```/g, "").trim();
    const parsed = JSON.parse(cleaned);

    console.log("=== LOCATION EXTRACTION — PARSED JSON ===");
    console.log(parsed);
    console.log("=========================================");

    return parsed.location || null;
  } catch (err) {
    console.log("LOCATION JSON PARSE ERROR:", err);
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
    // ---------------------------------------------------
    // 1. Load project: character model + registry
    // ---------------------------------------------------
    const { data: project, error: projErr } = await supabase
      .from("book_projects")
      .select("character_model_url, illustrations, props_registry")
      .eq("id", projectId)
      .single();

    if (projErr || !project) {
      console.log("PROJECT LOAD ERROR:", projErr);
      return res.status(500).json({ error: "Project not found." });
    }

    console.log("=== PROJECT LOADED ===");
    console.log(project);
    console.log("======================");

    // Ensure registry exists
    const registry = project.props_registry || {
      characters: {},
      props: {},
      environments: {},
      notes: ""
    };

    console.log("=== REGISTRY — BEFORE UPDATE ===");
    console.log(registry);
    console.log("================================");

    // ---------------------------------------------------
    // 2. Load character model as base64
    // ---------------------------------------------------
    const modelResp = await fetch(project.character_model_url);
    const buffer = Buffer.from(await modelResp.arrayBuffer());
    const modelDataUrl = `data:image/png;base64,${buffer.toString("base64")}`;

    // ---------------------------------------------------
    // 3. AI extract props + location
    // ---------------------------------------------------
    const [aiProps, detectedLocation] = await Promise.all([
      extractPropsUsingAI(pageText),
      extractLocationUsingAI(pageText)
    ]);

    console.log("=== AI PROPS (final parsed) ===");
    console.log(aiProps);
    console.log("==============================");

    console.log("=== DETECTED LOCATION ===");
    console.log(detectedLocation);
    console.log("==========================");

    // ---------------------------------------------------
    // 4. Build enforced-tool prompt
    // ---------------------------------------------------
    const environmentsJson = JSON.stringify(registry.environments || {}, null, 2);
    const propsJson = JSON.stringify(registry.props || {}, null, 2);

    const enforcedPrompt = `
You MUST generate this illustration using the image_generation tool.
DO NOT respond with text.

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
${detectedLocation || "none — choose a simple, neutral background"}

ENVIRONMENT REGISTRY:
${environmentsJson}

PROP REGISTRY:
${propsJson}

STYLE REQUIREMENTS:
• Must use the supplied character model EXACTLY  
• Full-body character, never cropped  
• Soft pastel “Jett book” style  
• No text in image  
• 1024×1024 PNG  
• Simple kid-friendly background  

Now call the image_generation tool.
`;

    console.log("=== FINAL GENERATION PROMPT ===");
    console.log(enforcedPrompt);
    console.log("================================");

    // ---------------------------------------------------
    // 5. GPT CALL — TOOL ENFORCEMENT
    // ---------------------------------------------------
    const response = await client.responses.create({
      model: "gpt-4.1",
      input: [
        {
          role: "user",
          content: [
            { type: "input_text", text: enforcedPrompt },
            { type: "input_image", image_url: modelDataUrl }
          ]
        }
      ],
      tools: [{ type: "image_generation" }]
    });

    console.log("=== RAW IMAGE GENERATION RESPONSE ===");
    console.log(JSON.stringify(response.output, null, 2));
    console.log("====================================");

    const imgCall = response.output.find(o => o.type === "image_generation_call");

    console.log("=== IMAGE GENERATION CALL SELECTED ===");
    console.log(imgCall);
    console.log("======================================");

    if (!imgCall || !imgCall.result) {
      console.log("=== ERROR: NO IMAGE GENERATED ===");
      console.log(response);
      console.log("==================================");
      return res.status(500).json({ error: "Model failed to generate image." });
    }

    const imageBuffer = Buffer.from(imgCall.result, "base64");

    // ---------------------------------------------------
    // 6. Upload to Supabase
    // ---------------------------------------------------
    const filePath = `illustrations/${projectId}-page-${page}.png`;

    const { error: uploadErr } = await supabase.storage
      .from("book_images")
      .upload(filePath, imageBuffer, {
        contentType: "image/png",
        upsert: true
      });

    if (uploadErr) {
      console.log("UPLOAD ERROR:", uploadErr);
      return res.status(500).json({ error: "Upload failed." });
    }

    const { data: url } = supabase.storage
      .from("book_images")
      .getPublicUrl(filePath);

    // ---------------------------------------------------
    // 7. Update registries
    // ---------------------------------------------------
    const updated = { ...registry };

    if (!updated.props) updated.props = {};
    if (!updated.environments) updated.environments = {};

    // update environments
    if (detectedLocation) {
      const key = detectedLocation.toLowerCase().trim();
      if (!updated.environments[key]) {
        updated.environments[key] = {
          style: `Consistent depiction of a ${key}`,
          first_seen_page: page
        };
      }
    }

    // update props
    aiProps.forEach(p => {
      const name = (p.name || "").toLowerCase().trim();
      if (!name) return;
      if (!updated.props[name]) {
        updated.props[name] = {
          context: p.context || "",
          first_seen_page: page
        };
      }
    });

    console.log("=== REGISTRY — AFTER UPDATE ===");
    console.log(updated);
    console.log("================================");

    await supabase
      .from("book_projects")
      .update({ props_registry: updated })
      .eq("id", projectId);

    // ---------------------------------------------------
    // 8. Save illustration metadata
    // ---------------------------------------------------
    const updatedIllustrations = [
      ...(project.illustrations || []),
      { page, image_url: url.publicUrl }
    ];

    await supabase
      .from("book_projects")
      .update({ illustrations: updatedIllustrations })
      .eq("id", projectId);

    // ---------------------------------------------------
    // 9. Return to frontend
    // ---------------------------------------------------
    return res.status(200).json({
      page,
      image_url: url.publicUrl
    });

  } catch (err) {
    console.log("=== ERROR IN GENERATION PIPELINE ===");
    console.error(err);
    console.log("====================================");
    return res.status(500).json({ error: "Unexpected error in scene generation." });
  }
};
