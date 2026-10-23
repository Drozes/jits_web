/**
 * Page objects for Blue's timekeeper-mode screens. The simulator is ALWAYS an
 * athlete, never the timekeeper (PM18: it has no camera, and the core runs
 * revoke its permission, so it could never pass the timekeeper's Start
 * camera gate); the timekeeper is always a bot (`bot/timekeeper.ts`).
 *
 * Every string is the app's own: the copy deck module
 * `apps/mobile/lib/match-flow/timekeeper-copy.ts` (slice M1, clean-code rule
 * M-R4) is pure, so it is imported, not re-spelled, and a relabel there moves
 * the harness with it. Names: the deck's `{name}`, `{A}`, `{B}` are short
 * names (`shortName`, "Demo Green" -> "D. Green"), but a picker row may show
 * the full display name, so every name-bearing selector accepts both forms.
 * Labels are matched case-insensitively (a caps style may uppercase the text
 * idb reports).
 *
 * Controls that slices M2 to M5 draw are found by their deck label or text;
 * the testIDs used are the ones the shipped face-off already has (and that
 * `tests/label-contract.test.ts` pins), plus the crew step's Leave (M2's
 * `crew/crew-top-bar.tsx`).
 */
import { SHIPPED_COPY, TIMEKEEPER_COPY } from "../../../apps/mobile/lib/match-flow/timekeeper-copy";
import { shortName } from "../../../apps/mobile/lib/match-flow/short-name";
import type { AXElement, Idb, Query, StillTiming } from "./idb";
import { matches, STILL_TIMING, summarise, tapWhenStill } from "./idb";
import type { Screens, WizardStep } from "./screens";
import { ExpectationTimeout } from "../lib/util";
import { APP_TIMING, TK_TIMING } from "../bot/protocol";

const C = TIMEKEEPER_COPY;

export function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** The forms a person's name takes on screen: the full display name and the deck's short name. */
export function nameForms(displayName: string): string[] {
  return [...new Set([displayName, shortName(displayName)])];
}

/** An exact, case-insensitive label regex for a deck string rendered with each of `names`. */
export function deckRe(render: (name: string) => string, names: readonly string[]): RegExp {
  return new RegExp(`^(?:${names.map((n) => escapeRe(render(n))).join("|")})$`, "i");
}

/** Same, for a string that names two people (`{athlete} asked {name}`). */
export function deckRe2(render: (a: string, b: string) => string, aNames: readonly string[], bNames: readonly string[]): RegExp {
  const alts: string[] = [];
  for (const a of aNames) for (const b of bNames) alts.push(escapeRe(render(a, b)));
  return new RegExp(`^(?:${alts.join("|")})$`, "i");
}

/** `NO CONTEST IN m:ss` (TK-D9), as text or as its spoken accessibility label. */
export const NO_CONTEST_CHIP_RE = new RegExp(
  `^(?:${escapeRe(C["TK-D9"].text(0)).replace("0:00", "\\d+:\\d{2}")}|${escapeRe(C["TK-D9"].a11y(0)).replace("0 minutes 0 seconds", "\\d+ minutes \\d+ seconds")})$`,
  "i",
);

/**
 * The seconds a countdown chip shows (TK-D9, TK-W1), from its text
 * (`... IN m:ss`) or its spoken label (`... in N minutes M seconds`), or
 * null when the label is neither (pure, for tests).
 */
export function countdownSeconds(label: string | null): number | null {
  if (!label) return null;
  const text = label.match(/(\d+):(\d{2})$/);
  if (text) return Number(text[1]) * 60 + Number(text[2]);
  const spoken = label.match(/(\d+) minutes (\d+) seconds$/i);
  return spoken ? Number(spoken[1]) * 60 + Number(spoken[2]) : null;
}

/** `CANCELS IN m:ss` (TK-W1), the pick deadline chip on crew (slice M2). */
export const DEADLINE_CHIP_RE = new RegExp(
  `^(?:${escapeRe(C["TK-W1"].text(0)).replace("0:00", "\\d+:\\d{2}")}|${escapeRe(C["TK-W1"].a11y(0)).replace("0 minutes 0 seconds", "\\d+ minutes \\d+ seconds")})$`,
  "i",
);

