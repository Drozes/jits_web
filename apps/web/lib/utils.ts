import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export const hasEnvVars =
  process.env.NEXT_PUBLIC_SUPABASE_URL &&
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

export function getEloTierClass(elo: number): string {
  if (elo >= 1400) return "outline-cyan-400/60";
  if (elo >= 1200) return "outline-yellow-400/60";
  if (elo >= 1000) return "outline-gray-400/60";
  return "outline-amber-600/60";
}

/**
 * Build the public URL for a profile photo.
 * Handles three cases:
 *  - null → no photo
 *  - Absolute URL (SSO avatar from Google/Apple) → use directly
 *  - Relative path → resolve from Supabase storage bucket
 */
export function getProfilePhotoUrl(
  profilePhotoUrl: string | null,
  cacheBuster?: number,
): string | null {
  if (!profilePhotoUrl) return null;
  if (profilePhotoUrl.startsWith("http")) return profilePhotoUrl;
  const base = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/athlete-photos/${profilePhotoUrl}`;
  return cacheBuster ? `${base}?t=${cacheBuster}` : base;
}
