/**
 * "Mina Park" -> "M. Park"; a single word stays as is.
 *
 * Pure and dependency free: `match-roles.ts` builds each athlete's short name
 * with it, and that module is imported (through `reconcile.ts`) by the
 * match-loop harness, which runs outside React Native.
 */
export function shortName(name: string | null | undefined): string {
  const words = (name ?? "").trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return "Opponent";
  if (words.length === 1) return words[0];
  return `${words[0][0]}. ${words.slice(1).join(" ")}`;
}
