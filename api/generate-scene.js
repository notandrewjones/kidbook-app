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
    // -----------------------------------
    // Fetch project info
    // -----------------------------------
    const { data: project } = await supabase
      .from("book_projects")
      .select("character_model_url, illustrations")
      .eq("id", projectId)
      .single();

    if (!project?.character_model_url)
      return res.status(400).json({ error: "Character model not found." });

    // -----------------------------------
    // Load character model as base64
    // -----------------------------------
    const imgResp = await fetch(project.character_model_url);
    const arrayBuffer = await imgResp.arrayBuffer();
    const base64ModelImage = Buffer.from(arrayBuffer).toString("base64");
    const modelDataUrl = `data:image/png;base64,${base64ModelImage}`;

    // -----------------------------------
    // Scene generation prompt
    // -----------------------------------
    const prompt = `
Create a children's book scene illustration for this page:

PAGE TEXT:
"${pageText}"

STYLE:
• Same style as the provided character model (Jett-book inspired)
• Soft pastel-friendly shading with clean line art
• Balanced daylight color temperature (5000–5500K)
• Friendly, simple children's book background supporting the scene
• Do NOT modify the character's appearance—must match the model exactly
• Character must appear full-body, head-to-toe, never cropped
• 10% margin on all sides
• Square 1024×1024 PNG output
• No text inside the image
`;

    // -----------------------------------
    // GPT-4.1 IMAGE GENERATION (correct format)
    // -----------------------------------
    const response = await client.responses.create({
      model: "gpt-4.1",

      input: [
        {
          role: "user",
          content: [
            { type: "input_text", text: prompt },
            { type: "input_image", image_url: modelDataUrl }
          ]
        }
      ],

      tools: [
        { type: "image_generation" }   // IMPORTANT: Correct tool type
      ]
    });

    // -----------------------------------
    // Extract image output
    // -----------------------------------
    const imageCall = response.output.find(
      out => out.type === "image_generation_call"
    );

    if (!imageCall) {
      console.error("NO IMAGE CALL:", response);
      return res.status(500).json({
        error: "Model did not generate a scene illustration."
      });
    }

    const base64Scene = imageCall.result;
    const pngBuffer = Buffer.from(base64Scene, "base64");

    // -----------------------------------
    // Upload to Supabase
    // -----------------------------------
    const filePath = `illustrations/${projectId}-page-${page}.png`;

    const { error: uploadError } = await supabase.storage
      .from("book_images")
      .upload(filePath, pngBuffer, {
        contentType: "image/png",
        upsert: true
      });

    if (uploadError) {
      console.error(uploadError);
      return res.status(500).json({ error: "Upload failed." });
    }

    const { data: urlData } = supabase.storage
      .from("book_images")
      .getPublicUrl(filePath);

    // -----------------------------------
    // Save to database
    // -----------------------------------
    const updatedIllustrations = [
      ...(project.illustrations || []),
      { page, image_url: urlData.publicUrl }
    ];

    await supabase
      .from("book_projects")
      .update({ illustrations: updatedIllustrations })
      .eq("id", projectId);

    // -----------------------------------
    // Send result back to frontend
    // -----------------------------------
    return res.status(200).json({
      page,
      image_url: urlData.publicUrl
    });

  } catch (err) {
    console.error("Illustration generation error:", err);
    return res.status(500).json({ error: "Failed to generate illustration." });
  }
}
