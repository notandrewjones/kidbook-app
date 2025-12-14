// api/set-illustration.js
// Swap a past revision to become the current primary illustration

const { createClient } = require("@supabase/supabase-js");

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { projectId, page, selectedImageUrl } = req.body || {};

  if (!projectId || !page || !selectedImageUrl) {
    return res.status(400).json({ 
      error: "Missing projectId, page, or selectedImageUrl" 
    });
  }

  try {
    // 1. Load current project data
    const { data: project, error: projectError } = await supabase
      .from("book_projects")
      .select("illustrations")
      .eq("id", projectId)
      .single();

    if (projectError) {
      console.error("Project fetch error:", projectError);
      return res.status(500).json({ error: "Could not load project." });
    }

    const existingIllustrations = Array.isArray(project.illustrations)
      ? project.illustrations
      : [];

    // 2. Find the illustration for this page
    const pageNum = Number(page);
    const existingForPage = existingIllustrations.find(
      (i) => Number(i.page) === pageNum
    );

    if (!existingForPage) {
      return res.status(404).json({ error: "Illustration not found for this page." });
    }

    // 3. Find the selected revision in history
    const revisionHistory = existingForPage.revision_history || [];
    
    // Clean the URL for comparison (remove cache busters)
    const cleanSelectedUrl = selectedImageUrl.split('?')[0];
    const cleanCurrentUrl = existingForPage.image_url.split('?')[0];
    
    // Check if the selected image is already the current one
    if (cleanSelectedUrl === cleanCurrentUrl) {
      return res.status(200).json({
        message: "Already the current version",
        page: pageNum,
        image_url: existingForPage.image_url,
        revisions: existingForPage.revisions,
        revision_history: revisionHistory,
      });
    }

    // Find the revision in history
    const selectedRevision = revisionHistory.find(
      (rev) => rev.image_url.split('?')[0] === cleanSelectedUrl
    );

    if (!selectedRevision) {
      return res.status(404).json({ 
        error: "Selected revision not found in history." 
      });
    }

    // 4. Swap: current becomes history entry, selected becomes current
    const newHistory = revisionHistory
      .filter((rev) => rev.image_url.split('?')[0] !== cleanSelectedUrl) // Remove selected from history
      .concat({
        // Add current to history
        revision: existingForPage.revisions,
        image_url: existingForPage.image_url,
        created_at: existingForPage.last_updated || new Date().toISOString(),
        notes: existingForPage.revision_notes || null,
      });

    // Keep only last 2 revisions
    const trimmedHistory = newHistory.length > 2 ? newHistory.slice(-2) : newHistory;

    // 5. Update the illustration entry
    const updatedIllustrations = existingIllustrations.map((illus) => {
      if (Number(illus.page) === pageNum) {
        return {
          ...illus,
          image_url: selectedRevision.image_url,
          // Keep the same revision number (we're not creating a new revision)
          last_updated: new Date().toISOString(),
          revision_history: trimmedHistory,
        };
      }
      return illus;
    });

    // 6. Save to database
    const { error: updateError } = await supabase
      .from("book_projects")
      .update({ illustrations: updatedIllustrations })
      .eq("id", projectId);

    if (updateError) {
      console.error("ILLUSTRATIONS UPDATE ERROR:", updateError);
      return res.status(500).json({ error: "Failed to update illustration." });
    }

    console.log(`Set page ${pageNum} illustration to revision ${selectedRevision.revision}`);

    // 7. Return updated data
    const updatedIllus = updatedIllustrations.find(i => Number(i.page) === pageNum);
    
    return res.status(200).json({
      message: "Illustration updated",
      page: pageNum,
      image_url: updatedIllus.image_url,
      revisions: updatedIllus.revisions,
      revision_history: updatedIllus.revision_history,
    });

  } catch (err) {
    console.error("Set illustration error:", err);
    return res.status(500).json({
      error: "Failed to set illustration.",
      details: err?.message || String(err),
    });
  }
}

module.exports = handler;

module.exports.config = {
  api: { bodyParser: { sizeLimit: "1mb" } },
};