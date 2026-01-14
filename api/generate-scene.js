// api/generate-scene.js
// Scene generation using unified story registry
// Simplified to use single registry for all data

const OpenAI = require("openai");
const { createClient } = require("@supabase/supabase-js");
const { uploadToR2 } = require("./_r2.js");

const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// Total reference images allowed per scene (OpenAI supports up to 16)
// We cap at 12 for optimal quality - system decides how to allocate
const MAX_TOTAL_REFERENCE_IMAGES = 12;

// -------------------------------------------------------
// Helper: Extract location from page text
// -------------------------------------------------------
async function extractLocationUsingAI(pageText) {
  const extraction = await client.responses.create({
    model: "gpt-4.1-mini",
    input: `
Extract the primary LOCATION or SETTING from this text.
Return ONLY JSON: { "location": "..." }
If none mentioned, infer from context (e.g., "backyard", "bedroom").

Text: "${pageText}"
`,
  });

  const raw = extraction.output_text ?? extraction.output?.[0]?.content?.[0]?.text;
  if (!raw) return null;

  try {
    const obj = JSON.parse(raw.replace(/```json|```/g, "").trim());
    return obj.location || null;
  } catch {
    return null;
  }
}

// -------------------------------------------------------
// Helper: Extract new props from page text
// -------------------------------------------------------
async function extractPropsUsingAI(pageText, existingProps) {
  const existingKeys = Object.keys(existingProps || {});
  const existingNames = Object.values(existingProps || {}).map(p => p.name?.toLowerCase()).filter(Boolean);
  
  const extraction = await client.responses.create({
    model: "gpt-4.1-mini",
    input: `
Extract physical objects/props from this text that could appear in an illustration.

ALREADY KNOWN PROPS (do not duplicate these):
${existingKeys.map(k => `- ${k}: ${existingProps[k]?.name || k}`).join("\n") || "none"}

DEDUPLICATION RULES:
- "controller" and "PlayStation controller" are the SAME object - don't create both
- "ball" and "red ball" are the SAME object - use the more specific name
- "toy" and "teddy bear" might be different OR the same - use context clues
- Singular and plural of same item = same prop (unless story has multiple distinct ones)
- Generic term + specific term for same thing = use specific term only

Return ONLY JSON:
{
  "props": [
    { "name": "specific-object-name", "description": "brief visual description" }
  ]
}

Text: "${pageText}"
`,
  });

  const raw = extraction.output_text ?? extraction.output?.[0]?.content?.[0]?.text;
  if (!raw) return [];

  try {
    const obj = JSON.parse(raw.replace(/```json|```/g, "").trim());
    return obj.props || [];
  } catch {
    return [];
  }
}

// -------------------------------------------------------
// Helper: Check if two prop names likely refer to the same object
// -------------------------------------------------------
function arePropsSimilar(name1, name2) {
  const n1 = name1.toLowerCase().trim();
  const n2 = name2.toLowerCase().trim();
  
  // Exact match
  if (n1 === n2) return true;
  
  // One contains the other (e.g., "controller" vs "playstation controller")
  if (n1.includes(n2) || n2.includes(n1)) return true;
  
  // Remove common modifiers and compare
  const stripModifiers = (s) => s
    .replace(/^(the|a|an|his|her|their|my)\s+/i, '')
    .replace(/\s+(toy|magic|special|favorite|old|new|big|small|little|red|blue|green|yellow|pink|purple|orange|black|white)\s*/gi, ' ')
    .trim();
  
  const stripped1 = stripModifiers(n1);
  const stripped2 = stripModifiers(n2);
  
  if (stripped1 === stripped2) return true;
  if (stripped1.includes(stripped2) || stripped2.includes(stripped1)) return true;
  
  // Check for singular/plural
  const singularize = (s) => s
    .replace(/ies$/, 'y')
    .replace(/es$/, '')
    .replace(/s$/, '');
  
  if (singularize(stripped1) === singularize(stripped2)) return true;
  
  return false;
}

// -------------------------------------------------------
// Helper: Merge duplicate props in registry
// -------------------------------------------------------
function deduplicateProps(props) {
  const merged = {};
  const processed = new Set();
  
  const entries = Object.entries(props);
  
  for (let i = 0; i < entries.length; i++) {
    const [key1, prop1] = entries[i];
    
    if (processed.has(key1)) continue;
    
    // Find all props that are similar to this one
    const similarProps = [{ key: key1, prop: prop1 }];
    
    for (let j = i + 1; j < entries.length; j++) {
      const [key2, prop2] = entries[j];
      if (processed.has(key2)) continue;
      
      if (arePropsSimilar(prop1.name || key1, prop2.name || key2)) {
        similarProps.push({ key: key2, prop: prop2 });
        processed.add(key2);
      }
    }
    
    processed.add(key1);
    
    // Pick the best version (prefer one with reference image, then most specific name)
    similarProps.sort((a, b) => {
      // Prefer one with reference image
      if (a.prop.reference_image_url && !b.prop.reference_image_url) return -1;
      if (!a.prop.reference_image_url && b.prop.reference_image_url) return 1;
      // Prefer longer/more specific name
      return (b.prop.name?.length || 0) - (a.prop.name?.length || 0);
    });
    
    const best = similarProps[0];
    merged[best.key] = best.prop;
    
    if (similarProps.length > 1) {
      console.log(`📦 Merged duplicate props: ${similarProps.map(p => p.prop.name || p.key).join(' + ')} → ${best.prop.name || best.key}`);
    }
  }
  
  return merged;
}