/** A25: the confirm step shows no rating in either mode (shipped kicker `YOUR RATING`). */
export const YOUR_RATING = "YOUR RATING";

/**
 * The athlete selectors, built from the deck. `tests/timekeeper.test.ts`
 * renders each against the deck functions so a deck change that breaks a
 * selector fails without a simulator.
 */
export const TK_UI = {
  /** The crew step's Leave (M2's `crew/crew-top-bar.tsx`; the face-off's Leave, A2). */
  crewLeave: { id: "crew-leave", label: SHIPPED_COPY.leave.a11y } satisfies Query,
  /** TK-P7: `Ask {name} to timekeep`, a picker row's action. */
  ask: (displayName: string) => deckRe(C["TK-P7"].a11y, nameForms(displayName)),
  /** TK-P17: `Asked {name}` (my own open request). */
  asked: (displayName: string) => deckRe(C["TK-P17"], nameForms(displayName)),
  /** TK-P20: `{athlete} asked {name}` (the other athlete's open request). */
  otherAsked: (athlete: string, timekeeper: string) => deckRe2((a, b) => C["TK-P20"]({ athlete: a, name: b }), nameForms(athlete), nameForms(timekeeper)),
  /** TK-P21: declined. */
  declined: (displayName: string) => deckRe(C["TK-P21"], nameForms(displayName)),
  /** TK-P22: lapsed. */
  lapsed: (displayName: string) => deckRe(C["TK-P22"], nameForms(displayName)),
  /** TK-D1: the timekeeper left before the start; pick again. */
  timekeeperLeft: (displayName: string) => deckRe(C["TK-D1"], nameForms(displayName)),
  /**
   * TK-F1: the timekeeper row on the athlete's face-off, as its `TIMEKEEPER`
   * text, or as the row's one merged label when it starts with it (then it
   * must name this timekeeper: `TIMEKEEPER, {name}[, {state}]`). The
   * positive anchor before any check that the row's state is absent.
   */
  timekeeperRow: (displayName: string) =>
    new RegExp(`^${escapeRe(C["TK-F1"])}(?:$|, (?:${nameForms(displayName).map(escapeRe).join("|")})(?:$|, ))`, "i"),
  /**
   * TK-F2 / TK-F3: the timekeeper's weight check state, as its own text or
   * at the end of the row's merged label. Only on a match with the
   * timekeeper check (A19).
   */
  verdictState: new RegExp(`(?:^|, )(?:${escapeRe(C["TK-F2"])}|${escapeRe(C["TK-F3"])})$`, "i"),
  /** TK-AR2: the line under the Arena's waiting strip, only while the flag is known ON (slice M6). */
  arenaWaitingHelper: new RegExp(`^${escapeRe(C["TK-AR2"])}$`, "i"),
  /** TK-F4: the athlete's merged ready ("Weight looks right, I'm ready"). */
  readyButton: new RegExp(`^${escapeRe(C["TK-F4"])}$`, "i"),
  /** TK-F5: `{NAME} STARTS THE MATCH`. */
  startsTheMatch: (displayName: string) => deckRe(C["TK-F5"], nameForms(displayName)),
  /** TK-F7: the timekeeper flagged my weight. */
  weightFlagged: (displayName: string) => deckRe(C["TK-F7"], nameForms(displayName)),
  /** TK-L2: `{NAME} RUNS THE CLOCK` (athletes have no clock controls). */
  runsTheClock: (displayName: string) => deckRe(C["TK-L2"], nameForms(displayName)),
  /** TK-D7: `{NAME} IS OFFLINE`. */
  offline: (displayName: string) => deckRe(C["TK-D7"], nameForms(displayName)),
  /** TK-D8: the result stall, under admin review. */
  resultReview: (displayName: string) => deckRe(C["TK-D8"], nameForms(displayName)),
  /** TK-R5: `RESULT RECORDED BY {NAME}` on the athletes' confirm step. */
  recordedBy: (displayName: string) => deckRe(C["TK-R5"], nameForms(displayName)),
  /** TK-RC1: `{NAME} CHANGED THE RESULT` (back on confirm after an edit). */
  changedResult: (displayName: string) => deckRe(C["TK-RC1"], nameForms(displayName)),
  /**
   * The match re-weigh (R9): the flagged athlete's prompt in the weight check
   * (`ReweighPrompt`, faceoff-weight-check.tsx), whose submit calls
   * `weightCheck.reweigh` (`reweigh_for_match`: the rated weight for this
   * match, voiding the checks on the athlete and both readies). NOT the
   * face-off header's profile editor (`faceoff-edit-weight`, faceoff-top.tsx),
   * which writes `athletes.current_weight` for future matches and leaves the
   * match's checks alone. In timekeeper mode the prompt sits on the ready
   * step, under TK-F7 or the opponent's flag.
   */
  reweigh: { prompt: { id: "weight-reweigh" }, input: "weight-reweigh-input", submit: { id: "weight-reweigh-submit" } },
  /** The shipped weigh-in (`Confirm {w} lbs`). */
  weighIn: { id: "weight-confirm" } satisfies Query,
  /** The live step's clock controls: an athlete in timekeeper mode has neither. */
  clockControls: [{ id: "live-end" }, { id: "live-pause-toggle" }] satisfies Query[],
  /**
   * What the face-off shows once Blue's TK-F4 is honoured (ready is the
   * server's in timekeeper mode, so each one means the server has Blue's
   * `match_ready` row): the merged ready's waiting line (its testID, the
   * shipped `WAITING FOR {OPP}...`, or TK-F5 once both are ready) and Blue's
   * own ready status (`You, ready`, the face-off chip in faceoff-top.tsx).
   */
  readyHonoured: [
    { id: "merged-ready-waiting" },
    { label: /^WAITING FOR .+\.\.\.$/i },
    { label: anyNameRe(C["TK-F5"]) },
    { label: /^You, ready$/i },
  ] satisfies Query[],
  /** The confirm step's Confirm (the shipped testID, `components/match-flow/steps/confirm-step.tsx`). */
  confirm: { id: "confirm-result" } satisfies Query,
} as const;

