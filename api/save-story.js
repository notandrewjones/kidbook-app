// api/save-story.js (CommonJS)
// Saves story edits without finalizing (keeps story_locked = false)

const { createClient } = require("@supabase/supabase-js");
const { getCurrentUser } = require("./_auth.js");

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  // Check authentication
  const { user, error: authError } = await getCurrentUser(req, res);
  
  if (!user) {
    return res.status(401).json({ 
      error: "Unauthorized",
      message: authError || "Please log in to save your story"
    });
  }

  const { projectId, storyPages } = req.body;

  if (!projectId) {
    return res.status(400).json({ error: "Missing projectId" });
  }

  if (!storyPages || !Array.isArray(storyPages)) {
    return res.status(400).json({ error: "Missing or invalid storyPages" });
  }

  try {
    // Check if project exists and belongs to user, also check if locked
    const { data: project, error: checkError } = await supabase
      .from("book_projects")
      .select("story_locked, user_id")
      .eq("id", projectId)
      .single();

    if (checkError) {
      return res.status(500).json({ error: "Could not load project." });
    }

    // Verify ownership
    if (project.user_id !== user.id) {
      return res.status(403).json({ 
        error: "Access denied",
        message: "You don't have permission to modify this project"
      });
    }

    if (project.story_locked === true) {
      return res.status(400).json({ 
        error: "Story is locked and cannot be edited." 
      });
    }

    // Save the story pages and ensure story_locked is false
    const { data: updated, error: updateError } = await supabase
      .from("book_projects")
      .update({
        story_json: storyPages,
        story_locked: false,
      })
      .eq("id", projectId)
      .select("id, story_json, story_locked")
      .single();

    if (updateError) {
      console.error("SAVE-STORY ERROR:", updateError);
      return res.status(500).json({ error: "Failed to save story." });
    }

    return res.status(200).json({
      projectId: updated.id,
      story_json: updated.story_json,
      story_locked: updated.story_locked,
    });

  } catch (err) {
    console.error("SAVE-STORY ERROR:", err);
    return res.status(500).json({
      error: "Failed to save story.",
      details: err.message,
    });
  }
}

module.exports = handler;
module.exports.config = {
  api: { bodyParser: { sizeLimit: "2mb" } },
};