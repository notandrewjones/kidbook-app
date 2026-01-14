// api/upload-character-photo.js
// Upload a photo for any character (not just the protagonist)

import { createClient } from "@supabase/supabase-js";
import { uploadToR2 } from "./_r2.js";

const DEV_MODE = process.env.DEV_MODE === "true";
// placehold.co returns SVG by default - use .png extension to force PNG format
const DEV_PHOTO_URL = process.env.DEV_CHARACTER_MODEL_URL || "https://placehold.co/512x512/7c5cff/white.png?text=DEV";

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

export const config = {
  api: {
    bodyParser: false,
  },
};

function readFile(req) {
  return new Promise((resolve, reject) => {
    const busboy = require("busboy");
    const bb = busboy({ headers: req.headers });

    let fileBuffer;
    let fileInfo = {};
    let projectId;
    let characterName;
    let characterRole;

    bb.on("field", (name, value) => {
      if (name === "projectId") projectId = value;
      if (name === "characterName") characterName = value;
      if (name === "characterRole") characterRole = value;
    });

    bb.on("file", (name, file, info) => {
      const { filename, mimeType } = info;
      fileInfo = { filename, mimeType };
      const chunks = [];

      file.on("data", (chunk) => chunks.push(chunk));
      file.on("end", () => {
        fileBuffer = Buffer.concat(chunks);
      });
    });

    bb.on("finish", () => {
      resolve({ fileBuffer, fileInfo, projectId, characterName, characterRole });
    });

    bb.on("error", reject);
    req.pipe(bb);
  });
}

function generateCharacterKey(name) {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_|_$/g, "");
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const { fileBuffer, fileInfo, projectId, characterName, characterRole } = await readFile(req);

    if (!projectId) {
      return res.status(400).json({ error: "Missing projectId" });
    }
    if (!characterName) {
      return res.status(400).json({ error: "Missing characterName" });
    }
    // In DEV_MODE, we don't require an actual file
    if (!fileBuffer && !DEV_MODE) {
      return res.status(400).json({ error: "No file uploaded" });
    }

    const characterKey = generateCharacterKey(characterName);
    
    let photoUrl;
    
    // -------------------------------------------------------------
    // 🔧 DEV MODE — Skip actual R2 upload, use placeholder URL
    // -------------------------------------------------------------
    if (DEV_MODE) {
      console.log("🔧 DEV MODE — Skipping R2 upload, using placeholder URL");
      photoUrl = DEV_PHOTO_URL;
    } else {
      // Production: Upload to R2
      const ext = fileInfo.filename?.split(".").pop() || "png";
      const filePath = `source_photos/${projectId}/${characterKey}.${ext}`;

      const uploadResult = await uploadToR2(filePath, fileBuffer, fileInfo.mimeType);

      if (!uploadResult.success) {
        console.error("R2 upload error:", uploadResult.error);
        return res.status(500).json({ error: "Upload failed" });
      }

      photoUrl = uploadResult.publicUrl;
    }
    
    console.log("Character photo URL:", photoUrl);

    // Update the project's pending_character_photos to track uploads before model generation
    const { data: project } = await supabase
      .from("book_projects")
      .select("pending_character_photos")
      .eq("id", projectId)
      .single();

    let pendingPhotos = Array.isArray(project?.pending_character_photos)
      ? project.pending_character_photos
      : [];

    // Remove existing entry for this character if any
    pendingPhotos = pendingPhotos.filter(p => p.character_key !== characterKey);

    pendingPhotos.push({
      character_key: characterKey,
      character_name: characterName,
      character_role: characterRole || "other",
      photo_url: photoUrl,
      uploaded_at: new Date().toISOString(),
    });

    await supabase
      .from("book_projects")
      .update({ pending_character_photos: pendingPhotos })
      .eq("id", projectId);

    return res.status(200).json({
      photoUrl,
      characterKey,
      characterName,
      characterRole: characterRole || "other",
    });

  } catch (error) {
    console.error("Upload error:", error);
    return res.status(500).json({ error: "Failed to upload photo" });
  }
}