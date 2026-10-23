/**
 * Page objects for the mobile app, driven through idb's accessibility tree.
 *
 * Selectors prefer testIDs (AXUniqueId). Where the app only has an
 * accessibility label, labels are matched case-insensitively (text-transform
 * uppercases rendered text) and filtered to Buttons where it matters.
 */
import {
  Idb,
  logBoxInspectorMinimize,
  logBoxOver,
  matches,
  summarise,
  tapPoint,
  type AXElement,
  type Query,
} from "./idb";
import type { Simctl } from "./simctl";
import { ExpectationTimeout, HarnessError } from "../lib/util";
import { PROMPT_INPUT_GUARD_MS } from "../../../apps/mobile/lib/arena/constants";
import { MATCH_STEPS, type MatchStep } from "../../../apps/mobile/lib/match-flow/step-router";
import { DOB_REQUIRED_COPY } from "../../../packages/shared/src/utils/invite-copy";

/**
 * The invite claim screen (apps/mobile/app/(app)/invite/claim.tsx): what
 * marks it (the account confirm's title, the date of birth step's message,
 * the plates' testIDs where idb reports them) and its Not now, which drops
 * the device's pending invite. `tests/timekeeper.test.ts` pins them to the
 * screen's source.
 */
export const INVITE_CLAIM_MARKERS: readonly Query[] = [
  { label: /^Open this invite\?$/i, type: "StaticText" },
  { label: DOB_REQUIRED_COPY, type: "StaticText" },
  { id: "claim-confirm" },
  { id: "claim-dob" },
  { id: "claim-message" },
];
export const INVITE_NOT_NOW: Query = { label: "Not now", type: "Button" };

/**
 * How long to wait after the prompt is detected before trying its buttons:
 * the app's input guard (AC-S3, imported so the two cannot drift) plus a
 * margin. The tap also waits for the button to report itself enabled (the
 * sheet disables its buttons for the guard), so a prompt detected late or
 * re-presented still lands; this floor only saves idb round trips.
 */
export const PROMPT_TAP_DELAY_MS = PROMPT_INPUT_GUARD_MS + 250;

/** The app's wizard steps (`MatchStep`, imported so the two cannot drift). */
export type WizardStep = MatchStep;

/**
 * The step marker's accessibility label, "Step N of T, <Label>" (`StepMarker`
 * in apps/mobile/components/match-flow/match-flow-wizard.tsx).
 */
export const STEP_MARKER_RE = /^Step \d+ of \d+, (\w+)$/;

/**
 * The marker's step name (lowercased) to the step. The names are the app's
 * `STEP_LABELS`; `tests/label-contract.test.ts` pins the two together.
 */
export const STEP_BY_LABEL: Readonly<Record<string, WizardStep>> = {
  // Timekeeper mode: the athletes pick a timekeeper (never shown in a two-athlete match).
  crew: "crew",
  weights: "weight",
  ready: "ready",
  live: "live",
  ended: "end",
  result: "result",
  confirm: "confirm",
  summary: "summary",
};

/** The step marker's testID prefix (`match-step-<step>`, StepMarker). */
export const STEP_TEST_ID_PREFIX = "match-step-";

/**
 * The step a `match-step-<step>` testID names, or null when the suffix is
 * not one of the app's `MATCH_STEPS` (a stale id such as the deleted
 * `match-step-wait` must never read as a step).
 */
export function stepFromTestId(id: string | null | undefined): WizardStep | null {
  if (!id?.startsWith(STEP_TEST_ID_PREFIX)) return null;
  const s = id.slice(STEP_TEST_ID_PREFIX.length);
  return (MATCH_STEPS as readonly string[]).includes(s) ? (s as WizardStep) : null;
}

/**
 * Controls that only one wizard step renders, for when the step marker is
 * missing from idb's tree. Seen on 8ae02d71 (2026-10-19): on the full-bleed
 * live step idb intermittently reports no `StepMarker` at all (neither its
 * label nor its testID), only the broadcast layout, so the live step is
 * also read from its own controls. The marker always wins when it is there.
 */
export const STEP_BY_CONTROL: ReadonlyArray<{ id: string; step: WizardStep }> = [
  { id: "live-end", step: "live" },
  { id: "live-pause-toggle", step: "live" },
  { id: "summary-exit", step: "summary" },
];

/** The step `STEP_BY_CONTROL` reads off the screen, or null. */
export function stepFromControls(els: AXElement[]): WizardStep | null {
  for (const { id, step } of STEP_BY_CONTROL) {
    if (els.some((e) => e.AXUniqueId === id)) return step;
  }
  return null;
}

/**
 * `HOLD_TO_END_MS` (apps/mobile/lib/match-flow/live-view-state.ts): how long
 * the live step's End must be held. Copied (that module is not loadable
 * here); `tests/label-contract.test.ts` pins the value to the app source.
 */
export const HOLD_TO_END_MS = 1_200;
/** Keep a bottom control this far above the screen edge: clear of the dev LogBox banner. */
const LOGBOX_CLEAR_INSET = 150;

/** Held this much longer than the app needs, so a slow frame never cuts it short. */
const HOLD_MARGIN_MS = 600;

/** testIDs of the face-off weight check (components/match-flow/faceoff/). */
export const WEIGHT_CHECK = {
  /** "YOUR CHECK": Blue's verdict on the opponent's weigh-in. */
  plate: "faceoff-weight-check-plate",
  confirm: "weight-check-confirm",
  /** "Doesn't look right". The flag-OFF tiers never tap it. */
  flag: "weight-check-flag",
} as const;

/** How long a Confirm tap may take to land before the harness taps again. */
const WEIGHT_CHECK_RETAP_MS = 3_000;

