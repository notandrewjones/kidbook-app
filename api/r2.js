// api/_r2.js
// Cloudflare R2 Storage Utility

import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";

// R2 uses S3-compatible API
const r2Client = new S3Client({
  region: "auto",
  endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId: process.env.R2_ACCESS_KEY_ID,
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
  },
});

const BUCKET_NAME = process.env.R2_BUCKET_NAME || "book-images";
const PUBLIC_URL_BASE = process.env.R2_PUBLIC_URL || `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com/${BUCKET_NAME}`;

/**
 * Upload a file to R2 storage
 * @param {string} filePath - The path/key for the file in the bucket (e.g., "source_photos/abc123/photo.png")
 * @param {Buffer} fileBuffer - The file content as a Buffer
 * @param {string} contentType - MIME type (e.g., "image/png")
 * @returns {Promise<{success: boolean, publicUrl?: string, error?: string}>}
 */
export async function uploadToR2(filePath, fileBuffer, contentType) {
  try {
    const command = new PutObjectCommand({
      Bucket: BUCKET_NAME,
      Key: filePath,
      Body: fileBuffer,
      ContentType: contentType,
    });

    await r2Client.send(command);

    // Construct public URL
    const publicUrl = `${PUBLIC_URL_BASE}/${filePath}`;

    return { success: true, publicUrl };
  } catch (error) {
    console.error("R2 upload error:", error);
    return { success: false, error: error.message };
  }
}

/**
 * Get the public URL for a file path
 * @param {string} filePath - The path/key for the file in the bucket
 * @returns {string} The public URL
 */
export function getR2PublicUrl(filePath) {
  return `${PUBLIC_URL_BASE}/${filePath}`;
}

export { r2Client, BUCKET_NAME, PUBLIC_URL_BASE };