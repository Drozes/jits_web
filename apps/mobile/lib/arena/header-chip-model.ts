/**
 * The header status chip's pure model (spec 4.2, 4.3): every state, its copy
 * and accessibility, and how it fits the 160pt cap. No React, no stores.
 *
 * Accessibility labels never equal `Go live` / `Go offline` (the harness
 * finds the Arena toggle by those): every chip label starts with
 * `Live status:` (AC-H13).
 */
import {
  displayDrawsLive,
  liveSwitchPending,
  type GoLiveDisplay,
  type LiveSwitchDirection,
  type LiveSwitchPhase,
} from "./arena-store";
import { freshRemainingMs } from "./incoming-challenges";
import { formatCountdown, spokenCountdown } from "./fresh-countdown";
import { formatBadgeCount } from "@/lib/navigation/tab-badge";
import { TYPE_SCALE } from "@/lib/typography";

// ---------------------------------------------------------------------------
// Model
// ---------------------------------------------------------------------------

/** testIDs, shared with the tests and the match-loop harness. */
export const HEADER_CHIP_TEST_ID = "header-status-chip";
export const HEADER_CHIP_CONFIRM_TEST_ID = "header-status-chip-confirm";

/** Every chip accessibility label starts with this (never `Go live`). */
export const CHIP_LABEL_PREFIX = "Live status:";

/**
 * The chip's drawn height. The touch target is `CHIP_TARGET_HEIGHT` tall and
 * the 28pt bordered frame is drawn inside it: on the New Architecture a view
 * that clips (or has no layout overflow) swallows touches outside its bounds,
 * so a hitSlop around a 28pt clipping wrapper never reaches 44pt (AC-H13).
 */
export const CHIP_HEIGHT = 28;
/** Each segment's real touch height: no vertical hitSlop is relied on. */
export const CHIP_TARGET_HEIGHT = 44;
/**
 * Max width of the WHOLE chip, CONFIRM included. Spec says "about 150pt";
 * 160 is the smallest cap that fits `○ GO LIVE · 12 ▪ CONFIRM` (157pt) at
 * 1x, so no state shrinks its text at the default size. A narrower header
 * gets `layoutChip`'s `maxWidth`.
 */
export const CHIP_MAX_WIDTH = 160;
/** Dynamic Type cap (AC-H12). */
export const CHIP_MAX_FONT_SCALE = 1.3;

/** The CONFIRM segment's copy: the full word, or just its marker when tight. */
export const CONFIRM_COPY_FULL = "▪ CONFIRM";
export const CONFIRM_COPY_COMPACT = "▪";
/**
 * The fewest name characters (an ellipsis counts as one) the layout keeps
 * room for, so a truncated name never vanishes entirely (AC-H12).
 */
export const MIN_NAME_CHARS = 3;

// Geometry the width budget and the render share.
/** The chip copy's font size (TEXT_CLASS `text-micro`). */
export const FONT_PX = TYPE_SCALE.micro.fontSize;
/** JetBrains Mono's advance width is 600/1000 em for every glyph. */
const MONO_ADVANCE_EM = 0.6;
export const SEGMENT_PAD_X = 8;
/** The status segment's right padding when the full CONFIRM follows it. */
const JOIN_PAD = 4;
export const GLYPH_GAP = 5;
export const LIVE_DOT_PX = 6;

export type ChipKind =
  | "offline"
  | "going-live"
  | "finding-you"
  | "live"
  | "waiting"
  | "incoming"
  | "incoming-many"
  | "reconnecting"
  | "retry";

/**
 * Colour coding (spec 3): green for live, ink-3 for offline and every
 * degraded state (reconnecting, write failure: never red), red border only
 * for "someone wants you".
 */
export type ChipTone = "live" | "neutral" | "incoming";

/** What a tap on the status segment does. */
export type ChipAction = "go-live" | "popover" | "open-arena" | "reopen-incoming" | "none";

