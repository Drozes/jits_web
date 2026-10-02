import { createBrowserClient } from "@supabase/ssr";
import { platformFetch } from "./platform-fetch";

export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      realtime: {
        heartbeatIntervalMs: 15_000,
        worker: true,
      },
      // x-elo-platform: web, on PostgREST requests only (see platform-fetch.ts).
      global: { fetch: platformFetch() },
    },
  );
}
