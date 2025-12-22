// api/cart/update.js
// Add, update quantity, or remove items from cart

const { createClient } = require("@supabase/supabase-js");
const { getCurrentUser } = require("../_auth.js");

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { user, error: authError } = await getCurrentUser(req, res);

  if (!user) {
    return res.status(401).json({
      error: "Unauthorized",
      message: authError || "Please log in to update cart",
    });
  }

  const { bookId, productType, size, quantity, action } = req.body;

  // Validate input
  if (!bookId) {
    return res.status(400).json({ error: "Missing bookId" });
  }

  if (!productType || !["ebook", "hardcover"].includes(productType)) {
    return res.status(400).json({ error: "Invalid productType" });
  }

  // Size is required for hardcover, null for ebook
  const itemSize = productType === "hardcover" ? (size || "square-medium") : null;

  try {
    // Verify the book exists and belongs to user
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

    // Handle different actions
    if (action === "remove" || quantity === 0) {
      // Remove item from cart
      let query = supabase
        .from("cart_items")
        .delete()
        .eq("user_id", user.id)
        .eq("book_id", bookId)
        .eq("product_type", productType);
      
      // Handle size matching - use .is() for null, .eq() for actual values
      if (itemSize === null) {
        query = query.is("size", null);
      } else {
        query = query.eq("size", itemSize);
      }

      const { error: deleteError } = await query;

      if (deleteError) throw deleteError;

      return res.status(200).json({ success: true, action: "removed" });
    }

    if (action === "set" || action === "add") {
      // Check if item already exists
      let existingQuery = supabase
        .from("cart_items")
        .select("id, quantity")
        .eq("user_id", user.id)
        .eq("book_id", bookId)
        .eq("product_type", productType);
      
      // Handle size matching - use .is() for null, .eq() for actual values
      if (itemSize === null) {
        existingQuery = existingQuery.is("size", null);
      } else {
        existingQuery = existingQuery.eq("size", itemSize);
      }
      
      const { data: existing } = await existingQuery.maybeSingle();

      if (existing) {
        // Update existing item
        const newQuantity = action === "add" 
          ? existing.quantity + (quantity || 1)
          : (quantity || 1);

        if (newQuantity <= 0) {
          // Remove if quantity is 0 or less
          await supabase
            .from("cart_items")
            .delete()
            .eq("id", existing.id);
          
          return res.status(200).json({ success: true, action: "removed" });
        }

        const { data: updated, error: updateError } = await supabase
          .from("cart_items")
          .update({ quantity: newQuantity })
          .eq("id", existing.id)
          .select()
          .single();

        if (updateError) throw updateError;

        return res.status(200).json({ 
          success: true, 
          action: "updated",
          item: updated,
        });
      } else {
        // Insert new item
        const { data: inserted, error: insertError } = await supabase
          .from("cart_items")
          .insert({
            user_id: user.id,
            book_id: bookId,
            product_type: productType,
            size: itemSize,
            quantity: quantity || 1,
          })
          .select()
          .single();

        if (insertError) throw insertError;

        return res.status(200).json({ 
          success: true, 
          action: "added",
          item: inserted,
        });
      }
    }

    return res.status(400).json({ error: "Invalid action" });

  } catch (err) {
    console.error("Cart update error:", err);
    return res.status(500).json({ error: "Failed to update cart" });
  }
}

module.exports = handler;