/** What Blue's weigh-in met on the face-off. */
export interface WeighIn {
  /** The weight-check plate asked for Blue's check and the harness confirmed. */
  weightCheck: boolean;
  /**
   * How many times the harness pressed the plate's Confirm. One is the only
   * clean answer: a second press means the app dropped the first (the
   * button stayed up and enabled for WEIGHT_CHECK_RETAP_MS), which the
   * caller records as a failed oracle rather than hiding it.
   */
  confirmPresses: number;
}

/** How Blue's End went: one hold is the only clean answer. */
export interface EndPress {
  holds: number;
}

/**
 * Why a second Back to Arena tap was allowed. Each is physical evidence read
 * from the screen, never an inference (jits-o47s.28):
 *  - `closed-before`: the harness closed a LogBox toast just before the first
 *    tap AND the LogBox inspector was on screen in the read just before that
 *    tap (the close tap missed the glyph and opened it, and it took the tap);
 *  - `toast-over-tap`: a toast lay over the first tap's point in that read;
 *  - `inspector-open`: the inspector was on screen at the tap (nothing closed
 *    before it) or after the ignored tap.
 * A toast closed before the tap with no inspector at or after it excuses
 * nothing: the close is not evidence that anything took the tap.
 */
export type LogBoxExcuse = "closed-before" | "toast-over-tap" | "inspector-open";

/** The excuse for a second Back to Arena tap, or undefined (pure, for tests). */
export function logBoxExcuseFor(x: {
  /** `dismissLogBox` closed a toast or minimised the inspector just before the tap. */
  closedBefore: boolean;
  /** The screen read just before the tap. */
  atTap: AXElement[];
  /** Where the tap landed. */
  point: { x: number; y: number };
  /** The screen read after the verdict ignored the tap. */
  after: AXElement[];
}): LogBoxExcuse | undefined {
  const inspectorAtTap = !!logBoxInspectorMinimize(x.atTap);
  if (x.closedBefore && inspectorAtTap) return "closed-before";
  if (logBoxOver(x.atTap, x.point)) return "toast-over-tap";
  if (inspectorAtTap || logBoxInspectorMinimize(x.after)) return "inspector-open";
  return undefined;
}

/** How Blue's Back to Arena went. */
export interface ExitPress {
  taps: number;
  /**
   * The harness tapped a second time because a dev-build LogBox could have
   * taken the first tap (`logBoxExcuse` says how). The only reason for a
   * second tap; a gate run reviews every true (LOOP.md, the flag-OFF guard).
   */
  logBoxRetap: boolean;
  logBoxExcuse?: LogBoxExcuse;
}

/**
 * The live step's pause toggle (`PauseButton`,
 * components/match-flow/live/pause-button.tsx). Its accessibility label
 * names the next action ("Pause match clock" while running, "Resume match
 * clock" while paused) since 35d87d0f; the drawn PAUSE / RESUME text is
 * inside that one accessible element, so idb never reports it on its own.
 */
export const PAUSE_TOGGLE = {
  id: "live-pause-toggle",
  pause: "Pause match clock",
  resume: "Resume match clock",
} as const;

/**
 * "PAUSE" or "RESUME" for the toggle's accessibility label, the raw label
 * for anything else (so a relabel shows up in the oracle's actual value
 * instead of as a bare timeout), null when the toggle is not on screen.
 */
export function pauseToggleState(label: string | null | undefined): string | null {
  if (label == null) return null;
  if (label === PAUSE_TOGGLE.pause) return "PAUSE";
  if (label === PAUSE_TOGGLE.resume) return "RESUME";
  return label;
}

/**
 * The tab bar's labels, in order (`title` of each `Tabs.Screen` in
 * apps/mobile/app/(app)/(tabs)/_layout.tsx). The Matches tab is labelled
 * Film since 2026-10-09; its route is still `matches`.
 */
export const TAB_LABELS = ["Home", "Arena", "Film", "Rankings", "Profile"] as const;
export type TabLabel = (typeof TAB_LABELS)[number];

/**
 * Every pushed screen's back control: AppHeader's chevron
 * (components/layout/app-header.tsx) and FilmBackButton
 * (components/film-room/film-back-button.tsx: the match detail hero, the
 * player's close, the timekeeper film page). A tab root has none.
 */
export const GO_BACK: Query = { label: "Go back", type: "Button" };

/**
 * A control centred above this line sits under the status bar and the
 * Dynamic Island (the top safe area is 62pt on the iPhone 17 Pro), where a
 * tap does not reach it. At rest every back control is centred lower:
 * AppHeader's at about y=88, the match hero's at 90, the player's at 92.
 */
export const BACK_MIN_CENTRE_Y = 62;
/** The home indicator strip at the bottom of the screen. */
const HOME_INDICATOR = 34;
/**
 * Where a reveal move aims a back control's centre: a little below where
 * any back control rests, so a move that scrolls content down always
 * reaches the top of its scroll view, which stops it there (no overshoot).
 */
const BACK_REVEAL_TARGET_Y = 110;
/** Reveal moves before an unreachable back control is a failure. */
const BACK_REVEAL_MOVES = 4;
/** Slow enough that the fling after release stays short (as `bandMove` in sim/match-detail.ts). */
const REVEAL_PT_PER_S = 300;

/**
 * Whether a tap at the element's centre reaches it (pure, for tests): on
 * screen, below the status bar, above the home indicator. idb lists
 * scrolled-away content with its real frame, so a FilmBackButton in a
 * scrolled match detail hero is reported at a negative y (E17, 2026-10-20:
 * y=-169), and a tap there lands nowhere.
 */
export function backTappable(el: AXElement, screenW: number, screenH: number): boolean {
  const cx = el.frame.x + el.frame.width / 2;
  const cy = el.frame.y + el.frame.height / 2;
  return el.frame.width > 0 && el.frame.height > 0 && cx > 0 && cx < screenW && cy >= BACK_MIN_CENTRE_Y && cy < screenH - HOME_INDICATOR;
}

