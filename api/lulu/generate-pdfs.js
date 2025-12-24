// api/lulu/generate-pdfs.js
// Generate print-ready PDFs (interior + cover) for Lulu printing
// Uploads PDFs to public storage (R2/Supabase Storage) and returns URLs

const { createClient } = require("@supabase/supabase-js");
const { getCurrentUser } = require("../_auth.js");
const { luluClient } = require("./client.js");

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

/**
 * Generate print-ready PDFs for an order
 * This is a server-side process that:
 * 1. Fetches the book data
 * 2. Generates interior PDF (all pages)
 * 3. Generates cover PDF (wraparound with spine)
 * 4. Uploads both to public storage
 * 5. Returns the URLs for Lulu submission
 */
async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  // Allow internal calls without auth (from webhook/admin)
  const isInternalCall = req.headers['x-internal-call'] === process.env.INTERNAL_API_SECRET;
  
  let userId;
  if (!isInternalCall) {
    const { user, error: authError } = await getCurrentUser(req, res);
    if (!user) {
      return res.status(401).json({
        error: "Unauthorized",
        message: authError || "Please log in",
      });
    }
    userId = user.id;
  }

  const { orderId, bookId } = req.body;

  if (!orderId && !bookId) {
    return res.status(400).json({ error: "Order ID or Book ID required" });
  }

  try {
    // Get order and book details
    let order, book;

    if (orderId) {
      const { data: orderData, error: orderError } = await supabase
        .from("orders")
        .select(`
          id,
          user_id,
          book_id,
          size,
          product:product_id (name)
        `)
        .eq("id", orderId)
        .single();

      if (orderError || !orderData) {
        return res.status(404).json({ error: "Order not found" });
      }

      // Verify ownership if not internal call
      if (!isInternalCall && orderData.user_id !== userId) {
        return res.status(403).json({ error: "Access denied" });
      }

      order = orderData;

      const { data: bookData } = await supabase
        .from("book_projects")
        .select("*")
        .eq("id", order.book_id)
        .single();

      book = bookData;
    } else {
      const { data: bookData, error: bookError } = await supabase
        .from("book_projects")
        .select("*")
        .eq("id", bookId)
        .single();

      if (bookError || !bookData) {
        return res.status(404).json({ error: "Book not found" });
      }

      if (!isInternalCall && bookData.user_id !== userId) {
        return res.status(403).json({ error: "Access denied" });
      }

      book = bookData;
    }

    // Get POD package for dimensions
    const sizeCode = order?.size || 'square-medium';
    const { data: podPackage } = await supabase
      .from("lulu_pod_packages")
      .select("*")
      .eq("size_code", sizeCode)
      .single();

    if (!podPackage) {
      return res.status(400).json({ error: `Unknown size: ${sizeCode}` });
    }

    // Calculate page count
    const illustrations = book.illustrations || [];
    const pageCount = Math.max(
      podPackage.min_pages || 24,
      Math.ceil((illustrations.length * 2 + 4) / 4) * 4 // Round to multiple of 4
    );

    // Get cover dimensions from Lulu
    let coverDimensions;
    try {
      coverDimensions = await luluClient.getCoverDimensions(
        podPackage.pod_package_id,
        pageCount,
        'in' // inches
      );
    } catch (err) {
      console.warn("Could not get cover dimensions from Lulu:", err);
      // Use fallback calculations
      coverDimensions = {
        width: (podPackage.width_inches * 2) + 0.5, // Two covers + spine estimate
        height: podPackage.height_inches,
      };
    }

    // For now, return instructions on what needs to be generated
    // The actual PDF generation happens client-side (using jsPDF)
    // and the files are then uploaded
    
    const response = {
      success: true,
      bookId: book.id,
      orderId: order?.id,
      sizeCode: sizeCode,
      podPackageId: podPackage.pod_package_id,
      pageCount: pageCount,
      dimensions: {
        interior: {
          width: podPackage.width_inches,
          height: podPackage.height_inches,
          widthPt: podPackage.width_inches * 72,
          heightPt: podPackage.height_inches * 72,
        },
        cover: {
          width: coverDimensions.width,
          height: coverDimensions.height,
          widthPt: coverDimensions.width * 72,
          heightPt: coverDimensions.height * 72,
          spineWidth: (coverDimensions.width - (podPackage.width_inches * 2)),
        },
      },
      // URLs where PDFs should be uploaded
      uploadEndpoints: {
        interior: `/api/lulu/upload-pdf?type=interior&bookId=${book.id}`,
        cover: `/api/lulu/upload-pdf?type=cover&bookId=${book.id}`,
      },
      // Data needed for generation
      bookData: {
        title: book.selected_idea?.title || 'Untitled',
        author: book.selected_idea?.author || 'Unknown',
        pages: illustrations.map((ill, idx) => ({
          page: idx + 1,
          text: ill.text || book.story?.scenes?.[idx]?.text || '',
          imageUrl: ill.image_url,
        })),
      },
    };

    return res.status(200).json(response);

  } catch (err) {
    console.error("Generate PDFs error:", err);
    return res.status(500).json({ 
      error: "Failed to prepare PDF generation",
      details: err.message,
    });
  }
}

module.exports = handler;
