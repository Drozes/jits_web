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

/** Returns "Today", "Yesterday", or "Earlier" for date grouping in notification feeds. */
export function getDateGroup(iso: string): "Today" | "Yesterday" | "Earlier" {
  const date = new Date(iso);
  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const startOfYesterday = new Date(startOfToday.getTime() - 86_400_000);

  if (date >= startOfToday) return "Today";
  if (date >= startOfYesterday) return "Yesterday";
  return "Earlier";
}

/** Returns a "Starts in X" hint for upcoming times within 2 hours, or null. */
export function formatTimeUntil(iso: string): string | null {
  const diffMs = new Date(iso).getTime() - Date.now();
  if (diffMs <= 0) return null;

  const diffMin = Math.floor(diffMs / 60_000);
  if (diffMin < 1) return "Starts now";
  if (diffMin < 60) return `Starts in ${diffMin} min`;

  const diffHr = Math.floor(diffMin / 60);
  if (diffHr <= 2) {
    const remainMin = diffMin % 60;
    if (remainMin === 0) return `Starts in ${diffHr} hr`;
    return `Starts in ${diffHr} hr ${remainMin} min`;
  }

  return null;
}