/**
 * The vertical swipe that scrolls a back control centred at `cy` back
 * towards BACK_REVEAL_TARGET_Y (pure, for tests): the content moves by the
 * control's own distance from there (finger down for a control above the
 * screen), at most 60% of the screen per move, centred on the screen's
 * middle, at REVEAL_PT_PER_S (0.3 s at least).
 */
export function backRevealMove(cy: number, screenH: number): { fromY: number; toY: number; durationS: number } {
  const span = screenH * 0.6;
  // > 0: the content must move down (finger moves down).
  const d = Math.max(-span, Math.min(span, BACK_REVEAL_TARGET_Y - cy));
  const mid = screenH / 2;
  return { fromY: mid - d / 2, toY: mid + d / 2, durationS: Math.max(0.3, Math.abs(d) / REVEAL_PT_PER_S) };
}

const VERDICT_RE = /^(YOU WON|YOU LOST|DRAW|DISPUTED|MATCH COMPLETE)$/i;

export interface SummaryView {
  verdict: string | null;
  eloDelta: string | null;
  hasExit: boolean;
}

/**
 * Controls the harness selects by testID AND label, never by element type:
 * idb sometimes reports a `accessibilityRole="button"` Pressable as
 * StaticText (seen 2026-10-19 on the prompt's Accept / Decline and the
 * face-off's Leave, while a status plate next to them read as Button), so
 * a `type: "Button"` filter would miss them. The testID plus the exact label
 * is unique.
 */
export const PROMPT_BUTTONS = {
  "Accept challenge": { id: "challenge-prompt-accept", label: "Accept challenge" },
  "Decline challenge": { id: "challenge-prompt-decline", label: "Decline challenge" },
} as const satisfies Record<string, Query>;
export const FACEOFF_LEAVE: Query = { id: "faceoff-leave", label: "Cancel match" };

/**
 * The ready step's framing hint (the capture policy, timekeeper mode spec 13,
 * A21 to A23; scenario T14): by testID, with the copy deck's words for each
 * role. The retired sideways hint must never show, in either mode or in
 * practice.
 *
 * Preconditions (`apps/mobile/components/match-flow/match-recorder-surface.tsx`):
 * the hint exists only on the READY step (never on weight or live), only with
 * camera permission granted, and only for a viewer who records ("Record from
 * my phone" on, which goes through the AI consent sheet). The timekeeper's
 * hint also waits for the lens lookup (the camera's onCameraReady, or 1.5 s).
 * Core runs revoke the camera and record from no phone, so none of them can
 * see it: a scenario checking it grants camera and microphone first (simctl
 * privacy grant relaunches the app), turns recording on, then waits on the
 * ready step. In portrait the hint sits beside the 9:16 card, under the
 * `ready-notes-beside` column.
 */
export const READY_CAPTURE_HINT = {
  id: "ready-capture-hint",
  /** TK-REC2: both athletes, both modes, and practice. */
  athlete: "Hold your phone upright and keep both of you in frame.",
  /** TK-REC1: the timekeeper on an iPhone's ultrawide. */
  timekeeperWideLens: "Hold your phone upright. The wide lens keeps the whole mat in frame.",
  /** TK-REC1b: the timekeeper without one (Android, older iPhones). */
  timekeeperStepBack: "Hold your phone upright. Step back so the whole mat fits.",
  retired: "Turn your phone sideways for a wide shot. It locks when the match starts.",
} as const;

/** testIDs from apps/mobile/components/layout/header-status-chip.tsx / header-live-dot.tsx. */
export const HEADER_CHIP_ID = "header-status-chip";
export const HEADER_LIVE_DOT_ID = "header-live-dot";
/** The tab-root chip while the athlete is live. */
export const LIVE_CHIP: Query = { id: HEADER_CHIP_ID, value: "live" };

export class Screens {
  constructor(
    readonly idb: Idb,
    readonly simctl: Simctl,
    /**
     * How long to wait before answering the prompt (default
     * PROMPT_TAP_DELAY_MS). Injectable so unit tests that do not assert the
     * delay do not sleep through it.
     */
    readonly promptTapDelayMs: number = PROMPT_TAP_DELAY_MS,
  ) {}

  // --- global ---------------------------------------------------------------

  async tab(name: TabLabel): Promise<void> {
    await this.idb.dismissLogBox();
    await this.idb.tapQ({ label: name, type: "Button" }, 15_000);
  }

  /**
   * Pop the top pushed screen with its "Go back" control; false when the
   * screen has none (a tab root). Only a back control a tap can reach is
   * tapped (`backTappable`). FilmBackButton sits in the match detail hero
   * and scrolls away with the content, so after a deeper screen pops, the
   * detail under it can still be scrolled down with its back control above
   * the screen (E17, 2026-10-20: the Stats detail, scrolled to its opponent
   * row, reported "Go back" at y=-169; six taps there did nothing and the
   * run was stranded on it). Such a control is scrolled back into reach by
   * its own reported frame (`backRevealMove`), then tapped. Throws
   * ExpectationTimeout when it cannot be brought into reach.
   */
  async goBack(): Promise<boolean> {
    const t0 = Date.now();
    let seen: AXElement[] = [];
    for (let move = 0; move <= BACK_REVEAL_MOVES; move++) {
      // Let a pop transition or scroll momentum finish before measuring.
      if (!(await this.idb.settled(GO_BACK))) return false;
      seen = (await this.idb.describe()).filter((e) => matches(e, GO_BACK));
      if (seen.length === 0) return false;
      const reachable = seen.find((e) => backTappable(e, this.idb.screenW, this.idb.screenH));
      if (reachable) {
        await this.idb.tap(reachable);
        return true;
      }
      // Only a vertical scroll can bring it back: one off to the side cannot be revealed.
      const b = seen.find((e) => {
        const cx = e.frame.x + e.frame.width / 2;
        return e.frame.width > 0 && cx > 0 && cx < this.idb.screenW;
      });
      if (!b || move === BACK_REVEAL_MOVES) break;
      const m = backRevealMove(b.frame.y + b.frame.height / 2, this.idb.screenH);
      const x = this.idb.screenW / 2;
      await this.idb.swipe(x, m.fromY, x, m.toY, m.durationS);
    }
    throw new ExpectationTimeout(
      `"Go back" within reach (on screen, centre at y >= ${BACK_MIN_CENTRE_Y})`,
      Date.now() - t0,
      seen.map((e) => ({ id: e.AXUniqueId, frame: e.frame })),
    );
  }

