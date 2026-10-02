import { createBrowserClient } from "@supabase/ssr";
import { platformFetch } from "./platform-fetch";

export function createClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  return createBrowserClient(
    url,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      realtime: {
        heartbeatIntervalMs: 15_000,
        worker: true,
      },
      // x-elo-platform: web, on PostgREST requests only (see platform-fetch.ts).
      global: { fetch: platformFetch(url) },
    },
  );
}
