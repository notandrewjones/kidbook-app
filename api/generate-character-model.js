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

export default async function handler(req, res) {
  if (req.method !== "POST")
    return res.status(405).json({ error: "Method not allowed" });

  const { projectId } = req.body;
  if (!projectId)
    return res.status(400).json({ error: "Missing projectId" });

  try {
    // Get child photo URL
    const { data: project } = await supabase
      .from("book_projects")
      .select("photo_url")
      .eq("id", projectId)
      .single();

    if (!project?.photo_url)
      return res.status(400).json({ error: "Child photo not found." });

    // Convert image to base64
    const fetchResp = await fetch(project.photo_url);
    const arrayBuffer = await fetchResp.arrayBuffer();
    const base64Photo = Buffer.from(arrayBuffer).toString("base64");
    const dataUrl = `data:image/png;base64,${base64Photo}`;

    // Prompt for GPT-4.1
    const prompt = `
Create a full-body cartoon character model sheet in Jett-Book style.

Requirements:
• Head-to-toe visible
• 15% top/bottom margin
• Soft pastel shading
• Clean outlines
• Transparent background
• 1024x1536 PNG

Use the attached image as the reference for the child's appearance.
`;

    // -----------------------------------------
    // 🔥 NEW CORRECT GPT-4.1 IMAGE GENERATION
    // -----------------------------------------
    const response = await client.responses.create({
      model: "gpt-4.1",

      input: [
        {
          role: "user",
          content: [
            { type: "input_text", text: prompt },
            { type: "input_image", image_url: dataUrl }
          ]
        }
      ],

      tools: [
        { type: "image_generation" }   // ← THE KEY FIX
      ]
    });

    // -----------------------------------------
    // 🔥 Extract image data (NEW FORMAT)
    // -----------------------------------------
    const imageCall = response.output.find(
      out => out.type === "image_generation_call"
    );

    if (!imageCall) {
      console.error("NO IMAGE CALL:", response);
      return res.status(500).json({ error: "Model didn't generate image." });
    }

    const base64Image = imageCall.result;
    const pngBuffer = Buffer.from(base64Image, "base64");

    // Upload to Supabase
    const filePath = `character_models/${projectId}.png`;

    const { error: uploadError } = await supabase.storage
      .from("book_images")
      .upload(filePath, pngBuffer, {
        contentType: "image/png",
        upsert: true,
      });

    if (uploadError) {
      console.error(uploadError);
      return res.status(500).json({ error: "Upload failed." });
    }

    const { data: urlData } = supabase.storage
      .from("book_images")
      .getPublicUrl(filePath);

    // Save URL to DB
    await supabase
      .from("book_projects")
      .update({ character_model_url: urlData.publicUrl })
      .eq("id", projectId);

    return res.status(200).json({ characterModelUrl: urlData.publicUrl });

  } catch (err) {
    console.error("Character model generation error:", err);
    return res.status(500).json({ error: "Failed to generate character model." });
  }
}