  /**
   * Pop pushed screens until a tab root shows (no "Go back" left), at most
   * `max` pops. Throws ExpectationTimeout when one cannot be popped
   * (`goBack`) or a back control is still there after `max` pops, so a
   * stranded screen fails here, naming itself, instead of in whatever the
   * caller does next.
   */
  async backToTabRoot(max = 6): Promise<void> {
    const t0 = Date.now();
    for (let i = 0; i < max; i++) {
      if (!(await this.goBack())) return;
      await new Promise((r) => setTimeout(r, 900));
    }
    const els = await this.idb.describe();
    if (els.some((e) => matches(e, GO_BACK))) {
      throw new ExpectationTimeout(`a tab root within ${max} pops of "Go back"`, Date.now() - t0, summarise(els));
    }
  }

  /**
   * Whether the header says the athlete is live: the tab roots' status chip
   * reporting value "live" (its copy varies: LIVE, WAITING, ! NAME, CONFIRM),
   * or the pushed screens' non-interactive live dot.
   */
  async isLivePillVisible(els?: AXElement[]): Promise<boolean> {
    const all = els ?? (await this.idb.describe());
    return !!(
      (await this.idb.find(LIVE_CHIP, all)) || (await this.idb.find({ id: HEADER_LIVE_DOT_ID }, all))
    );
  }

  async screen(): Promise<string[]> {
    return summarise(await this.idb.describe());
  }

  /**
   * Tap the alert button labelled `label`, disambiguated from a same-label
   * control underneath by proximity to the alert's other button.
   */
  async tapAlertButton(label: string, sibling: string, timeoutMs = 8_000): Promise<void> {
    const sib = await this.idb.waitFor({ label: sibling, type: "Button" }, timeoutMs);
    const els = await this.idb.describe();
    const candidates = els.filter(
      (e) => (e.type === "Button" || e.type === "Link") && (e.AXLabel ?? "").toLowerCase() === label.toLowerCase(),
    );
    if (candidates.length === 0) throw new HarnessError(`alert button "${label}" not found`);
    candidates.sort((a, b) => Math.abs(a.frame.y - sib.frame.y) - Math.abs(b.frame.y - sib.frame.y));
    // Alerts animate in; a tap during the animation is dropped. Tap the
    // settled frame, then confirm the alert went away (retry once).
    for (let attempt = 0; attempt < 3; attempt++) {
      const el = (await this.idb.settled({ label, type: "Button" })) ?? candidates[0];
      await this.idb.tap(attempt === 0 ? candidates[0] : el);
      try {
        await this.idb.waitGone({ label: sibling, type: "Button" }, 3_000);
        return;
      } catch {
        /* retry */
      }
    }
    throw new HarnessError(`alert button "${label}" did not dismiss the alert`);
  }

  // --- invites --------------------------------------------------------------

  /**
   * Drop a pending invite the device still holds: when the invite claim
   * screen is up with its Not now (the account confirm, the date of birth
   * step, or a retryable failure), tap it. Not now clears the pending invite
   * (`clearPendingInvite`) and goes to the Arena; a pending invite left on
   * the device brings every cold launch back to the claim screen
   * (`lib/invites/launch-route.ts`). Keyed on the claim screen's own copy, so
   * the other screens' Not now (the practice offer, the go-live location
   * and AI consent sheets) are never touched. Returns whether it tapped.
   */
  async dropPendingInvite(els?: AXElement[]): Promise<boolean> {
    const all = els ?? (await this.idb.describe());
    if (!all.some((e) => INVITE_CLAIM_MARKERS.some((q) => matches(e, q)))) return false;
    const notNow = all.find((e) => matches(e, { ...INVITE_NOT_NOW, enabled: true }));
    if (!notNow) return false;
    await this.idb.tap(this.idb.onScreen(notNow) ? notNow : await this.idb.scrollTo({ ...INVITE_NOT_NOW, enabled: true }, 4));
    // The claim screen leaves for the Arena; a caller that loops (normaliseApp) reads it again anyway.
    for (const start = Date.now(); Date.now() - start < 8_000; ) {
      const now = await this.idb.describe();
      if (!now.some((e) => INVITE_CLAIM_MARKERS.some((q) => matches(e, q)))) break;
      await new Promise((r) => setTimeout(r, 350));
    }
    return true;
  }

  // --- Arena ----------------------------------------------------------------

  async openArena(): Promise<void> {
    await this.tab("Arena");
    await this.idb.waitAny([{ label: "Go live", type: "Button" }, { label: "Go offline", type: "Button" }, { label: /^Waiting for /, type: "StaticText" }], 15_000);
  }

  /**
   * Go live through the UI if not already, and wait for the pill. The toggle
   * is disabled while it saves and for 2s after each transition (a tap then
   * is ignored), so the tap waits for it to be enabled.
   */
  async ensureLive(): Promise<void> {
    const els = await this.idb.describe();
    if (await this.idb.find({ label: "Go live", type: "Button" }, els)) await this.tapGoLive();
    await this.idb.waitFor(LIVE_CHIP, 15_000);
    await this.idb.waitFor({ label: "Go offline", type: "Button" }, 15_000);
  }

