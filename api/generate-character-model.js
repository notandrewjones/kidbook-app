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

    // Download child photo → base64
    const downloaded = await fetch(project.photo_url);
    const arrayBuffer = await downloaded.arrayBuffer();
    const base64Image = Buffer.from(arrayBuffer).toString("base64");

    // ---------------------------
    // CHARACTER MODEL PROMPT
    // ---------------------------
    const prompt = `
Create a full-body cartoon character model sheet of the child in the attached image.

STYLE (Jett Book Style):
• Soft rounded cartoon proportions
• Slightly oversized head, friendly bright eyes
• Simple pastel-adjacent color palette
• Clean medium-weight outlines
• Soft ambient lighting, minimal shadows
• Warm white balance (5000–5500K)
• Transparent background preferred

FRAMING:
• Full head-to-toe visible
• NO CROPPING: head, hair, chin, shoes, feet
• 15% empty margin above head and below feet
• 10% margin left and right
• Neutral standing pose
• Character centered
`;

    // ---------------------------
    // GPT-IMAGE-1 MULTIMODAL REQUEST
    // ---------------------------
    const imageResponse = await client.images.generate({
      model: "gpt-image-1",
      size: "1024x1536",

      // REQUIRED placeholder even when using messages
      prompt: "See messages for full instruction.",

      messages: [
        {
          role: "user",
          content: [
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

    // Convert output to buffer
    const base64Output = imageResponse.data[0].b64_json;
    const buffer = Buffer.from(base64Output, "base64");

    // Upload to Supabase
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

    // Save to DB
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
