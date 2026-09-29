/**
 * Page objects for the mobile app, driven through idb's accessibility tree.
 *
 * Selectors prefer testIDs (AXUniqueId). Where the app only has an
 * accessibility label, labels are matched case-insensitively (text-transform
 * uppercases rendered text) and filtered to Buttons where it matters.
 */
import { Idb, summarise, type AXElement, type Query } from "./idb";
import type { Simctl } from "./simctl";
import { ExpectationTimeout, HarnessError } from "../lib/util";
import { PROMPT_INPUT_GUARD_MS } from "../../../apps/mobile/lib/arena/constants";

/**
 * How long to wait after the prompt is detected before trying its buttons:
 * the app's input guard (AC-S3, imported so the two cannot drift) plus a
 * margin. The tap also waits for the button to report itself enabled (the
 * sheet disables its buttons for the guard), so a prompt detected late or
 * re-presented still lands; this floor only saves idb round trips.
 */
export const PROMPT_TAP_DELAY_MS = PROMPT_INPUT_GUARD_MS + 250;

export type WizardStep = "wait" | "weight" | "ready" | "live" | "end" | "result" | "confirm" | "summary";

const STEP_BY_LABEL: Record<string, WizardStep> = {
  waiting: "wait",
  weights: "weight",
  ready: "ready",
  live: "live",
  ended: "end",
  result: "result",
  confirm: "confirm",
  summary: "summary",
};

const VERDICT_RE = /^(YOU WON|YOU LOST|DRAW|DISPUTED|MATCH COMPLETE)$/i;

export interface SummaryView {
  verdict: string | null;
  eloDelta: string | null;
  hasExit: boolean;
}

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

  async tab(name: "Home" | "Arena" | "Rankings" | "Profile"): Promise<void> {
    await this.idb.dismissLogBox();
    await this.idb.tapQ({ label: name, type: "Button" }, 15_000);
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
    if (await this.idb.find({ label: "Go live", type: "Button" }, els)) {
      await this.idb.tapQ({ label: "Go live", type: "Button", enabled: true }, 15_000);
    }
    await this.idb.waitFor(LIVE_CHIP, 15_000);
    await this.idb.waitFor({ label: "Go offline", type: "Button" }, 15_000);
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
   * The sheet's drag handle. Since jits-ef2a the prompt's Accept / Decline
   * buttons are exposed by label (the sheet no longer collapses its children
   * into one "Bottom Sheet" element), and they are the only way the harness
   * answers a prompt. The handle is kept as a second visibility signal, so a
   * prompt whose buttons are momentarily missing from a describe still counts
   * as up.
   */
  private promptSheet(els: AXElement[]): AXElement | undefined {
    return els.find((e) => e.AXLabel === "Bottom sheet handle" && e.frame.y < this.idb.screenH - 40);
  }

  async isPromptVisible(els?: AXElement[]): Promise<boolean> {
    const all = els ?? (await this.idb.describe());
    return !!(await this.idb.find({ label: "Accept challenge", type: "Button" }, all)) || !!this.promptSheet(all);
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
      await this.idb.tapQ({ label, type: "Button", enabled: true }, timeoutMs);
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
   * Current wizard step. The step marker is a Text; iOS does not surface a
   * Text's testID through idb, so the marker's accessibility label
   * ("Step N of 8, <Label>") is the primary signal and the testID a fallback.
   */
  async currentStep(els?: AXElement[]): Promise<WizardStep | null> {
    const all = els ?? (await this.idb.describe());
    for (const e of all) {
      const m = (e.AXLabel ?? "").match(/^Step \d+ of \d+, (\w+)$/);
      if (m && STEP_BY_LABEL[m[1].toLowerCase()]) return STEP_BY_LABEL[m[1].toLowerCase()];
      if (e.AXUniqueId?.startsWith("match-step-")) return e.AXUniqueId.slice("match-step-".length) as WizardStep;
    }
    return null;
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

  async confirmWeights(): Promise<void> {
    await this.idb.tapQ({ id: "weight-confirm" }, 10_000);
  }

  async tapReady(): Promise<void> {
    await this.idb.tapQ({ id: "ready-button" }, 10_000);
  }

  /** The ready step's Opponent panel (testID ready-panel-opponent, label "Opponent, ready"). */
  async waitOpponentReady(timeoutMs: number): Promise<void> {
    const start = Date.now();
    for (;;) {
      const els = await this.idb.describe();
      const panel =
        els.find((e) => e.AXUniqueId === "ready-panel-opponent") ??
        els.find((e) => /^opponent, (ready|waiting)$/i.test(e.AXLabel ?? ""));
      if (panel && /, ready$/i.test(panel.AXLabel ?? "")) return;
      if (Date.now() - start > timeoutMs) throw new ExpectationTimeout("opponent panel to show Ready", timeoutMs, summarise(els));
      await new Promise((r) => setTimeout(r, 350));
    }
  }

  /** "Cancel match" -> alert -> "Cancel Match". */
  async cancelMatch(): Promise<void> {
    await this.idb.tapQ({ label: "Cancel match", type: "Button" });
    await this.tapAlertButton("Cancel Match", "Keep Waiting");
  }

  async pauseToggle(): Promise<void> {
    await this.idb.tapQ({ id: "live-pause-toggle" });
  }

  /** "PAUSE" or "RESUME" as the live toggle currently reads. */
  async pauseLabel(): Promise<string | null> {
    return (await this.idb.find({ id: "live-pause-toggle" }))?.AXLabel?.toUpperCase() ?? null;
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

  async endMatch(): Promise<void> {
    await this.idb.tapQ({ id: "live-end" });
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
   * Focus a text field and type into it, verifying the value landed (a type
   * issued before focus settles is silently dropped). Retries up to 3 times.
   */
  async fillField(id: string, text: string): Promise<void> {
    for (let attempt = 0; attempt < 3; attempt++) {
      const field = await this.idb.scrollTo({ id });
      await this.idb.tap(field);
      // Let focus land; then verify rather than trust.
      await new Promise((r) => setTimeout(r, 600 + attempt * 400));
      await this.idb.typeText(text);
      const start = Date.now();
      while (Date.now() - start < 2_000) {
        const el = await this.idb.find({ id });
        if ((el?.AXValue ?? "").includes(text)) return;
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
    const d = els.find((e) => e.AXUniqueId === "summary-elo-delta") ?? els.find((e) => e.type === "StaticText" && /^[▲▼]/.test(e.AXLabel ?? ""));
    const exit = els.find((e) => e.AXUniqueId === "summary-exit");
    return { verdict: v?.AXLabel ?? null, eloDelta: d?.AXLabel ?? null, hasExit: !!exit };
  }

  async exitSummary(): Promise<void> {
    const el = await this.idb.scrollTo({ id: "summary-exit" });
    await this.idb.tap(el);
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