export type ChipGlyph = "○" | "●" | "◌" | "!";

/**
 * Glyphs drawn as a View, not as text: `●` is the pulsing LIVE dot, and `○`
 * is a hollow ring because the bundled JetBrains Mono Bold has no U+25CB (it
 * would draw from an iOS fallback font, off weight, off baseline and not
 * 0.6em wide). Both are `LIVE_DOT_PX` wide. Every other glyph is text and must
 * exist in the bundled font (pinned by the chip tests).
 */
export const VIEW_GLYPHS: ReadonlySet<ChipGlyph> = new Set<ChipGlyph>(["●", "○"]);

export interface ChipModel {
  kind: ChipKind;
  tone: ChipTone;
  /**
   * `●` renders as the pulsing LIVE dot and `○` as a hollow ring View
   * (`VIEW_GLYPHS`); the others as text.
   */
  glyph: ChipGlyph;
  /** Copy before the name ("LIVE · 12", "WAITING · ", "3 WANT TO ROLL"). */
  lead: string;
  /** The athlete name, upper-cased: the ONLY part that truncates. */
  name: string | null;
  /** Copy after the name (" · 8:12"): never truncates. */
  tail: string | null;
  /** The countdown's remaining ms (drives the clock), or null for none. */
  remainingMs: number | null;
  /** Append the `▪ CONFIRM` segment (base states only). */
  confirm: boolean;
  action: ChipAction;
  disabled: boolean;
  /** The athlete is live (the harness reads this as the chip's value). */
  live: boolean;
  accessibilityLabel: string;
  /** Said after the label (offline after a location failure: "Location needed to go live"). */
  accessibilityHint?: string;
}

/** The FINDING YOU chip's spoken label (UX 019, 4). */
export const FINDING_YOU_LABEL = `${CHIP_LABEL_PREFIX} finding your location`;
/** The offline chip's hint after an attempt ended for location (UX 019, 2.2). */
export const NEEDS_LOCATION_HINT = "Location needed to go live";

export interface ChipInput {
  isLive: boolean;
  /**
   * Live as drawn, from the store's one snapshot (`useLiveSurface`). When
   * given it is used as is, so the chip and the Arena bar can never read
   * different frames (round 5). Otherwise derived from the other inputs.
   */
  drawnLive?: boolean;
  phase: LiveSwitchPhase;
  direction: LiveSwitchDirection | null;
  reconnecting: boolean;
  lastLiveWriteFailed: boolean;
  /** Lobby size EXCLUDING self; null while the lobby is unknown. */
  onMat: number | null;
  outgoing: {
    opponentName: string;
    createdAt?: string | null;
    expiresAt?: string | null;
  } | null;
  incoming: {
    challengerName: string;
    createdAt: string | null;
    expiresAt: string | null;
  } | null;
  incomingTucked: boolean;
  incomingCount: number;
  /** A result to confirm is waiting (additive: never changes live state). */
  confirm: boolean;
  /**
   * An Arena owner has registered its controller. Without one a go-live tap
   * does nothing, so the offline and retry chips render disabled.
   */
  controllerReady: boolean;
  /**
   * The chip is on the Arena tab itself. Its WAITING state then has nothing
   * to open (the waiting strip is right below), so it has no action and its
   * label does not say "Open Arena".
   */
  onArena?: boolean;
  /**
   * What a go-live in progress draws (instant go-live, UX 019): `hold`
   * (no pending yet), `optimistic` / `restore-live` (drawn live), GOING
   * LIVE, FINDING YOU, RECONNECTING, OFFLINE · RETRY. Null: `isLive` as is.
   */
  display?: GoLiveDisplay | null;
  /** The last attempt ended for location: the offline chip says why to VoiceOver. */
  needsLocation?: boolean;
  /** Kept for callers; an offline choice is always possible now (review round 3). */
  cancellable?: boolean;
  /**
   * The athlete's last choice (review round 3): a decided offline choice is
   * drawn offline at once, whatever the server still says or is doing.
   */
  intent?: { decided: boolean; live: boolean } | null;
  now: number;
}

