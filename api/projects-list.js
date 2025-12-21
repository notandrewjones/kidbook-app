// api/projects-list.js (CommonJS)

const { createClient } = require("@supabase/supabase-js");
const { getCurrentUser } = require("./_auth.js");

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function handler(req, res) {
  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  // Check authentication
  const { user, error: authError } = await getCurrentUser(req, res);
  
  if (!user) {
    return res.status(401).json({ 
      error: "Unauthorized",
      message: authError || "Please log in to view your books"
    });
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
        story_locked,
        illustrations,
        character_model_url,
        user_id
      `
      )
      .eq("user_id", user.id)
      .order("created_at", { ascending: false });

    if (error) {
      console.error("PROJECTS LIST ERROR:", error);
      return res.status(500).json({ error: "Failed to list projects" });
    }

    // Normalize story_locked to boolean
    const normalizedProjects = (data || []).map(p => ({
      ...p,
      story_locked: p.story_locked || false
    }));

    return res.status(200).json({ projects: normalizedProjects });
  } catch (err) {
    console.error("PROJECTS LIST FATAL:", err);
    return res.status(500).json({ error: "Failed to list projects" });
  }
}

module.exports = handler;