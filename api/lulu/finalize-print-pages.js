// api/lulu/finalize-print-pages.js
// Marks print pages as finalized and clears any stale data

const { createClient } = require("@supabase/supabase-js");
const { getCurrentUser } = require("../_auth.js");

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { bookId } = req.body;
    
    if (!bookId) {
      return res.status(400).json({ error: 'Missing bookId' });
    }

    // Get user from session using shared auth
    const { user, error: authError } = await getCurrentUser(req, res);
    
    if (!user) {
      return res.status(401).json({ error: authError || 'Not authenticated' });
    }

    // Verify user owns this book and get current print_pages
    const { data: book } = await supabase
      .from('book_projects')
      .select('id, user_id, print_pages, print_cover_image')
      .eq('id', bookId)
      .single();

    if (!book || book.user_id !== user.id) {
      return res.status(403).json({ error: 'Not authorized' });
    }

    const pageCount = book.print_pages?.length || 0;
    
    console.log(`[Finalize] Book ${bookId} has ${pageCount} print pages ready`);

    // Just log completion - pages are already saved incrementally
    return res.status(200).json({
      success: true,
      bookId,
      pageCount,
      hasCover: !!book.print_cover_image,
      message: `${pageCount} print pages ready`,
    });

  } catch (error) {
    console.error('[Finalize] Error:', error);
    return res.status(500).json({ error: error.message });
  }
};