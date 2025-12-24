// api/lulu/start-print-upload.js
// Clears old print pages to start a fresh upload session

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

    // Verify user owns this book
    const { data: book } = await supabase
      .from('book_projects')
      .select('id, user_id')
      .eq('id', bookId)
      .single();

    if (!book || book.user_id !== user.id) {
      return res.status(403).json({ error: 'Not authorized' });
    }

    // Clear old print pages to start fresh
    const { error: updateError } = await supabase
      .from('book_projects')
      .update({
        print_pages: [],
        print_cover_image: null,
        print_pages_updated_at: new Date().toISOString(),
      })
      .eq('id', bookId);

    if (updateError) {
      console.error('[StartUpload] Failed to clear old pages:', updateError);
      return res.status(500).json({ error: 'Failed to start upload session' });
    }

    console.log(`[StartUpload] Cleared old print pages for book ${bookId}`);

    return res.status(200).json({
      success: true,
      bookId,
      message: 'Ready for upload',
    });

  } catch (error) {
    console.error('[StartUpload] Error:', error);
    return res.status(500).json({ error: error.message });
  }
};