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

  const { name, interests } = req.body;

  if (!name) {
    return res.status(400).json({ error: "Missing child name" });
  }

  try {
    const prompt = `
You are a children's author. Create 5 fun, kid-friendly story ideas for a child.
Return them as JSON array of ideas with "title" and "description".

Child:
- Name: ${name}
- Interests: ${interests || "not specified"}
- Age: unknown (assume 4-7 years old)
`;

    const response = await client.responses.create({
  model: "gpt-4.1-mini",
  input: prompt,
  text: {
    format: "json_schema",
    json_schema: {
      type: "object",
      properties: {
        ideas: {
          type: "array",
          items: {
            type: "object",
            properties: {
              title: { type: "string" },
              description: { type: "string" }
            },
            required: ["title", "description"]
          }
        }
      },
      required: ["ideas"]
    }
  }
});


    const parsed = JSON.parse(response.output_text);


    // Save result in Supabase (optional)
    const { error: dbError } = await supabase
      .from("book_projects")
      .insert({
        kid_name: name,
        kid_interests: interests,
        story_ideas: parsed.ideas
      });

    if (dbError) {
      console.error("Supabase insert error:", dbError);
    }

    return res.status(200).json(parsed);

  } catch (error) {
    console.error("Error generating story ideas:", error);
    return res.status(500).json({ error: "Failed to generate story ideas" });
  }
}
