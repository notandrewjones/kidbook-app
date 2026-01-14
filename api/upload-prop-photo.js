// api/upload-prop-photo.js
// Upload a reference photo for a prop (airplane, toy, etc.)
// Unlike characters, we don't generate a model - we use the raw photo as reference

import { createClient } from "@supabase/supabase-js";
import { uploadToR2 } from "./_r2.js";

const DEV_MODE = process.env.DEV_MODE === "true";
const DEV_PROP_URL = "https://placehold.co/512x512/34d399/white?text=PROP";

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
    let propKey;
    let propName;

    bb.on("field", (name, value) => {
      if (name === "projectId") projectId = value;
      if (name === "propKey") propKey = value;
      if (name === "propName") propName = value;
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
      resolve({ fileBuffer, fileInfo, projectId, propKey, propName });
    });

    bb.on("error", reject);
    req.pipe(bb);
  });
}

function generatePropKey(name) {
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
    const { fileBuffer, fileInfo, projectId, propKey, propName } = await readFile(req);

    if (!projectId) {
      return res.status(400).json({ error: "Missing projectId" });
    }
    if (!propKey && !propName) {
      return res.status(400).json({ error: "Missing propKey or propName" });
    }
    // In DEV_MODE, we don't require an actual file
    if (!fileBuffer && !DEV_MODE) {
      return res.status(400).json({ error: "No file uploaded" });
    }

    // Use provided key or generate from name
    const finalPropKey = propKey || generatePropKey(propName);
    
    let photoUrl;
    
    // -------------------------------------------------------------
    // 🔧 DEV MODE — Skip actual R2 upload, use placeholder URL
    // -------------------------------------------------------------
    if (DEV_MODE) {
      console.log("🔧 DEV MODE — Skipping R2 upload for prop, using placeholder URL");
      photoUrl = DEV_PROP_URL;
    } else {
      // Production: Upload to R2
      const ext = fileInfo.filename?.split(".").pop() || "png";
      const filePath = `prop_photos/${projectId}/${finalPropKey}.${ext}`;

      const uploadResult = await uploadToR2(filePath, fileBuffer, fileInfo.mimeType);

      if (!uploadResult.success) {
        console.error("R2 upload error:", uploadResult.error);
        return res.status(500).json({ error: "Upload failed" });
      }

      photoUrl = uploadResult.publicUrl;
    }
    
    console.log("Prop photo URL:", photoUrl);

    // Update the props_registry with the reference image URL
    const { data: project, error: fetchError } = await supabase
      .from("book_projects")
      .select("props_registry")
      .eq("id", projectId)
      .single();

    if (fetchError) {
      console.error("Failed to fetch project:", fetchError);
      return res.status(500).json({ error: "Failed to fetch project" });
    }

    // Get or initialize registry
    let registry = Array.isArray(project?.props_registry) && project.props_registry.length
      ? project.props_registry[0]
      : { characters: {}, props: {}, environments: {} };

    // Ensure props section exists
    if (!registry.props) registry.props = {};

    // Update the prop with reference image
    if (registry.props[finalPropKey]) {
      registry.props[finalPropKey].reference_image_url = photoUrl;
      registry.props[finalPropKey].image_source = "user";
      registry.props[finalPropKey].image_uploaded_at = new Date().toISOString();
    } else {
      // Prop doesn't exist yet - create it
      registry.props[finalPropKey] = {
        name: propName || finalPropKey,
        description: "User-uploaded prop",
        reference_image_url: photoUrl,
        image_source: "user",
        image_uploaded_at: new Date().toISOString(),
        first_seen_page: 1,
      };
    }

    // Save updated registry
    const { error: updateError } = await supabase
      .from("book_projects")
      .update({ props_registry: [registry] })
      .eq("id", projectId);

    if (updateError) {
      console.error("Failed to update registry:", updateError);
      return res.status(500).json({ error: "Failed to save prop reference" });
    }

    return res.status(200).json({
      photoUrl,
      propKey: finalPropKey,
      propName: propName || finalPropKey,
      registry: registry,
    });

  } catch (error) {
    console.error("Upload error:", error);
    return res.status(500).json({ error: "Failed to upload photo" });
  }
}