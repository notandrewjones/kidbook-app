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
// LOGGING HELPER
// -------------------------------------------------------
function log(label, data) {
  console.log(`\n======================`);
  console.log(label);
  console.log(JSON.stringify(data, null, 2));
  console.log(`======================\n`);
}

// -------------------------------------------------------
// Extract props with logging
// -------------------------------------------------------
async function extractPropsUsingAI(pageText) {
  log("PROP EXTRACTION: input page text", pageText);

  const extraction = await client.responses.create({
    model: "gpt-4.1",
    input: [
      {
        role: "user",
        content: [
          {
            type: "input_text",
            text: `
Extract ALL physical objects or props in the page text.
Return ONLY JSON:
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

  const raw =
    extraction.output_text ??
    extraction.output?.[0]?.content?.[0]?.text ??
    null;

  log("PROP EXTRACTION: raw model output", raw);

  if (!raw) return [];

  try {
    const cleaned = raw.replace(/```json|```/g, "").trim();
    const parsed = JSON.parse(cleaned);
    log("PROP EXTRACTION: parsed props", parsed);
    return parsed.props || [];
  } catch (err) {
    console.error("PROP EXTRACTION JSON ERROR:", err, raw);
    return [];
  }
}

// -------------------------------------------------------
// Extract location with logging
// -------------------------------------------------------
async function extractLocationUsingAI(pageText) {
  log("LOCATION EXTRACTION: input page text", pageText);

  const extraction = await client.responses.create({
    model: "gpt-4.1",
    input: [
      {
        role: "user",
        content: [
          {
            type: "input_text",
            text: `
Identify the LOCATION or SETTING in the page text.
Return ONLY JSON:
{ "location": "simple-name" }

Page Text: "${pageText}"
`
          }
        ]
      }
    ]
  });

  const raw =
    extraction.output_text ??
    extraction.output?.[0]?.content?.[0]?.text ??
    null;

  log("LOCATION EXTRACTION: raw model output", raw);

  if (!raw) return null;

  try {
    const cleaned = raw.replace(/```json|```/g, "").trim();
    const parsed = JSON.parse(cleaned);
    log("LOCATION EXTRACTION: parsed location JSON", parsed);
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
    // -------------------------------------------------------
    // 1. Load project
    // -------------------------------------------------------
    const { data: project } = await supabase
      .from("book_projects")
      .select("character_model_url, illustrations, props_registry")
      .eq("id", projectId)
      .single();
	  
	// 🔧 TEMPORARY DEVELOPMENT OVERRIDE — hard-coded character model
	const hardcodedModelUrl =
	  "https://mndeoxianjxgwdiwsowa.supabase.co/storage/v1/object/public/book_images/character_models/3432e488-4787-482e-aab0-1e5380eff258.png"; // <-- paste your PNG URL

	const characterModelUrl =
	  hardcodedModelUrl || project?.character_model_url;

	console.log("USING CHARACTER IMAGE:", characterModelUrl);
	  

    log("PROJECT LOADED", project);

    // initialize registry if missing
    let registry = project.props_registry || {
      characters: {},
      props: {},
      environments: {},
      notes: ""
    };

    log("REGISTRY BEFORE EXTRACTION", registry);

    // -------------------------------------------------------
    // 2. Load character image
    // -------------------------------------------------------
    const imgResp = await fetch(project.character_model_url);
    const arrayBuffer = await imgResp.arrayBuffer();
    const base64Model = Buffer.from(arrayBuffer).toString("base64");
    const modelDataUrl = `data:image/png;base64,${base64Model}`;

    // -------------------------------------------------------
    // 3. Extract props + location
    // -------------------------------------------------------
    const aiProps = await extractPropsUsingAI(pageText);
    const detectedLocation = await extractLocationUsingAI(pageText);

    log("AI EXTRACTED PROPS", aiProps);
    log("AI EXTRACTED LOCATION", detectedLocation);

    // -------------------------------------------------------
    // 4. Update registry in memory
    // -------------------------------------------------------
    if (!registry.props) registry.props = {};
    if (!registry.environments) registry.environments = {};

    // update props
    for (const p of aiProps) {
      const key = (p.name || "").toLowerCase().trim();
      if (key && !registry.props[key]) {
        registry.props[key] = {
          context: p.context,
          first_seen_page: page
        };
      }
    }

    // update environment
    if (detectedLocation) {
      const key = detectedLocation.toLowerCase().trim();
      if (!registry.environments[key]) {
        registry.environments[key] = {
          style: `Consistent depiction of ${key}`,
          first_seen_page: page
        };
      }
    }

    log("REGISTRY AFTER UPDATE (BEFORE DB WRITE)", registry);

    // -------------------------------------------------------
    // 5. Write registry to DB
    // -------------------------------------------------------
    const { error: regErr } = await supabase
      .from("book_projects")
      .update({ props_registry: registry })
      .eq("id", projectId);

    if (regErr) {
      console.error("REGISTRY UPDATE ERROR", regErr);
    } else {
      console.log("REGISTRY UPDATE SUCCESS");
    }

    // -------------------------------------------------------
    // 6. Generate image (unchanged)
    // -------------------------------------------------------

    const fullPrompt = `
PAGE TEXT:
"${pageText}"

Use character model exactly. Style pastel. No text. 1024x1024.
`;

    const responseImg = await client.responses.create({
      model: "gpt-4.1",
      input: [
        {
          role: "user",
          content: [
            { type: "input_text", text: fullPrompt },
            { type: "input_image", image_url: modelDataUrl }
          ]
        }
      ],
      tools: [{ type: "image_generation" }]
    });

    const imgCall = responseImg.output.find(o => o.type === "image_generation_call");
    const sceneBuffer = Buffer.from(imgCall.result, "base64");

    // upload
    const filePath = `illustrations/${projectId}-page-${page}.png`;
    await supabase.storage
      .from("book_images")
      .upload(filePath, sceneBuffer, {
        contentType: "image/png",
        upsert: true
      });

    const { data: urlData } = supabase.storage
      .from("book_images")
      .getPublicUrl(filePath);

    // append illustration entry
    const newIllustrations = [
      ...(project.illustrations || []),
      { page, image_url: urlData.publicUrl }
    ];

    await supabase
      .from("book_projects")
      .update({ illustrations: newIllustrations })
      .eq("id", projectId);

    return res.status(200).json({
      page,
      image_url: urlData.publicUrl
    });

  } catch (err) {
    console.error("SCENE GENERATION ERROR", err);
    return res.status(500).json({ error: "Scene generation failed." });
  }
}
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
// LOGGING HELPER
// -------------------------------------------------------
function log(label, data) {
  console.log(`\n======================`);
  console.log(label);
  console.log(JSON.stringify(data, null, 2));
  console.log(`======================\n`);
}

// -------------------------------------------------------
// Extract props with logging
// -------------------------------------------------------
async function extractPropsUsingAI(pageText) {
  log("PROP EXTRACTION: input page text", pageText);

  const extraction = await client.responses.create({
    model: "gpt-4.1",
    input: [
      {
        role: "user",
        content: [
          {
            type: "input_text",
            text: `
Extract ALL physical objects or props in the page text.
Return ONLY JSON:
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

  const raw =
    extraction.output_text ??
    extraction.output?.[0]?.content?.[0]?.text ??
    null;

  log("PROP EXTRACTION: raw model output", raw);

  if (!raw) return [];

  try {
    const cleaned = raw.replace(/```json|```/g, "").trim();
    const parsed = JSON.parse(cleaned);
    log("PROP EXTRACTION: parsed props", parsed);
    return parsed.props || [];
  } catch (err) {
    console.error("PROP EXTRACTION JSON ERROR:", err, raw);
    return [];
  }
}

// -------------------------------------------------------
// Extract location with logging
// -------------------------------------------------------
async function extractLocationUsingAI(pageText) {
  log("LOCATION EXTRACTION: input page text", pageText);

  const extraction = await client.responses.create({
    model: "gpt-4.1",
    input: [
      {
        role: "user",
        content: [
          {
            type: "input_text",
            text: `
Identify the LOCATION or SETTING in the page text.
Return ONLY JSON:
{ "location": "simple-name" }

Page Text: "${pageText}"
`
          }
        ]
      }
    ]
  });

  const raw =
    extraction.output_text ??
    extraction.output?.[0]?.content?.[0]?.text ??
    null;

  log("LOCATION EXTRACTION: raw model output", raw);

  if (!raw) return null;

  try {
    const cleaned = raw.replace(/```json|```/g, "").trim();
    const parsed = JSON.parse(cleaned);
    log("LOCATION EXTRACTION: parsed location JSON", parsed);
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
    // -------------------------------------------------------
    // 1. Load project
    // -------------------------------------------------------
    const { data: project } = await supabase
      .from("book_projects")
      .select("character_model_url, illustrations, props_registry")
      .eq("id", projectId)
      .single();

    log("PROJECT LOADED", project);

    // initialize registry if missing
    let registry = project.props_registry || {
      characters: {},
      props: {},
      environments: {},
      notes: ""
    };

    log("REGISTRY BEFORE EXTRACTION", registry);

    // -------------------------------------------------------
    // 2. Load character image
    // -------------------------------------------------------
    const imgResp = await fetch(project.character_model_url);
    const arrayBuffer = await imgResp.arrayBuffer();
    const base64Model = Buffer.from(arrayBuffer).toString("base64");
    const modelDataUrl = `data:image/png;base64,${base64Model}`;

    // -------------------------------------------------------
    // 3. Extract props + location
    // -------------------------------------------------------
    const aiProps = await extractPropsUsingAI(pageText);
    const detectedLocation = await extractLocationUsingAI(pageText);

    log("AI EXTRACTED PROPS", aiProps);
    log("AI EXTRACTED LOCATION", detectedLocation);

    // -------------------------------------------------------
    // 4. Update registry in memory
    // -------------------------------------------------------
    if (!registry.props) registry.props = {};
    if (!registry.environments) registry.environments = {};

    // update props
    for (const p of aiProps) {
      const key = (p.name || "").toLowerCase().trim();
      if (key && !registry.props[key]) {
        registry.props[key] = {
          context: p.context,
          first_seen_page: page
        };
      }
    }

    // update environment
    if (detectedLocation) {
      const key = detectedLocation.toLowerCase().trim();
      if (!registry.environments[key]) {
        registry.environments[key] = {
          style: `Consistent depiction of ${key}`,
          first_seen_page: page
        };
      }
    }

    log("REGISTRY AFTER UPDATE (BEFORE DB WRITE)", registry);

    // -------------------------------------------------------
    // 5. Write registry to DB
    // -------------------------------------------------------
    const { error: regErr } = await supabase
      .from("book_projects")
      .update({ props_registry: registry })
      .eq("id", projectId);

    if (regErr) {
      console.error("REGISTRY UPDATE ERROR", regErr);
    } else {
      console.log("REGISTRY UPDATE SUCCESS");
    }

    // -------------------------------------------------------
    // 6. Generate image (unchanged)
    // -------------------------------------------------------

    const fullPrompt = `
PAGE TEXT:
"${pageText}"

Use character model exactly. Style pastel. No text. 1024x1024.
`;

    const responseImg = await client.responses.create({
      model: "gpt-4.1",
      input: [
        {
          role: "user",
          content: [
            { type: "input_text", text: fullPrompt },
            { type: "input_image", image_url: modelDataUrl }
          ]
        }
      ],
      tools: [{ type: "image_generation" }]
    });

    const imgCall = responseImg.output.find(o => o.type === "image_generation_call");
    const sceneBuffer = Buffer.from(imgCall.result, "base64");

    // upload
    const filePath = `illustrations/${projectId}-page-${page}.png`;
    await supabase.storage
      .from("book_images")
      .upload(filePath, sceneBuffer, {
        contentType: "image/png",
        upsert: true
      });

    const { data: urlData } = supabase.storage
      .from("book_images")
      .getPublicUrl(filePath);

    // append illustration entry
    const newIllustrations = [
      ...(project.illustrations || []),
      { page, image_url: urlData.publicUrl }
    ];

    await supabase
      .from("book_projects")
      .update({ illustrations: newIllustrations })
      .eq("id", projectId);

    return res.status(200).json({
      page,
      image_url: urlData.publicUrl
    });

  } catch (err) {
    console.error("SCENE GENERATION ERROR", err);
    return res.status(500).json({ error: "Scene generation failed." });
  }
}
