/**
 * The Supabase client, required on first use rather than at import. The
 * block and consent stores are read by many screens (Rankings, Settings, the
 * reel viewer) that only need their snapshot; a static import would make each
 * of them load the client, and its env check, just to render.
 */
export function moderationClient(): typeof import("@/lib/supabase/client").supabase {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  return (require("@/lib/supabase/client") as typeof import("@/lib/supabase/client")).supabase;
}