/**
 * How long after Blue's one Confirm press the verdict may take (PM29 (5)):
 * the send ceiling (no reply for 20 s ends the press as failed), then the
 * confirm step's `ADVANCE_AFTER_CONFIRM_MS` before it moves on, plus a
 * margin for the screen reads. The scenarios' wait for the summary step
 * (`TK.handshake`) must cover it; `tests/timekeeper.test.ts` checks it does.
 */
export const TK_CONFIRM_SETTLE_MS = TK_TIMING.SEND_CEILING_MS + APP_TIMING.CONFIRM_ADVANCE_MS + 5_000;

/** The steps after the face-off: reaching one means the timekeeper started the match. */
export const AFTER_FACEOFF: ReadonlySet<WizardStep> = new Set<WizardStep>(["live", "end", "result", "confirm", "summary"]);

/**
 * How long a TK-F4 press may stay unanswered (the button still offered and
 * enabled: a press the app took goes busy at once, `useMergedReady`) before
 * the harness presses again and counts it, as the shipped check plate's
 * strict press does (`WEIGHT_CHECK_RETAP_MS`).
 */
export const TK_READY_RETAP_MS = 3_000;

/**
 * At most this many TK-F4 presses: a second one is already a failed oracle,
 * so a third would only hide how the first two went; the helper then waits
 * out its timeout for the second to be honoured.
 */
export const TK_READY_MAX_PRESSES = 2;

/** The harness's timing knobs for Blue's face-off (tests shorten them). */
export interface TkScreenTiming {
  /** Between screen reads. */
  pollMs: number;
  /** See `TK_READY_RETAP_MS`. */
  retapMs: number;
  /** Between reads of `serverReady`, when given. */
  probeMs: number;
  /** For the keyboard to finish closing once its text field has gone. */
  keyboardMs: number;
  /** How long a control must hold still before a tap (`tapWhenStill`). */
  still: StillTiming;
}

const DEFAULT_TIMING: TkScreenTiming = { pollMs: 350, retapMs: TK_READY_RETAP_MS, probeMs: 1_000, keyboardMs: 500, still: STILL_TIMING };