// -------------------------------------------------------
// Helper: Analyze which characters AND props appear in this scene
// -------------------------------------------------------
async function analyzeSceneComposition(pageText, registry, characterModels, allPages, currentPage) {
  // Build character list from registry
  const knownCharacters = Object.entries(registry.characters || {}).map(([key, char]) => ({
    key,
    name: char.name,
    role: char.role,
    type: char.type,
    has_model: char.has_model,
  }));

  // Build props list from registry (deduplicated)
  const deduplicatedProps = deduplicateProps(registry.props || {});
  const knownProps = Object.entries(deduplicatedProps).map(([key, prop]) => ({
    key,
    name: prop.name,
    description: prop.description || prop.visual || "",
    has_reference_image: !!prop.reference_image_url,
  }));

  // Build groups list from registry
  const knownGroups = Object.entries(registry.groups || {}).map(([key, group]) => ({
    key,
    name: group.name,
    singular: group.singular,
    detected_term: group.detected_term,
    member_count: group.members?.length || 0,
    members_with_images: (group.members || []).filter(m => m.reference_image_url).length,
    members: (group.members || []).map(m => ({
      id: m.id,
      name: m.name,
      has_image: !!m.reference_image_url,
    })),
  }));

  // Story context BEFORE current page (what has happened)
  const storyBefore = (allPages || [])
    .filter(p => Number(p.page) < Number(currentPage))
    .map(p => `Page ${p.page}: ${p.text}`)
    .join("\n");

  // Story context AFTER current page (what will happen - for hidden item locations)
  const storyAfter = (allPages || [])
    .filter(p => Number(p.page) > Number(currentPage))
    .map(p => `Page ${p.page}: ${p.text}`)
    .join("\n");

  const prompt = `
Analyze WHO and WHAT should VISUALLY APPEAR in this illustration.

=== CHARACTER PRESENCE RULES ===
- "Harley visits Gary's house" → Gary is NOW PRESENT
- "They played together" → BOTH characters in scene
- Plural pronouns (they, them, we) after establishing characters → ALL present

=== GROUP PRESENCE RULES ===
- Groups are collective references like "the grandkids", "cousins", "siblings"
- If a group is mentioned, include it in groups_in_scene
- All members of the group with uploaded reference images should appear

=== PROP PRESENCE RULES (CRITICAL) ===
Determine if each prop should VISUALLY APPEAR based on narrative context:

SHOW the prop when:
✓ Character is actively using/holding/interacting with it
✓ Prop is physically present in the scene
✓ "He picked up his controller" → show controller
✓ "She opened the magic box" → show box

DO NOT SHOW the prop when:
✗ Prop is LOST/MISSING/GONE - "his controller had gone away", "couldn't find her toy"
✗ Prop is REMEMBERED/WISHED FOR - "she dreamed of a bicycle", "he missed his teddy"
✗ Prop is being SEARCHED FOR - "looking everywhere for the key"
✗ Prop is BROKEN/DESTROYED - show broken pieces only if dramatic
✗ Prop is in a DIFFERENT LOCATION - "left his bag at school" (if scene is at home)
✗ Prop is FUTURE/HYPOTHETICAL - "maybe he would get a puppy someday"

=== HIDDEN ITEMS RULE (IMPORTANT) ===
If an item is LOST or being SEARCHED FOR on this page, check the FUTURE PAGES to see WHERE it gets found.
- If the item is found "under the blanket" later → show it hidden under blanket NOW (subtly visible, partially hidden)
- If the item is found "behind the couch" later → show it hidden behind couch NOW
- If the item is found "in the garden" later → DON'T show it if current scene is indoors
- The hiding spot must be CONSISTENT with where it's eventually found
- Show hidden items subtly - partially obscured, in background, not obvious

CONTEXT CLUES for ABSENCE:
- "gone", "lost", "missing", "disappeared", "couldn't find", "where is", "vanished"
- "wished for", "dreamed of", "hoped for", "wanted", "imagined"
- "left behind", "forgot", "at home", "at school" (when scene is elsewhere)
- "broken", "shattered", "destroyed", "ruined" (show aftermath, not intact object)
- Questions like "Where did it go?" indicate absence

STORY BEFORE THIS PAGE:
${storyBefore || "(This is the first page)"}

CURRENT PAGE (Page ${currentPage}):
"${pageText}"

STORY AFTER THIS PAGE (use to find where lost items are discovered):
${storyAfter || "(This is the last page)"}

KNOWN CHARACTERS:
${JSON.stringify(knownCharacters, null, 2)}

KNOWN GROUPS:
${JSON.stringify(knownGroups, null, 2)}

KNOWN PROPS:
${JSON.stringify(knownProps, null, 2)}

Return ONLY JSON:
{
  "characters_in_scene": [
    { "key": "character_key", "name": "Name", "prominence": "primary|secondary|background", "reason": "why present" }
  ],
  "groups_in_scene": [
    { "key": "group_key", "name": "Group Name", "reason": "why this group appears" }
  ],
  "props_in_scene": [
    { "key": "prop_key", "name": "Prop Name", "importance": "focal|supporting|background", "reason": "why VISUALLY shown", "visible": true }
  ],
  "hidden_props": [
    { "key": "prop_key", "name": "Prop Name", "hiding_spot": "where to hide it", "reason": "found here on page X" }
  ],
  "absent_props": [
    { "key": "prop_key", "name": "Prop Name", "reason": "why NOT shown (lost/missing/not in this location)" }
  ],
  "shot_type": "close-up|medium|wide|establishing",
  "focal_point": "what viewer should focus on",
  "show_characters": true,
  "notes": "composition notes including any absent items"
}

RULES FOR CHARACTERS:
1. Protagonist appears unless explicitly excluded
2. Going to someone's location means they're there
3. Plural pronouns = all recently mentioned characters
4. "Together", "with", "and" = multiple characters
5. If uncertain, INCLUDE the character

RULES FOR GROUPS:
1. If a group term (grandkids, cousins, etc.) is mentioned, include the group
2. All members of that group with uploaded images will be shown
3. Groups are separate from individual named characters

RULES FOR PROPS:
1. ONLY include props that should VISUALLY APPEAR in the illustration
2. If a prop is lost/missing/gone per the text, put it in "absent_props" NOT "props_in_scene"
3. Props being actively used = "focal" importance
4. Props in background = "background" importance
5. When in doubt about presence, check the CONTEXT CLUES above

NOTE: Max ${MAX_TOTAL_REFERENCE_IMAGES} total reference images (characters + group members + props combined).
`;

  const response = await client.responses.create({
    model: "gpt-4.1-mini",
    input: prompt,
  });

  const raw = response.output_text ?? response.output?.[0]?.content?.[0]?.text;

  if (!raw) {
    const protagonist = knownCharacters.find(c => c.role === "protagonist");
    return {
      characters_in_scene: protagonist ? [{ ...protagonist, prominence: "primary" }] : [],
      props_in_scene: [],
      shot_type: "medium",
      focal_point: "the scene",
      show_characters: true,
      notes: "",
    };
  }

  try {
    const parsed = JSON.parse(raw.replace(/```json|```/g, "").trim());
    // Ensure props_in_scene exists
    if (!parsed.props_in_scene) parsed.props_in_scene = [];
    return parsed;
  } catch {
    const protagonist = knownCharacters.find(c => c.role === "protagonist");
    return {
      characters_in_scene: protagonist ? [{ ...protagonist, prominence: "primary" }] : [],
      props_in_scene: [],
      shot_type: "medium",
      focal_point: "the scene",
      show_characters: true,
      notes: "",
    };
  }
}

