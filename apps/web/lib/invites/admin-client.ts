import "server-only";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/**
 * Service-role client for the public invite landing page only (preview, OG
 * image, landing telemetry). `server-only` makes any client-bundle import a
 * build error, and the key is read from a non-NEXT_PUBLIC env var so it can
 * never be inlined into browser code. Returns null when the key is absent
 * (local dev without it, preview deploys): callers then degrade to the
 * generic "unavailable" card and skip telemetry.
 */
export function createInviteAdminClient(): SupabaseClient | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
