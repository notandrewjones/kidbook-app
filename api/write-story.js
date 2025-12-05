import OpenAI from "openai";
import { createClient } from "@supabase/supabase-js";

const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// Clean JSON output from OpenAI
function extractJson(text) {
  if (!text) return text;

  text = text.replace(/```json/gi, "").replace(/```/g, "").trim();

  const firstBrace = text.indexOf("{");
  const lastBrace = text.lastIndexOf("}");

  if (firstBrace === -1 || lastBrace === -1) {
    throw new Error("No JSON found in model output.");
  }

  return text.substring(firstBrace, lastBrace + 1);
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { name, interests, selectedIdea, projectId } = req.body;

  if (!projectId) {
    return res.status(400).json({ error: "Missing projectId" });
  }

  try {
    const prompt = `
Write a children's picture book story for ages 3–6.

Story Idea:
- Title: ${selectedIdea.title}
- Description: ${selectedIdea.description}
Child:
- Name: ${name}
- Interests: ${interests || "not specified"}

Return ONLY JSON:
{
  "title": "...",
  "pages": [
    { "page": 1, "text": "..." },
    ...
  ]
}

Rules:
- 8 to 14 pages
- Each page 1–3 simple sentences
- The last word of each line must rhyme with the line before it. Only break this pattern to start new rhymes after two lines or more. Always break rhymes on the even number line, never break a rhyme after rhyming an odd number of lines.
- No markdown or code fences
- No general scary themes.
`;

    const response = await client.responses.create({
      model: "gpt-4.1-mini",
      input: prompt
    });

    let raw = response.output_text;
    if (!raw && response.output?.[0]?.content?.[0]?.text) {
      raw = response.output[0].content[0].text;
    }

    const cleaned = extractJson(raw);
    const story = JSON.parse(cleaned);

    // UPDATE existing row instead of inserting new
    const { data, error: dbError } = await supabase
      .from("book_projects")
      .update({
        selected_idea: selectedIdea,
        story_json: story
      })
      .eq("id", projectId)
      .select();

    if (dbError) {
      console.error("Supabase update error:", dbError);
    }

    return res.status(200).json(story);

  } catch (error) {
    console.error("Error generating story:", error);
    return res.status(500).json({ error: "Failed to generate story" });
  }
}
