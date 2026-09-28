import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "../types/database";

type Client = SupabaseClient<Database>;

/** Private bucket holding match recordings, normalized copies and posters. */
export const MATCH_VIDEO_BUCKET = "match-videos";

/**
 * Sign many `match_videos.thumbnail_url` values in ONE storage call.
 *
 * The column holds a STORAGE KEY in the private bucket (jits-fjzy), not a
 * URL; a legacy `http...` value passes through unchanged. Output is aligned
 * with the input: `result[i]` is the signed URL for `keys[i]`, or null when
 * the key is empty or could not be signed.
 *
 * Best effort by design: a poster is decoration, so a failed or partial sign
 * yields nulls (the UI shows its fallback plate) and never an error. Duplicate
 * keys are signed once.
 */
export async function signPosterKeys(
  supabase: Client,
  keys: ReadonlyArray<string | null | undefined>,
  expiresInSeconds: number,
): Promise<(string | null)[]> {
  const out: (string | null)[] = keys.map((key) =>
    key && /^https?:\/\//i.test(key) ? key : null,
  );
  const toSign = [
    ...new Set(
      keys.filter(
        (key): key is string => !!key && !/^https?:\/\//i.test(key),
      ),
    ),
  ];
  if (toSign.length === 0) return out;

  try {
    const { data, error } = await supabase.storage
      .from(MATCH_VIDEO_BUCKET)
      .createSignedUrls(toSign, expiresInSeconds);
    if (error || !Array.isArray(data)) return out;
    const byPath = new Map<string, string>();
    for (const entry of data) {
      if (entry && !entry.error && entry.path && entry.signedUrl) {
        byPath.set(entry.path, entry.signedUrl);
      }
    }
    return keys.map((key, i) => out[i] ?? (key ? byPath.get(key) ?? null : null));
  } catch {
    return out;
  }
}
