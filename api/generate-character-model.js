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
    // Fetch child photo
    const { data: project } = await supabase
      .from("book_projects")
      .select("photo_url")
      .eq("id", projectId)
      .single();

    if (!project?.photo_url)
      return res.status(400).json({ error: "Child photo not found." });

    // Convert child image to base64
    const resp = await fetch(project.photo_url);
    const base64 = Buffer.from(await resp.arrayBuffer()).toString("base64");
    const dataUrl = `data:image/png;base64,${base64}`;

    // Your prompt
    const prompt = `
Create a **full-body cartoon character model sheet** of the child shown in the reference image.

STYLE REQUIREMENTS (Jett Book Style):
• Soft rounded proportions
• Slightly oversized head
• Pastel-adjacent palette
• Clean outlines
• Transparent background
• FULL head-to-toe, 15% margin, NEVER crop

Output: 1024×1536 PNG
`;

    // -----------------------------
    // GPT-4.1 with TOOL ENABLED
    // -----------------------------
    const response = await client.responses.create({
      model: "gpt-4.1",

		tools: [
		  {
		    name: "generate_image",   // REQUIRED BY API
		    type: "function",
		    function: {
		      name: "generate_image",  // MUST MATCH tools[0].name
		      description: "Generate a PNG image",
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

		tool_choice: {
		  type: "file_search"
		},
      

      input: [
        {
          role: "user",
          content: [
            { type: "input_image", image_url: dataUrl },
            { type: "input_text", text: prompt }
          ]
        }
      ]
    });

    // -----------------------------
    // PARSE TOOL CALL
    // -----------------------------
    const toolCall = response.output[0]?.content?.find(
      c => c.type === "tool_call"
    );

    if (!toolCall) {
      console.error("No tool call found:", response);
      return res.status(500).json({
        error: "Image generation tool was not invoked."
      });
    }

    // Extract actual base64 PNG
    const imageBase64 = toolCall.output[0].b64_json;
    const pngBuffer = Buffer.from(imageBase64, "base64");

    // Upload to Supabase
    const filePath = `character_models/${projectId}.png`;

    const { error: uploadError } = await supabase.storage
      .from("book_images")
      .upload(filePath, pngBuffer, {
        contentType: "image/png",
        upsert: true
      });

    if (uploadError)
      return res.status(500).json({ error: "Upload failed." });

    // Get public URL
    const { data: urlData } = supabase.storage
      .from("book_images")
      .getPublicUrl(filePath);

    // Update DB
    await supabase
      .from("book_projects")
      .update({ character_model_url: urlData.publicUrl })
      .eq("id", projectId);

    return res.status(200).json({
      characterModelUrl: urlData.publicUrl
    });

  } catch (err) {
    console.error("Character model generation error:", err);
    return res.status(500).json({ error: "Failed to generate character model." });
  }
}