  /**
   * Tap the Arena's Go live and return without waiting for the result. For
   * when going live raises something over the Arena: a recovered incoming
   * challenge is a centered modal (jits-02vo.3) that hides the whole tab
   * root from idb, chip and control bar included, so the caller waits for
   * what it expects instead of for `Go offline`.
   */
  async tapGoLive(): Promise<void> {
    await this.idb.tapQ({ label: "Go live", type: "Button", enabled: true }, 15_000);
  }

  async ensureOffline(): Promise<void> {
    const els = await this.idb.describe();
    if (await this.idb.find({ label: "Go offline", type: "Button" }, els)) {
      await this.idb.tapQ({ label: "Go offline", type: "Button", enabled: true }, 15_000);
    }
    await this.idb.waitFor({ label: "Go live", type: "Button" }, 15_000);
    await this.idb.waitGone(LIVE_CHIP, 10_000);
  }

  /**
   * The roster is a snapshot, so pull-to-refresh until the Challenge button
   * for `name` shows, then tap it.
   */
  async challenge(name: string, timeoutMs = 30_000): Promise<void> {
    const q = { label: `Challenge ${name}`, type: "Button" };
    const start = Date.now();
    for (;;) {
      const els = await this.idb.describe();
      // The row's Pressable surfaces as Button, Link, Slider or GenericElement
      // depending on what else is mounted; the label is what is stable.
      const btn = els.find((e) => e.type !== "StaticText" && e.AXLabel?.toLowerCase() === q.label.toLowerCase());
      if (btn && this.idb.onScreen(btn)) {
        await this.idb.tap(btn);
        return;
      }
      if (Date.now() - start > timeoutMs) {
        throw new ExpectationTimeout(`"${q.label}" on the Arena roster`, timeoutMs, summarise(els));
      }
      await this.idb.pullToRefresh();
      await new Promise((r) => setTimeout(r, 900));
    }
  }

  async waitWaitingPlate(name: string, timeoutMs = 10_000): Promise<void> {
    await this.idb.waitFor({ label: `Waiting for ${name}`, type: "StaticText" }, timeoutMs);
  }

  async cancelOutgoing(): Promise<void> {
    await this.idb.tapQ({ label: "Cancel challenge", type: "Button" });
  }

  // --- incoming prompt ------------------------------------------------------

  /**
   * The prompt's "INCOMING CHALLENGE" title. Since jits-02vo.3 the prompt is a
   * centered modal, not a gorhom bottom sheet, so there is no drag handle to
   * look for. Its Accept / Decline buttons are exposed by label (jits-ef2a)
   * and are the only way the harness answers a prompt; the title is kept as a
   * second visibility signal, so a prompt whose buttons are momentarily
   * missing from a describe still counts as up.
   *
   * A card that is fading out (about 300ms after an answer) is still drawn,
   * but the app hides it from the accessibility tree the moment its
   * challenge clears (`accessibilityElementsHidden`), so neither the title
   * nor the buttons of a closing card are reported here. A zero-size or
   * off-screen title is ignored as well, as the old sheet-handle check did.
   */
  private promptSheet(els: AXElement[]): AXElement | undefined {
    return els.find((e) => e.AXLabel === "INCOMING CHALLENGE" && this.idb.onScreen(e, 0, 0));
  }

  async isPromptVisible(els?: AXElement[]): Promise<boolean> {
    const all = els ?? (await this.idb.describe());
    return !!(await this.idb.find(PROMPT_BUTTONS["Accept challenge"], all)) || !!this.promptSheet(all);
  }

  async waitPrompt(timeoutMs = 15_000): Promise<void> {
    const start = Date.now();
    for (;;) {
      const els = await this.idb.describe();
      if (await this.isPromptVisible(els)) return;
      if (Date.now() - start > timeoutMs) throw new ExpectationTimeout("the incoming challenge prompt", timeoutMs, summarise(els));
      await new Promise((r) => setTimeout(r, 350));
    }
  }

  async waitPromptGone(timeoutMs = 8_000): Promise<void> {
    const start = Date.now();
    for (;;) {
      const els = await this.idb.describe();
      if (!(await this.isPromptVisible(els))) return;
      if (Date.now() - start > timeoutMs) throw new ExpectationTimeout("the prompt to close", timeoutMs, summarise(els));
      await new Promise((r) => setTimeout(r, 350));
    }
  }

  /**
   * Answer the prompt by label. The app drops (does not queue) any tap inside
   * its input guard, so a tap that lands early would be silently lost and the
   * run would stall until a later, unrelated timeout. Instead: wait out the
   * guard, then wait for the button to report itself ENABLED (the sheet
   * disables its buttons for the guard) before tapping, and fail HERE, naming
   * the guard, if it never does. There is no offset fallback any more: the
   * layout (countdown, stakes strip, "+N more" line, Later) moves the row, and
   * the buttons are reachable by label since jits-ef2a.
   */
  private async tapPromptButton(label: "Accept challenge" | "Decline challenge", timeoutMs = 5_000): Promise<void> {
    await new Promise((r) => setTimeout(r, this.promptTapDelayMs));
    try {
      await this.idb.tapQ({ ...PROMPT_BUTTONS[label], enabled: true }, timeoutMs);
    } catch (e) {
      if (e instanceof ExpectationTimeout) {
        throw new ExpectationTimeout(
          `the prompt's "${label}" button to accept taps (input guard ${PROMPT_INPUT_GUARD_MS}ms)`,
          timeoutMs,
          summarise(await this.idb.describe()),
        );
      }
      throw e;
    }
  }

  async acceptPrompt(): Promise<void> {
    await this.tapPromptButton("Accept challenge");
  }

  async declinePrompt(): Promise<void> {
    await this.tapPromptButton("Decline challenge");
  }