// -------------------------------------------------------
// Helper: Build character visual rules for the prompt
// Now includes reference image numbers for clarity
// -------------------------------------------------------
function buildCharacterVisualRules(registry, sceneComposition, charImageIndexMap) {
  const rules = [];
  const charactersInScene = sceneComposition.characters_in_scene || [];

  for (const sceneChar of charactersInScene) {
    const char = registry.characters?.[sceneChar.key];
    
    if (!char) {
      rules.push(`• ${sceneChar.name}: No registry data. Depict consistently with story context.`);
      continue;
    }

    if (char.has_model && char.visual_source === "user") {
      const imageIndex = charImageIndexMap?.[sceneChar.key];
      if (imageIndex !== undefined) {
        rules.push(`• ${sceneChar.name} (${sceneChar.prominence}): MUST match Reference Image #${imageIndex + 1} EXACTLY - this is ${sceneChar.name}.`);
      } else {
        rules.push(`• ${sceneChar.name} (${sceneChar.prominence}): MUST match uploaded reference image EXACTLY.`);
      }
    } else if (char.visual) {
      const v = char.visual;
      if (char.type === "human") {
        rules.push(`• ${sceneChar.name} (${sceneChar.prominence}): ${v.age_range || ''} ${char.gender || ''}.
  Hair: ${v.hair || 'unspecified'}
  Skin: ${v.skin_tone || 'unspecified'}
  Build: ${v.build || 'unspecified'}
  Clothing: ${v.typical_clothing || 'casual children\'s clothes'}
  Features: ${v.distinctive_features || 'none'}`);
      } else {
        // Pet or animal
        rules.push(`• ${sceneChar.name} (${sceneChar.prominence}): ${char.breed || char.type || 'animal'}.
  Size: ${v.size || 'medium'}
  Colors: ${v.colors || 'unspecified'}
  Features: ${v.distinctive_features || 'none'}`);
      }
    } else {
      rules.push(`• ${sceneChar.name} (${sceneChar.prominence}): ${char.type || 'character'}. Depict consistently.`);
    }
  }

  return rules.join("\n\n");
}

// Valid image types for OpenAI API
const VALID_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];

// Check if base64 data is actually an SVG (common issue with placeholder services)
function isActuallySVG(base64Data) {
  // SVG files start with "<?xml" or "<svg" - check the first few bytes
  // In base64: "PHN2Zy" = "<svg" and "PD94bW" = "<?xm"
  return base64Data.startsWith('PHN2Zy') || base64Data.startsWith('PD94bW');
}

