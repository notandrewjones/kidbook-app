// api/character-models.js
// List, add, update, and delete character models

const { createClient } = require("@supabase/supabase-js");

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function handler(req, res) {
  // Accept projectId from query (GET) or body (DELETE/PATCH)
  const projectId = req.query?.projectId || req.body?.projectId;

  if (!projectId) {
    return res.status(400).json({ error: "Missing projectId" });
  }

  // GET - List all character models
  if (req.method === "GET") {
    try {
      const { data: project, error } = await supabase
        .from("book_projects")
        .select("character_models, character_model_url, pending_character_photos, context_registry, props_registry")
        .eq("id", projectId)
        .single();

      if (error) {
        console.error("Error fetching character models:", error);
        return res.status(500).json({ error: "Could not load project" });
      }

      let characterModels = Array.isArray(project?.character_models)
        ? project.character_models
        : [];

      // Handle legacy single model
      if (project?.character_model_url && characterModels.length === 0) {
        const protagonistName = project?.context_registry?.child?.name || "Child";
        characterModels.push({
          character_key: "protagonist",
          name: protagonistName,
          role: "protagonist",
          model_url: project.character_model_url,
          is_protagonist: true,
          visual_source: "user",
        });
      }

      // Get characters from context/props that might need models
      const suggestedCharacters = [];
      const context = project?.context_registry || {};
      const props = Array.isArray(project?.props_registry) 
        ? project.props_registry[0] 
        : project?.props_registry || {};

      // Add protagonist if not modeled
      if (context.child?.name) {
        const key = context.child.name.toLowerCase().replace(/[^a-z0-9]+/g, "_");
        if (!characterModels.find(cm => cm.character_key === key || cm.is_protagonist)) {
          suggestedCharacters.push({
            character_key: key,
            name: context.child.name,
            role: "protagonist",
            suggested: true,
          });
        }
      }

      // Add additional children
      for (const [key, child] of Object.entries(context.additional_children || {})) {
        if (!characterModels.find(cm => cm.character_key === key)) {
          suggestedCharacters.push({
            character_key: key,
            name: child.name || key,
            role: child.relationship || "sibling",
            suggested: true,
          });
        }
      }

      // Add pets
      for (const [key, pet] of Object.entries(context.pets || {})) {
        if (!characterModels.find(cm => cm.character_key === key)) {
          suggestedCharacters.push({
            character_key: key,
            name: pet.name || key,
            role: "pet",
            type: pet.type || pet.species,
            suggested: true,
          });
        }
      }

      // Add people (parents, etc.)
      for (const [key, person] of Object.entries(context.people || {})) {
        if (!characterModels.find(cm => cm.character_key === key)) {
          suggestedCharacters.push({
            character_key: key,
            name: person.name || key,
            role: person.relationship || "other",
            suggested: true,
          });
        }
      }

      return res.status(200).json({
        character_models: characterModels,
        pending_photos: project?.pending_character_photos || [],
        suggested_characters: suggestedCharacters,
      });

    } catch (err) {
      console.error("Character models fetch error:", err);
      return res.status(500).json({ error: "Failed to fetch character models" });
    }
  }

  // DELETE - Remove a character model
  if (req.method === "DELETE") {
    // Accept characterKey from either body or query
    const { characterKey } = req.body || req.query || {};

    if (!characterKey) {
      return res.status(400).json({ error: "Missing characterKey" });
    }

    try {
      const { data: project } = await supabase
        .from("book_projects")
        .select("character_models, props_registry")
        .eq("id", projectId)
        .single();

      let characterModels = Array.isArray(project?.character_models)
        ? project.character_models
        : [];

      // Remove the character model
      characterModels = characterModels.filter(cm => cm.character_key !== characterKey);

      // Update props_registry to mark character as no longer having a model
      let registry = Array.isArray(project?.props_registry) && project.props_registry.length
        ? project.props_registry[0]
        : { characters: {}, props: {}, environments: {}, notes: "" };

      if (registry.characters[characterKey]) {
        registry.characters[characterKey] = {
          ...registry.characters[characterKey],
          has_model: false,
          visual_source: "auto",
        };
      }

      await supabase
        .from("book_projects")
        .update({
          character_models: characterModels,
          props_registry: [registry],
        })
        .eq("id", projectId);

      return res.status(200).json({
        success: true,
        character_models: characterModels,
      });

    } catch (err) {
      console.error("Character model delete error:", err);
      return res.status(500).json({ error: "Failed to delete character model" });
    }
  }

  // PATCH - Update character model metadata (name, role, etc.)
  if (req.method === "PATCH") {
    const { characterKey, updates } = req.body || {};

    if (!characterKey || !updates) {
      return res.status(400).json({ error: "Missing characterKey or updates" });
    }

    try {
      const { data: project } = await supabase
        .from("book_projects")
        .select("character_models")
        .eq("id", projectId)
        .single();

      let characterModels = Array.isArray(project?.character_models)
        ? project.character_models
        : [];

      const idx = characterModels.findIndex(cm => cm.character_key === characterKey);
      if (idx === -1) {
        return res.status(404).json({ error: "Character model not found" });
      }

      // Only allow updating specific fields
      const allowedUpdates = ["name", "role", "is_protagonist"];
      for (const [key, value] of Object.entries(updates)) {
        if (allowedUpdates.includes(key)) {
          characterModels[idx][key] = value;
        }
      }

      characterModels[idx].updated_at = new Date().toISOString();

      await supabase
        .from("book_projects")
        .update({ character_models: characterModels })
        .eq("id", projectId);

      return res.status(200).json({
        success: true,
        character_model: characterModels[idx],
      });

    } catch (err) {
      console.error("Character model update error:", err);
      return res.status(500).json({ error: "Failed to update character model" });
    }
  }

  return res.status(405).json({ error: "Method not allowed" });
}

module.exports = handler;

module.exports.config = {
  api: { bodyParser: { sizeLimit: "1mb" } },
};