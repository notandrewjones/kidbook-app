// api/projects-list.js (CommonJS)

const { createClient } = require("@supabase/supabase-js");

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function handler(req, res) {
  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed" });
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
        character_model_url
      `
      );

    if (error) {
      console.error("PROJECTS LIST ERROR:", error);
      return res.status(500).json({ error: "Failed to list projects" });
    }

    return res.status(200).json({ projects: data || [] });
  } catch (err) {
    console.error("PROJECTS LIST FATAL:", err);
    return res.status(500).json({ error: "Failed to list projects" });
  }
}

module.exports = handler;
