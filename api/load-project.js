// api/load-project.js (CommonJS)

const { createClient } = require("@supabase/supabase-js");

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { projectId } = req.body || {};
  if (!projectId) {
    return res.status(400).json({ error: "Missing projectId" });
  }

  try {
    const { data, error } = await supabase
      .from("book_projects")
      .select(`
        id,
        kid_name,
        kid_interests,
        story_ideas,
        selected_idea,
        story_json,
        story_locked,
        illustrations,
        character_model_url,
        context_registry,
        props_registry
      `)
      .eq("id", projectId)
      .single();

    if (error) {
      console.error("PROJECT LOAD ERROR:", error);
      return res.status(500).json({ error: "Failed to load project" });
    }

    if (!data) {
      return res.status(404).json({ error: "Project not found" });
    }

    // Normalize to prevent UI crashes
    // Ensure each illustration has revision_history array
    const normalizedIllustrations = (data.illustrations || []).map(illus => ({
      ...illus,
      revision_history: illus.revision_history || []
    }));

    return res.status(200).json({
      project: {
        ...data,
        story_ideas: data.story_ideas || [],
        story_json: data.story_json || [],
        story_locked: data.story_locked || false,
        illustrations: normalizedIllustrations,
        props_registry: data.props_registry || [],
        context_registry: data.context_registry || {}
      }
    });

  } catch (err) {
    console.error("PROJECT LOAD FATAL:", err);
    return res.status(500).json({ error: "Failed to load project" });
  }
}

module.exports = handler;

module.exports.config = {
  api: { bodyParser: { sizeLimit: "10mb" } }
};