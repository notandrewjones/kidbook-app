// api/lulu/start-print-upload.js
// Clears old print pages to start a fresh upload session

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

    // Verify user owns this book
    const { data: book } = await supabase
      .from('book_projects')
      .select('id, user_id')
      .eq('id', bookId)
      .single();

    if (!book || book.user_id !== userId) {
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