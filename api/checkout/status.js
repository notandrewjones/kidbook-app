// api/checkout/status.js
// Check the unlock/purchase status for a book

const { createClient } = require("@supabase/supabase-js");
const { getCurrentUser } = require("../_auth.js");

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function handler(req, res) {
  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  // Check authentication
  const { user, error: authError } = await getCurrentUser(req, res);

  if (!user) {
    return res.status(401).json({
      error: "Unauthorized",
      message: authError || "Please log in",
    });
  }

  const bookId = req.query.bookId;

  if (!bookId) {
    return res.status(400).json({ error: "Missing bookId parameter" });
  }

  try {
    // Get book with unlock status
    const { data: book, error: bookError } = await supabase
      .from("book_projects")
      .select("id, selected_idea, user_id, has_watermark, ebook_unlocked, hardcover_unlocked")
      .eq("id", bookId)
      .single();

    if (bookError || !book) {
      return res.status(404).json({ error: "Book not found" });
    }

    if (book.user_id !== user.id) {
      return res.status(403).json({ error: "Access denied" });
    }

    // Get available products with prices
    const { data: products } = await supabase
      .from("products")
      .select("id, name, display_name, description, price_cents")
      .eq("is_active", true)
      .order("sort_order");

    // Get any pending orders for this book
    const { data: pendingOrders } = await supabase
      .from("orders")
      .select("id, product_id, status, created_at, products(name)")
      .eq("book_id", bookId)
      .eq("user_id", user.id)
      .eq("status", "pending")
      .order("created_at", { ascending: false });

    // Get completed orders (for download history)
    const { data: completedOrders } = await supabase
      .from("orders")
      .select("id, product_id, paid_at, products(name, display_name)")
      .eq("book_id", bookId)
      .eq("user_id", user.id)
      .eq("status", "paid")
      .order("paid_at", { ascending: false });

    // Get export records for download tracking
    const { data: exports } = await supabase
      .from("book_exports")
      .select("id, product_type, download_count, max_downloads, created_at, expires_at")
      .eq("book_id", bookId)
      .eq("user_id", user.id);

    // Build response
    const productStatus = {};
    
    for (const product of products || []) {
      const isUnlocked = product.name === "ebook" 
        ? book.ebook_unlocked 
        : book.hardcover_unlocked;
      
      const exportRecord = exports?.find(e => e.product_type === product.name);
      const completedOrder = completedOrders?.find(o => o.products?.name === product.name);
      const pendingOrder = pendingOrders?.find(o => o.products?.name === product.name);

      productStatus[product.name] = {
        productId: product.id,
        displayName: product.display_name,
        description: product.description,
        priceCents: product.price_cents,
        priceFormatted: `$${(product.price_cents / 100).toFixed(2)}`,
        unlocked: isUnlocked,
        purchasedAt: completedOrder?.paid_at || null,
        hasPendingOrder: !!pendingOrder,
        pendingOrderId: pendingOrder?.id || null,
        export: exportRecord ? {
          id: exportRecord.id,
          downloadCount: exportRecord.download_count,
          maxDownloads: exportRecord.max_downloads,
          downloadsRemaining: exportRecord.max_downloads - exportRecord.download_count,
          expiresAt: exportRecord.expires_at,
        } : null,
      };
    }

    return res.status(200).json({
      bookId: book.id,
      title: book.selected_idea?.title || "Untitled Book",
      hasWatermark: book.has_watermark,
      products: productStatus,
    });

  } catch (err) {
    console.error("STATUS CHECK ERROR:", err);
    return res.status(500).json({
      error: "Failed to check status",
      details: process.env.NODE_ENV === "development" ? err.message : undefined,
    });
  }
}

module.exports = handler;
