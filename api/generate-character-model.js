import OpenAI from "openai";
import { createClient } from "@supabase/supabase-js";

const DEV_MODE = process.env.DEV_MODE === "true";
const DEV_MODEL_URL = process.env.DEV_CHARACTER_MODEL_URL;

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

/**
 * Generate a unique character key from name
 */
function generateCharacterKey(name) {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_|_$/g, "");
}

/**
 * Multi-Character Model Generation
 * 
 * This endpoint now supports generating models for ANY character:
 * - The protagonist (main child)
 * - Siblings, parents, friends
 * - Pets with distinct appearances
 * 
 * Each character gets their own model sheet stored in character_models array
 */
export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { 
    projectId, 
    characterName,      // Name of the character (required)
    characterRole,      // "protagonist" | "sibling" | "parent" | "friend" | "pet" | "other"
    isProtagonist,      // Boolean - is this the main child?
    photoUrl,           // Optional: if photo already uploaded, pass URL directly
  } = req.body;

  if (!projectId) {
    return res.status(400).json({ error: "Missing projectId" });
  }

  if (!characterName) {
    return res.status(400).json({ error: "Missing characterName" });
  }

  const characterKey = generateCharacterKey(characterName);
  const role = characterRole || (isProtagonist ? "protagonist" : "other");

  // -------------------------------------------------------------
  // 🔧 DEV MODE — Placeholder character model
  // -------------------------------------------------------------
  if (DEV_MODE) {
    console.log("🔧 DEV MODE ENABLED — Using placeholder character model.");

    const { data: project } = await supabase
      .from("book_projects")
      .select("character_models, props_registry, context_registry")
      .eq("id", projectId)
      .single();

    // Initialize or get existing character_models array
    let characterModels = Array.isArray(project?.character_models) 
      ? project.character_models 
      : [];

    // Remove existing entry for this character if any
    characterModels = characterModels.filter(cm => cm.character_key !== characterKey);

    // Add new character model
    const newModel = {
      character_key: characterKey,
      name: characterName,
      role: role,
      model_url: DEV_MODEL_URL,
      source_photo_url: null,
      visual_source: "user",
      created_at: new Date().toISOString(),
      is_protagonist: isProtagonist || false,
      dev_placeholder: true,
    };

    characterModels.push(newModel);

    // Update props_registry to link character
    let registry = Array.isArray(project?.props_registry) && project.props_registry.length
      ? project.props_registry[0]
      : { characters: {}, props: {}, environments: {}, notes: "" };

    registry.characters[characterKey] = {
      ...registry.characters[characterKey],
      name: characterName,
      role: role,
      visual_source: "user",
      has_model: true,
      model_key: characterKey,
      locked_at: new Date().toISOString(),
    };

    await supabase
      .from("book_projects")
      .update({
        character_models: characterModels,
        props_registry: [registry],
        // Keep legacy field updated for backward compatibility
        ...(isProtagonist ? { character_model_url: DEV_MODEL_URL } : {}),
      })
      .eq("id", projectId);

    return res.status(200).json({
      characterModel: newModel,
      characterModels: characterModels,
      devMode: true,
    });
  }

  // -------------------------------------------------------------
  // Production flow
  // -------------------------------------------------------------
  try {
    // Fetch project data
    const { data: project, error: projectError } = await supabase
      .from("book_projects")
      .select("photo_url, character_models, props_registry, context_registry")
      .eq("id", projectId)
      .single();

    if (projectError) {
      console.error("Project fetch error:", projectError);
      return res.status(500).json({ error: "Could not load project." });
    }

    // Determine which photo to use
    const sourcePhotoUrl = photoUrl || project?.photo_url;

    if (!sourcePhotoUrl) {
      return res.status(400).json({ 
        error: "No photo available. Upload a photo first or provide photoUrl." 
      });
    }

    // Fetch photo → buffer
    const imgResp = await fetch(sourcePhotoUrl);
    const arrayBuffer = await imgResp.arrayBuffer();
    const imageBuffer = Buffer.from(arrayBuffer);

    // Build character-specific prompt
    const prompt = buildCharacterModelPrompt(characterName, role);

    // GPT-4.1 Image Generation
    const response = await client.responses.create({
      model: "gpt-4.1",
      input: [
        {
          role: "user",
          content: [
            { type: "input_text", text: prompt },
            {
              type: "input_image",
              image_url: `data:image/png;base64,${imageBuffer.toString("base64")}`
            }
          ]
        }
      ],
      tools: [
        {
          type: "image_generation",
          model: "gpt-image-1",
          size: "1024x1024",
          quality: "low", // Change to "high" for production
          background: "transparent",
          output_format: "png",
          output_compression: 100,
          moderation: "auto",
        },
      ]
    });

    const imageCall = response.output.find(o => o.type === "image_generation_call");

    if (!imageCall?.result) {
      console.error("NO IMAGE GENERATED:", response);
      return res.status(500).json({ error: "Model did not generate a character image." });
    }

    const pngBuffer = Buffer.from(imageCall.result, "base64");

    // Upload to Supabase storage with character-specific path
    const filePath = `character_models/${projectId}/${characterKey}.png`;

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

    // -------------------------------------------------------------
    // Update character_models array
    // -------------------------------------------------------------
    let characterModels = Array.isArray(project?.character_models) 
      ? project.character_models 
      : [];

    // Remove existing entry for this character if any
    characterModels = characterModels.filter(cm => cm.character_key !== characterKey);

    // Add new character model
    const newModel = {
      character_key: characterKey,
      name: characterName,
      role: role,
      model_url: publicUrl.publicUrl,
      source_photo_url: sourcePhotoUrl,
      visual_source: "user",
      created_at: new Date().toISOString(),
      is_protagonist: isProtagonist || false,
    };

    characterModels.push(newModel);

    // -------------------------------------------------------------
    // Update props_registry to link character to model
    // -------------------------------------------------------------
    let registry = Array.isArray(project?.props_registry) && project.props_registry.length
      ? project.props_registry[0]
      : { characters: {}, props: {}, environments: {}, notes: "" };

    registry.characters[characterKey] = {
      ...registry.characters[characterKey],
      name: characterName,
      role: role,
      visual_source: "user",
      has_model: true,
      model_key: characterKey,
      locked_at: new Date().toISOString(),
    };

    // Persist updates
    await supabase
      .from("book_projects")
      .update({
        character_models: characterModels,
        props_registry: [registry],
        // Keep legacy field updated for protagonist (backward compatibility)
        ...(isProtagonist ? { character_model_url: publicUrl.publicUrl } : {}),
      })
      .eq("id", projectId);

    console.log(`✅ Character model generated: ${characterName} (${characterKey})`);

    return res.status(200).json({
      characterModel: newModel,
      characterModels: characterModels,
    });

  } catch (err) {
    console.error("Character model generation error:", err);
    return res.status(500).json({ error: "Failed to generate character model." });
  }
}

