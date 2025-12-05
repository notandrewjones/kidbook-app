// api/story-ideas.js

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
Return them as JSON array of objects with "title" and "description".

Child:
- Name: ${name}
- Interests: ${interests || "not specified"}
- Age: unknown (assume 4-7 years old)
`;

    const response = await client.responses.create({
      model: "gpt-4.1-mini",
      input: prompt,
      response_format: {
        type: "json_schema",
        json_schema: {
          name: "story_ideas",
          schema: {
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
                  required: ["title", "description"],
                  additionalProperties: false
                }
              }
            },
            required: ["ideas"],
            additionalProperties: false
          }
        }
      }
    });

        const parsed = JSON.parse(response.output[0].content[0].text);

    // Save project to Supabase
    const { data, error: dbError } = await supabase
      .from("book_projects")
      .insert({
        kid_name: name,
        kid_interests: interests,
        story_ideas: parsed.ideas  // if you added a JSONB column
      })
      .select()
      .single();

    if (dbError) {
      console.error("Error saving to Supabase:", dbError);
    }

    return res.status(200).json(parsed);

  } catch (error) {
    console.error("Error generating story ideas:", error);
    return res.status(500).json({ error: "Failed to generate story ideas" });
  }
}
