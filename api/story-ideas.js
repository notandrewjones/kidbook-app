import OpenAI from "openai";
import { createClient } from "@supabase/supabase-js";

const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { name, interests, projectId } = req.body;

  if (!name) {
    return res.status(400).json({ error: "Missing child name" });
  }

  try {
    const prompt = `
You are a children's author. Create 5 fun, kid-friendly story ideas for a child.

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

    const parsed = JSON.parse(raw);

    let finalProjectId;

    // 🟦 UPDATE EXISTING ROW — only if projectId is valid
    if (projectId && projectId !== "undefined" && projectId !== null) {
      const { data, error } = await supabase
        .from("book_projects")
        .update({
          kid_name: name,
          kid_interests: interests,
          story_ideas: parsed.ideas
        })
        .eq("id", projectId)
        .select("*")
        .single();     // 🔥 ensures we get the updated row

      if (error) {
        console.error("Update error:", error);
        return res.status(500).json({ error: "Update failed", details: error });
      }

      finalProjectId = data.id;

    } else {
      // 🟦 INSERT NEW ROW — guaranteed to return row now
      const { data, error } = await supabase
        .from("book_projects")
        .insert({
          kid_name: name,
          kid_interests: interests,
          story_ideas: parsed.ideas
        })
        .select("*")
        .single();

      if (error) {
        console.error("Insert error:", error);
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
