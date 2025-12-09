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

/* ------------------------------------------------------
   FIXED PROP EXTRACTION — GPT-4.1 + correct syntax
------------------------------------------------------- */
async function extractPropsUsingAI(pageText) {
  const extraction = await client.responses.create({
    model: "gpt-4.1",
    input: [
      {
        role: "user",
        content: [
          {
            type: "input_text",
            text: `
Extract ALL physical objects or props mentioned or implied in the page text.

Return ONLY JSON in this exact format:
{
  "props": [
    { "name": "object-name", "context": "short explanation" }
  ]
}

Text: "${pageText}"
`
          }
        ]
      }
    ]
  });

  let raw =
    extraction.output_text ??
    extraction.output?.[0]?.content?.[0]?.text ??
    null;

  if (!raw) return [];

  try {
    raw = raw.replace(/```json|```/g, "").trim();
    const parsed = JSON.parse(raw);
    return parsed.props || [];
  } catch (err) {
    console.error("PROP EXTRACTION JSON ERROR:", err, raw);
    return [];
  }
}

/* ------------------------------------------------------
   FIXED LOCATION EXTRACTION — GPT-4.1 + correct syntax
------------------------------------------------------- */
async function extractLocationUsingAI(pageText) {
  const extraction = await client.responses.create({
    model: "gpt-4.1",
    input: [
      {
        role: "user",
        content: [
          {
            type: "input_text",
            text: `
Identify the primary LOCATION or SETTING described or implied in this page.

Return ONLY JSON:
{
  "location": "simple-location-name"
}

If no location is mentioned, infer a logical one (e.g., "park", "bedroom", "yard").

Page Text: "${pageText}"
`
          }
        ]
      }
    ]
  });

  let raw =
    extraction.output_text ??
    extraction.output?.[0]?.content?.[0]?.text ??
    null;

  if (!raw) return null;

  try {
    raw = raw.replace(/```json|```/g, "").trim();
    const parsed = JSON.parse(raw);
    return parsed.location || null;
  } catch (err) {
    console.error("LOCATION EXTRACTION JSON ERROR:", err, raw);
    return null;
  }
}

export default async function handler(req, res) {
  if (req.method !== "POST")
    return res.status(405).json({ error: "Method not allowed" });

  const { projectId, page, pageText } = req.body;

  if (!projectId || !page || !pageText)
    return res.status(400).json({ error: "Missing projectId, page, or pageText" });

  try {
    /* ------------------------------------------------------
       1. Fetch project
    ------------------------------------------------------- */
    const { data: project, error: projectError } = await supabase
      .from("book_projects")
      .select("character_model_url, illustrations, props_registry")
      .eq("id", projectId)
      .single();

    if (projectError) {
      console.error("Project fetch error:", projectError);
      return res.status(500).json({ error: "Could not load project." });
    }

    if (!project?.character_model_url)
      return res.status(400).json({ error: "Character model not found." });

    // Ensure registry exists
    const registry = project.props_registry || {
      characters: {},
      props: {},
      environments: {},
      notes: ""
    };

    /* ------------------------------------------------------
       2. Load character model image as base64
    ------------------------------------------------------- */
    const imgResp = await fetch(project.character_model_url);
    const arrayBuffer = await imgResp.arrayBuffer();
    const base64Model = Buffer.from(arrayBuffer).toString("base64");
    const modelDataUrl = `data:image/png;base64,${base64Model}`;

    /* ------------------------------------------------------
       3. AI extract props + location
    ------------------------------------------------------- */
    const [aiProps, detectedLocation] = await Promise.all([
      extractPropsUsingAI(pageText),
      extractLocationUsingAI(pageText)
    ]);

    /* ------------------------------------------------------
       4. Build scene prompt
    ------------------------------------------------------- */
    const environmentsJson = JSON.stringify(registry.environments || {}, null, 2);
    const propsJson = JSON.stringify(registry.props || {}, null, 2);

    const prompt = `
You are generating a single illustration for a children's picture book.

PAGE TEXT:
"${pageText}"

DETECTED LOCATION:
${detectedLocation || "None — infer a simple, child-friendly setting."}

ENVIRONMENT REGISTRY:
${environmentsJson}

PROP REGISTRY:
${propsJson}

AMBIGUOUS PROP RULES:
• Resolve vague nouns (“the board”, “the thing”, “the toy”) logically using:
  1. Previously seen props
  2. Page context
  3. Children’s book logic

• Never redesign previously introduced props — they must stay consistent.

LOCATION CONTINUITY RULES:
• Match previously used settings if they exist.
• If new: simple, kid-friendly, uncluttered, reusable.

STYLE REQUIREMENTS:
• Use the attached character model EXACTLY — same face, body, clothing, colors  
• Do NOT alter the model  
• Character must be full-body, head-to-toe, no cropping  
• Leave ~10% margin on all sides  
• Pastel “Jett book” illustration style  
• No text in the scene  
• Output a 1024×1024 PNG  
• Keep backgrounds simple and readable  

ILLUSTRATION RULES:
• Character is the focal point  
• Props must match existing registry items  
• Environment must follow continuity rules  
• Soft daylight tones (5000–5500K)  
`;

    /* ------------------------------------------------------
       5. Generate image using GPT-4.1 image_generation tool
    ------------------------------------------------------- */
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

    const imgCall = response.output.find(o => o.type === "image_generation_call");

    if (!imgCall?.result) {
      console.error("NO IMAGE GENERATED:", response);
      return res.status(500).json({ error: "Model produced no scene." });
    }

    const sceneBuffer = Buffer.from(imgCall.result, "base64");

    /* ------------------------------------------------------
       6. Upload image
    ------------------------------------------------------- */
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

    /* ------------------------------------------------------
       7. Update continuity registry
    ------------------------------------------------------- */
    const updatedRegistry = { ...registry };

    // ensure structure exists
    if (!updatedRegistry.props) updatedRegistry.props = {};
    if (!updatedRegistry.environments) updatedRegistry.environments = {};

    // Update environments
    if (detectedLocation) {
      const key = detectedLocation.toLowerCase().trim();
      if (!updatedRegistry.environments[key]) {
        updatedRegistry.environments[key] = {
          style: `Consistent depiction of a ${key} environment.`,
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
          context: p.context,
          first_seen_page: page
        };
      }
    }

    await supabase
      .from("book_projects")
      .update({ props_registry: updatedRegistry })
      .eq("id", projectId);

    /* ------------------------------------------------------
       8. Save illustration metadata
    ------------------------------------------------------- */
    const updatedIllustrations = [
      ...(project.illustrations || []),
      { page, image_url: urlData.publicUrl }
    ];

    await supabase
      .from("book_projects")
      .update({ illustrations: updatedIllustrations })
      .eq("id", projectId);

    /* ------------------------------------------------------
       9. Return success
    ------------------------------------------------------- */
    return res.status(200).json({
      page,
      image_url: urlData.publicUrl
    });

  } catch (err) {
    console.error("Illustration generation error:", err);
    return res.status(500).json({ error: "Failed to generate illustration." });
  }
}
