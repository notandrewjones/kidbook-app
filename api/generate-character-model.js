import OpenAI from "openai";
import { createClient } from "@supabase/supabase-js";

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

  try {
    // Fetch project to get uploaded child photo
    const { data: project, error: projectError } = await supabase
      .from("book_projects")
      .select("photo_url")
      .eq("id", projectId)
      .single();

    if (projectError || !project || !project.photo_url) {
      return res.status(400).json({ error: "Child photo not found." });
    }

    // Fetch the image from its public URL and convert it to base64
    const imgResp = await fetch(project.photo_url);
    const arrayBuffer = await imgResp.arrayBuffer();
    const base64Image = Buffer.from(arrayBuffer).toString("base64");

    // ---------------------------
    // CHARACTER MODEL PROMPT
    // ---------------------------
    const prompt = `
Create a full-body cartoon character model sheet of the child shown in the attached image.

STYLE REQUIREMENTS (Jett Book Style):
• Soft, rounded cartoon proportions
• Slightly oversized head, friendly bright eyes
• Simple pastel-adjacent palette, gentle gradients
• Clean, medium-weight outlines
• Consistent warm neutral white balance (5000–5500K)
• Soft ambient lighting, minimal shadows
• No background — transparent PNG preferred

FRAMING RULES (IMPORTANT):
• Show the child fully head-to-toe.
• ABSOLUTELY NO CROPPING of head, hair, chin, shoes, or feet.
• Leave at least 15% empty margin above the head and below the feet.
• Leave 10% margin on left and right.
• Character must be completely visible in-frame.
• Center the character vertically and horizontally.
• Neutral standing pose with relaxed arms.

OUTPUT:
• A full-body character model sheet
• Transparent background (or pure white fallback)
• Portrait ratio
    `;

    // ---------------------------
    // CALL GPT-IMAGE-1 (multimodal)
    // ---------------------------
    const imageResponse = await client.images.generate({
      model: "gpt-image-1",
      size: "1024x1536",
      messages: [
        {
          role: "user",
          prompt: [
            {
              type: "input_text",
              text: prompt
            },
            {
              type: "input_image",
              data: base64Image,
              mime_type: "image/png"
            }
          ]
        }
      ]
    });

    const base64Output = imageResponse.data[0].b64_json;
    const buffer = Buffer.from(base64Output, "base64");

    // Upload to Supabase storage
    const filePath = `character_models/${projectId}.png`;
    const { error: uploadError } = await supabase.storage
      .from("book_images")
      .upload(filePath, buffer, {
        contentType: "image/png",
        upsert: true,
      });

    if (uploadError) {
      console.error(uploadError);
      return res.status(500).json({ error: "Failed to upload character model." });
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
      characterModelUrl: publicUrl.publicUrl
    });

  } catch (err) {
    console.error("Character model generation error:", err);
    return res.status(500).json({ error: "Failed to generate character model." });
  }
}
