// api/story-ideas.js (CommonJS)
const OpenAI = require("openai").default;
const { createClient } = require("@supabase/supabase-js");
const { getCurrentUser } = require("./_auth.js");

const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// 🔥 CLEAN JSON OUTPUT FROM MODEL
function cleanJsonOutput(text) {
  if (!text) return text;

  text = text.replace(/```json/gi, "");
  text = text.replace(/```/g, "");
  text = text.trim();

  const firstBrace = text.indexOf("{");
  const lastBrace = text.lastIndexOf("}");

  if (firstBrace === -1 || lastBrace === -1) {
    throw new Error("No JSON object found in model output.");
  }

  return text.substring(firstBrace, lastBrace + 1);
}

async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  // Check authentication
  const { user, error: authError } = await getCurrentUser(req, res);
  
  if (!user) {
    return res.status(401).json({ 
      error: "Unauthorized",
      message: authError || "Please log in to create stories"
    });
  }

  const { name, interests, projectId } = req.body;

  if (!name) {
    return res.status(400).json({ error: "Missing child name" });
  }

  try {
    const prompt = `
You are a children's author. Create 5 fun, kid-friendly story ideas.

Return ONLY JSON:
{
  "ideas": [
    { "title": "...", "description": "..." }
  ]
}

Child:
- Name: ${name}
- Interests: ${interests || "not specified"}
- Age: assume 4–7 years old
`;

    const response = await client.responses.create({
      model: "gpt-4.1-mini",
      input: prompt
    });

    let raw = response.output_text;
    if (!raw && response.output?.[0]?.content?.[0]?.text) {
      raw = response.output[0].content[0].text;
    }

    // ⭐ CLEAN THE MODEL OUTPUT
    const cleaned = cleanJsonOutput(raw);
    const parsed = JSON.parse(cleaned);

    let finalProjectId;

    // Do we have a candidate projectId?
    const hasProjectId =
      projectId && projectId !== "undefined" && projectId !== null;

    if (hasProjectId) {
      // First verify the project belongs to this user
      const { data: existingProject, error: checkError } = await supabase
        .from("book_projects")
        .select("id, user_id")
        .eq("id", projectId)
        .single();
      
      if (checkError || !existingProject) {
        // Project doesn't exist, create new one
        console.log("Project not found, creating new one");
      } else if (existingProject.user_id !== user.id) {
        return res.status(403).json({ 
          error: "Access denied",
          message: "You don't have permission to modify this project"
        });
      }

      // 1) Try UPDATE first (only if project exists and belongs to user)
      if (existingProject && existingProject.user_id === user.id) {
        const { data: updateData, error: updateError } = await supabase
          .from("book_projects")
          .update({
            kid_name: name,
            kid_interests: interests,
            story_ideas: parsed.ideas
          })
          .eq("id", projectId)
          .eq("user_id", user.id) // Extra safety
          .select("*");

        if (updateError) {
          console.error("Update failed:", updateError);
          return res
            .status(500)
            .json({ error: "Update failed", details: updateError });
        }

        if (updateData && updateData.length > 0) {
          finalProjectId = updateData[0].id;
        }
      }

      // If no rows were updated, insert a new project
      if (!finalProjectId) {
        console.log("No existing project found; inserting a new row.");

        const { data: insertData, error: insertError } = await supabase
          .from("book_projects")
          .insert({
            kid_name: name,
            kid_interests: interests,
            story_ideas: parsed.ideas,
            user_id: user.id
          })
          .select("*")
          .single();

        if (insertError) {
          console.error("Insert failed:", insertError);
          return res.status(500).json({
            error: "Insert failed",
            details: insertError
          });
        }

        finalProjectId = insertData.id;
      }
    } else {
      // 2) No projectId given → INSERT a new project with user_id
      const { data, error } = await supabase
        .from("book_projects")
        .insert({
          kid_name: name,
          kid_interests: interests,
          story_ideas: parsed.ideas,
          user_id: user.id
        })
        .select("*")
        .single();

      if (error) {
        console.error("Insert failed:", error);
        return res.status(500).json({ error: "Insert failed", details: error });
      }

      finalProjectId = data.id;
    }

    return res.status(200).json({
      ideas: parsed.ideas,
      projectId: finalProjectId
    });
  } catch (error) {
    console.error("Error generating ideas:", error);
    return res.status(500).json({ error: "Failed to generate story ideas" });
  }
}

module.exports = handler;
