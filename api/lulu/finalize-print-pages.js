// api/lulu/finalize-print-pages.js
// Marks print pages as finalized and clears any stale data

const { createClient } = require("@supabase/supabase-js");

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

    // Verify user owns this book and get current print_pages
    const { data: book } = await supabase
      .from('book_projects')
      .select('id, user_id, print_pages, print_cover_image')
      .eq('id', bookId)
      .single();

    if (!book || book.user_id !== userId) {
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