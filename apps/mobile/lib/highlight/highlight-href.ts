import type { HighlightShareSourceTag } from "@jits/shared/api/highlight-share";

/** Every source the viewer route accepts in `?source=` (spec 014 section 16.3.6). */
const SOURCES: ReadonlySet<string> = new Set<HighlightShareSourceTag>([
  "push",
  "bell",
  "home",
  "profile",
  "match_detail",
  "summary",
]);

/** The full-screen viewer for one of the athlete's own reels. */
export function highlightHref(highlightId: string, source: HighlightShareSourceTag): string {
  return `/highlight/${encodeURIComponent(highlightId)}?source=${source}`;
}

/** `?source=` as the viewer reads it: unknown or missing -> `match_detail` (spec 16.6.2). */
export function parseHighlightSource(raw: string | string[] | undefined): HighlightShareSourceTag {
  const value = Array.isArray(raw) ? raw[0] : raw;
  return value && SOURCES.has(value) ? (value as HighlightShareSourceTag) : "match_detail";
}