// -------------------------------------------------------
// Helper: Load character model images
// Returns all available, limiting happens later
// -------------------------------------------------------
async function prepareCharacterModelImages(registry, sceneComposition) {
  const images = [];
  const charactersInScene = sceneComposition.characters_in_scene || [];

  // Sort by prominence (prioritization happens later when combining all images)
  const sorted = [...charactersInScene].sort((a, b) => {
    const order = { primary: 0, secondary: 1, background: 2 };
    return (order[a.prominence] || 2) - (order[b.prominence] || 2);
  });

  for (const sceneChar of sorted) {
    const char = registry.characters?.[sceneChar.key];
    
    if (char?.has_model && char?.model_url) {
      try {
        const resp = await fetch(char.model_url);
        
        if (!resp.ok) {
          console.error(`Failed to fetch model for ${char.name}: ${resp.status}`);
          continue;
        }
        
        // Get content type from response header
        let contentType = resp.headers.get('content-type') || '';
        
        // Strip charset and other parameters
        contentType = contentType.split(';')[0].trim().toLowerCase();
        
        // If content-type is not valid for OpenAI, try to detect from URL extension
        if (!VALID_IMAGE_TYPES.includes(contentType)) {
          const url = char.model_url.toLowerCase();
          if (url.includes('.jpg') || url.includes('.jpeg')) {
            contentType = 'image/jpeg';
          } else if (url.includes('.webp')) {
            contentType = 'image/webp';
          } else if (url.includes('.gif')) {
            contentType = 'image/gif';
          } else if (url.includes('.png')) {
            contentType = 'image/png';
          } else {
            // Default to PNG
            console.warn(`Unknown content type for ${char.name}, defaulting to image/png`);
            contentType = 'image/png';
          }
          console.log(`📷 Content-type override for ${char.name}: ${resp.headers.get('content-type')} -> ${contentType}`);
        }
        
        const buffer = await resp.arrayBuffer();
        const base64 = Buffer.from(buffer).toString("base64");
        
        // Check if the actual content is SVG (common with placeholder services)
        if (isActuallySVG(base64)) {
          console.error(`⚠️ Skipping ${char.name}: File content is SVG, not a valid image format`);
          continue;
        }
        
        images.push({
          key: sceneChar.key,
          name: char.name,
          data_url: `data:${contentType};base64,${base64}`,
        });
        console.log(`📷 Loaded model: ${char.name} (${contentType})`);
      } catch (err) {
        console.error(`Failed to load model for ${char.name}:`, err.message);
      }
    }
  }

  return images;
}

// -------------------------------------------------------
// Helper: Load prop reference images
// Returns all available, limiting happens later
// -------------------------------------------------------
async function preparePropReferenceImages(registry, sceneComposition) {
  const images = [];
  const propsInScene = sceneComposition.props_in_scene || [];
  const hiddenProps = sceneComposition.hidden_props || [];

  // Combine visible and hidden props, marking hidden ones
  const allPropsToLoad = [
    ...propsInScene.map(p => ({ ...p, isHidden: false })),
    ...hiddenProps.map(p => ({ ...p, importance: 'background', isHidden: true })),
  ];

  // Sort by importance (prioritization happens later when combining all images)
  const sorted = [...allPropsToLoad].sort((a, b) => {
    const order = { focal: 0, supporting: 1, background: 2 };
    return (order[a.importance] || 2) - (order[b.importance] || 2);
  });

  for (const sceneProp of sorted) {
    const prop = registry.props?.[sceneProp.key];
    
    // Only include props that have user-uploaded reference images
    if (prop?.reference_image_url && prop?.image_source === "user") {
      try {
        const resp = await fetch(prop.reference_image_url);
        
        if (!resp.ok) {
          console.error(`Failed to fetch prop image for ${prop.name}: ${resp.status}`);
          continue;
        }
        
        // Get content type from response header
        let contentType = resp.headers.get('content-type') || '';
        
        // Strip charset and other parameters (e.g., "image/svg+xml; charset=utf-8" -> "image/svg+xml")
        contentType = contentType.split(';')[0].trim().toLowerCase();
        
        // If content-type is not valid for OpenAI, try to detect from URL extension
        if (!VALID_IMAGE_TYPES.includes(contentType)) {
          const url = prop.reference_image_url.toLowerCase();
          if (url.includes('.jpg') || url.includes('.jpeg')) {
            contentType = 'image/jpeg';
          } else if (url.includes('.webp')) {
            contentType = 'image/webp';
          } else if (url.includes('.gif')) {
            contentType = 'image/gif';
          } else if (url.includes('.png')) {
            contentType = 'image/png';
          } else {
            // Default to PNG, OpenAI will validate the actual bytes
            console.warn(`Unknown content type for ${prop.name}, defaulting to image/png`);
            contentType = 'image/png';
          }
          console.log(`📦 Content-type override for ${prop.name}: ${resp.headers.get('content-type')} -> ${contentType}`);
        }
        
        const buffer = await resp.arrayBuffer();
        const base64 = Buffer.from(buffer).toString("base64");
        
        // Check if the actual content is SVG (common with placeholder services)
        if (isActuallySVG(base64)) {
          console.error(`⚠️ Skipping ${prop.name}: File content is SVG, not a valid image format`);
          continue;
        }
        
        images.push({
          key: sceneProp.key,
          name: prop.name,
          importance: sceneProp.importance,
          isHidden: sceneProp.isHidden || false,
          hidingSpot: sceneProp.hiding_spot || null,
          data_url: `data:${contentType};base64,${base64}`,
        });
        const hiddenLabel = sceneProp.isHidden ? ` (HIDDEN: ${sceneProp.hiding_spot})` : '';
        console.log(`📦 Loaded prop reference: ${prop.name}${hiddenLabel} (${contentType})`);
      } catch (err) {
        console.error(`Failed to load prop image for ${prop.name}:`, err.message);
      }
    }
  }

  return images;
}

