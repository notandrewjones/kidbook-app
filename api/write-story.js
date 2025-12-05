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

  const { name, interests, selectedIdea } = req.body;

  if (!name || !selectedIdea) {
    return res.status(400).json({ error: "Missing name or selected story idea" });
  }

  try {
    const prompt = `
Write a children's picture book story for ages 3–6 based on the following information.

CHILD:
- Name: ${name}
- Interests: ${interests || "not specified"}

STORY IDEA:
- Title: ${selectedIdea.title}
- Description: ${selectedIdea.description}

REQUIREMENTS:
- Return ONLY valid JSON.
- The JSON should look like this:

{
  "title": "...",
  "pages": [
    { "page": 1, "text": "..." },
    { "page": 2, "text": "..." }
  ]
}

RULES:
- 8 to 14 pages total.
- Each page should be 1–3 short, simple sentences.
- Rhythmic, fun, expressive, and kid-friendly.
- No scary or negative themes.
`;

    const response = await client.responses.create({
      model: "gpt-4.1-mini",
      input: prompt
    });

    let raw = response.output_text;
    if (!raw && response.output?.[0]?.content?.[0]?.text) {
      raw = response.output[0].content[0].text;
    }

    const story = JSON.parse(raw);

    // Save story in supabase
    const { data, error: dbError } = await supabase
  .from("book_projects")
  .insert({
    kid_name: name,
    kid_interests: interests,
    selected_idea: selectedIdea,
    story_json: story
  })
  .select();

console.log("DB insert:", { data, dbError });


    if (dbError) {
      console.error("Supabase insert error:", dbError);
    }

    return res.status(200).json(story);

  } catch (error) {
    console.error("Error generating story:", error);
    return res.status(500).json({ error: "Failed to generate story" });
  }
}
