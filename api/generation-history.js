// api/generation-history.js
// Get and save user's generation history

const { createClient } = require("@supabase/supabase-js");
const { getCurrentUser } = require("./_auth.js");

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

module.exports = async function handler(req, res) {
  // Get user from session
  const { user, error: authError } = await getCurrentUser(req, res);
  
  if (!user) {
    return res.status(401).json({ error: authError || "Not authenticated" });
  }
  
  if (req.method === "GET") {
    // Get generation history for user
    try {
      const { data, error } = await supabase
        .from("generation_history")
        .select("*")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false })
        .limit(50);
      
      if (error) {
        console.error("Error fetching generation history:", error);
        return res.status(500).json({ error: "Failed to fetch history" });
      }
      
      // Transform to frontend format
      const history = (data || []).map(item => ({
        id: item.id,
        projectId: item.project_id,
        projectTitle: item.project_title,
        page: item.page_number,
        imageUrl: item.image_url,
        status: item.status,
        timestamp: new Date(item.created_at).getTime(),
      }));
      
      return res.status(200).json({ history });
    } catch (e) {
      console.error("Error in GET generation-history:", e);
      return res.status(500).json({ error: "Server error" });
    }
  }
  
  if (req.method === "POST") {
    // Add new generation history item
    const { projectId, projectTitle, page, imageUrl, status } = req.body;
    
    if (!projectId || !page) {
      return res.status(400).json({ error: "Missing required fields" });
    }
    
    try {
      const { data, error } = await supabase
        .from("generation_history")
        .insert({
          user_id: user.id,
          project_id: projectId,
          project_title: projectTitle || 'Untitled Book',
          page_number: page,
          image_url: imageUrl,
          status: status || 'complete',
        })
        .select()
        .single();
      
      if (error) {
        console.error("Error saving generation history:", error);
        return res.status(500).json({ error: "Failed to save history" });
      }
      
      return res.status(200).json({ 
        success: true,
        item: {
          id: data.id,
          projectId: data.project_id,
          projectTitle: data.project_title,
          page: data.page_number,
          imageUrl: data.image_url,
          status: data.status,
          timestamp: new Date(data.created_at).getTime(),
        }
      });
    } catch (e) {
      console.error("Error in POST generation-history:", e);
      return res.status(500).json({ error: "Server error" });
    }
  }
  
  return res.status(405).json({ error: "Method not allowed" });
};