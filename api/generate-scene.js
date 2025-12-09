import OpenAI from "openai";
import { createClient } from "@supabase/supabase-js";

export const config = {
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
// Helper: Extract props (objects) from page text via GPT
// -------------------------------------------------------
async function extractPropsUsingAI(pageText) {
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
`
  });

  const raw =
    extraction.output_text ??
    extraction.output?.[0]?.content?.[0]?.text;

  if (!raw) return [];

  try {
    const cleaned = raw.replace(/```json|```/g, "").trim();
    const obj = JSON.parse(cleaned);
    return obj.props || [];
  } catch {
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
based on the child's activity (e.g., "backyard", "playground", "bedroom").

Text: "${pageText}"
`
  });

  const raw =
    extraction.output_text ??
    extraction.output?.[0]?.content?.[0]?.text;

  if (!raw) return null;

  try {
    const cleaned = raw.replace(/```json|```/g, "").trim();
    const obj = JSON.parse(cleaned);
    return obj.location || null;
  } catch {
    return null;
  }
}

export default async function handler(req, res) {
  if (req.method !== "POST")
    return res.status(405).json({ error: "Method not allowed" });

  const { projectId, page, pageText } = req.body;

  if (!projectId || !page || !pageText) {
    return res
      .status(400)
      .json({ error: "Missing projectId, page, or pageText" });
  }

  try {
    // -------------------------------------------------------
    // 1. Load project (character model, illustrations, registry)
    // -------------------------------------------------------
    const { data: project, error: projectError } = await supabase
      .from("book_projects")
      .select("character_model_url, illustrations, props_registry")
      .eq("id", projectId)
      .single();

    if (projectError) {
      console.error("Project fetch error:", projectError);
      return res.status(500).json({ error: "Could not load project." });
    }

    if (!project?.character_model_url) {
      return res.status(400).json({ error: "Character model not found." });
    }

    // Ensure registry object exists
    const registry = project.props_registry || {
      characters: {},
      props: {},
      environments: {},
      notes: ""
    };

    // -------------------------------------------------------
    // 2. Load character model image as base64 data URL
    // -------------------------------------------------------
    const modelResp = await fetch(project.character_model_url);
    const arrayBuffer = await modelResp.arrayBuffer();
    const base64Image = Buffer.from(arrayBuffer).toString("base64");
    const modelDataUrl = `data:image/png;base64,${base64Image}`;

    // -------------------------------------------------------
    // 3. AI: Extract props + location from this page
    // -------------------------------------------------------
    const [aiProps, detectedLocation] = await Promise.all([
      extractPropsUsingAI(pageText),
      extractLocationUsingAI(pageText)
    ]);

    // -------------------------------------------------------
    // 4. Build scene-generation prompt with continuity & location
    // -------------------------------------------------------
    const environmentsJson = JSON.stringify(
      registry.environments || {},
      null,
      2
    );
    const propsJson = JSON.stringify(registry.props || {}, null, 2);

    const prompt = `
You are generating a single illustration for a children's picture book.

PAGE TEXT:
"${pageText}"

CURRENT DETECTED LOCATION:
${detectedLocation || "None explicitly detected — choose a simple, neutral setting that fits the action."}

ENVIRONMENT REGISTRY (for location continuity):
${environmentsJson}

PROP REGISTRY (for object continuity):
${propsJson}

AMBIGUOUS PROP RULES:
• If the page text refers to an ambiguous object (“the board”, “his board”, “the toy”, “that thing”), resolve the reference logically using:
  1. The props already listed in the registry
  2. The story context from this page
  3. Logical inference suitable for a children's book

• If an ambiguous phrase clearly refers to an existing prop (for example, “the board” referring to a skateboard introduced earlier), use the SAME prop visually.

• If it might refer to multiple props, choose the one that best maintains story and visual consistency.

• If a new prop appears for the first time:
  – Make it simple
  – Recognizable
  – Easy to reuse in future illustrations

• NEVER reinvent or alter previously drawn props. Each prop must appear consistent across all pages of the book.

LOCATION CONTINUITY RULES:
• Determine the scene's environment using the detected location above
  and any matching entry in the environment registry.

• If the location already exists in the registry:
  – Keep overall look and feel consistent (colors, general layout, mood)
  – Use similar background elements (trees, bed, furniture, fences, etc.)
  – Variation is allowed, but it must still look like the same place.

• If the location is NEW:
  – Create a simple, child-friendly environment
  – Avoid clutter
  – Use gentle, readable shapes and colors
  – Imagine this environment could be reused on later pages.

STYLE REQUIREMENTS:
• Use the attached character model EXACTLY — same face, body, clothing, colors  
• Do NOT alter the model's appearance  
• Character must be full-body, head-to-toe, no cropping  
• Leave ~10% margin on all sides  
• Style: soft pastel “Jett book” illustration style  
• No text inside the image  
• Produce a 1024×1024 PNG scene  
• Keep backgrounds simple, readable, kid-friendly  

ILLUSTRATION RULES:
• Character is the visual focus of the scene  
• Props must match prior pages if already introduced  
• Environment must be consistent with the detected or previously used location  
• Use soft, warm, daylight tones (around 5000–5500K white balance)  
`;

    // -------------------------------------------------------
    // 5. Call GPT-4.1 with image_generation tool
    // -------------------------------------------------------
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
	
	console.log("RAW RESPONSE OUTPUT:", JSON.stringify(response.output, null, 2));

    const imgCall = response.output.find(
      (o) => o.type === "image_generation_call"
    );

    if (!imgCall || !imgCall.result) {
      console.error("NO IMAGE GENERATED:", response);
      return res.status(500).json({ error: "Model produced no scene." });
    }

    const base64Scene = imgCall.result;
    const sceneBuffer = Buffer.from(base64Scene, "base64");

    // -------------------------------------------------------
    // 6. Upload scene image to Supabase storage
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
    // 7. Update continuity registry (props + environments)
    // -------------------------------------------------------
    const updatedRegistry = { ...registry };

    // Ensure nested objects exist
    if (!updatedRegistry.props) updatedRegistry.props = {};
    if (!updatedRegistry.environments) updatedRegistry.environments = {};

    // Update environments
    if (detectedLocation) {
      const envKey = detectedLocation.toLowerCase().trim();
      if (!updatedRegistry.environments[envKey]) {
        updatedRegistry.environments[envKey] = {
          style: `Consistent depiction of a ${envKey} environment.`,
          first_seen_page: page
        };
      }
    }

    // Update props
    for (const p of aiProps) {
      const key = (p.name || "").toLowerCase().trim();
      if (!key) continue;

      if (!updatedRegistry.props[key]) {
        updatedRegistry.props[key] = {
          context: p.context || "Appears in this scene",
          first_seen_page: page
        };
      }
    }

    await supabase
      .from("book_projects")
      .update({ props_registry: updatedRegistry })
      .eq("id", projectId);

    // -------------------------------------------------------
    // 8. Save illustration metadata on the project row
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
    // 9. Return success
    // -------------------------------------------------------
    return res.status(200).json({
      page,
      image_url: urlData.publicUrl
    });

  } catch (err) {
    console.error("Illustration generation error:", err);
    return res
      .status(500)
      .json({ error: "Failed to generate illustration." });
  }
}
