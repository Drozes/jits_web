import type { HighlightReadyOrigin, HighlightShareSourceTag } from "@jits/shared/api/highlight-share";

/**
 * Discovery-surface copy and routing for Highlight Reels phase 2 (jr_be spec
 * 014 sections 16.6.3 and 16.6.4): the Home card, the bell item, the
 * match-flow summary note and the match-detail "Open reel" link. Kept apart
 * from `highlight-copy.ts` (the phase-1 card and the viewer) so the parallel
 * phase-2 slices do not edit the same file.
 */
export const DISCOVERY_COPY = {
  homeMetaTag: "NEW HIGHLIGHT",
  homeTitle: "Your new highlight",
  watch: "Watch",
  dismiss: "Dismiss",
  bellTitle: "Your highlight is ready",
  bellTitleRegen: "Your new version is ready",
  summaryNote: "Your highlight is being made, we'll let you know.",
  openReel: "Open reel",
} as const;

/** The viewer route (F6, `app/(app)/highlight/[id].tsx`); navigated by path string only. */
export function highlightHref(highlightId: string, source: HighlightShareSourceTag): string {
  return `/highlight/${encodeURIComponent(highlightId)}?source=${source}`;
}

const SOURCES: ReadonlySet<string> = new Set<HighlightShareSourceTag>([
  "push",
  "bell",
  "home",
  "profile",
  "match_detail",
  "summary",
  "matches",
]);

/** `?source=` as the viewer route reads it: unknown or missing -> `match_detail` (spec 16.6.2). */
export function parseHighlightSource(raw: string | string[] | undefined): HighlightShareSourceTag {
  const value = Array.isArray(raw) ? raw[0] : raw;
  return value && SOURCES.has(value) ? (value as HighlightShareSourceTag) : "match_detail";
}

/** Bell item body: "Your reel vs {opponent} is ready to watch." */
export function bellBody(opponentName: string | null): string {
  const name = opponentName?.trim();
  return name ? `Your reel vs ${name} is ready to watch.` : "Your match reel is ready to watch.";
}

/**
 * Bell item title, by the ledger row's `origin` for the live version (the
 * push function's copy split): only a regeneration (`regen`) reads "Your new
 * version is ready"; `auto`, `retry` (a retry that landed the first reel)
 * and unknown read "Your highlight is ready".
 */
export function bellTitle(origin: HighlightReadyOrigin | null): string {
  return origin === "regen" ? DISCOVERY_COPY.bellTitleRegen : DISCOVERY_COPY.bellTitle;
}