/**
 * The lobby as a spoken sentence (with its leading space), "" when unknown.
 * Never "live" / "offline": the accessibilityValue says that.
 */
function spokenOnMat(n: number | null): string {
  if (n === null) return "";
  if (n === 0) return " Just you on the mat.";
  return ` ${formatBadgeCount(n)} on the mat.`;
}

/**
 * Still inside its 10-minute window: the remaining time, or null when no
 * timestamp is known (no countdown is shown then). `false` once lapsed.
 */
function remaining(
  c: { createdAt?: string | null; expiresAt?: string | null },
  now: number,
): number | null | false {
  const ms = freshRemainingMs(c, now);
  if (ms === null) return null;
  return ms > 0 ? ms : false;
}

/** The pending rule lives with the store (one snapshot for chip and bar); re-exported here. */
export { liveSwitchPending } from "./arena-store";

/**
 * The chip, as a pure function of the stores (spec 4.3). Precedence, highest
 * first: several incoming or one tucked away, then waiting on my outgoing
 * challenge, then the base live/offline state. The CONFIRM marker is
 * appended to base states only and never changes them.
 */
export function describeHeaderChip(input: ChipInput): ChipModel {
  const { phase, now } = input;
  const display = input.display ?? null;
  const intendedOffline = !!input.intent && input.intent.decided && !input.intent.live;
  // Live as the athlete sees it: their offline choice first; else the
  // committed flag, or an optimistic / restore overlay.
  const isLive =
    input.drawnLive !== undefined ? input.drawnLive : intendedOffline ? false : displayDrawsLive(display, input.isLive);
  const saving = phase === "saving";
  // A choice only needs an owner to run it (with no controller registered
  // the call is a silent no-op). Nothing in flight ever locks the opposite
  // choice: it is recorded at once and the server follows (review round 3).
  const canGoLive = input.controllerReady;

  // Someone wants you.
  if (input.incoming && input.incomingCount >= 2) {
    const n = input.incomingCount;
    return {
      kind: "incoming-many",
      tone: "incoming",
      glyph: "!",
      lead: `${formatBadgeCount(n)} WANT TO ROLL`,
      name: null,
      tail: null,
      remainingMs: null,
      confirm: false,
      action: "reopen-incoming",
      disabled: false,
      live: isLive,
      accessibilityLabel: `${CHIP_LABEL_PREFIX} ${n} athletes want to roll. Open challenge`,
    };
  }
  if (input.incoming && input.incomingTucked) {
    const left = remaining(input.incoming, now);
    if (left !== false) {
      const name = input.incoming.challengerName.trim() || "Athlete";
      return {
        kind: "incoming",
        tone: "incoming",
        glyph: "!",
        lead: "",
        name: name.toUpperCase(),
        tail: left === null ? null : ` · ${formatCountdown(left)}`,
        remainingMs: left,
        confirm: false,
        action: "reopen-incoming",
        disabled: false,
        live: isLive,
        accessibilityLabel:
          `${CHIP_LABEL_PREFIX} ${name} wants to roll` +
          (left === null ? "" : `, ${spokenCountdown(left)} left`) +
          ". Open challenge",
      };
    }
  }

  // Waiting on my outgoing challenge: green only while live, like every state.
  if (input.outgoing) {
    const left = remaining(input.outgoing, now);
    if (left !== false) {
      const name = input.outgoing.opponentName.trim() || "Athlete";
      return {
        kind: "waiting",
        tone: isLive ? "live" : "neutral",
        glyph: isLive ? "●" : "○",
        lead: "WAITING · ",
        name: name.toUpperCase(),
        tail: left === null ? null : ` · ${formatCountdown(left)}`,
        remainingMs: left,
        confirm: false,
        action: input.onArena ? "none" : "open-arena",
        disabled: false,
        live: isLive,
        accessibilityLabel:
          `${CHIP_LABEL_PREFIX} waiting for ${name}` +
          (left === null ? "" : `, ${spokenCountdown(left)} left`) +
          (input.onArena ? "" : ". Open Arena"),
      };
    }
  }

  // Base states; CONFIRM is appended to each.
  const confirm = input.confirm;
  type BaseFields = Omit<ChipModel, "name" | "tail" | "remainingMs" | "confirm" | "live">;
  const base = (m: BaseFields): ChipModel => ({
    ...m,
    name: null,
    tail: null,
    remainingMs: null,
    confirm,
    live: isLive,
  });

  // The last choice is offline: drawn offline now, the way back one tap away.
  if (intendedOffline) {
    const n = input.onMat;
    if (display === "retry" || input.lastLiveWriteFailed) {
      return base({
        kind: "retry",
        tone: "neutral",
        glyph: "○",
        lead: "OFFLINE · RETRY",
        action: "go-live",
        disabled: !canGoLive,
        accessibilityLabel: `${CHIP_LABEL_PREFIX} going live failed. Retry going live`,
      });
    }
    return base({
      kind: "offline",
      tone: "neutral",
      glyph: "○",
      lead: n === null ? "GO LIVE" : `GO LIVE · ${formatBadgeCount(n)}`,
      action: "go-live",
      disabled: !canGoLive,
      accessibilityLabel: `${CHIP_LABEL_PREFIX}${spokenOnMat(n)} Go live`,
      ...(input.needsLocation ? { accessibilityHint: NEEDS_LOCATION_HINT } : {}),
    });
  }

  // A go-live in progress (instant go-live display overlay, UX 019).
  if ((display === "hold" || display === "leaving") && !isLive) {
    // The first 240 ms after the tap: nothing pending yet, and no taps.
    const n = input.onMat;
    return base({
      kind: "offline",
      tone: "neutral",
      glyph: "○",
      lead: n === null ? "GO LIVE" : `GO LIVE · ${formatBadgeCount(n)}`,
      action: "none",
      disabled: true,
      accessibilityLabel: `${CHIP_LABEL_PREFIX}${spokenOnMat(n)} Go live`,
    });
  }
  if ((display === "finding-you" || display === "restore-finding") && !isLive) {
    return base({
      kind: "finding-you",
      tone: "neutral",
      glyph: "◌",
      lead: "FINDING YOU",
      action: "none",
      disabled: true,
      // No accessibilityValue (see `chipAccessibilityValue`).
      accessibilityLabel: FINDING_YOU_LABEL,
    });
  }
  if (display === "recovering" && !isLive) {
    return base({
      kind: "reconnecting",
      tone: "neutral",
      glyph: "◌",
      lead: "RECONNECTING",
      action: "popover",
      // The live menu's Go offline is always there (QA 4, appendix B2).
      disabled: !input.controllerReady,
      accessibilityLabel: `${CHIP_LABEL_PREFIX} reconnecting. Open live menu`,
    });
  }
  if (display === "retry" && !isLive) {
    return base({
      kind: "retry",
      tone: "neutral",
      glyph: "○",
      lead: "OFFLINE · RETRY",
      action: "go-live",
      disabled: !canGoLive,
      accessibilityLabel: `${CHIP_LABEL_PREFIX} going live failed. Retry going live`,
    });
  }
  if (
    (display === "going-live" || display === null) &&
    liveSwitchPending({ intent: input.intent, display, drawnLive: isLive, phase, direction: input.direction })
  ) {
    return base({
      kind: "going-live",
      tone: "neutral",
      glyph: "◌",
      lead: "GOING LIVE",
      action: "none",
      disabled: true,
      // No accessibilityValue in this state (see `chipAccessibilityValue`).
      accessibilityLabel: `${CHIP_LABEL_PREFIX} going live`,
    });
  }
  // Never over a restore drawn live: the lobby rejoining after a foreground
  // return is part of the restore, not a reconnect (UX defect 2).
  if (isLive && input.reconnecting && display !== "restore-live" && display !== "optimistic") {
    return base({
      kind: "reconnecting",
      tone: "neutral",
      glyph: "◌",
      lead: "RECONNECTING",
      action: "popover",
      disabled: !input.controllerReady,
      accessibilityLabel: `${CHIP_LABEL_PREFIX} reconnecting. Open live menu`,
    });
  }
  if (isLive) {
    const n = input.onMat;
    return base({
      kind: "live",
      tone: "live",
      glyph: "●",
      lead: n === null ? "LIVE" : n === 0 ? "LIVE · JUST YOU" : `LIVE · ${formatBadgeCount(n)}`,
      // The live menu (and its Go offline) is always one tap away.
      action: "popover",
      disabled: !input.controllerReady,
      accessibilityLabel: `${CHIP_LABEL_PREFIX}${spokenOnMat(n)} Open live menu`,
    });
  }
  if (input.lastLiveWriteFailed) {
    return base({
      kind: "retry",
      tone: "neutral",
      glyph: "○",
      lead: "OFFLINE · RETRY",
      action: "go-live",
      // Disabled through the 2s cooldown after the failure, not a button
      // that swallows the tap (arena-store `runGuarded`).
      disabled: !canGoLive,
      accessibilityLabel: `${CHIP_LABEL_PREFIX} going live failed. Retry going live`,
    });
  }
  const n = input.onMat;
  return base({
    kind: "offline",
    tone: "neutral",
    glyph: "○",
    lead: n === null ? "GO LIVE" : `GO LIVE · ${formatBadgeCount(n)}`,
    action: "go-live",
    disabled: !canGoLive,
    accessibilityLabel: `${CHIP_LABEL_PREFIX}${spokenOnMat(n)} Go live`,
    ...(input.needsLocation ? { accessibilityHint: NEEDS_LOCATION_HINT } : {}),
  });
}

