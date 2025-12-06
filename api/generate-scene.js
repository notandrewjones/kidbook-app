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
    return res.status(400).json({ error: "Missing projectId, page, or pageText" });

  try {
    // ---------------------------------------------------
    // FETCH PROJECT INFO
    // ---------------------------------------------------
    const { data: project } = await supabase
      .from("book_projects")
      .select("character_model_url, illustrations")
      .eq("id", projectId)
      .single();

    if (!project?.character_model_url)
      return res.status(400).json({ error: "Character model not found." });

    // ---------------------------------------------------
    // LOAD CHARACTER MODEL → BASE64 INLINE
    // ---------------------------------------------------
    const imgResp = await fetch(project.character_model_url);
    const arrayBuffer = await imgResp.arrayBuffer();
    const base64Character = Buffer.from(arrayBuffer).toString("base64");
    const modelDataUrl = `data:image/png;base64,${base64Character}`;

    // ---------------------------------------------------
    // SCENE GENERATION PROMPT
    // ---------------------------------------------------
    const prompt = `
Create a children's book scene illustration based on this text:

PAGE TEXT:
"${pageText}"

STYLE:
• Same visual style as the previously generated character model (Jett-book inspired)
• Soft rounded cartoon shaping
• Clean pastel outlines and gentle gradients
• Balanced daylight color (5000–5500K)
• Friendly, simple, uncluttered backgrounds

REQUIREMENTS:
• Character must appear EXACTLY as the provided model (same clothes, face, hair, colors)
• Character must be full-body, head-to-toe, never cropped
• Leave 10% margin on all sides
• Scene must visually match the text context
• No text inside the image

OUTPUT:
• Square 1024x1024 PNG
`;

    // ---------------------------------------------------
    // GPT-4.1 CALL WITH IMAGE TOOL ENABLED
    // ---------------------------------------------------
    const response = await client.responses.create({
      model: "gpt-4.1",

      tools: [
        {
          type: "function",
          function: {
            name: "generate_image",
            description: "Generate a square PNG for a story scene",
            parameters: {
              type: "object",
              properties: {
                prompt: { type: "string" },
                size: { type: "string" }
              },
              required: ["prompt", "size"]
            }
          }
        }
      ],

      tool_choice: "auto",

      input: [
        {
          role: "user",
          content: [
            { type: "input_image", image_url: modelDataUrl },
            { type: "input_text", text: prompt }
          ]
        }
      ]
    });

    // ---------------------------------------------------
    // PARSE TOOL CALL
    // ---------------------------------------------------
    const toolCall = response.output[0]?.content?.find(c => c.type === "tool_call");

    if (!toolCall) {
      console.error("Scene tool call missing:", response);
      return res.status(500).json({ error: "Scene generation tool was not invoked." });
    }

    const base64Scene = toolCall.output[0].b64_json;
    const pngBuffer = Buffer.from(base64Scene, "base64");

    // ---------------------------------------------------
    // UPLOAD TO SUPABASE
    // ---------------------------------------------------
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

    const { data: urlData } = supabase.storage
      .from("book_images")
      .getPublicUrl(filePath);

    // ---------------------------------------------------
    // UPDATE DB
    // ---------------------------------------------------
    const updatedIllustrations = [
      ...(project.illustrations || []),
      { page, image_url: urlData.publicUrl }
    ];

    await supabase
      .from("book_projects")
      .update({ illustrations: updatedIllustrations })
      .eq("id", projectId);

    // ---------------------------------------------------
    // RETURN TO FRONTEND
    // ---------------------------------------------------
    return res.status(200).json({
      page,
      image_url: urlData.publicUrl
    });

  } catch (err) {
    console.error("Illustration generation error:", err);
    return res.status(500).json({ error: "Failed to generate illustration." });
  }
}
