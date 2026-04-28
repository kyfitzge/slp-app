import { createClient } from "@supabase/supabase-js";

/**
 * Supabase admin client — uses the service-role key.
 * Never expose this to the browser. Server-side only.
 */
export function createAdminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );
}