  // --- wizard ---------------------------------------------------------------

  /**
   * Current wizard step. idb does not reliably surface the step marker's
   * testID, so the step name in its accessibility label ("Step N of T,
   * <Label>") is the primary signal and the testID a fallback.
   */
  async currentStep(els?: AXElement[]): Promise<WizardStep | null> {
    const all = els ?? (await this.idb.describe());
    for (const e of all) {
      const m = (e.AXLabel ?? "").match(STEP_MARKER_RE);
      if (m && STEP_BY_LABEL[m[1].toLowerCase()]) return STEP_BY_LABEL[m[1].toLowerCase()];
      const fromId = stepFromTestId(e.AXUniqueId);
      if (fromId) return fromId;
    }
    return stepFromControls(all);
  }

  async waitStep(step: WizardStep, timeoutMs = 15_000): Promise<void> {
    const start = Date.now();
    for (;;) {
      const els = await this.idb.describe();
      const cur = await this.currentStep(els);
      if (cur === step) return;
      if (Date.now() - start > timeoutMs) {
        throw new ExpectationTimeout(`wizard step "${step}"`, timeoutMs, { currentStep: cur, screen: summarise(els) });
      }
      await new Promise((r) => setTimeout(r, 350));
    }
  }

  /** Wait until the wizard is on any of `steps`; resolves which one. */
  async waitStepIn(steps: WizardStep[], timeoutMs = 15_000): Promise<WizardStep> {
    const start = Date.now();
    for (;;) {
      const els = await this.idb.describe();
      const cur = await this.currentStep(els);
      if (cur && steps.includes(cur)) return cur;
      if (Date.now() - start > timeoutMs) {
        throw new ExpectationTimeout(`wizard step in [${steps.join(", ")}]`, timeoutMs, { currentStep: cur, screen: summarise(els) });
      }
      await new Promise((r) => setTimeout(r, 350));
    }
  }

  /**
   * Blue's weigh-in on the face-off: tap "Confirm <N> lbs" (#weight-confirm).
   * On a match with weight checks (jr_be-ahn.4: every challenge-backed
   * match) the opponent's plate then turns into Blue's check of their
   * weigh-in (#faceoff-weight-check-plate) with Confirm and "Doesn't look
   * right", and the app stays on the weight step until Blue's OWN check is
   * confirmed (`useFaceoff`; jits-c3vd). Answer Confirm, pressing again only
   * if the press was dropped (the button stays up and enabled for
   * WEIGHT_CHECK_RETAP_MS), and count the presses: the caller records
   * anything but one as a failed oracle, so a dropped press cannot hide
   * behind the retry. Without checks (the pre-check flow) the app moves on
   * by itself. Resolves once the wizard has left the weight step; the
   * caller waits for the step it wants.
   */
  async confirmWeights(timeoutMs = 25_000): Promise<WeighIn> {
    await this.idb.tapQ({ id: "weight-confirm" }, 10_000);
    const start = Date.now();
    let confirmPresses = 0;
    let lastTap = 0;
    for (;;) {
      const els = await this.idb.describe();
      const step = await this.currentStep(els);
      if (step && step !== "weight") return { weightCheck: confirmPresses > 0, confirmPresses };
      const plate = els.find((e) => e.AXUniqueId === WEIGHT_CHECK.plate);
      const confirm = els.find((e) => matches(e, { id: WEIGHT_CHECK.confirm, enabled: true }));
      if (plate && confirm && Date.now() - lastTap > WEIGHT_CHECK_RETAP_MS) {
        const target = this.idb.onScreen(confirm) ? confirm : await this.idb.scrollTo({ id: WEIGHT_CHECK.confirm });
        await this.idb.tap(target);
        confirmPresses++;
        lastTap = Date.now();
      }
      if (Date.now() - start > timeoutMs) {
        throw new ExpectationTimeout("the weigh-in (and Blue's weight check) to leave the weight step", timeoutMs, {
          currentStep: step,
          weightCheckConfirmPresses: confirmPresses,
          screen: summarise(els),
        });
      }
      await new Promise((r) => setTimeout(r, 350));
    }
  }

  async tapReady(): Promise<void> {
    await this.idb.tapQ({ id: "ready-button" }, 10_000);
  }

  /**
   * The ready step's Opponent panel (testID ready-panel-opponent, label
   * "Opponent, ready"): the two-athlete plate says "waiting" while pending,
   * the timekeeper-mode chip "not ready". `/, ready$/` rejects both.
   */
  async waitOpponentReady(timeoutMs: number): Promise<void> {
    const start = Date.now();
    for (;;) {
      const els = await this.idb.describe();
      const panel =
        els.find((e) => e.AXUniqueId === "ready-panel-opponent") ??
        els.find((e) => /^opponent, (ready|waiting|not ready)$/i.test(e.AXLabel ?? ""));
      if (panel && /, ready$/i.test(panel.AXLabel ?? "")) return;
      if (Date.now() - start > timeoutMs) throw new ExpectationTimeout("opponent panel to show Ready", timeoutMs, summarise(els));
      await new Promise((r) => setTimeout(r, 350));
    }
  }

  /** "Cancel match" (the face-off's Leave) -> alert -> "Cancel Match". */
  async cancelMatch(): Promise<void> {
    await this.idb.tapQ(FACEOFF_LEAVE);
    await this.tapAlertButton("Cancel Match", "Keep Waiting");
  }

  async pauseToggle(): Promise<void> {
    await this.idb.tapQ({ id: PAUSE_TOGGLE.id });
  }

  /**
   * "PAUSE" (running) or "RESUME" (paused): the action the live toggle
   * offers, read from its accessibility label (`pauseToggleState`).
   */
  async pauseLabel(): Promise<string | null> {
    const el = await this.idb.find({ id: PAUSE_TOGGLE.id });
    return el ? pauseToggleState(el.AXLabel ?? "") : null;
  }

