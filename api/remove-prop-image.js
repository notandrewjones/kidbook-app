// api/remove-prop-image.js
// Remove a reference image from a prop (revert to AI description)

import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { projectId, propKey } = req.body || {};

  if (!projectId) {
    return res.status(400).json({ error: "Missing projectId" });
  }
  if (!propKey) {
    return res.status(400).json({ error: "Missing propKey" });
  }

  try {
    // Fetch current registry
    const { data: project, error: fetchError } = await supabase
      .from("book_projects")
      .select("props_registry")
      .eq("id", projectId)
      .single();

    if (fetchError) {
      console.error("Failed to fetch project:", fetchError);
      return res.status(500).json({ error: "Failed to fetch project" });
    }

    // Get or initialize registry
    let registry = Array.isArray(project?.props_registry) && project.props_registry.length
      ? project.props_registry[0]
      : { characters: {}, props: {}, environments: {} };

    // Check if prop exists
    if (!registry.props || !registry.props[propKey]) {
      return res.status(404).json({ error: "Prop not found" });
    }

    // Remove reference image fields
    delete registry.props[propKey].reference_image_url;
    delete registry.props[propKey].image_source;
    delete registry.props[propKey].image_uploaded_at;

    // Save updated registry
    const { error: updateError } = await supabase
      .from("book_projects")
      .update({ props_registry: [registry] })
      .eq("id", projectId);

    if (updateError) {
      console.error("Failed to update registry:", updateError);
      return res.status(500).json({ error: "Failed to update prop" });
    }

    return res.status(200).json({
      success: true,
      propKey,
      message: "Prop reference image removed",
    });

  } catch (error) {
    console.error("Remove prop image error:", error);
    return res.status(500).json({ error: "Failed to remove prop image" });
  }
}

export const config = {
  api: { bodyParser: { sizeLimit: "1mb" } },
};