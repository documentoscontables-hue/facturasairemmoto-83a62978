import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const PROTECTED_EMAIL = "ai01@remmoto.co";

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY") || Deno.env.get("SUPABASE_PUBLISHABLE_KEY")!;

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) throw new Error("No authorization header");

    const userClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });

    const { data: { user: requestingUser }, error: authError } = await userClient.auth.getUser();
    if (authError || !requestingUser) throw new Error("Unauthorized");

    const adminClient = createClient(supabaseUrl, supabaseServiceKey);

    const { data: roleData } = await adminClient
      .from("user_roles")
      .select("role")
      .eq("user_id", requestingUser.id)
      .in("role", ["admin", "superadmin"]);

    if (!roleData || roleData.length === 0) throw new Error("Insufficient permissions");

    const { userId } = await req.json();
    if (!userId) throw new Error("userId is required");

    // Check if target user is the protected superadmin
    const { data: targetProfile } = await adminClient
      .from("profiles")
      .select("email")
      .eq("user_id", userId)
      .single();

    if (targetProfile?.email === PROTECTED_EMAIL) {
      throw new Error("No se puede eliminar al SuperAdmin principal");
    }

    // Prevent self-deletion
    if (userId === requestingUser.id) {
      throw new Error("No puedes eliminarte a ti mismo");
    }

    // Delete user (cascades through foreign keys)
    const { error: deleteError } = await adminClient.auth.admin.deleteUser(userId);
    if (deleteError) throw new Error(deleteError.message);

    return new Response(
      JSON.stringify({ success: true }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return new Response(
      JSON.stringify({ error: message }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
