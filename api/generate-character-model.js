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

  const { projectId } = req.body;

  if (!projectId) {
    return res.status(400).json({ error: "Missing projectId" });
  }

  try {
    // Fetch the photo URL
    const { data: project } = await supabase
      .from("book_projects")
      .select("photo_url")
      .eq("id", projectId)
      .single();

    if (!project?.photo_url) {
      return res.status(400).json({ error: "Child photo not found." });
    }

    // Download the photo
    const imgResp = await fetch(project.photo_url);
    const imageBuffer = Buffer.from(await imgResp.arrayBuffer());

    // Prompt
    const prompt = `
Generate a full-body cartoon character model of the child in this photo.
STYLE:
- Soft pastel coloring
- Clean outlines
- Friendly proportions
- Transparent background
FRAMING:
- Full head-to-toe
- No cropping
- Leave 15% margin top/bottom
`;

    // GPT-image-1 edit call
    const editResponse = await client.images.edit({
      model: "gpt-image-1",
      image: imageBuffer,
      prompt,
      size: "1024x1536",
    });

    const base64 = editResponse.data[0].b64_json;
    const buffer = Buffer.from(base64, "base64");

    // Upload
    const path = `character_models/${projectId}.png`;

    await supabase.storage.from("book_images").upload(path, buffer, {
      contentType: "image/png",
      upsert: true,
    });

    const { data: publicUrl } = supabase.storage
      .from("book_images")
      .getPublicUrl(path);

    await supabase
      .from("book_projects")
      .update({ character_model_url: publicUrl.publicUrl })
      .eq("id", projectId);

    return res.status(200).json({ characterModelUrl: publicUrl.publicUrl });

  } catch (err) {
    console.error("Character model error:", err);
    return res.status(500).json({ error: "Failed to generate model" });
  }
}
