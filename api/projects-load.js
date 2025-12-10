// api/projects-load.js (CommonJS)

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
      .select(
        `
        id,
        kid_name,
        kid_interests,
        story_ideas,
        selected_idea,
        story_json,
        illustrations,
        character_model_url,
        context_registry,
        props_registry
      `
      )
      .eq("id", projectId)
      .single();

    if (error) {
      console.error("PROJECT LOAD ERROR:", error);
      return res.status(500).json({ error: "Failed to load project" });
    }

    if (!data) {
      return res.status(404).json({ error: "Project not found" });
    }

    return res.status(200).json({ project: data });
  } catch (err) {
    console.error("PROJECT LOAD FATAL:", err);
    return res.status(500).json({ error: "Failed to load project" });
  }
}

module.exports = handler;
