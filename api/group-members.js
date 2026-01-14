// api/group-members.js
// Manage group members (add, remove, update) and upload reference photos

import { createClient } from "@supabase/supabase-js";
import { uploadToR2 } from "./_r2.js";

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

export const config = {
  api: {
    bodyParser: false, // We handle multipart for photo uploads
  },
};

// Generate unique ID for group member
function generateMemberId(groupKey) {
  return `${groupKey}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

// Parse multipart form data
function readFormData(req) {
  return new Promise((resolve, reject) => {
    const busboy = require("busboy");
    const bb = busboy({ headers: req.headers });

    let fileBuffer = null;
    let fileInfo = {};
    const fields = {};

    bb.on("field", (name, value) => {
      fields[name] = value;
    });

    bb.on("file", (name, file, info) => {
      const { filename, mimeType } = info;
      fileInfo = { filename, mimeType };
      const chunks = [];

      file.on("data", (chunk) => chunks.push(chunk));
      file.on("end", () => {
        fileBuffer = Buffer.concat(chunks);
      });
    });

    bb.on("finish", () => {
      resolve({ fileBuffer, fileInfo, fields });
    });

    bb.on("error", reject);
    req.pipe(bb);
  });
}

export default async function handler(req, res) {
  const { method } = req;

  // ─────────────────────────────────────────────────────────────────
  // GET: List group members for a project
  // ─────────────────────────────────────────────────────────────────
  if (method === "GET") {
    const { projectId, groupKey } = req.query;

    if (!projectId) {
      return res.status(400).json({ error: "Missing projectId" });
    }

    const { data: project, error } = await supabase
      .from("book_projects")
      .select("props_registry")
      .eq("id", projectId)
      .single();

    if (error) {
      return res.status(500).json({ error: "Failed to load project" });
    }

    const registry = Array.isArray(project?.props_registry) && project.props_registry.length
      ? project.props_registry[0]
      : { groups: {} };

    if (groupKey) {
      // Return specific group
      const group = registry.groups?.[groupKey];
      return res.status(200).json({ group: group || null });
    }

    // Return all groups
    return res.status(200).json({ groups: registry.groups || {} });
  }

  // ─────────────────────────────────────────────────────────────────
  // POST: Add a new member to a group (with optional photo upload)
  // ─────────────────────────────────────────────────────────────────
  if (method === "POST") {
    const { fileBuffer, fileInfo, fields } = await readFormData(req);
    const { projectId, groupKey, memberName } = fields;

    if (!projectId || !groupKey || !memberName) {
      return res.status(400).json({ error: "Missing projectId, groupKey, or memberName" });
    }

    // Fetch current registry
    const { data: project, error: fetchError } = await supabase
      .from("book_projects")
      .select("props_registry")
      .eq("id", projectId)
      .single();

    if (fetchError) {
      return res.status(500).json({ error: "Failed to load project" });
    }

    let registry = Array.isArray(project?.props_registry) && project.props_registry.length
      ? project.props_registry[0]
      : { characters: {}, props: {}, environments: {}, groups: {} };

    // Ensure groups section exists
    if (!registry.groups) registry.groups = {};

    // Get or create the group
    if (!registry.groups[groupKey]) {
      return res.status(404).json({ error: `Group '${groupKey}' not found` });
    }

    const group = registry.groups[groupKey];
    if (!group.members) group.members = [];

    // Generate member ID and upload photo if provided
    const memberId = generateMemberId(groupKey);
    let photoUrl = null;

    if (fileBuffer) {
      const ext = fileInfo.filename?.split(".").pop() || "png";
      const filePath = `group_members/${projectId}/${groupKey}/${memberId}.${ext}`;

      const uploadResult = await uploadToR2(filePath, fileBuffer, fileInfo.mimeType);

      if (!uploadResult.success) {
        console.error("R2 upload error:", uploadResult.error);
        return res.status(500).json({ error: "Failed to upload photo" });
      }

      photoUrl = uploadResult.publicUrl;
      console.log(`👥 Group member photo uploaded: ${photoUrl}`);
    }

    // Add the new member
    const newMember = {
      id: memberId,
      name: memberName.trim(),
      reference_image_url: photoUrl,
      image_source: photoUrl ? "user" : null,
      added_at: new Date().toISOString(),
    };

    group.members.push(newMember);

    // Save updated registry
    const { error: updateError } = await supabase
      .from("book_projects")
      .update({ props_registry: [registry] })
      .eq("id", projectId);

    if (updateError) {
      return res.status(500).json({ error: "Failed to save member" });
    }

    return res.status(200).json({
      success: true,
      member: newMember,
      group: group,
    });
  }

  // ─────────────────────────────────────────────────────────────────
  // PUT: Update a group member (name or photo)
  // ─────────────────────────────────────────────────────────────────
  if (method === "PUT") {
    const { fileBuffer, fileInfo, fields } = await readFormData(req);
    const { projectId, groupKey, memberId, memberName } = fields;

    if (!projectId || !groupKey || !memberId) {
      return res.status(400).json({ error: "Missing projectId, groupKey, or memberId" });
    }

    // Fetch current registry
    const { data: project, error: fetchError } = await supabase
      .from("book_projects")
      .select("props_registry")
      .eq("id", projectId)
      .single();

    if (fetchError) {
      return res.status(500).json({ error: "Failed to load project" });
    }

    let registry = Array.isArray(project?.props_registry) && project.props_registry.length
      ? project.props_registry[0]
      : { groups: {} };

    const group = registry.groups?.[groupKey];
    if (!group) {
      return res.status(404).json({ error: `Group '${groupKey}' not found` });
    }

    const memberIndex = group.members?.findIndex(m => m.id === memberId);
    if (memberIndex === -1) {
      return res.status(404).json({ error: `Member '${memberId}' not found` });
    }

    const member = group.members[memberIndex];

    // Update name if provided
    if (memberName) {
      member.name = memberName.trim();
    }

    // Upload new photo if provided
    if (fileBuffer) {
      const ext = fileInfo.filename?.split(".").pop() || "png";
      const filePath = `group_members/${projectId}/${groupKey}/${memberId}.${ext}`;

      const uploadResult = await uploadToR2(filePath, fileBuffer, fileInfo.mimeType);

      if (!uploadResult.success) {
        return res.status(500).json({ error: "Failed to upload photo" });
      }

      member.reference_image_url = uploadResult.publicUrl;
      member.image_source = "user";
      member.updated_at = new Date().toISOString();
    }

    // Save updated registry
    const { error: updateError } = await supabase
      .from("book_projects")
      .update({ props_registry: [registry] })
      .eq("id", projectId);

    if (updateError) {
      return res.status(500).json({ error: "Failed to update member" });
    }

    return res.status(200).json({
      success: true,
      member: member,
      group: group,
    });
  }

  // ─────────────────────────────────────────────────────────────────
  // DELETE: Remove a member from a group
  // ─────────────────────────────────────────────────────────────────
  if (method === "DELETE") {
    // For DELETE, we need to parse JSON body
    let body = "";
    for await (const chunk of req) {
      body += chunk;
    }
    const { projectId, groupKey, memberId } = JSON.parse(body || "{}");

    if (!projectId || !groupKey || !memberId) {
      return res.status(400).json({ error: "Missing projectId, groupKey, or memberId" });
    }

    // Fetch current registry
    const { data: project, error: fetchError } = await supabase
      .from("book_projects")
      .select("props_registry")
      .eq("id", projectId)
      .single();

    if (fetchError) {
      return res.status(500).json({ error: "Failed to load project" });
    }

    let registry = Array.isArray(project?.props_registry) && project.props_registry.length
      ? project.props_registry[0]
      : { groups: {} };

    const group = registry.groups?.[groupKey];
    if (!group || !group.members) {
      return res.status(404).json({ error: `Group '${groupKey}' not found` });
    }

    // Remove the member
    const initialLength = group.members.length;
    group.members = group.members.filter(m => m.id !== memberId);

    if (group.members.length === initialLength) {
      return res.status(404).json({ error: `Member '${memberId}' not found` });
    }

    // Save updated registry
    const { error: updateError } = await supabase
      .from("book_projects")
      .update({ props_registry: [registry] })
      .eq("id", projectId);

    if (updateError) {
      return res.status(500).json({ error: "Failed to remove member" });
    }

    return res.status(200).json({
      success: true,
      group: group,
    });
  }

  return res.status(405).json({ error: "Method not allowed" });
}