/** A deck string's exact regex for any name (`{NAME} STARTS THE MATCH` -> `^.+ STARTS THE MATCH$`). */
export function anyNameRe(render: (name: string) => string): RegExp {
  const slot = "\u0001";
  return new RegExp(`^${escapeRe(render(slot)).split(slot).join(".+")}$`, "i");
}

/** Whether an element's label matches a label regex (any element type). */
function labelled(re: RegExp): Query {
  return { label: re };
}

/**
 * TK-F4 as a control (`type: "Button"` takes any interactive element, never
 * its text), only while it is enabled: a busy or disabled TK-F4 is never
 * pressed, on screen or once scrolled into view (`tapControl`).
 */
const READY_CONTROL: Query = { label: TK_UI.readyButton, enabled: true, type: "Button" };

/**
 * Every `TimekeeperScreens` tap goes through `tapWhenStill` (or
 * `Idb.scrollTo`, which already waits for the element to settle): never to
 * a point from one read taken before a bot action could move the screen
 * (Wave 3 gate, T10). Taps the scenarios make themselves (the crew's Leave,
 * the T3 and T17 alerts) are outside this class and keep their own reads.
 */
export class TimekeeperScreens {
  readonly timing: TkScreenTiming;

  constructor(
    readonly idb: Idb,
    readonly ui: Screens,
    timing: Partial<TkScreenTiming> = {},
  ) {
    this.timing = { ...DEFAULT_TIMING, ...timing };
  }

  /** Wait for any element labelled by `re` (text or control). */
  async waitLabel(re: RegExp, timeoutMs: number): Promise<AXElement> {
    return this.idb.waitFor(labelled(re), timeoutMs);
  }

  async hasLabel(re: RegExp, els?: AXElement[]): Promise<boolean> {
    return !!(await this.idb.find(labelled(re), els));
  }

  /**
   * Blue picks a timekeeper on `crew`: tap the row's `Ask` (TK-P7), scrolling
   * the list if needed. The rows can reorder as people come online, so the
   * row is tapped only once it holds still.
   */
  async ask(displayName: string, timeoutMs = 20_000): Promise<void> {
    const q: Query = { label: TK_UI.ask(displayName), enabled: true, type: "Button" };
    const start = Date.now();
    for (;;) {
      const at = Date.now();
      const els = await this.idb.describe();
      const btn = els.find((e) => matches(e, q));
      if (btn && this.idb.onScreen(btn)) {
        if (await tapWhenStill(this.idb, q, { el: btn, at }, this.timing.still)) return;
      } else if (btn) {
        await this.idb.tap(await this.idb.scrollTo(q, 4));
        return;
      }
      if (Date.now() - start > timeoutMs) throw new ExpectationTimeout(`"Ask ${displayName} to timekeep" on the picker`, timeoutMs, summarise(els));
      await this.pause();
    }
  }

  /**
   * Blue's weigh-in in timekeeper mode (spec 4.2, step `weight`): the
   * shipped `Confirm {w} lbs`, tapped once, which moves the face-off to the
   * `ready` step at once (the opponent check is merged into TK-F4 there).
   * Resolves once the wizard has left `weight` (and `crew`, which a fresh
   * seat may still show for a moment) with the step it is on; `weighedIn`
   * says whether the harness tapped (false when Blue was already past it).
   */
  async weighIn(timeoutMs = 25_000): Promise<{ weighedIn: boolean; step: WizardStep }> {
    const start = Date.now();
    let weighedIn = false;
    const q: Query = { ...TK_UI.weighIn, enabled: true };
    for (;;) {
      const at = Date.now();
      const els = await this.idb.describe();
      const step = await this.ui.currentStep(els);
      if (step && step !== "weight" && step !== "crew") return { weighedIn, step };
      // Only `weight` draws the weigh-in; a null step is a read that missed the marker.
      const weigh = !weighedIn && step !== "crew" ? els.find((e) => matches(e, q)) : undefined;
      if (weigh) weighedIn = await this.tapControl(q, weigh, at, TK_UI.weighIn);
      if (Date.now() - start > timeoutMs) {
        throw new ExpectationTimeout("Blue's weigh-in to move the face-off from weight to ready", timeoutMs, {
          currentStep: step,
          weighedIn,
          screen: summarise(els),
        });
      }
      await this.pause();
    }
  }

