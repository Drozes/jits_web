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

export function computeStats(outcomes: { outcome: string | null }[]): {
  wins: number;
  losses: number;
  winRate: number;
} {
  const wins = outcomes.filter((o) => o.outcome === "win").length;
  const losses = outcomes.filter((o) => o.outcome === "loss").length;
  const total = wins + losses;
  const winRate = total > 0 ? Math.round((wins / total) * 100) : 0;
  return { wins, losses, winRate };
}

export function computeWinStreak(
  outcomes: { outcome: string | null }[],
): number {
  let streak = 0;
  for (const o of outcomes) {
    if (o.outcome === "win") streak++;
    else break;
  }
  return streak;
}

export function extractGymName(
  gyms: { name: string }[] | null,
): string | null {
  return (gyms as { name: string }[] | null)?.[0]?.name ?? null;
}
