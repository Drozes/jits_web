import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export const hasEnvVars =
  process.env.NEXT_PUBLIC_SUPABASE_URL &&
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

export function getInitials(name: string): string {
  return name
    .split(" ")
    .map((w) => w[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);
}

export function extractGymName(
  gyms: { name: string } | { name: string }[] | null,
): string | null {
  if (!gyms) return null;
  if (Array.isArray(gyms)) return gyms[0]?.name ?? null;
  return gyms.name ?? null;
}

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

export function formatRelativeDate(dateString: string): string {
  const date = new Date(dateString);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (diffDays === 0) return "Today";
  if (diffDays === 1) return "Yesterday";
  if (diffDays < 7) return `${diffDays}d ago`;
  if (diffDays < 30) return `${Math.floor(diffDays / 7)}w ago`;
  return `${Math.floor(diffDays / 30)}mo ago`;
}

/** Fine-grained relative time for chat/inbox timestamps: "now", "5m", "3h", "2d", "Jan 15" */
export function formatRelativeTime(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const diffMin = Math.floor(diffMs / 60_000);

  if (diffMin < 1) return "now";
  if (diffMin < 60) return `${diffMin}m`;

  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h`;

  const diffDay = Math.floor(diffHr / 24);
  if (diffDay < 7) return `${diffDay}d`;

  return new Date(iso).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  });
}