  /**
   * Blue's face-off in timekeeper mode, the spec's two steps (4.2): the
   * weigh-in on `weight` (`weighIn`, skipped when Blue is already on
   * `ready`), then the merged ready on `ready` (TK-F4: it also confirms
   * Blue's check of the opponent, `mark_match_ready`). Finishes only when
   * the press is honoured (`TK_UI.readyHonoured` on screen, Blue's
   * `match_ready` row when `serverReady` is given, or the match already
   * past the face-off), never just on leaving `weight`.
   *
   * Counts the presses of TK-F4 like the shipped check plate's strict press:
   * one is clean; a second (made only when TK-F4 stayed offered and enabled
   * for `retapMs` after the first, and never a third) means the app dropped
   * or refused the first, and the caller records it as a failed oracle.
   * Zero means TK-F4 was never pressed (the match moved on, or ready
   * showed, without it).
   */
  async weighInAndReady(
    timeoutMs = 25_000,
    opts: { serverReady?: () => Promise<boolean> } = {},
  ): Promise<{ weighedIn: boolean; readyPresses: number }> {
    const deadline = Date.now() + timeoutMs;
    const { weighedIn } = await this.weighIn(timeoutMs);
    const readyPresses = await this.pressReady(Math.max(deadline - Date.now(), 0), opts.serverReady);
    return { weighedIn, readyPresses };
  }

  /** TK-F4 on `ready`, until the press is honoured; returns the presses made. */
  private async pressReady(timeoutMs: number, serverReady?: () => Promise<boolean>): Promise<number> {
    const start = Date.now();
    let presses = 0;
    let lastTap = 0;
    let lastProbe = 0;
    for (;;) {
      const at = Date.now();
      const els = await this.idb.describe();
      const step = await this.ui.currentStep(els);
      if (step && AFTER_FACEOFF.has(step)) return presses;
      // Only the ready step draws these (and TK-F4), so a read that missed the step marker still counts.
      if (TK_UI.readyHonoured.some((q) => els.some((e) => matches(e, q)))) return presses;
      const retapDue = presses > 0 && Date.now() - lastTap > this.timing.retapMs;
      // The server's row is the authority: read it before any second press.
      if (presses > 0 && serverReady && (retapDue || Date.now() - lastProbe >= this.timing.probeMs)) {
        lastProbe = Date.now();
        if (await serverReady()) return presses;
      }
      const ready = els.find((e) => matches(e, READY_CONTROL));
      // A press counts only when it was made: TK-F4 moving, going or turning
      // busy under the harness is read again, never tapped where it was.
      if (ready && (presses === 0 || (retapDue && presses < TK_READY_MAX_PRESSES)) && (await this.tapControl(READY_CONTROL, ready, at, { label: TK_UI.readyButton }))) {
        presses++;
        lastTap = Date.now();
      }
      if (Date.now() - start > timeoutMs) {
        throw new ExpectationTimeout("Blue's TK-F4 (Weight looks right, I'm ready) to be honoured on the ready step", timeoutMs, {
          currentStep: step,
          readyPresses: presses,
          screen: summarise(els),
        });
      }
      await this.pause();
    }
  }

  /**
   * Blue re-weighs for this match (R9) to `lbs` through the weight check's
   * prompt (`TK_UI.reweigh`), shown under TK-F7 or the opponent's flag.
   * Resolves once the prompt has gone (the face-off re-read the voided
   * flag, so TK-F4 is offered again) and its keyboard with it: a TK-F4
   * pressed under a closing keyboard would read as a dropped press.
   */
  async reweigh(lbs: number, timeoutMs = 10_000, goneMs = 15_000): Promise<void> {
    await this.idb.waitFor({ id: TK_UI.reweigh.input }, timeoutMs);
    await this.ui.fillField(TK_UI.reweigh.input, String(lbs));
    // The keyboard opening scrolls the prompt: tap Re-weigh where it settles.
    await this.tapWhenReady({ ...TK_UI.reweigh.submit, enabled: true }, timeoutMs, "Blue's Re-weigh (weight-reweigh-submit) offered and enabled");
    await this.idb.waitGone({ id: TK_UI.reweigh.input }, goneMs);
    await new Promise((r) => setTimeout(r, this.timing.keyboardMs));
  }