// -------------------------------------------------------
// Helper: Load group member reference images
// Returns all available, limiting happens later
// -------------------------------------------------------
async function prepareGroupMemberImages(registry, sceneComposition) {
  const images = [];
  const groupsInScene = sceneComposition.groups_in_scene || [];

  for (const sceneGroup of groupsInScene) {
    const group = registry.groups?.[sceneGroup.key];
    
    if (!group || !group.members) continue;

    // Load images for all members that have reference images
    for (const member of group.members) {
      if (!member.reference_image_url) continue;

      try {
        const resp = await fetch(member.reference_image_url);
        
        if (!resp.ok) {
          console.error(`Failed to fetch image for group member ${member.name}: ${resp.status}`);
          continue;
        }
        
        // Get content type from response header
        let contentType = resp.headers.get('content-type') || '';
        contentType = contentType.split(';')[0].trim().toLowerCase();
        
        // If content-type is not valid for OpenAI, try to detect from URL extension
        if (!VALID_IMAGE_TYPES.includes(contentType)) {
          const url = member.reference_image_url.toLowerCase();
          if (url.includes('.jpg') || url.includes('.jpeg')) {
            contentType = 'image/jpeg';
          } else if (url.includes('.webp')) {
            contentType = 'image/webp';
          } else if (url.includes('.gif')) {
            contentType = 'image/gif';
          } else if (url.includes('.png')) {
            contentType = 'image/png';
          } else {
            console.warn(`Unknown content type for ${member.name}, defaulting to image/png`);
            contentType = 'image/png';
          }
        }
        
        const buffer = await resp.arrayBuffer();
        const base64 = Buffer.from(buffer).toString("base64");
        
        // Check if the actual content is SVG
        if (isActuallySVG(base64)) {
          console.error(`⚠️ Skipping ${member.name}: File content is SVG, not a valid image format`);
          continue;
        }
        
        images.push({
          key: member.id,
          name: member.name,
          group_key: sceneGroup.key,
          group_name: group.name,
          type: 'group_member',
          data_url: `data:${contentType};base64,${base64}`,
        });
        console.log(`👥 Loaded group member: ${member.name} from ${group.name} (${contentType})`);
      } catch (err) {
        console.error(`Failed to load image for group member ${member.name}:`, err.message);
      }
    }
  }

  return images;
}

// -------------------------------------------------------
// Helper: Build group visual rules for the prompt
// -------------------------------------------------------
function buildGroupVisualRules(registry, sceneComposition, groupMemberIndexMap) {
  const rules = [];
  const groupsInScene = sceneComposition.groups_in_scene || [];

  for (const sceneGroup of groupsInScene) {
    const group = registry.groups?.[sceneGroup.key];
    
    if (!group) continue;

    const membersWithImages = (group.members || []).filter(m => m.reference_image_url);
    
    if (membersWithImages.length > 0) {
      const memberRules = membersWithImages.map(member => {
        const imageIndex = groupMemberIndexMap?.[member.id];
        if (imageIndex !== undefined) {
          return `  - ${member.name}: MUST match Reference Image #${imageIndex + 1}`;
        }
        return `  - ${member.name}: Match their uploaded reference image`;
      }).join("\n");
      
      rules.push(`• ${group.name} (${membersWithImages.length} members with photos):\n${memberRules}`);
    } else {
      rules.push(`• ${group.name}: Generate ${group.detected_count || 'several'} ${group.singular || 'people'} with consistent appearances.`);
    }
  }

  return rules.join("\n\n");
}

// -------------------------------------------------------
// Helper: Build prop visual rules for the prompt
// Props with reference images should NOT get text descriptions (avoid conflicts)
// Now includes reference image numbers for clarity
// -------------------------------------------------------
function buildPropVisualRules(registry, sceneComposition, propImageIndexMap) {
  const rules = [];
  const propsInScene = sceneComposition.props_in_scene || [];

  for (const sceneProp of propsInScene) {
    const prop = registry.props?.[sceneProp.key];
    
    if (!prop) {
      rules.push(`• ${sceneProp.name}: Depict based on story context.`);
      continue;
    }

    // Props with reference images: specify WHICH image number to match
    if (prop.reference_image_url && prop.image_source === "user") {
      const imageIndex = propImageIndexMap?.[sceneProp.key];
      if (imageIndex !== undefined) {
        rules.push(`• ${prop.name} (${sceneProp.importance}): MUST match Reference Image #${imageIndex + 1} EXACTLY - this is the ${prop.name}.`);
      } else {
        rules.push(`• ${prop.name} (${sceneProp.importance}): Match the uploaded reference image exactly.`);
      }
    } 
    // Props WITHOUT reference images: include text description
    else if (prop.description || prop.visual) {
      rules.push(`• ${prop.name} (${sceneProp.importance}): ${prop.description || prop.visual}`);
    } else {
      rules.push(`• ${prop.name} (${sceneProp.importance}): Depict consistently with story.`);
    }
  }

  return rules.join("\n");
}

