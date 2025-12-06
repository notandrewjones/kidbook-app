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

  const { projectId, kidName } = req.body;
  if (!projectId)
    return res.status(400).json({ error: "Missing projectId" });

  try {
    // -----------------------------
    // Fetch uploaded child photo
    // -----------------------------
    const { data: project, error: projectError } = await supabase
      .from("book_projects")
      .select("photo_url")
      .eq("id", projectId)
      .single();

    if (projectError || !project?.photo_url) {
      console.error(projectError);
      return res.status(400).json({ error: "Child photo not found." });
    }

    // Fetch the image and convert to base64
    const fetchResp = await fetch(project.photo_url);
    const arrayBuffer = await fetchResp.arrayBuffer();
    const base64Image = Buffer.from(arrayBuffer).toString("base64");
    const dataUrl = `data:image/png;base64,${base64Image}`;

    // -----------------------------
    // CHARACTER MODEL PROMPT
    // -----------------------------
    const prompt = `
Create a **full-body cartoon character model sheet** of the child shown in the reference image.

STYLE REQUIREMENTS (Jett Book Style):
• Soft, rounded cartoon proportions
• Slightly oversized head, friendly bright eyes
• Simple pastel-adjacent palette, gentle gradients
• Clean, medium-weight outlines
• Consistent warm neutral white balance (5000–5500K)
• Soft ambient lighting, minimal shadows
• Transparent background preferred (PNG)
• Full head-to-toe, centered, no cropping whatsoever
• Leave 15% margin above head and below feet

OUTPUT:
• Full-body character model
• 1024×1536 portrait PNG
• No background, no shadows, no text
`;

    // -----------------------------
    // GPT-4.1 → TOOL CALL
    // -----------------------------
    const response = await client.responses.create({
      model: "gpt-4.1",
      input: [
        {
          role: "user",
          content: [
            { type: "input_image", image_url: dataUrl },
            { type: "text", text: prompt }
          ]
        }
      ]
    });

    // -----------------------------
    // Parse tool call output
    // -----------------------------
    const toolCall = response.output[0]?.content?.find(c => c.type === "tool_call");

    if (!toolCall) {
      console.error("No tool call found:", response);
      return res.status(500).json({ error: "Model did not generate an image." });
    }

    const imageBase64 = toolCall.output[0].b64_json;
    const pngBuffer = Buffer.from(imageBase64, "base64");

    // -----------------------------
    // Upload to Supabase
    // -----------------------------
    const filePath = `character_models/${projectId}.png`;

    const { error: uploadError } = await supabase.storage
      .from("book_images")
      .upload(filePath, pngBuffer, {
        contentType: "image/png",
        upsert: true,
      });

    if (uploadError) {
      console.error("Upload error:", uploadError);
      return res.status(500).json({ error: "Upload failed." });
    }

    const { data: publicUrl } = supabase.storage
      .from("book_images")
      .getPublicUrl(filePath);

    // -----------------------------
    // Save URL to database
    // -----------------------------
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
