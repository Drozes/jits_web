/**
 * The header rating (jits-1ez5): the athlete's `current_elo` beside the
 * wordmark on every tab root, and its post-match moment ("Header ELO roll" in
 * the DESIGN.md Motion registry).
 *
 * The moment keys on the rating transition, not on a result id: the bar reads
 * only the auth context (it never fetches), and the auth row carries no match
 * id. The transition is seen by a ref in each mounted header, so a mount, a
 * refetch with the same rating or a tab switch never plays it, and only the
 * focused tab root plays it. A rating the athlete already watched land on a
 * verdict (`noteRatingWatched`, called by the verdict step) never rolls again
 * in the bar: one roll per result.
 */
import * as React from "react";
import { CHIP_MAX_FONT_SCALE } from "@/lib/arena/header-chip-model";
import { TYPE_SCALE } from "@/lib/typography";
import { formatDeltaChip } from "@/components/ui/elo-system/delta-chip";

/**
 * Dynamic Type cap of the header rating and its delta: the chip's own cap
 * (owner decision, jits-1ez5.1), not the 1.15x the mock proposed. The
 * wordmark stays at 1 (`BRAND_WORDMARK_MAX_FONT_SCALE`).
 */
export const HEADER_ELO_MAX_FONT_SCALE = CHIP_MAX_FONT_SCALE;
/** How long the delta stays beside the landed rating ("about 4s"). */
export const HEADER_DELTA_HOLD_MS = 4000;
/** Space between the rating and its delta. */
export const HEADER_DELTA_GAP = 6;
/** The delta's text step (mono 700, 10px). */
export const HEADER_DELTA_STEP = "micro" as const;
/** JetBrains Mono's advance is 600/1000 em for every glyph. */
const MONO_ADVANCE_EM = 0.6;

/** The width the delta (with its gap) takes beside the rating, in points. */
export function headerDeltaWidth(delta: number, fontScale: number): number {
  const scale = Math.min(Number.isFinite(fontScale) && fontScale > 0 ? fontScale : 1, HEADER_ELO_MAX_FONT_SCALE);
  const chars = Array.from(formatDeltaChip(delta)).length;
  return HEADER_DELTA_GAP + Math.ceil(chars * TYPE_SCALE[HEADER_DELTA_STEP].fontSize * scale * MONO_ADVANCE_EM);
}

/** The delta shows only when the row has room for it beside the chip. */
export function headerDeltaFits(delta: number, fontScale: number, spareWidth: number | null): boolean {
  return spareWidth !== null && spareWidth >= headerDeltaWidth(delta, fontScale);
}

/** VoiceOver: "Your rating 1512". */
export function headerEloLabel(rating: number): string {
  return `Your rating ${rating}`;
}

/** The one-time announcement after a result: "Your rating 1512, up 14 last match." */
export function headerEloAnnouncement(rating: number, delta: number): string {
  if (delta === 0) return `${headerEloLabel(rating)}.`;
  return `${headerEloLabel(rating)}, ${delta > 0 ? "up" : "down"} ${Math.abs(delta)} last match.`;
}

// ---------------------------------------------------------------------------
// Watched on the verdict
// ---------------------------------------------------------------------------

/** The post-match rating the athlete last saw on a verdict, this app run. */
let watched: { athleteId: string; rating: number } | null = null;

/** The verdict showed this athlete's stamped post-match rating. */
export function noteRatingWatched(athleteId: string, rating: number): void {
  watched = { athleteId, rating };
}

export function wasRatingWatched(athleteId: string, rating: number): boolean {
  return watched !== null && watched.athleteId === athleteId && watched.rating === rating;
}

/** Tests only. */
export function __resetWatchedRatingForTests(): void {
  watched = null;
}

// ---------------------------------------------------------------------------
// The transition
// ---------------------------------------------------------------------------

export interface HeaderEloMoment {
  from: number;
  to: number;
  delta: number;
  /** The `usePlayOnce` key: one roll per transition, across the five headers. */
  key: string;
}

/** A real rating change for this athlete, or null (first value, no change, bad input). */
export function headerEloTransition(
  athleteId: string,
  from: number | null | undefined,
  to: number | null | undefined,
): HeaderEloMoment | null {
  if (from == null || to == null || !Number.isInteger(from) || !Number.isInteger(to) || from === to) return null;
  return { from, to, delta: to - from, key: `header-elo:${athleteId}:${from}->${to}` };
}

/**
 * The moment this header plays, or null. Decided when the rating changes:
 * only on the focused tab root and only for a rating not already watched on a
 * verdict. The first value of a mount (or of a new athlete) is never a
 * change. Later re-renders keep the decision until the next change.
 */
export function useHeaderEloMoment(
  athleteId: string | undefined,
  rating: number | undefined,
  focused: boolean,
): HeaderEloMoment | null {
  const seen = React.useRef<{ athleteId: string | undefined; rating: number | undefined }>({ athleteId, rating });
  const focusedRef = React.useRef(focused);
  focusedRef.current = focused;
  const [moment, setMoment] = React.useState<HeaderEloMoment | null>(null);

  React.useEffect(() => {
    const prev = seen.current;
    seen.current = { athleteId, rating };
    if (athleteId === undefined || prev.athleteId !== athleteId) {
      setMoment(null);
      return;
    }
    const next = headerEloTransition(athleteId, prev.rating, rating);
    if (!next) return;
    setMoment(focusedRef.current && !wasRatingWatched(athleteId, next.to) ? next : null);
  }, [athleteId, rating]);

  return moment;
}
