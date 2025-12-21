// api/load-project.js (CommonJS)
// Updated to include character_models array and user authentication

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
      message: authError || "Please log in to access this project"
    });
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
        user_id,
        kid_name,
        kid_interests,
        story_ideas,
        selected_idea,
        story_json,
        story_locked,
        illustrations,
        character_model_url,
        character_models,
        pending_character_photos,
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

    // Verify ownership
    if (data.user_id !== user.id) {
      return res.status(403).json({ 
        error: "Access denied",
        message: "You don't have permission to access this project"
      });
    }

    // Normalize character_models
    let characterModels = Array.isArray(data.character_models)
      ? data.character_models
      : [];

    // Handle legacy: if only character_model_url exists, convert to array format
    if (data.character_model_url && characterModels.length === 0) {
      const protagonistName = data.context_registry?.child?.name || data.kid_name || "Child";
      const protagonistKey = protagonistName.toLowerCase().replace(/[^a-z0-9]+/g, "_") || "protagonist";
      
      characterModels.push({
        character_key: protagonistKey,
        name: protagonistName,
        role: "protagonist",
        model_url: data.character_model_url,
        is_protagonist: true,
        visual_source: "user",
        created_at: new Date().toISOString(),
      });
    }

    // Normalize illustrations to include revision_history
    const normalizedIllustrations = (data.illustrations || []).map(illus => ({
      ...illus,
      revision_history: illus.revision_history || [],
      scene_composition: illus.scene_composition || null,
    }));

    return res.status(200).json({
      project: {
        ...data,
        story_ideas: data.story_ideas || [],
        story_json: data.story_json || [],
        story_locked: data.story_locked || false,
        illustrations: normalizedIllustrations,
        character_models: characterModels,
        pending_character_photos: data.pending_character_photos || [],
        props_registry: data.props_registry || [],
        context_registry: data.context_registry || {},
      }
    });

  } catch (err) {
    console.error("PROJECT LOAD FATAL:", err);
    return res.status(500).json({ error: "Failed to load project" });
  }
}

module.exports = handler;

module.exports.config = {
  api: { bodyParser: { sizeLimit: "10mb" } },
};