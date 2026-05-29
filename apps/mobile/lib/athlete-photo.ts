import { env } from "./env";

/**
 * Resolve an athlete photo reference to a loadable URL: pass through absolute
 * http(s) URLs, build a public Supabase storage URL for bare storage keys, and
 * return null when there is no photo (callers fall back to initials). The
 * try/catch guards `env.supabaseUrl`, which throws when unset (e.g. during
 * `expo export`). Single source of truth shared by Avatar32, MatchCard, and
 * ProfileHeader so a bare key is never handed straight to <Image>.
 */
export function athletePhotoSource(
  profilePhotoUrl: string | null | undefined,
): string | null {
  if (!profilePhotoUrl) return null;
  if (profilePhotoUrl.startsWith("http")) return profilePhotoUrl;
  try {
    return `${env.supabaseUrl}/storage/v1/object/public/athlete-photos/${profilePhotoUrl}`;
  } catch {
    return null;
  }
}
