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

  const { projectId, page, pageText } = req.body;

  if (!projectId || !page || !pageText)
    return res.status(400).json({ error: "Missing parameters" });

  try {
    // ----------------------------
    // Get character model URL
    // ----------------------------
    const { data: project } = await supabase
      .from("book_projects")
      .select("character_model_url, illustrations")
      .eq("id", projectId)
      .single();

    if (!project || !project.character_model_url)
      return res.status(400).json({ error: "Character model not ready." });

    // Fetch and convert character model to base64 input
    const imgResp = await fetch(project.character_model_url);
    const buf = Buffer.from(await imgResp.arrayBuffer());
    const base64 = buf.toString("base64");
    const dataUrl = `data:image/png;base64,${base64}`;

    // ----------------------------
    // Scene Generation Prompt
    // ----------------------------
    const prompt = `
Create a children's book illustration based on this story page:

PAGE TEXT:
"${pageText}"

Use the attached character model EXACTLY as the main character.
Match face, proportions, clothing, colors, and style.

STYLE:
• Jett-book inspired soft cartoon shading
• Soft pastels, gentle gradients
• Clean line work
• Bright friendly daylight (5000–5500K)
• Simple background illustrating story context
• No text in the image

COMPOSITION:
• Character must be fully visible (head-to-toe)
• Leave 10% frame margin on all sides
• Square format 1024×1024
`;

    // ----------------------------
    // GPT-4.1 Tool Call
    // ----------------------------
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

    // Extract tool call output
    const toolCall = response.output[0]?.content?.find(c => c.type === "tool_call");

    if (!toolCall) {
      console.error("No tool call:", response);
      return res.status(500).json({ error: "Model failed to generate image." });
    }

    const imageBase64 = toolCall.output[0].b64_json;
    const pngBuffer = Buffer.from(imageBase64, "base64");

    // ----------------------------
    // Upload to Supabase
    // ----------------------------
    const filePath = `illustrations/${projectId}-page-${page}.png`;

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

    const { data: publicUrl } = supabase.storage
      .from("book_images")
      .getPublicUrl(filePath);

    // Save illustration to DB
    const updatedIllustrations = [
      ...(project.illustrations || []),
      { page, image_url: publicUrl.publicUrl }
    ];

    await supabase
      .from("book_projects")
      .update({ illustrations: updatedIllustrations })
      .eq("id", projectId);

    return res.status(200).json({
      page,
      image_url: publicUrl.publicUrl
    });

  } catch (err) {
    console.error("Illustration generation error:", err);
    return res.status(500).json({ error: "Failed to generate illustration." });
  }
}
