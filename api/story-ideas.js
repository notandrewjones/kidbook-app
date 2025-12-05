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
You are a children's author. Create 5 fun story ideas...
(Return ONLY JSON)
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

    let finalProjectId = projectId;

    if (projectId) {
      // UPDATE EXISTING ROW
      const { data, error } = await supabase
        .from("book_projects")
        .update({
          kid_name: name,
          kid_interests: interests,
          story_ideas: parsed.ideas
        })
        .eq("id", projectId)
        .select();

      if (error) console.error("Update error:", error);

      finalProjectId = projectId;

    } else {
      // INSERT NEW ROW
      const { data, error } = await supabase
        .from("book_projects")
        .insert({
          kid_name: name,
          kid_interests: interests,
          story_ideas: parsed.ideas
        })
        .select();

      if (error) console.error("Insert error:", error);

      finalProjectId = data?.[0]?.id;
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
