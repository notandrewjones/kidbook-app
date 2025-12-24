// api/lulu/upload-pdf.js
// Upload print-ready PDFs to public storage for Lulu to access
// Supports both interior and cover PDFs

const { createClient } = require("@supabase/supabase-js");
const { getCurrentUser } = require("../_auth.js");

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// R2/S3 configuration (if using Cloudflare R2)
const R2_BUCKET_URL = process.env.R2_PUBLIC_URL || process.env.R2_BUCKET_URL;
const R2_ACCESS_KEY = process.env.R2_ACCESS_KEY_ID;
const R2_SECRET_KEY = process.env.R2_SECRET_ACCESS_KEY;
const R2_ENDPOINT = process.env.R2_ENDPOINT;

/**
 * Upload a PDF file for print production
 * The file must be publicly accessible for Lulu to download
 */
async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { user, error: authError } = await getCurrentUser(req, res);

  if (!user) {
    return res.status(401).json({
      error: "Unauthorized",
      message: authError || "Please log in",
    });
  }

  const { type, bookId, orderId } = req.query;

  if (!type || !['interior', 'cover'].includes(type)) {
    return res.status(400).json({ error: "Type must be 'interior' or 'cover'" });
  }

  if (!bookId) {
    return res.status(400).json({ error: "Book ID required" });
  }

  // Verify book ownership
  const { data: book, error: bookError } = await supabase
    .from("book_projects")
    .select("id, user_id")
    .eq("id", bookId)
    .single();

  if (bookError || !book) {
    return res.status(404).json({ error: "Book not found" });
  }

  if (book.user_id !== user.id) {
    return res.status(403).json({ error: "Access denied" });
  }

  try {
    // Parse the incoming PDF data
    // Expecting base64 encoded PDF in body
    const contentType = req.headers['content-type'];
    
    let pdfBuffer;
    
    if (contentType?.includes('application/json')) {
      const { pdfBase64 } = req.body;
      if (!pdfBase64) {
        return res.status(400).json({ error: "PDF data required (pdfBase64)" });
      }
      pdfBuffer = Buffer.from(pdfBase64, 'base64');
    } else if (contentType?.includes('application/pdf')) {
      // Direct PDF upload
      pdfBuffer = await getRawBody(req);
    } else {
      return res.status(400).json({ 
        error: "Invalid content type. Use application/json with base64 or application/pdf" 
      });
    }

    // Validate it's a PDF (check magic bytes)
    if (pdfBuffer.slice(0, 4).toString() !== '%PDF') {
      return res.status(400).json({ error: "Invalid PDF file" });
    }

    // Generate unique filename
    const timestamp = Date.now();
    const filename = `print-${bookId}-${type}-${timestamp}.pdf`;
    const storagePath = `print-pdfs/${user.id}/${bookId}/${filename}`;

    let publicUrl;

    // Upload to R2 (primary storage)
    try {
      publicUrl = await uploadToR2(storagePath, pdfBuffer);
      console.log(`[Upload PDF] Uploaded to R2: ${publicUrl}`);
    } catch (uploadError) {
      console.error("R2 upload failed:", uploadError);
      throw new Error(`Failed to upload PDF: ${uploadError.message}`);
    }

    // Update book_exports record
    const exportUpdateField = type === 'interior' ? 'interior_pdf_path' : 'cover_pdf_path';
    const validatedField = type === 'interior' ? 'lulu_interior_validated' : 'lulu_cover_validated';

    // Find or create export record
    let exportRecord;
    if (orderId) {
      const { data } = await supabase
        .from("book_exports")
        .select("id")
        .eq("order_id", orderId)
        .maybeSingle();
      exportRecord = data;
    }

    if (exportRecord) {
      await supabase
        .from("book_exports")
        .update({
          [exportUpdateField]: publicUrl,
          [validatedField]: false, // Will be set true after Lulu validation
          updated_at: new Date().toISOString(),
        })
        .eq("id", exportRecord.id);
    } else {
      // Create new export record
      await supabase
        .from("book_exports")
        .insert({
          book_id: bookId,
          order_id: orderId || null,
          user_id: user.id,
          product_type: 'hardcover',
          [exportUpdateField]: publicUrl,
          [validatedField]: false,
        });
    }

    // Also update lulu_print_jobs if orderId provided
    if (orderId) {
      const { data: printJob } = await supabase
        .from("lulu_print_jobs")
        .select("id")
        .eq("order_id", orderId)
        .maybeSingle();

      if (printJob) {
        const printJobUpdateField = type === 'interior' ? 'interior_pdf_url' : 'cover_pdf_url';
        await supabase
          .from("lulu_print_jobs")
          .update({
            [printJobUpdateField]: publicUrl,
          })
          .eq("id", printJob.id);
      }
    }

    return res.status(200).json({
      success: true,
      type,
      url: publicUrl,
      size: pdfBuffer.length,
      path: storagePath,
    });

  } catch (err) {
    console.error("Upload PDF error:", err);
    return res.status(500).json({ 
      error: "Failed to upload PDF",
      details: err.message,
    });
  }
}

/**
 * Get raw body as buffer
 */
async function getRawBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on("data", (chunk) => chunks.push(chunk));
    req.on("end", () => resolve(Buffer.concat(chunks)));
    req.on("error", reject);
  });
}

/**
 * Upload to Cloudflare R2 (S3-compatible)
 */
async function uploadToR2(path, buffer) {
  const { S3Client, PutObjectCommand } = require("@aws-sdk/client-s3");
  
  const client = new S3Client({
    region: "auto",
    endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId: process.env.R2_ACCESS_KEY_ID,
      secretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
    },
  });

  const bucketName = process.env.R2_BUCKET_NAME || 'book-images';

  await client.send(new PutObjectCommand({
    Bucket: bucketName,
    Key: path,
    Body: buffer,
    ContentType: 'application/pdf',
  }));

  // Return public URL
  return `${process.env.R2_PUBLIC_URL}/${path}`;
}

module.exports = handler;

// Allow larger body for PDF uploads
module.exports.config = {
  api: {
    bodyParser: {
      sizeLimit: '50mb',
    },
  },
};