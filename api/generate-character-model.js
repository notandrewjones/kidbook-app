import OpenAI from "openai";
import { createClient } from "@supabase/supabase-js";

const DEV_MODE = process.env.DEV_MODE === "true";
const DEV_MODEL_URL = process.env.DEV_CHARACTER_MODEL_URL;


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

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { projectId, kidName } = req.body;

  if (!projectId) {
    return res.status(400).json({ error: "Missing projectId" });
  }

  // -------------------------------------------------------------
  // 🔧 DEV MODE SHORT-CIRCUIT
  // -------------------------------------------------------------
  if (DEV_MODE) {
    console.log("🔧 DEV MODE ENABLED — Skipping character generation.");

    // Update database so the story pipeline works exactly the same
    await supabase
      .from("book_projects")
      .update({ character_model_url: DEV_MODEL_URL })
      .eq("id", projectId);

    return res.status(200).json({
      characterModelUrl: DEV_MODEL_URL,
      devMode: true
    });
  }

  // -------------------------------------------------------------
  // Normal production flow below
  // -------------------------------------------------------------
  try {
    // Fetch project to obtain the uploaded child photo
    const { data: project, error: projectError } = await supabase
      .from("book_projects")
      .select("photo_url")
      .eq("id", projectId)
      .single();

    if (projectError || !project?.photo_url) {
      return res.status(400).json({ error: "Child photo not found." });
    }

    // Fetch child photo → buffer
    const imgResp = await fetch(project.photo_url);
    const arrayBuffer = await imgResp.arrayBuffer();
    const imageBuffer = Buffer.from(arrayBuffer);

    // Build prompt
    const prompt = `
Create a full-body cartoon character model sheet of the child shown in the attached image. Please use a neutral, happy face when generating this model.

STYLE REQUIREMENTS (Jett Book Style):
• Soft, rounded cartoon proportions
• Slightly oversized head, friendly bright eyes
• Simple pastel-adjacent palette, gentle gradients
• Clean, medium-weight outlines
• Warm neutral white balance (5000–5500K)
• Soft ambient lighting
• NO BACKGROUND — transparent PNG
• Character must be fully visible, head-to-toe with 10–15% margins
• Neutral standing pose

OUTPUT:
• A full-body character model sheet
• Transparent PNG
`;

    // GPT-4.1 Image Generation Tool Call
    const response = await client.responses.create({
      model: "gpt-4.1",
      input: [
        {
          role: "user",
          content: [
            { type: "input_text", text: prompt },
            {
              type: "input_image",
              image_url: `data:image/png;base64,${imageBuffer.toString("base64")}`
            }
          ]
        }
      ],
      tools: [{ type: "image_generation" }]
    });

    const imageCall = response.output.find(o => o.type === "image_generation_call");

    if (!imageCall?.result) {
      console.error("NO IMAGE GENERATED:", response);
      return res.status(500).json({ error: "Model did not generate a character image." });
    }

    const pngBuffer = Buffer.from(imageCall.result, "base64");

    // Upload to Supabase storage
    const filePath = `character_models/${projectId}.png`;

    const { error: uploadError } = await supabase.storage
      .from("book_images")
      .upload(filePath, pngBuffer, {
        contentType: "image/png",
        upsert: true,
      });

    if (uploadError) {
      return res.status(500).json({ error: "Upload failed." });
    }

    const { data: publicUrl } = supabase.storage
      .from("book_images")
      .getPublicUrl(filePath);

    // Update DB
    await supabase
      .from("book_projects")
      .update({ character_model_url: publicUrl.publicUrl })
      .eq("id", projectId);

    return res.status(200).json({
      characterModelUrl: publicUrl.publicUrl,
    });

  } catch (err) {
    console.error("Character model generation error:", err);
    return res.status(500).json({ error: "Failed to generate character model." });
  }
}

