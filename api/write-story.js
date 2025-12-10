// api/write-story.js

import OpenAI from "openai";
import { createClient } from "@supabase/supabase-js";

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

// 🔍 Extract durable “world context” from name + interests
async function extractContextRegistry(name, interests) {
  const prompt = `
You are building a small "world registry" for a children's story project.

From the child info below, extract persistent facts that MUST NOT be lost,
even if later story text or ideas simplify them.

Examples of facts:
- Specific pet names and types (e.g. "beagle named Cricket")
- Siblings or family members and how they relate to the child
- Favorite places, activities, toys, characters, etc.
- Any detail the parent clearly cares about

Child info:
- Name: ${name}
- Raw interests text: ${interests || "not specified"}

Return ONLY JSON in this exact structure:

{
  "child": {
    "name": "Child's name",
    "age_range": "approx age range like 4-7",
    "notes": "any extra details that matter"
  },
  "pets": {
    "slug-key": {
      "name": "Cricket",
      "type": "dog",
      "breed": "beagle",
      "relationship": "child's pet",
      "notes": "any extra detail"
    }
  },
  "people": {
    "slug-key": {
      "name": "Nana",
      "relationship": "grandparent",
      "notes": "any extra detail"
    }
  },
  "locations": {
    "slug-key": {
      "name": "Grandad's farm",
      "type": "farm / house / park / etc.",
      "notes": "why this place matters to the child"
    }
  },
  "items": {
    "slug-key": {
      "name": "favorite blanket",
      "type": "toy / clothing / etc.",
      "notes": "what makes it special"
    }
  },
  "notes": "any other small but important facts for continuity"
}

Rules:
- "slug-key" should be lowercase with hyphens (e.g. "Cricket the beagle" -> "cricket-beagle").
- If there are no entries for a category, return an empty object {} for that category.
- Do NOT invent new facts; only use or lightly infer from what is given.
`;

  const response = await client.responses.create({
    model: "gpt-4.1-mini",
    input: prompt,
  });

  let raw = response.output_text;
  if (!raw && response.output?.[0]?.content?.[0]?.text) {
    raw = response.output[0].content[0].text;
  }

  try {
    const cleaned = cleanJsonOutput(raw);
    const parsed = JSON.parse(cleaned);
    return parsed;
  } catch (err) {
    console.error("Context registry parse error:", err);
    // Safe fallback registry
    return {
      child: {
        name,
        age_range: "4-7",
        notes: interests || "",
      },
      pets: {},
      people: {},
      locations: {},
      items: {},
      notes: "",
    };
  }
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { name, interests, projectId } = req.body;

  if (!name) {
    return res.status(400).json({ error: "Missing child name" });
  }

  try {
    // 1) Generate story ideas, but FORCE keeping specific details
    const ideasPrompt = `
You are a children's author. Create 5 fun, kid-friendly story ideas.

IMPORTANT DETAIL PRESERVATION:
- If the child info mentions specific names, types, or relationships
  (for example: "my beagle named Cricket"),
  you MUST keep those exact details in your ideas.
- Do NOT generalize them (e.g. don't change "beagle named Cricket" to just "dog").
- Do NOT rename or swap them for different animals or people.
- These details are part of the child's real life and must stay intact.

Child:
- Name: ${name}
- Interests (raw text from parent): ${interests || "not specified"}
- Age: assume 4–7 years old

Return ONLY JSON:
{
  "ideas": [
    { "title": "...", "description": "..." }
  ]
}
`;

    const response = await client.responses.create({
      model: "gpt-4.1-mini",
      input: ideasPrompt,
    });

    let raw = response.output_text;
    if (!raw && response.output?.[0]?.content?.[0]?.text) {
      raw = response.output[0].content[0].text;
    }

    const cleaned = cleanJsonOutput(raw);
    const parsed = JSON.parse(cleaned);

    // 2) Build / update the world context registry from raw name + interests
    const contextRegistry = await extractContextRegistry(name, interests);

    let finalProjectId;

    // UPDATE PATH (existing project)
    if (projectId && projectId !== "undefined" && projectId !== null) {
      const { data, error } = await supabase
        .from("book_projects")
        .update({
          kid_name: name,
          kid_interests: interests,
          story_ideas: parsed.ideas,
          context_registry: contextRegistry,
        })
        .eq("id", projectId)
        .select("*")
        .single();

      if (error) {
        console.error("Update failed:", error);
        return res.status(500).json({ error: "Update failed", details: error });
      }

      finalProjectId = data.id;
    }

    // INSERT PATH (new project)
    else {
      const { data, error } = await supabase
        .from("book_projects")
        .insert({
          kid_name: name,
          kid_interests: interests,
          story_ideas: parsed.ideas,
          context_registry: contextRegistry,
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
      projectId: finalProjectId,
      context_registry: contextRegistry,
    });
  } catch (error) {
    console.error("Error generating ideas:", error);
    return res.status(500).json({ error: "Failed to generate story ideas" });
  }
}
