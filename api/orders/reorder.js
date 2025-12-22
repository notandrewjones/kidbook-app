// api/orders/reorder.js
// Add items from a previous order back to cart

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
      message: authError || "Please log in to reorder",
    });
  }

  const { orderId } = req.body;

  if (!orderId) {
    return res.status(400).json({ error: "Order ID required" });
  }

  try {
    // Get the original order
    const { data: order, error: fetchError } = await supabase
      .from("orders")
      .select(`
        id,
        book_id,
        size,
        product:product_id (
          name
        )
      `)
      .eq("id", orderId)
      .eq("user_id", user.id)
      .single();

    if (fetchError) {
      if (fetchError.code === "PGRST116") {
        return res.status(404).json({ error: "Order not found" });
      }
      throw fetchError;
    }

    // Verify the book still exists
    const { data: book, error: bookError } = await supabase
      .from("book_projects")
      .select("id")
      .eq("id", order.book_id)
      .eq("user_id", user.id)
      .single();

    if (bookError || !book) {
      return res.status(400).json({ 
        error: "Book not found",
        message: "The book from this order is no longer available",
      });
    }

    const productType = order.product?.name || 'hardcover';
    const size = productType === 'hardcover' ? (order.size || 'square-medium') : null;

    // Check if item already in cart
    let query = supabase
      .from("cart_items")
      .select("id, quantity")
      .eq("user_id", user.id)
      .eq("book_id", order.book_id)
      .eq("product_type", productType);

    if (size) {
      query = query.eq("size", size);
    } else {
      query = query.is("size", null);
    }

    const { data: existingItem } = await query.maybeSingle();

    if (existingItem) {
      // Update quantity
      const { error: updateError } = await supabase
        .from("cart_items")
        .update({ quantity: existingItem.quantity + 1 })
        .eq("id", existingItem.id);

      if (updateError) throw updateError;
    } else {
      // Add new cart item
      const { error: insertError } = await supabase
        .from("cart_items")
        .insert({
          user_id: user.id,
          book_id: order.book_id,
          product_type: productType,
          size: size,
          quantity: 1,
        });

      if (insertError) throw insertError;
    }

    return res.status(200).json({
      success: true,
      message: "Item added to cart",
      addedItem: {
        bookId: order.book_id,
        productType,
        size,
      },
    });

  } catch (err) {
    console.error("Error reordering:", err);
    return res.status(500).json({ error: "Failed to add to cart" });
  }
}

module.exports = handler;