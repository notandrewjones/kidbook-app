// api/lulu/upload-page-images.js
// Receives rendered page images from the compositor and stores them for print PDF generation

const { createClient } = require("@supabase/supabase-js");
const { S3Client, PutObjectCommand } = require("@aws-sdk/client-s3");

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const s3Client = new S3Client({
  region: "auto",
  endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId: process.env.R2_ACCESS_KEY_ID,
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
  },
});

async function uploadToR2(key, buffer, contentType) {
  await s3Client.send(new PutObjectCommand({
    Bucket: process.env.R2_BUCKET_NAME,
    Key: key,
    Body: buffer,
    ContentType: contentType,
  }));
  
  return `${process.env.R2_PUBLIC_URL}/${key}`;
}

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { bookId, pages, coverImage } = req.body;
    
    if (!bookId) {
      return res.status(400).json({ error: 'Missing bookId' });
    }
    
    if (!pages || !Array.isArray(pages) || pages.length === 0) {
      return res.status(400).json({ error: 'Missing or invalid pages array' });
    }

    // Get user from session
    const authHeader = req.headers.cookie;
    const sessionMatch = authHeader?.match(/session=([^;]+)/);
    const sessionToken = sessionMatch?.[1];

    if (!sessionToken) {
      return res.status(401).json({ error: 'Not authenticated' });
    }

    const { data: session } = await supabase
      .from('sessions')
      .select('user_id')
      .eq('token', sessionToken)
      .gt('expires_at', new Date().toISOString())
      .single();

    if (!session) {
      return res.status(401).json({ error: 'Invalid session' });
    }

    const userId = session.user_id;

    // Verify user owns this book
    const { data: book } = await supabase
      .from('book_projects')
      .select('id, user_id')
      .eq('id', bookId)
      .single();

    if (!book || book.user_id !== userId) {
      return res.status(403).json({ error: 'Not authorized' });
    }

    console.log(`[Upload] Uploading ${pages.length} page images for book ${bookId}`);

    const timestamp = Date.now();
    const uploadedPages = [];

    // Upload each page image
    for (const page of pages) {
      const { pageNumber, imageData } = page;
      
      if (!imageData || !pageNumber) {
        console.warn(`[Upload] Skipping invalid page data`);
        continue;
      }

      // Remove data URL prefix if present
      const base64Data = imageData.replace(/^data:image\/\w+;base64,/, '');
      const buffer = Buffer.from(base64Data, 'base64');
      
      // Determine image type from data URL
      const mimeMatch = imageData.match(/^data:(image\/\w+);base64,/);
      const contentType = mimeMatch ? mimeMatch[1] : 'image/png';
      const ext = contentType === 'image/jpeg' ? 'jpg' : 'png';

      const key = `print-pages/${userId}/${bookId}/${timestamp}/page-${String(pageNumber).padStart(3, '0')}.${ext}`;
      
      const url = await uploadToR2(key, buffer, contentType);
      
      uploadedPages.push({
        pageNumber,
        url,
        key,
      });
      
      console.log(`[Upload] Page ${pageNumber} uploaded: ${url}`);
    }

    // Upload cover image if provided
    let coverUrl = null;
    if (coverImage) {
      const base64Data = coverImage.replace(/^data:image\/\w+;base64,/, '');
      const buffer = Buffer.from(base64Data, 'base64');
      const mimeMatch = coverImage.match(/^data:(image\/\w+);base64,/);
      const contentType = mimeMatch ? mimeMatch[1] : 'image/png';
      const ext = contentType === 'image/jpeg' ? 'jpg' : 'png';

      const key = `print-pages/${userId}/${bookId}/${timestamp}/cover.${ext}`;
      coverUrl = await uploadToR2(key, buffer, contentType);
      console.log(`[Upload] Cover uploaded: ${coverUrl}`);
    }

    // Store the page URLs in the book_projects table
    const { error: updateError } = await supabase
      .from('book_projects')
      .update({
        print_pages: uploadedPages,
        print_cover_image: coverUrl,
        print_pages_updated_at: new Date().toISOString(),
      })
      .eq('id', bookId);

    if (updateError) {
      console.error('[Upload] Failed to update book:', updateError);
      // Don't fail - pages are uploaded, just metadata update failed
    }

    return res.status(200).json({
      success: true,
      pageCount: uploadedPages.length,
      pages: uploadedPages,
      coverUrl,
    });

  } catch (error) {
    console.error('[Upload] Error:', error);
    return res.status(500).json({ error: error.message });
  }
};