  /** Fill the submission form without tapping Record (for E10). */
  async fillSubmission(winnerId: string, code: string, finishTime: string): Promise<AXElement> {
    await this.tapOutcomeSubmissionIfPresent();
    await this.idb.tapQ({ id: `result-winner-${winnerId}` });
    const chip = await this.idb.scrollTo({ id: `result-submission-${code}` });
    await this.idb.tap(chip);
    await this.fillField("result-finish-time", finishTime);
    await this.dismissKeyboard();
    return this.idb.scrollTo({ id: "result-record" });
  }

  /**
   * Wait for the live screen itself: the wizard is on "live" from the start
   * of the 3-2-1 countdown, but the live step (End, Pause, and the step's
   * channel) mounts only at GO (`LiveStage`).
   */
  async waitLiveScreen(timeoutMs = 15_000): Promise<void> {
    await this.idb.waitFor({ id: "live-end" }, timeoutMs);
  }

  /**
   * End the match from the live step. The red CTA is "Hold to end match"
   * (`HoldToEndButton`): a tap never ends, the press must last
   * `HOLD_TO_END_MS`, so hold it with a margin, then confirm the press took
   * (the button leaves the screen with the live step, or reads ENDING).
   * A hold that did not take is held once more and counted: the caller
   * records anything but one hold as a failed oracle. When neither hold
   * ended the match, that is the app not ending it (ExpectationTimeout, a
   * `fail`), not a harness fault. `settleMs`: how long each hold has to
   * show it took (unit tests shorten it).
   */
  async endMatch(settleMs = 3_000): Promise<EndPress> {
    let els: AXElement[] = [];
    for (let holds = 1; holds <= 2; holds++) {
      const el = await this.idb.waitFor({ id: "live-end", enabled: true }, 10_000);
      await this.idb.longPress(el, (HOLD_TO_END_MS + HOLD_MARGIN_MS) / 1000);
      const start = Date.now();
      while (Date.now() - start < settleMs) {
        els = await this.idb.describe();
        const btn = els.find((e) => e.AXUniqueId === "live-end");
        if (!btn || btn.enabled === false || (await this.currentStep(els)) !== "live") return { holds };
        await new Promise((r) => setTimeout(r, 250));
      }
    }
    throw new ExpectationTimeout(
      `the live step to end after two ${HOLD_TO_END_MS + HOLD_MARGIN_MS}ms holds on #live-end`,
      2 * (HOLD_TO_END_MS + HOLD_MARGIN_MS + settleMs),
      summarise(els),
    );
  }

  /**
   * The redesigned result step (match-flow redesign) has no Submission /
   * Draw toggle: tapping a winner tile IS the submission choice. Older
   * builds still show the toggle, so tap it only when it is there.
   */
  private async tapOutcomeSubmissionIfPresent(): Promise<void> {
    await this.idb.waitAny([{ id: "result-outcome-submission" }, { id: "result-outcome-draw" }], 10_000);
    const toggle = await this.idb.find({ id: "result-outcome-submission" });
    if (toggle) await this.idb.tap(toggle);
  }

  async recordSubmission(winnerId: string, code: string, finishTime: string): Promise<void> {
    await this.tapOutcomeSubmissionIfPresent();
    await this.idb.tapQ({ id: `result-winner-${winnerId}` });
    const chip = await this.idb.scrollTo({ id: `result-submission-${code}` });
    await this.idb.tap(chip);
    await this.fillField("result-finish-time", finishTime);
    await this.dismissKeyboard();
    const rec = await this.idb.scrollTo({ id: "result-record" });
    await this.idb.tap(rec);
  }

  /**
   * Focus a text field, clear what it holds and type into it, verifying the
   * value landed (a type issued before focus settles is silently dropped).
   * Clearing matters for prefilled fields: the finish time is prefilled
   * from the match clock ("0:07"), and typing onto it would append.
   * Retries up to 3 times.
   */
  async fillField(id: string, text: string): Promise<void> {
    for (let attempt = 0; attempt < 3; attempt++) {
      const field = await this.idb.scrollTo({ id });
      await this.idb.tap(field);
      // Let focus land; then verify rather than trust.
      await new Promise((r) => setTimeout(r, 600 + attempt * 400));
      // The tap may put the caret anywhere in the text, so delete both ways.
      // An empty field may report its placeholder as the value: the extra
      // deletes are then no-ops.
      await this.idb.clearFocused((field.AXValue ?? "").length + 2);
      await this.idb.typeText(text);
      const start = Date.now();
      while (Date.now() - start < 2_000) {
        const el = await this.idb.find({ id });
        // Case-insensitive: iOS auto-capitalises a text field's first letter.
        if ((el?.AXValue ?? "").toLowerCase() === text.toLowerCase()) return;
        await new Promise((r) => setTimeout(r, 250));
      }
    }
    throw new HarnessError(`could not type into #${id}`);
  }

  async recordDraw(): Promise<void> {
    await this.idb.tapQ({ id: "result-outcome-draw" });
    const rec = await this.idb.scrollTo({ id: "result-record" });
    await this.idb.tap(rec);
  }

  /** Tap a non-interactive heading so the numeric keyboard goes away. */
  async dismissKeyboard(): Promise<void> {
    const els = await this.idb.describe();
    const heading =
      els.find((e) => e.type === "StaticText" && /^record result$/i.test(e.AXLabel ?? "") && this.idb.onScreen(e, 40, 40)) ??
      els.find((e) => e.AXUniqueId?.startsWith("match-step-"));
    if (heading) await this.idb.tap(heading);
    else await this.idb.tapXY(this.idb.screenW / 2, 120);
  }

  async confirmResult(): Promise<void> {
    const el = await this.idb.scrollTo({ id: "confirm-result" });
    await this.idb.tap(el);
  }

