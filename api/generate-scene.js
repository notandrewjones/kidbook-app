import OpenAI from "openai";
import { createClient } from "@supabase/supabase-js";

const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// Future toggle — streaming will hook into this later
const STREAMING_ENABLED = false;

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { projectId, page, pageText } = req.body;

  if (!projectId || !page || !pageText) {
    return res.status(400).json({ error: "Missing projectId, page, or pageText" });
  }

  try {
    // 1) Load project to get character model
    const { data: project, error: projectError } = await supabase
      .from("book_projects")
      .select("character_model_url, illustrations")
      .eq("id", projectId)
      .single();

    if (projectError || !project) {
      console.error(projectError);
      return res.status(400).json({ error: "Project not found" });
    }

    if (!project.character_model_url) {
      return res.status(400).json({ error: "Character model not generated yet" });
    }

    // 2) Fetch the character model PNG as base64
    const imgResp = await fetch(project.character_model_url);
    const arrayBuffer = await imgResp.arrayBuffer();
    const base64Character = Buffer.from(arrayBuffer).toString("base64");

    // 3) Create scene prompt (Hybrid style)
    const prompt = `
Create a children's book illustration for this story page:

PAGE TEXT:
"${pageText}"

Use the attached character model exactly as the main character.

STYLE:
• Hybrid children's storybook scene
• Soft, simple, pastel-adjacent shapes
• Bright but not neon colors
• Smooth rounded outlines, medium weight
• Slight depth but not realistic shading
• Gentle gradients and soft ambient light
• Clear, readable composition for young children
• No clutter, minimal complexity
• Maintain consistent daylight-balanced lighting at 5000–5500K
• Make the environment lively but clean (e.g., soft background animals, trees, clouds)

COMPOSITION:
• Character should be the clear focus
• Full body visible unless page text specifies otherwise
• Entire head and feet visible (no cropping)
• Character should look consistent with model sheet
• Place character naturally inside the scene described by the page text

BACKGROUND:
• Simple cartoon environment inspired by the text
• Soft shapes, pastel palette, consistent white balance

OUTPUT:
• Full-page 1024x1024 illustration
• Transparent PNG or full background if scene requires
• No text on image
`;

    // 4) CALL IMAGES.GENERATE (non-streaming for now)
    const imageResponse = await client.images.generate({
      model: "gpt-image-1",
      prompt,
      size: "1024x1024",
      image: [
        {
          type: "input_image",
          data: base64Character,
          mime_type: "image/png"
        }
      ],
      // prepare for streaming but not enabled yet
      stream: STREAMING_ENABLED ? true : false
    });

    // final output (if streaming is off)
    const base64Output = imageResponse.data[0].b64_json;
    const buffer = Buffer.from(base64Output, "base64");

    // 5) Upload to Supabase
    const filePath = `illustrations/${projectId}-page-${page}.png`;
    const { error: uploadError } = await supabase.storage
      .from("book_images")
      .upload(filePath, buffer, {
        contentType: "image/png",
        upsert: true,
      });

    if (uploadError) {
      console.error(uploadError);
      return res.status(500).json({ error: "Failed to upload illustration" });
    }

    // 6) Get public URL
    const { data: publicUrl } = supabase.storage
      .from("book_images")
      .getPublicUrl(filePath);

    // 7) Update DB
    const newIllustration = { page, image_url: publicUrl.publicUrl };

    const updatedList = [
      ...(project.illustrations || []),
      newIllustration
    ];

    await supabase
      .from("book_projects")
      .update({ illustrations: updatedList })
      .eq("id", projectId);

    // 8) Return illustration to frontend
    return res.status(200).json(newIllustration);

  } catch (err) {
    console.error("Illustration generation error:", err);
    return res.status(500).json({ error: "Failed to generate illustration" });
  }
}