  /**
   * Blue's Confirm on the confirm step in timekeeper mode (PM29 (1) and
   * (5)): pressed once, and only once it is offered AND enabled. From the tap
   * until the server answers (at most `TK_TIMING.SEND_CEILING_MS`) Confirm is
   * busy and inert, and after a RESULT_CHANGED refusal it stays disabled
   * until the newer result is on screen (`waitingForNewResult`): a tap then
   * is silently lost and would read as an app timeout on the summary wait.
   * So this never taps a busy or disabled Confirm and never presses twice.
   * Returns the presses made (1), which the caller records
   * (`ui:tk-confirm-one-press`); the caller's wait for the verdict covers
   * `TK_CONFIRM_SETTLE_MS`.
   */
  async confirmOnce(timeoutMs = 25_000): Promise<number> {
    const q: Query = { ...TK_UI.confirm, enabled: true };
    const start = Date.now();
    for (;;) {
      const at = Date.now();
      const els = await this.idb.describe();
      const btn = els.find((e) => matches(e, q));
      // An edit landing (TK-RC1) can move Confirm: pressed only where it holds still.
      if (btn && (await this.tapControl(q, btn, at, q))) return 1;
      if (Date.now() - start > timeoutMs) {
        const seen = els.find((e) => matches(e, TK_UI.confirm));
        throw new ExpectationTimeout("Blue's Confirm (confirm-result) offered and enabled", timeoutMs, {
          confirm: seen ? { enabled: seen.enabled ?? null, label: seen.AXLabel } : "absent",
          screen: summarise(els),
        });
      }
      await this.pause();
    }
  }

  /** Clock controls on screen (an athlete in timekeeper mode must have none). */
  async clockControls(): Promise<string[]> {
    const els = await this.idb.describe();
    return TK_UI.clockControls.filter((q) => els.some((e) => matches(e, q))).map((q) => q.id as string);
  }

  /** The TK-D9 chip's text or label, or null when it is not on screen. */
  async noContestChip(): Promise<string | null> {
    const el = await this.idb.find({ label: NO_CONTEST_CHIP_RE });
    return el?.AXLabel ?? null;
  }

  /** The TK-W1 pick deadline chip's text or label, or null when it is not on screen. */
  async deadlineChip(): Promise<string | null> {
    const el = await this.idb.find({ label: DEADLINE_CHIP_RE });
    return el?.AXLabel ?? null;
  }

  /**
   * Tap `el`, found by `q` in a read that started at `at`: on screen, once it
   * holds still (`tapWhenStill`); off screen, brought into view by
   * `Idb.scrollTo(scrollQ)` (which finds it even while busy, and waits for
   * it to settle) and tapped only if what it brought into view still matches
   * `q` (an enabled control). False when nothing was tapped (it moved for
   * too long, went away or turned busy or disabled): the caller reads again.
   */
  private async tapControl(q: Query, el: AXElement, at: number, scrollQ: Query): Promise<boolean> {
    if (!this.idb.onScreen(el)) {
      const shown = await this.idb.scrollTo(scrollQ);
      if (!matches(shown, q)) return false;
      await this.idb.tap(shown);
      return true;
    }
    return !!(await tapWhenStill(this.idb, q, { el, at }, this.timing.still));
  }

  /** Wait for `q` and tap it once (`tapControl`); throws `ExpectationTimeout` naming `what`. */
  private async tapWhenReady(q: Query, timeoutMs: number, what: string): Promise<void> {
    const start = Date.now();
    for (;;) {
      const at = Date.now();
      const els = await this.idb.describe();
      const el = els.find((e) => matches(e, q));
      if (el && (await this.tapControl(q, el, at, q))) return;
      if (Date.now() - start > timeoutMs) throw new ExpectationTimeout(what, timeoutMs, summarise(els));
      await this.pause();
    }
  }

  private pause(): Promise<void> {
    return new Promise((r) => setTimeout(r, this.timing.pollMs));
  }
}