  async dispute(reason: string): Promise<void> {
    const d = await this.idb.scrollTo({ id: "confirm-dispute" });
    await this.idb.tap(d);
    await this.fillField("dispute-reason", reason);
    const heading = await this.idb.find({ label: /^dispute result$/i, type: "StaticText" });
    if (heading) await this.idb.tap(heading);
    const submit = await this.idb.scrollTo({ id: "dispute-submit" });
    await this.idb.tap(submit);
  }

  /** Texts may not expose testIDs through idb, so fall back to the copy. */
  async readConfirmVerdict(): Promise<string | null> {
    const els = await this.idb.describe();
    const el = els.find((e) => e.AXUniqueId === "confirm-verdict") ?? els.find((e) => e.type === "StaticText" && VERDICT_RE.test(e.AXLabel ?? ""));
    return el?.AXLabel ?? null;
  }

  async readSummary(): Promise<SummaryView> {
    const els = await this.idb.describe();
    const v = els.find((e) => e.AXUniqueId === "summary-verdict") ?? els.find((e) => e.type === "StaticText" && VERDICT_RE.test(e.AXLabel ?? ""));
    // The chip, when idb exposes it; else the rating card (one accessible
    // element whose label speaks the delta, see `parseDelta`).
    const d =
      els.find((e) => e.AXUniqueId === "summary-elo-delta") ??
      els.find((e) => e.type === "StaticText" && /^[▲▼]/.test(e.AXLabel ?? "")) ??
      els.find((e) => e.AXUniqueId === "verdict-rating-card" || /^Rating -?\d+(, |$)/.test(e.AXLabel ?? ""));
    const exit = els.find((e) => e.AXUniqueId === "summary-exit");
    return { verdict: v?.AXLabel ?? null, eloDelta: d?.AXLabel ?? null, hasExit: !!exit };
  }

  /**
   * Tap the verdict's exit ("Back to Arena"). It sits at the bottom of the
   * verdict, where a dev build's LogBox banner ("Open debugger to view
   * warnings") can lie over it and swallow the tap: close the banner, scroll
   * the exit clear of that band, tap. Tap a second time ONLY when a LogBox
   * physically could have taken the first tap, on evidence read from the
   * screen (`logBoxExcuseFor`): the inspector on screen in the read just
   * before the tap or after it (a toast closed just before the tap only
   * explains how it opened), or a toast over the tap's point in the read
   * just before the tap. A toast elsewhere on screen excuses
   * nothing: the exit was scrolled LOGBOX_CLEAR_INSET clear of the toast
   * band, so a verdict that ignores the tap is the app's failure
   * (ExpectationTimeout), never retried away. Returns the tap count (and
   * the excuse, when there was a second tap) for the caller's strict oracle.
   */
  async exitSummary(): Promise<ExitPress> {
    const goneMs = 5_000;
    let excuse: LogBoxExcuse | undefined;
    for (let taps = 1; taps <= 2; taps++) {
      const closedBefore = await this.idb.dismissLogBox();
      const el = await this.idb.scrollTo({ id: "summary-exit" }, 8, "up", LOGBOX_CLEAR_INSET);
      const point = tapPoint(el);
      const atTap = await this.idb.describe();
      await this.idb.tap(el);
      try {
        await this.idb.waitGone({ id: "summary-exit" }, goneMs);
        return excuse ? { taps, logBoxRetap: true, logBoxExcuse: excuse } : { taps, logBoxRetap: false };
      } catch (e) {
        if (!(e instanceof ExpectationTimeout)) throw e;
        const els = await this.idb.describe();
        const why = logBoxExcuseFor({ closedBefore, atTap, point, after: els });
        if (taps === 2 || !why) {
          throw new ExpectationTimeout(
            `the verdict to close after ${taps === 1 ? "one tap" : "two taps"} on Back to Arena (#summary-exit)${
              why
                ? ""
                : "; no LogBox could have taken the tap (no inspector open at or after the tap, no toast over its point; a toast closed just before it is no evidence on its own), so no second tap"
            }`,
            taps * goneMs,
            { taps, logBoxRetap: excuse !== undefined, logBoxExcuse: excuse, point, screen: summarise(els) },
          );
        }
        excuse = why;
      }
    }
    throw new HarnessError("exitSummary: unreachable");
  }

  // --- auth -----------------------------------------------------------------

  /** Email shown on Settings, or null when not signed in / not reachable. */
  async signedInEmail(): Promise<string | null> {
    await this.simctl.openUrl("elorated://settings");
    try {
      await this.idb.waitFor({ label: "Sign out", type: "Button" }, 10_000);
    } catch {
      return null;
    }
    const els = await this.idb.describe();
    const label = els.find((e) => e.type === "StaticText" && /@/.test(e.AXLabel ?? ""));
    return label?.AXLabel?.toLowerCase() ?? null;
  }

  async signOut(): Promise<void> {
    await this.simctl.openUrl("elorated://settings");
    await this.idb.tapQ({ label: "Sign out", type: "Button" }, 10_000);
    await this.tapAlertButton("Sign out", "Cancel");
    await this.idb.waitFor({ id: "login-email" }, 20_000);
  }

  async signIn(email: string, password: string): Promise<void> {
    await this.idb.tapQ({ id: "login-email" }, 10_000);
    await this.idb.typeText(email);
    await this.idb.tapQ({ id: "login-password" });
    await this.idb.typeText(password);
    await this.idb.tapQ({ id: "login-submit" });
    const start = Date.now();
    while (Date.now() - start < 40_000) {
      if (await this.idb.find({ label: "Home", type: "Button" })) break;
      await this.idb.dismissForeignSheet();
    }
    await this.idb.waitFor({ label: "Home", type: "Button" }, 10_000);
    await this.idb.dismissForeignSheet();
  }
}
