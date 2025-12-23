import { createClient } from "@supabase/supabase-js";
import { uploadToR2 } from "./_r2.js";

// Supabase client (for database operations)
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

export const config = {
  api: {
    bodyParser: false, // Required for handling file uploads
  },
};

function readFile(req) {
  return new Promise((resolve, reject) => {
    const busboy = require("busboy");
    const bb = busboy({ headers: req.headers });

    let fileBuffer;
    let fileInfo = {};
    let projectId;

    bb.on("field", (name, value) => {
      if (name === "projectId") projectId = value;
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
      resolve({ fileBuffer, fileInfo, projectId });
    });

    req.pipe(bb);
  });
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const { fileBuffer, fileInfo, projectId } = await readFile(req);

    if (!projectId) {
      return res.status(400).json({ error: "Missing projectId" });
    }
    if (!fileBuffer) {
      return res.status(400).json({ error: "No file uploaded" });
    }

    const ext = fileInfo.filename.split(".").pop();
    const filePath = `source_photos/${projectId}.${ext}`;

    // Upload to R2
    const uploadResult = await uploadToR2(filePath, fileBuffer, fileInfo.mimeType);

    if (!uploadResult.success) {
      console.error("R2 upload error:", uploadResult.error);
      return res.status(500).json({ error: "Upload failed" });
    }

    const photoUrl = uploadResult.publicUrl;
    console.log("Returning public image URL:", photoUrl);


    // Save into book_projects
    await supabase
      .from("book_projects")
      .update({ photo_url: photoUrl })
      .eq("id", projectId);

    return res.status(200).json({ photoUrl });

  } catch (error) {
    console.error("Upload error:", error);
    return res.status(500).json({ error: "Failed to upload photo" });
  }
}