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

  const { projectId, page, pageText } = req.body;

  if (!projectId || !page || !pageText) {
    return res.status(400).json({ error: "Missing projectId, page, or pageText" });
  }

  try {
    // Fetch required project fields
    const { data: project, error: projectError } = await supabase
      .from("book_projects")
      .select("character_model_url, illustrations")
      .eq("id", projectId)
      .single();

    if (projectError || !project || !project.character_model_url) {
      return res.status(400).json({ error: "Character model not generated yet." });
    }

    // Download character model → base64
    const modelResp = await fetch(project.character_model_url);
    const arrayBuffer = await modelResp.arrayBuffer();
    const base64Model = Buffer.from(arrayBuffer).toString("base64");

    // ---------------------------
    // Scene prompt
    // ---------------------------
    const prompt = `
Create a children's book illustration for the following story page:

PAGE TEXT:
"${pageText}"

Use the attached character model EXACTLY as the main character.
Maintain consistent proportions, face shape, clothing, color palette, and style.

STYLE:
• Hybrid children's book look (soft shapes + gentle depth)
• Pastel-friendly palette, clean outlines
• Slight gradients, soft ambient light
• Balanced daylight color temperature (5000–5500K)
• Friendly cartoon environment with minimal clutter
• Background inspired by the context of the page text

COMPOSITION:
• Character must be fully visible (head-to-toe)
• No cropping of head, hair, hands, legs, or feet
• Leave 10% margin around character
• Character should be the visual focus
• Scene should support the text but stay simple and readable

OUTPUT:
• Full-page illustration (square)
• PNG
• No text inside the image
`;

    // ---------------------------
    // CALL GPT-IMAGE-1 (multimodal)
    // ---------------------------
    const imageResponse = await client.images.generate({
      model: "gpt-image-1",
      size: "1024x1024",
      messages: [
        {
          role: "user",
          prompt: [
            { type: "input_text", text: prompt },
            {
              type: "input_image",
              data: base64Model,
              mime_type: "image/png"
            }
          ]
        }
      ]
    });

    const base64Output = imageResponse.data[0].b64_json;
    const buffer = Buffer.from(base64Output, "base64");

    const filePath = `illustrations/${projectId}-page-${page}.png`;
    const { error: uploadError } = await supabase.storage
      .from("book_images")
      .upload(filePath, buffer, {
        contentType: "image/png",
        upsert: true,
      });

    if (uploadError) {
      console.error(uploadError);
      return res.status(500).json({ error: "Failed to upload illustration." });
    }

    const { data: publicUrl } = supabase.storage
      .from("book_images")
      .getPublicUrl(filePath);

    const newIllustration = { page, image_url: publicUrl.publicUrl };
    const updated = [...(project.illustrations || []), newIllustration];

    await supabase
      .from("book_projects")
      .update({ illustrations: updated })
      .eq("id", projectId);

    return res.status(200).json(newIllustration);

  } catch (error) {
    console.error("Illustration generation error:", error);
    return res.status(500).json({ error: "Failed to generate illustration." });
  }
}