/**
 * The status segment's accessibilityValue, `live` or `offline` (the harness
 * reads it). GOING LIVE has none: "going live, offline" would contradict.
 */
export function chipAccessibilityValue(m: ChipModel): { text: string } | undefined {
  if (m.kind === "going-live" || m.kind === "finding-you") return undefined;
  return { text: m.live ? "live" : "offline" };
}

/** The chip's full copy on one line, as the spec writes it (for tests). */
export function chipCopy(m: ChipModel): string {
  const main = `${m.glyph} ${m.lead}${m.name ?? ""}${m.tail ?? ""}`;
  return m.confirm ? `${main} ▪ CONFIRM` : main;
}

/** The system text scale, sanitised and capped at `CHIP_MAX_FONT_SCALE`. */
export function effectiveScale(fontScale: number): number {
  return Math.min(Number.isFinite(fontScale) && fontScale > 0 ? fontScale : 1, CHIP_MAX_FONT_SCALE);
}

/** The CONFIRM segment's drawn and touch width for a given copy. */
function confirmSegmentWidth(copy: string, ch: number): number {
  // The compact marker gets a 44pt square target with the glyph centred;
  // the full word is its text plus right padding, never under 44pt (AC-H13).
  if (copy === CONFIRM_COPY_COMPACT) return CHIP_TARGET_HEIGHT;
  return Math.max(CHIP_TARGET_HEIGHT, Array.from(copy).length * ch + SEGMENT_PAD_X);
}

