import OpenAI, { toFile } from "openai";
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

  const { projectId, kidName } = req.body;

  if (!projectId) {
    return res.status(400).json({ error: "Missing projectId" });
  }

  try {
    //
    // 1) Fetch the existing project to get the uploaded photo URL
    //
    const { data: project, error: projectError } = await supabase
      .from("book_projects")
      .select("photo_url")
      .eq("id", projectId)
      .single();

    if (projectError) {
      console.error("Project lookup error:", projectError);
      return res.status(400).json({ error: "Unable to find project" });
    }

    if (!project?.photo_url) {
      return res
        .status(400)
        .json({ error: "No source photo found for this project" });
    }

    const sourcePhotoUrl = project.photo_url;

    //
    // 2) Download the child's photo and convert to a File object
    //
    const photoResp = await fetch(sourcePhotoUrl);
    if (!photoResp.ok) {
      console.error("Failed to fetch source photo:", photoResp.status);
      return res.status(500).json({ error: "Failed to fetch source photo" });
    }

    const contentType =
      photoResp.headers.get("content-type") || "image/jpeg";
    const arrayBuffer = await photoResp.arrayBuffer();
    const blob = new Blob([arrayBuffer], { type: contentType });

    const imageFile = await toFile(blob, "child-photo", {
      type: contentType,
    });

    //
    // 3) The optimized, consistent, token-efficient Jett Book Style prompt
    //
    const childNameSafe = kidName || "the child";

    const prompt = `
Create a full-body cartoon character model of ${childNameSafe}. Use the reference photo to match their face, hair, skin tone, and build.
	
Do not match the cropping of the reference image. Instead generate a fully visible, head-to-toe character model.


STYLE:
• Modern children's board-book illustration  
• Semi-flat with soft shading  
• Smooth rounded outlines, medium weight, no sketch texture  
• Slightly oversized head (20–25%), expressive eyes, small nose, gentle smile  
• Soft gradients for skin, clothes, and hair  
• Pastel-adjacent but vivid color palette; never neon  
• Clean vector-like shapes with subtle painterly depth  
• Simple, kid-friendly clothing with light shading  
• Transparent PNG background  

LIGHTING / COLOR:
• Even daylight-balanced lighting (5000–5500K)  
• No white balance shifts between images  
• No harsh shadows, no dramatic contrast  

POSE / FRAMING:
• Full-body standing pose, neutral and friendly  
• Face fully visible; feet fully visible  
• No props, no scenery, no text  
• The entire head must be fully visible with space above it  
• The entire body must be visible including feet  
• Do NOT crop at the forehead, knees, or shins  
• Frame the character with a generous margin around all edges  
• Portrait-style composition with the figure centered  

PRIORITIES:
1. Keep the child's likeness  
2. Match this art style exactly  
3. Maintain consistent lighting and white balance  
4. Maintain proper framing. Do not cut off any part of the character model by shortening or condensing the framing of the image, even if the original image has crops.
5. Do not render any text in this image. No text should be visible on shirts, tattoos, hats, etc.
`;

    //
    // 4) Call the OpenAI Images Edit API
    //
    const imgResponse = await client.images.edit({
      model: "gpt-image-1",
      image: [imageFile],
      prompt,
      size: "1024x1024",
      output_format: "png",
      background: "transparent",
      input_fidelity: "high",
      n: 1,
    });

    const base64 = imgResponse.data[0].b64_json;
    const buffer = Buffer.from(base64, "base64");

    //
    // 5) Upload to Supabase
    //
    const filePath = `character_models/${projectId}.png`;

    const { error: uploadError } = await supabase.storage
      .from("book_images")
      .upload(filePath, buffer, {
        contentType: "image/png",
        upsert: true,
      });

    if (uploadError) {
      console.error("Supabase upload error:", uploadError);
      return res
        .status(500)
        .json({ error: "Failed to upload character model image" });
    }

    //
    // 6) Get public URL
    //
    const { data: publicUrlData } = supabase.storage
      .from("book_images")
      .getPublicUrl(filePath);

    const characterUrl = publicUrlData.publicUrl;

    //
    // 7) Save URL to database
    //
    await supabase
      .from("book_projects")
      .update({ character_model_url: characterUrl })
      .eq("id", projectId);

    //
    // 8) Return to frontend
    //
    return res.status(200).json({ characterModelUrl: characterUrl });
  } catch (err) {
    console.error("Character model generation error:", err);
    return res
      .status(500)
      .json({ error: "Failed to generate character model" });
  }
}
