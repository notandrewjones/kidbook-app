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
    // Fetch project data
    const { data: project } = await supabase
      .from("book_projects")
      .select("character_model_url, illustrations")
      .eq("id", projectId)
      .single();

    if (!project?.character_model_url) {
      return res.status(400).json({ error: "Character model not generated yet." });
    }

    // Download the transparent character PNG
    const modelResp = await fetch(project.character_model_url);
    const imageBuffer = Buffer.from(await modelResp.arrayBuffer());

    // Scene prompt
    const prompt = `
Use this transparent PNG of the child's character model and place them into a full illustrated children's book scene.

RULES:
- DO NOT redraw, modify, or alter the character. Preserve every pixel.
- The character must remain fully visible, including head, hair, hands, legs, feet.
- Place the character naturally into a background scene that fits this page text:

"${pageText}"

STYLE:
- Hybrid children’s book style (soft pastel, gentle gradients, clean outlines)
- Warm daylight white balance
- Background must be fully illustrated behind the transparent regions
- Do not overwrite or distort the character
- The result must look like a finished page illustration

OUTPUT:
- 1024×1024 square
- PNG
`;

    // Call GPT-image-1 edit endpoint
    const imageResponse = await client.images.edit({
      model: "gpt-image-1",
      image: imageBuffer,       // transparent character PNG
      prompt: prompt,
      size: "1024x1024",
      quality: "high"
    });

    // Convert model output from base64
    const base64Output = imageResponse.data[0].b64_json;
    const buffer = Buffer.from(base64Output, "base64");

    // Upload to Supabase
    const filePath = `illustrations/${projectId}-page-${page}.png`;

    await supabase.storage.from("book_images").upload(filePath, buffer, {
      contentType: "image/png",
      upsert: true
    });

    const { data: publicUrl } = supabase.storage
      .from("book_images")
      .getPublicUrl(filePath);

    // Update DB
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