/** The status segment's right padding, which depends on what follows it. */
export function statusPadRight(confirmCopy: string | null): number {
  if (confirmCopy === null) return SEGMENT_PAD_X;
  // The compact CONFIRM target already spaces its centred glyph off.
  return confirmCopy === CONFIRM_COPY_COMPACT ? 0 : JOIN_PAD;
}

/**
 * The chip's rendered width in points, from its copy (JetBrains Mono has a
 * fixed advance, so this is exact up to font rounding). `confirmCopy` is the
 * CONFIRM segment's text, or null when there is none. The name is counted up
 * to `nameChars` characters (in full by default); it is the only part that
 * truncates when space runs out.
 */
export function estimateChipWidth(
  m: Pick<ChipModel, "glyph" | "lead" | "name" | "tail">,
  fontScale: number,
  confirmCopy: string | null,
  nameChars: number = Number.POSITIVE_INFINITY,
): number {
  const ch = FONT_PX * effectiveScale(fontScale) * MONO_ADVANCE_EM;
  const chars = (t: string) => Array.from(t).length;
  const glyph = VIEW_GLYPHS.has(m.glyph) ? LIVE_DOT_PX : ch;
  const text = chars(m.lead) + Math.min(chars(m.name ?? ""), nameChars) + chars(m.tail ?? "");
  const status = SEGMENT_PAD_X + glyph + GLYPH_GAP + text * ch + statusPadRight(confirmCopy);
  const confirm = confirmCopy ? confirmSegmentWidth(confirmCopy, ch) : 0;
  return status + confirm;
}

