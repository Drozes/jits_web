import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "../types/database";
import { mapPostgrestError, type Result } from "./errors";

type Client = SupabaseClient<Database>;

/**
 * The server's playback settings (`get_playback_settings()`, jr_be
 * 20261008100400): the merged defaults plus any admin override, as raw JSON.
 * Parsing and validation are the caller's job (`parsePlaybackSettings` in
 * `@jits/shared/utils`), so a bad value can never break playback. Never
 * throws; any failure is `{ ok: false }` and the caller keeps its cache or
 * the builtin defaults.
 */
export async function getPlaybackSettings(supabase: Client): Promise<Result<unknown>> {
  try {
    const { data, error } = await supabase.rpc("get_playback_settings");
    if (error) return { ok: false, error: mapPostgrestError(error, "playback_settings") };
    return { ok: true, data: data as unknown };
  } catch (err) {
    return {
      ok: false,
      error: { code: "UNKNOWN", message: err instanceof Error ? err.message : "Something went wrong." },
    };
  }
}
