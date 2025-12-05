import { createClient } from "@supabase/supabase-js";

// Supabase client (service role required for uploads)
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

    const { data, error } = await supabase.storage
      .from("book_images")
      .upload(filePath, fileBuffer, {
        contentType: fileInfo.mimeType,
        upsert: true, // overwrite if needed
      });

    if (error) {
      console.error("Supabase upload error:", error);
      return res.status(500).json({ error: "Upload failed" });
    }

    // Generate public URL
    const { data: publicUrlData } = supabase.storage
      .from("book_images")
      .getPublicUrl(filePath);

    const photoUrl = publicUrlData.publicUrl;

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
