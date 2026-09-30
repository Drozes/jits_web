/**
 * The Arena's Mat Board (spec arena-live-chip section 6): the pure rules
 * behind what it shows. No stores, no network, no hooks: the screen passes
 * in what the Arena store, the lobby and the roster know.
 */
import type { RecentActivityItem } from "@jits/shared/types/composites";
import type { TabBadge } from "@/lib/navigation/tab-badge";
import { IN_BAND_ELO } from "./constants";

// ---------------------------------------------------------------------------
// Time
// ---------------------------------------------------------------------------

/**
 * How long ago, as the ticker's compact age: `now`, `4m`, `3h`, `2d`.
 * A future timestamp (clock skew) reads `now`; an unreadable one reads "".
 */
export function formatAge(iso: string, now: number): string {
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return "";
  const s = Math.max(0, Math.floor((now - t) / 1000));
  if (s < 60) return "now";
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h`;
  return `${Math.floor(h / 24)}d`;
}

// ---------------------------------------------------------------------------
// Just Rolled
// ---------------------------------------------------------------------------

/** Labels for the `matches.result` values the schema allows today. */
const METHOD_LABELS: Readonly<Record<string, string>> = Object.freeze({
  submission: "Submission",
  draw: "Draw",
});

/**
 * The method from `matches.result`: a known result maps to its label; any
 * other value is shown bounded, underscores as spaces and each word
 * title-cased (`points_advantage` -> `Points Advantage`), so a result added
 * server-side later never renders as a raw identifier.
 */
export function methodLabel(result: string | null | undefined): string {
  const raw = (result ?? "").trim();
  if (!raw) return "";
  const known = METHOD_LABELS[raw.toLowerCase()];
  if (known) return known;
  return raw
    .split(/[_\s]+/)
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join(" ");
}

/**
 * One Just Rolled line: `winner def. loser · method · age` (spec 6.5), from
 * `get_arena_data.recent_activity` exactly as returned. A draw has no winner
 * (`get_recent_activity` returns the pair in name order), so it reads
 * `A drew B · Draw · age` rather than claiming a result that did not happen.
 */
export function formatJustRolled(item: RecentActivityItem, now: number): string {
  const isDraw = item.result === "draw";
  const head = isDraw
    ? `${item.winner_name} drew ${item.loser_name}`
    : `${item.winner_name} def. ${item.loser_name}`;
  return [head, methodLabel(item.result), formatAge(item.completed_at, now)]
    .filter(Boolean)
    .join(" · ");
}

// ---------------------------------------------------------------------------
// On The Mat
// ---------------------------------------------------------------------------

/**
 * Closest first: ascending `|eloDiff|`. Stable, so athletes at the same
 * distance keep roster order (the render never shuffles equal rows).
 */
export function sortByEloGap<T extends { eloDiff: number }>(list: readonly T[]): T[] {
  return list
    .map((c, i) => ({ c, i }))
    .sort((a, b) => Math.abs(a.c.eloDiff) - Math.abs(b.c.eloDiff) || a.i - b.i)
    .map((x) => x.c);
}

/**
 * Whether a roster athlete is ON THE MAT: in `lobby:online` and not the
 * viewer. The one membership rule behind the rows, the control bar's counts
 * and the header chip's `· N` (spec 14, D2). Only roster ids are tested, so a
 * stray presence key is never counted.
 */
export function isOnTheMat(
  id: string,
  lobbyIds: ReadonlySet<string>,
  selfId: string | null | undefined,
): boolean {
  return id !== selfId && lobbyIds.has(id);
}

/** The On The Mat rows: roster in the lobby, self excluded, closest first. */
export function onTheMatRows<T extends { id: string; eloDiff: number }>(
  roster: readonly T[],
  lobbyIds: ReadonlySet<string>,
  selfId: string | null | undefined,
): T[] {
  return sortByEloGap(roster.filter((c) => isOnTheMat(c.id, lobbyIds, selfId)));
}

/**
 * `onTheMatRows(...).length` for a surface that draws no rows (the header
 * chip). Null while the roster is not loaded.
 */
export function countOnTheMat(
  rosterIds: readonly string[] | null,
  lobbyIds: ReadonlySet<string>,
  selfId: string | null | undefined,
): number | null {
  if (rosterIds === null) return null;
  let n = 0;
  for (const id of rosterIds) if (isOnTheMat(id, lobbyIds, selfId)) n += 1;
  return n;
}

/**
 * The control bar's counts from exactly the rows On The Mat renders (spec
 * 14, D2): `onMat` is `rows.length`, `inBand` the rows whose displayed gap is
 * within `IN_BAND_ELO` either side. Null rows (roster or lobby not known)
 * give null counts, never a false 0; `inBand` is also null while the
 * viewer's own rating (every gap's base) is unknown.
 */
export function matCounts(
  rows: readonly { eloDiff: number }[] | null,
  selfEloKnown: boolean,
): { onMat: number | null; inBand: number | null } {
  if (rows === null) return { onMat: null, inBand: null };
  return {
    onMat: rows.length,
    inBand: selfEloKnown ? rows.filter((r) => Math.abs(r.eloDiff) <= IN_BAND_ELO).length : null,
  };
}

/**
 * The Closest Match: the first on-mat athlete (closest first) who is not
 * `exclude`d (the screen excludes anyone a challenge is
 * already pending with: the database does not make pending pairs unique).
 */
export function pickClosest<T>(
  sortedOnMat: readonly T[],
  exclude?: (c: T) => boolean,
): T | null {
  return sortedOnMat.find((c) => !exclude?.(c)) ?? null;
}

// ---------------------------------------------------------------------------
// Challenge strip
// ---------------------------------------------------------------------------

/**
 * The strips under the control bar (spec 6.2, AC-A2).
 *
 * At most one CHALLENGE strip, highest first:
 *  - `offer` over a tucked incoming prompt or over my own waiting challenge:
 *    a push (or the bell count) pointed at a fresh challenge while I am
 *    offline, and going live answers it (AC-A8);
 *  - `incoming`: someone wants to roll with me (a prompt up or tucked);
 *  - `waiting`: my outgoing challenge is unanswered;
 *  - `offer` otherwise.
 *
 * `alsoWaiting`: my waiting strip under a leading tucked-incoming or offer
 * strip, so "Cancel challenge" stays reachable (a prompt that is up covers
 * the screen anyway). `confirm` sits under any challenge strip, never
 * displaced. All secondary strips are neutral, so one red CTA holds.
 */
export type ChallengeStripKind = "incoming" | "waiting" | "offer";

export interface Strips {
  challenge: ChallengeStripKind | null;
  /** The waiting strip too, under a tucked incoming (or offer) strip. */
  alsoWaiting: boolean;
  confirm: boolean;
}

export function chooseStrip(input: {
  hasIncoming: boolean;
  /** The incoming prompt is tucked away with "Later". */
  incomingTucked?: boolean;
  hasOutgoing: boolean;
  hasOffer: boolean;
  hasConfirm: boolean;
}): Strips {
  const tucked = input.hasIncoming && !!input.incomingTucked;
  const offerOverWaiting = input.hasOffer && input.hasOutgoing && !input.hasIncoming;
  const challenge: ChallengeStripKind | null =
    (input.hasOffer && tucked) || offerOverWaiting
      ? "offer"
      : input.hasIncoming
        ? "incoming"
        : input.hasOutgoing
          ? "waiting"
          : input.hasOffer
            ? "offer"
            : null;
  const alsoWaiting = input.hasOutgoing && (tucked || offerOverWaiting);
  return { challenge, alsoWaiting, confirm: input.hasConfirm };
}

// ---------------------------------------------------------------------------
// Closest Match CTA (the surface's one Signal Red)
// ---------------------------------------------------------------------------

/**
 * The Closest Match button (AC-A3): `challenge` live, `go-live` offline even
 * on an empty mat (offline athletes are never in the lobby, so the first to
 * open the Arena always sees one), `none` live with nobody to suggest.
 * `red` unless something else owns red (an incoming or waiting challenge, or
 * the offer strip while it shows) or the live CHALLENGE is disabled by the
 * 3-challenge cap: at most one red CTA, and never a dead one.
 */
export interface ClosestCta {
  kind: "challenge" | "go-live" | "none";
  red: boolean;
}

export function closestCta(input: {
  isLive: boolean;
  hasClosest: boolean;
  hasIncoming: boolean;
  hasOutgoing: boolean;
  hasOffer: boolean;
  /** The 3-challenge cap is reached: sending is disabled. */
  capped?: boolean;
}): ClosestCta {
  const demoted = input.hasIncoming || input.hasOutgoing || input.hasOffer;
  if (!input.isLive) return { kind: "go-live", red: !demoted };
  if (!input.hasClosest) return { kind: "none", red: false };
  return { kind: "challenge", red: !demoted && !input.capped };
}

// ---------------------------------------------------------------------------
// Control bar counts
// ---------------------------------------------------------------------------

/**
 * `12 ON MAT · 7 IN BAND` (spec 6.1). Either count unknown reads
 * `CONNECTING` (never a false zero); nobody else reads `NOBODY ELSE ON MAT`.
 */
export function formatMatCounts(onMat: number | null, inBand: number | null): string {
  if (onMat === null || inBand === null) return "CONNECTING";
  if (onMat === 0) return "NOBODY ELSE ON MAT";
  return `${onMat} ON MAT · ${inBand} IN BAND`;
}

// ---------------------------------------------------------------------------
// Arena tab badge (spec 7, AC-T1..4)
// ---------------------------------------------------------------------------

/**
 * The Arena tab's mark:
 *  - fresh incoming challenges: a red count (AC-T1);
 *  - live, none incoming: a static green dot, including live plus a result
 *    to confirm (AC-T2; a pending result never changes live state);
 *  - offline with a result to confirm: a hollow ring (AC-T3);
 *  - offline and idle: nothing (AC-T4).
 */
export function arenaTabBadge(input: {
  incomingCount: number;
  isLive: boolean;
  hasConfirm: boolean;
}): TabBadge | null {
  const n = input.incomingCount;
  if (n > 0) {
    return { kind: "count", count: n, label: n === 1 ? "1 challenge" : `${n} challenges` };
  }
  if (input.isLive) {
    return {
      kind: "dot",
      label: input.hasConfirm ? "Live, result to confirm" : "Live",
    };
  }
  if (input.hasConfirm) return { kind: "ring", label: "Result to confirm" };
  return null;
}