// -------------------------------------------------------
// Main handler
// -------------------------------------------------------
async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { projectId, page, pageText, isRegeneration, allPages } = req.body || {};

  if (!projectId || !page || !pageText) {
    return res.status(400).json({ error: "Missing projectId, page, or pageText" });
  }

  try {
    // 1. Load project
    const { data: project, error: projectError } = await supabase
      .from("book_projects")
      .select("character_model_url, character_models, illustrations, props_registry")
      .eq("id", projectId)
      .single();

    if (projectError) {
      console.error("Project fetch error:", projectError);
      return res.status(500).json({ error: "Could not load project." });
    }

    // 2. Get unified registry
    let registry;
    if (Array.isArray(project.props_registry) && project.props_registry.length > 0) {
      registry = project.props_registry[0];
    } else if (project.props_registry && typeof project.props_registry === "object") {
      registry = project.props_registry;
    } else {
      registry = { characters: {}, props: {}, environments: {} };
    }

    // Ensure registry has all sections
    if (!registry.characters) registry.characters = {};
    if (!registry.props) registry.props = {};
    if (!registry.environments) registry.environments = {};

    // Handle legacy character_model_url
    if (project.character_model_url && Object.keys(registry.characters).length === 0) {
      registry.characters.protagonist = {
        name: "Child",
        role: "protagonist",
        type: "human",
        has_model: true,
        visual_source: "user",
        model_url: project.character_model_url,
      };
    }

    // Merge character_models into registry if needed
    for (const cm of (project.character_models || [])) {
      if (!registry.characters[cm.character_key]) {
        registry.characters[cm.character_key] = {
          name: cm.name,
          role: cm.role,
          type: cm.role === "pet" ? "animal" : "human",
          has_model: true,
          visual_source: "user",
          model_url: cm.model_url,
        };
      } else if (cm.model_url) {
        registry.characters[cm.character_key].has_model = true;
        registry.characters[cm.character_key].model_url = cm.model_url;
        registry.characters[cm.character_key].visual_source = "user";
      }
    }

    const existingIllustrations = Array.isArray(project.illustrations) ? project.illustrations : [];
    const existingForPage = existingIllustrations.find(i => Number(i.page) === Number(page));
    const previousRevisions = existingForPage?.revisions || 0;
    const existingHistory = existingForPage?.revision_history || [];
    const isRegen = !!isRegeneration;

    // 3. Analyze scene composition (now includes props and groups)
    console.log("=== ANALYZING SCENE ===");
    const sceneComposition = await analyzeSceneComposition(
      pageText, registry, project.character_models, allPages, page
    );
    console.log("Characters:", sceneComposition.characters_in_scene?.map(c => c.name));
    console.log("Groups:", sceneComposition.groups_in_scene?.map(g => g.name));
    console.log("Props to SHOW:", sceneComposition.props_in_scene?.map(p => p.name));
    if (sceneComposition.hidden_props?.length > 0) {
      console.log("Props HIDDEN:", sceneComposition.hidden_props?.map(p => `${p.name} (${p.hiding_spot})`));
    }
    if (sceneComposition.absent_props?.length > 0) {
      console.log("Props ABSENT (not shown):", sceneComposition.absent_props?.map(p => `${p.name} (${p.reason})`));
    }

    // 4. Prepare all reference images
    const characterImages = await prepareCharacterModelImages(registry, sceneComposition);
    const groupMemberImages = await prepareGroupMemberImages(registry, sceneComposition);
    const propImages = await preparePropReferenceImages(registry, sceneComposition);

    // 5. Extract location and new props
    const [detectedLocation, newProps] = await Promise.all([
      extractLocationUsingAI(pageText),
      extractPropsUsingAI(pageText, registry.props),
    ]);

    // 6. Combine all reference images with intelligent prioritization
    // Priority: 1) Primary characters, 2) Group members, 3) Focal props, 4) Secondary chars, 5) Supporting props
    const prioritizedImages = [];
    
    // Add primary characters first (most important for consistency)
    const primaryChars = characterImages.filter(img => {
      const sceneChar = sceneComposition.characters_in_scene?.find(c => c.key === img.key);
      return sceneChar?.prominence === 'primary';
    });
    prioritizedImages.push(...primaryChars);
    
    // Add group members (typically important when mentioned)
    prioritizedImages.push(...groupMemberImages);
    
    // Add focal props
    const focalProps = propImages.filter(img => img.importance === 'focal');
    prioritizedImages.push(...focalProps);
    
    // Add secondary characters
    const secondaryChars = characterImages.filter(img => {
      const sceneChar = sceneComposition.characters_in_scene?.find(c => c.key === img.key);
      return sceneChar?.prominence === 'secondary';
    });
    prioritizedImages.push(...secondaryChars);
    
    // Add supporting props
    const supportingProps = propImages.filter(img => img.importance === 'supporting');
    prioritizedImages.push(...supportingProps);
    
    // Add background characters
    const bgChars = characterImages.filter(img => {
      const sceneChar = sceneComposition.characters_in_scene?.find(c => c.key === img.key);
      return sceneChar?.prominence === 'background';
    });
    prioritizedImages.push(...bgChars);
    
    // Add background props
    const bgProps = propImages.filter(img => img.importance === 'background');
    prioritizedImages.push(...bgProps);
    
    // Apply the total limit
    const allReferenceImages = prioritizedImages.slice(0, MAX_TOTAL_REFERENCE_IMAGES);
    
    if (prioritizedImages.length > MAX_TOTAL_REFERENCE_IMAGES) {
      console.log(`⚠️ Trimmed reference images from ${prioritizedImages.length} to ${MAX_TOTAL_REFERENCE_IMAGES}`);
    }
    
    // Build index maps for prompt references
    const charImageIndexMap = {};
    const groupMemberIndexMap = {};
    const propImageIndexMap = {};
    
    allReferenceImages.forEach((img, index) => {
      if (img.type === 'group_member') {
        groupMemberIndexMap[img.key] = index;
      } else if (img.importance) {
        // It's a prop (has importance field)
        propImageIndexMap[img.key] = index;
      } else {
        // It's a character
        charImageIndexMap[img.key] = index;
      }
    });
    
    console.log("Image index map - Characters:", charImageIndexMap);
    console.log("Image index map - Group Members:", groupMemberIndexMap);
    console.log("Image index map - Props:", propImageIndexMap);
    console.log(`Total reference images: ${allReferenceImages.length}/${MAX_TOTAL_REFERENCE_IMAGES}`);

    // 7. Build the prompt with image index references
    const characterRules = buildCharacterVisualRules(registry, sceneComposition, charImageIndexMap);
    const groupRules = buildGroupVisualRules(registry, sceneComposition, groupMemberIndexMap);
    const propRules = buildPropVisualRules(registry, sceneComposition, propImageIndexMap);
    
    const prompt = `
You MUST generate this illustration using the image_generation tool.
Return ONLY a tool call.

=== SCENE INFO ===
Page text: "${pageText}"
Location: ${detectedLocation || "infer from context"}
Shot type: ${sceneComposition.shot_type}
Focal point: ${sceneComposition.focal_point}

=== CHARACTERS IN SCENE ===
${sceneComposition.characters_in_scene?.map(c => `${c.name} (${c.prominence}): ${c.reason || ''}`).join("\n") || "None specified"}

=== CHARACTER VISUAL RULES ===
${characterRules}

${sceneComposition.groups_in_scene?.length > 0 ? `
=== GROUPS IN SCENE ===
${sceneComposition.groups_in_scene?.map(g => `${g.name}: ${g.reason || ''}`).join("\n")}

=== GROUP VISUAL RULES ===
${groupRules}
` : ''}

=== PROPS TO SHOW IN SCENE ===
${sceneComposition.props_in_scene?.map(p => `${p.name} (${p.importance}): ${p.reason || ''}`).join("\n") || "None - no props should appear"}

=== PROP VISUAL RULES ===
${propRules || "No props to show in this scene."}

${sceneComposition.hidden_props?.length > 0 ? `
=== HIDDEN PROPS (show partially obscured) ===
These items should appear HIDDEN in the scene - partially visible but not obvious:
${sceneComposition.hidden_props.map(p => `• ${p.name}: Hide it ${p.hiding_spot} (${p.reason})`).join("\n")}
IMPORTANT: Show hidden items subtly - peeking out, partially covered, in the background. The reader should be able to spot them if looking carefully.
` : ''}

${sceneComposition.absent_props?.length > 0 ? `
=== PROPS TO EXCLUDE (DO NOT DRAW) ===
These items are mentioned but should NOT appear visually:
${sceneComposition.absent_props.map(p => `• ${p.name}: ${p.reason}`).join("\n")}
` : ''}

${allReferenceImages.length > 0 ? `
=== REFERENCE IMAGES PROVIDED (${allReferenceImages.length} total) ===
The following reference images are attached IN ORDER. You MUST use them:
${allReferenceImages.map((img, i) => {
  if (img.type === 'group_member') {
    return `• Reference Image #${i + 1}: ${img.name} (GROUP MEMBER from ${img.group_name} - draw this exact person)`;
  } else if (img.isHidden) {
    return `• Reference Image #${i + 1}: ${img.name} (PROP - show HIDDEN ${img.hidingSpot})`;
  } else if (img.importance) {
    return `• Reference Image #${i + 1}: ${img.name} (PROP - show this exact object)`;
  } else {
    return `• Reference Image #${i + 1}: ${img.name} (CHARACTER - draw this exact person/animal)`;
  }
}).join("\n")}

CRITICAL: Each character, group member, and prop listed above with a reference image MUST look EXACTLY like their reference image. Copy the colors, shape, and details precisely.
` : ''}

=== ENVIRONMENT STYLE ===
${registry.environments?.[detectedLocation?.toLowerCase()]?.style || "Child-friendly, bright, simple"}

=== STYLE REQUIREMENTS ===
• Soft pastel children's-book illustration
• Clean rounded outlines, gentle shading
• Warm daylight colors (5000-5500K)
• Simple uncluttered backgrounds
• Full-body characters, never awkwardly cropped
• No text in image
• 1024×1024 PNG

=== STRICT RULES ===
• Reference images are EXACT visual guides - match them precisely
• The prop/character MUST look identical to their reference image
• Include ALL characters and props listed for this scene
• Hidden props should be subtle but findable by careful readers
• Maintain consistent art style while matching references

Generate the illustration now.
`;

    // 7. Build input with images (characters + props)
    const inputContent = [{ type: "input_text", text: prompt }];
    for (const img of allReferenceImages) {
      // Log the data URL prefix to debug content type issues
      const prefix = img.data_url.substring(0, 50);
      const imgType = img.importance ? 'prop' : 'character';
      const hiddenLabel = img.isHidden ? ' (hidden)' : '';
      console.log(`Adding ${imgType} image for ${img.name}${hiddenLabel}: ${prefix}...`);
      inputContent.push({ type: "input_image", image_url: img.data_url });
    }

    // 8. Generate image
    const response = await client.responses.create({
      model: "gpt-4.1", 
      input: [{ role: "user", content: inputContent }],
      tools: [{
        type: "image_generation",
        model: "gpt-image-1-mini", //CHANGED TO TEST IF CHEAPER MODEL IS STILL GOOD LOOKING. WAS: gpt-image-1. Consider changing to gpt-image-1.5 if visual fidelity or context isn't working right on image-1-mini
        size: "1024x1024",
        quality: "low",  // Change to "high" for production
        background: "opaque",
        output_format: "png",
        output_compression: 100,
        moderation: "auto",
      }],
    });

    const imgCall = response.output.find(o => o.type === "image_generation_call");
    if (!imgCall?.result) {
      return res.status(500).json({ error: "Model produced no image." });
    }

    const sceneBuffer = Buffer.from(imgCall.result, "base64");

    // 9. Upload image to R2
    const newRevisions = isRegen ? previousRevisions + 1 : 0;
    const filePath = `illustrations/${projectId}-page-${page}-r${newRevisions}.png`;

    const uploadResult = await uploadToR2(filePath, sceneBuffer, "image/png");

    if (!uploadResult.success) {
      console.error("R2 upload error:", uploadResult.error);
      return res.status(500).json({ error: "Failed to upload illustration." });
    }

    const imageUrl = uploadResult.publicUrl;

    // 10. Update registry with new props/environments
    if (detectedLocation) {
      const envKey = detectedLocation.toLowerCase().trim();
      if (!registry.environments[envKey]) {
        registry.environments[envKey] = {
          name: detectedLocation,
          style: `Consistent ${detectedLocation} setting`,
          first_seen_page: page,
        };
      }
    }

    for (const p of newProps) {
      const key = (p.name || "").toLowerCase().trim().replace(/\s+/g, "_");
      if (key && !registry.props[key] && !registry.characters[key]) {
        registry.props[key] = {
          name: p.name,
          description: p.description,
          first_seen_page: page,
        };
      }
    }

    await supabase
      .from("book_projects")
      .update({ props_registry: [registry] })
      .eq("id", projectId);

    // 11. Update illustrations (re-fetch to avoid race conditions with parallel generation)
    const { data: currentProject } = await supabase
      .from("book_projects")
      .select("illustrations")
      .eq("id", projectId)
      .single();
    
    const currentIllustrations = Array.isArray(currentProject?.illustrations) 
      ? currentProject.illustrations 
      : [];
    
    // Build revision history
    let newHistory = [...existingHistory];
    if (isRegen && existingForPage?.image_url) {
      newHistory.push({
        revision: previousRevisions,
        image_url: existingForPage.image_url,
        created_at: existingForPage.last_updated || new Date().toISOString(),
      });
      if (newHistory.length > 2) newHistory = newHistory.slice(-2);
    }

    // Filter out old entry for this page and add new one
    const updatedIllustrations = currentIllustrations.filter(i => Number(i.page) !== Number(page));
    updatedIllustrations.push({
      page,
      image_url: imageUrl,
      revisions: newRevisions,
      last_updated: new Date().toISOString(),
      revision_history: newHistory,
      scene_composition: sceneComposition,
    });

    const { error: updateError } = await supabase
      .from("book_projects")
      .update({ illustrations: updatedIllustrations })
      .eq("id", projectId);
    
    if (updateError) {
      console.error("Failed to save illustration:", updateError);
      // Don't fail the request - image was generated and uploaded successfully
    }

    // 12. Done
    return res.status(200).json({
      page,
      image_url: imageUrl,
      revisions: newRevisions,
      revision_history: newHistory,
      scene_composition: sceneComposition,
    });

  } catch (err) {
    console.error("Generation error:", err?.message, err?.stack);
    return res.status(500).json({
      error: "Failed to generate illustration.",
      details: err?.message,
    });
  }
}

module.exports = handler;
module.exports.config = {
  api: { bodyParser: { sizeLimit: "10mb" } },
};