import { env } from "./env";

/**
 * Builds a full URL for an athlete profile photo stored in Supabase Storage.
 * Mobile equivalent of `getProfilePhotoUrl` from `apps/web/lib/utils.ts`.
 */
export function buildPhotoUrl(
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