/** How the chip draws at a given system text size. */
export interface ChipLayout {
  /** The CONFIRM segment's copy, or null when there is nothing to confirm. */
  confirmCopy: string | null;
  /**
   * The text scale to draw at: the system scale capped at 1.3x, stepped down
   * (never below 1x, nor above the system scale) only when nothing else fits.
   */
  textScale: number;
}

/** How far each text-scale step shrinks the chip copy. */
const TEXT_SCALE_STEP = 0.05;
/**
 * The smallest text scale, used only when the header leaves the chip less
 * than `CHIP_MAX_WIDTH` (a 320pt-wide phone). With the full cap available
 * the text never drops below 1x.
 */
export const NARROW_MIN_TEXT_SCALE = 0.8;

/**
 * Fit the chip into `maxWidth` (at most `CHIP_MAX_WIDTH`; spec 4.2, AC-H12).
 * The count, the countdown and every separator always read in full. What
 * gives way, in order:
 *   1. the NAME ellipsizes (budgeted at `MIN_NAME_CHARS`);
 *   2. CONFIRM shortens to its `▪` marker (same 44pt target, label and tap);
 *   3. the text scale steps down from the 1.3x cap toward 1x;
 *   4. on a header narrower than the cap only: below 1x, to
 *      `NARROW_MIN_TEXT_SCALE`, with the name down to a lone "…".
 */
export function layoutChip(
  m: ChipModel,
  fontScale: number,
  maxWidth: number = CHIP_MAX_WIDTH,
): ChipLayout {
  const budget = Math.min(
    CHIP_MAX_WIDTH,
    Number.isFinite(maxWidth) && maxWidth > 0 ? maxWidth : CHIP_MAX_WIDTH,
  );
  const scale = effectiveScale(fontScale);
  const fits = (confirmCopy: string | null, textScale: number, nameChars = MIN_NAME_CHARS) =>
    estimateChipWidth(m, textScale, confirmCopy, nameChars) <= budget;

  if (m.confirm && fits(CONFIRM_COPY_FULL, scale)) {
    return { confirmCopy: CONFIRM_COPY_FULL, textScale: scale };
  }
  const confirmCopy = m.confirm ? CONFIRM_COPY_COMPACT : null;
  const floor = Math.min(scale, budget < CHIP_MAX_WIDTH ? NARROW_MIN_TEXT_SCALE : 1);
  let textScale = scale;
  while (!fits(confirmCopy, textScale) && textScale > floor) {
    // Rounded so the steps land on exact hundredths (1.3, 1.25, ...).
    textScale = Math.max(floor, Math.round((textScale - TEXT_SCALE_STEP) * 100) / 100);
  }
  return { confirmCopy, textScale };
}

