import type { InFlightReel } from "@jits/shared/api/highlight-share";
import { formatCountdown } from "@/lib/video/video-status-copy";
import type { ReelItem, ReelSource } from "@/lib/highlight/reel-types";
import { REEL_LANE_COPY, type CtaVariant, type GhostVariant } from "@/lib/highlight/reel-lane";

/**
 * Tile copy and accessibility labels (specs/matches-tab section 11). Pure, so
 * every string is unit tested without rendering. No em dashes, no
 * exclamation marks, sentence case (tags render in mono caps by style).
 */

/** C-S1 to C-S3: the source chip on a tile that is not the athlete's own. */
export const SOURCE_CHIP: Record<Exclude<ReelSource, "own">, { label: string; a11y: string }> = {
  friend: { label: "FRIEND", a11y: ", from a friend" },
  local: { label: "NEARBY", a11y: ", nearby" },
  elo: { label: "ELO RATED", a11y: ", from ELO RATED" },
};

/** The chip for an item, or null for an own item (own tiles never chip). */
export function sourceChip(item: Pick<ReelItem, "source">): { label: string; a11y: string } | null {
  return item.source === "own" ? null : SOURCE_CHIP[item.source];
}

export const BUILDING_COPY = {
  /** C-B1 */
  step1: "Finding your best moments",
  /** C-B2 */
  step2: "Cutting your highlight",
  /** C-B3 at 0:00 */
  anySecond: "Any second now",
  /** C-B4 */
  helper: "Usually 1 to 3 minutes",
} as const;

/** C-B5 */
export function stepCounter(step: 1 | 2): string {
  return `Step ${step} of 2`;
}

/** C-B3: `Waiting 8:12`, or `Any second now` once the deadline has passed. */
export function waitingLine(remainingMs: number): string {
  return remainingMs <= 0 ? BUILDING_COPY.anySecond : `Waiting ${formatCountdown(remainingMs)}`;
}

/** Short name for a caption: trimmed, null when blank. */
function name(raw: string | null | undefined): string | null {
  const n = raw?.trim();
  return n ? n : null;
}

/**
 * Caption under a ready tile: `vs {opp}` for an own reel, else the subject
 * athlete's short name (`opponentName` carries the subject's display name
 * for a non-own item). Null when the name is unknown.
 */
export function readyCaption(item: Pick<ReelItem, "isOwn" | "opponentName">): string | null {
  const n = name(item.opponentName);
  if (!n) return null;
  return item.isOwn ? `vs ${n}` : n;
}

/** C-M12: `Watch your highlight vs {opp}` (+ `, unwatched`), plus the source chip's words. */
export function readyA11yLabel(item: Pick<ReelItem, "isOwn" | "opponentName" | "unseen" | "source">): string {
  const n = name(item.opponentName);
  const base = item.isOwn
    ? n
      ? `Watch your highlight vs ${n}`
      : "Watch your highlight"
    : n
      ? `Watch ${n}'s highlight`
      : "Watch highlight";
  return `${base}${sourceChip(item)?.a11y ?? ""}${item.unseen ? ", unwatched" : ""}`;
}

/** Which line a building tile shows: C-B1 or C-B2, or C-B3 while waiting with a known deadline. */
export function buildingStepLine(reel: Pick<InFlightReel, "reelState" | "step">, remainingMs: number | null): string {
  if (reel.reelState === "waiting" && remainingMs != null) return waitingLine(remainingMs);
  return reel.step === 2 || reel.reelState === "rendering" ? BUILDING_COPY.step2 : BUILDING_COPY.step1;
}

/** C-B6: `Your highlight vs {opp} is being made. {step line}. Opens the match.` */
export function buildingA11yLabel(opponentName: string | null, stepLine: string): string {
  const n = name(opponentName);
  return `${n ? `Your highlight vs ${n}` : "Your highlight"} is being made. ${stepLine}. Opens the match.`;
}

export function ghostCopy(variant: GhostVariant): string {
  return REEL_LANE_COPY.ghost[variant];
}

/** CTA tile label and its a11y label (`Get your first highlight. Opens the Arena tab`). */
export function ctaCopy(variant: CtaVariant): { label: string; a11y: string } {
  const label = REEL_LANE_COPY.cta[variant];
  return { label, a11y: `${label}. Opens the Arena tab` };
}

export const SEE_ALL_A11Y = "See all, open Matches";

/** `28s` duration chip (whole seconds). */
export function durationChip(seconds: number): string {
  return `${Math.max(0, Math.round(seconds))}s`;
}

// ---- server-clock countdown (C-B3) -------------------------------------------

/**
 * Milliseconds left until `waitDeadlineAt`, measured on the SERVER's clock:
 * the offset (server minus device) is fixed when the read landed
 * (`serverNow` against the device time `receivedAt`), then applied to the
 * device's `now`, so a device clock that is minutes off still counts down
 * correctly. Without `serverNow` the device clock is used as is. Null when
 * there is no (parseable) deadline.
 */
export function serverRemainingMs(
  waitDeadlineAt: string | null,
  serverNow: string | null,
  receivedAt: number,
  now: number,
): number | null {
  const deadline = waitDeadlineAt ? Date.parse(waitDeadlineAt) : NaN;
  if (!Number.isFinite(deadline)) return null;
  const server = serverNow ? Date.parse(serverNow) : NaN;
  const offset = Number.isFinite(server) ? server - receivedAt : 0;
  return deadline - (now + offset);
}
