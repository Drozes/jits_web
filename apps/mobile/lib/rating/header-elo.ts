/**
 * The header rating (jits-1ez5): the athlete's `current_elo` beside the
 * wordmark on every tab root, and its post-match moment ("Header ELO roll" in
 * the DESIGN.md Motion registry).
 *
 * The moment keys on the rating change, not on a result id: the bar reads
 * only the auth context (it never fetches), and the auth row carries no match
 * id. The change is seen by a ref in each mounted header, so a mount, a
 * refetch with the same rating or a tab switch never plays it, and only the
 * focused tab root plays it. Every change gets its own in-memory epoch
 * (`ratingEpoch`), so the same from -> to later still rolls. A rating the
 * athlete already watched land on a verdict (`noteRatingWatched`, called by
 * the verdict step) does not roll again in the bar: one roll per result.
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

/**
 * The text scale the header rating and its delta draw at: the system scale,
 * at least 1 and at most `HEADER_ELO_MAX_FONT_SCALE`. The header sizes its
 * text from this itself (OS scaling off), as the chip does, so the rating
 * grows with Dynamic Type exactly to the cap.
 */
export function headerEloScale(fontScale: number): number {
  return Math.min(Math.max(Number.isFinite(fontScale) && fontScale > 0 ? fontScale : 1, 1), HEADER_ELO_MAX_FONT_SCALE);
}

/** The width the delta (with its gap) takes beside the rating, in points. */
export function headerDeltaWidth(delta: number, fontScale: number): number {
  const scale = headerEloScale(fontScale);
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

/**
 * The one-time announcement after a rating change: "Your rating 1512, up 14."
 * (Not "last match": the bar cannot tell a match from another change.)
 */
export function headerEloAnnouncement(rating: number, delta: number): string {
  if (delta === 0) return `${headerEloLabel(rating)}.`;
  return `${headerEloLabel(rating)}, ${delta > 0 ? "up" : "down"} ${Math.abs(delta)}.`;
}

// ---------------------------------------------------------------------------
// What the verdict showed
// ---------------------------------------------------------------------------

export type VerdictOutcome = "win" | "loss" | "draw";

/** The post-match rating the athlete last saw on a verdict, this app run. */
let watched: { athleteId: string; rating: number } | null = null;
/**
 * The last verdict the athlete saw, this app run, with the rating it started
 * from: it colors only the change that starts there, and only once.
 */
let lastVerdict: { athleteId: string; matchId: string; outcome: VerdictOutcome; eloBefore: number | null } | null = null;

/** The verdict showed this athlete's stamped post-match rating. */
export function noteRatingWatched(athleteId: string, rating: number): void {
  watched = { athleteId, rating };
}

export function wasRatingWatched(athleteId: string, rating: number): boolean {
  return watched !== null && watched.athleteId === athleteId && watched.rating === rating;
}

/**
 * True (once) when this rating was watched on the verdict: the slot is
 * cleared as the header consumes it, so a later return to the same value
 * (1514, down, then 1514 again) still rolls.
 */
export function consumeRatingWatched(athleteId: string, rating: number): boolean {
  if (!wasRatingWatched(athleteId, rating)) return false;
  watched = null;
  // That verdict's change is spent: its outcome must not color a later one.
  lastVerdict = null;
  return true;
}

/**
 * The verdict showed a result (not disputed), with or without its stamped
 * rating, so the header can color that result's negative delta amber on a
 * draw. `eloBefore` ties it to the change it explains.
 */
export function noteVerdictOutcome(
  athleteId: string,
  matchId: string,
  outcome: VerdictOutcome,
  eloBefore: number | null = null,
): void {
  lastVerdict = { athleteId, matchId, outcome, eloBefore };
}

/**
 * The verdict outcome for the change that starts at `from`, used at most
 * once: null (and kept) when it explains another change; returned and
 * cleared when it matches. Without a known `eloBefore` it never matches, so
 * an unknown change stays red rather than borrowing an old draw.
 */
export function takeVerdictOutcomeFor(athleteId: string, from: number): VerdictOutcome | null {
  if (lastVerdict === null || lastVerdict.athleteId !== athleteId || lastVerdict.eloBefore !== from) return null;
  const { outcome } = lastVerdict;
  lastVerdict = null;
  return outcome;
}

/** The last verdict outcome recorded for this athlete, or null (unknown). */
export function lastVerdictOutcome(athleteId: string): VerdictOutcome | null {
  return lastVerdict !== null && lastVerdict.athleteId === athleteId ? lastVerdict.outcome : null;
}

/** The header delta's tone: gain green up, amber down after a draw, red down otherwise. */
export function headerDeltaTone(delta: number, outcome: VerdictOutcome | null): "win" | "draw" | "loss" {
  if (delta > 0) return "win";
  return outcome === "draw" ? "draw" : "loss";
}

// ---------------------------------------------------------------------------
// The transition
// ---------------------------------------------------------------------------

export interface HeaderEloMoment {
  from: number;
  to: number;
  delta: number;
  /** One roll per rating change across the five headers (`claimHeaderMoment`). */
  key: string;
}

/**
 * Every rating change of an athlete gets the next epoch, this app run. All
 * mounted headers see the same change, so they agree on its epoch and the
 * first focused one to claim it plays it. In memory only: a repeat of the
 * same from -> to later is a new change and rolls again.
 */
const ratingEpochs = new Map<string, { rating: number; epoch: number }>();

export function ratingEpoch(athleteId: string, rating: number): number {
  const cur = ratingEpochs.get(athleteId);
  if (!cur) {
    ratingEpochs.set(athleteId, { rating, epoch: 0 });
    return 0;
  }
  if (cur.rating === rating) return cur.epoch;
  const next = { rating, epoch: cur.epoch + 1 };
  ratingEpochs.set(athleteId, next);
  return next.epoch;
}

const claimedMoments = new Set<string>();

/** True for the first caller of a moment key (this app run), false after. */
export function claimHeaderMoment(key: string): boolean {
  if (claimedMoments.has(key)) return false;
  claimedMoments.add(key);
  return true;
}

/** Tests only. */
export function __resetHeaderEloForTests(): void {
  watched = null;
  lastVerdict = null;
  ratingEpochs.clear();
  claimedMoments.clear();
}

/** A real rating change for this athlete, or null (first value, no change, bad input). */
export function headerEloTransition(
  athleteId: string,
  from: number | null | undefined,
  to: number | null | undefined,
  epoch: number,
): HeaderEloMoment | null {
  if (from == null || to == null || !Number.isInteger(from) || !Number.isInteger(to) || from === to) return null;
  return { from, to, delta: to - from, key: `header-elo:${athleteId}:${epoch}` };
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
    const epoch = athleteId !== undefined && rating !== undefined ? ratingEpoch(athleteId, rating) : 0;
    if (athleteId === undefined || prev.athleteId !== athleteId) {
      setMoment(null);
      return;
    }
    const next = headerEloTransition(athleteId, prev.rating, rating, epoch);
    if (!next) return;
    // Only the focused tab root reads (and consumes) the verdict's slot.
    setMoment(focusedRef.current && !consumeRatingWatched(athleteId, next.to) ? next : null);
  }, [athleteId, rating]);

  return moment;
}
