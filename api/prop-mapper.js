// ------------------------------------------------------------------
// 7. Update props registry using raw AI extraction
// ------------------------------------------------------------------
const aiProps = await extractPropsUsingAI(pageText);

const updatedRegistry = { ...registry };

if (!updatedRegistry.props) updatedRegistry.props = {};

// Add each prop exactly as GPT detected it
for (const p of aiProps) {
  const key = p.name.toLowerCase().trim();

  if (!updatedRegistry.props[key]) {
    updatedRegistry.props[key] = {
      context: p.context || "Appears in page illustration",
      first_seen_page: page
    };
  }
}

// Save updated registry
await supabase
  .from("book_projects")
  .update({ props_registry: updatedRegistry })
  .eq("id", projectId);