/**
 * Build a role-appropriate character model prompt
 */
function buildCharacterModelPrompt(name, role) {
  const baseStyle = `
STYLE REQUIREMENTS (Jett Book Style):
• Soft, rounded cartoon proportions
• Slightly oversized head, friendly bright eyes
• Simple pastel-adjacent palette, gentle gradients
• Clean, medium-weight outlines
• Warm neutral white balance (5000–5500K)
• Soft ambient lighting
• NO BACKGROUND — transparent PNG
• Character must be fully visible, head-to-toe with 10–15% margins
• Neutral standing pose facing forward
• Neutral, happy expression

OUTPUT:
• A full-body character model sheet
• Transparent PNG
• Character should be recognizable and consistent for reuse across multiple illustrations
`;

  if (role === "pet") {
    return `
Create a full-body cartoon character model sheet of the pet shown in the attached image.
This is ${name}, a pet character who will appear throughout a children's picture book.

${baseStyle}

ADDITIONAL PET NOTES:
• Capture distinctive markings, colors, and breed characteristics
• Keep proportions consistent with children's book illustration style
• The pet should look friendly and approachable
`;
  }

  if (role === "protagonist") {
    return `
Create a full-body cartoon character model sheet of the child shown in the attached image.
This is ${name}, the main character (protagonist) of a children's picture book.

${baseStyle}

ADDITIONAL PROTAGONIST NOTES:
• This character will appear on almost every page
• Capture their unique features, hair, skin tone accurately
• Expression should be warm and relatable
`;
  }

  // Default for siblings, parents, friends, other
  return `
Create a full-body cartoon character model sheet of the person shown in the attached image.
This is ${name}, a character who will appear in a children's picture book.

${baseStyle}

ADDITIONAL NOTES:
• Capture their unique features accurately
• Style should match other characters in the book (soft, rounded, friendly)
`;
}