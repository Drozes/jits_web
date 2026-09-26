/**
 * Page objects for the mobile app, driven through idb's accessibility tree.
 *
 * Selectors prefer testIDs (AXUniqueId). Where the app only has an
 * accessibility label, labels are matched case-insensitively (text-transform
 * uppercases rendered text) and filtered to Buttons where it matters.
 */
import { Idb, summarise, type AXElement } from "./idb";
import type { Simctl } from "./simctl";
import { ExpectationTimeout, HarnessError } from "../lib/util";

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

export class Screens {
  constructor(
    readonly idb: Idb,
    readonly simctl: Simctl,
  ) {}

  // --- global ---------------------------------------------------------------

  async tab(name: "Home" | "Arena" | "Rankings" | "Profile"): Promise<void> {
    await this.idb.dismissLogBox();
    await this.idb.tapQ({ label: name, type: "Button" }, 15_000);
  }

  /** The header LIVE pill (testID live-header-signal). */
  async isLivePillVisible(els?: AXElement[]): Promise<boolean> {
    return !!(await this.idb.find({ id: "live-header-signal" }, els));
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

  /** Go live through the UI if not already, and wait for the pill. */
  async ensureLive(): Promise<void> {
    const els = await this.idb.describe();
    const goLive = await this.idb.find({ label: "Go live", type: "Button" }, els);
    if (goLive) await this.idb.tap(goLive);
    await this.idb.waitFor({ id: "live-header-signal" }, 15_000);
    await this.idb.waitFor({ label: "Go offline", type: "Button" }, 15_000);
  }

  async ensureOffline(): Promise<void> {
    const els = await this.idb.describe();
    const off = await this.idb.find({ label: "Go offline", type: "Button" }, els);
    if (off) await this.idb.tap(off);
    await this.idb.waitFor({ label: "Go live", type: "Button" }, 15_000);
    await this.idb.waitGone({ id: "live-header-signal" }, 10_000);
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
   * The gorhom BottomSheetModal exposes itself as one "Bottom Sheet" slider
   * and hides its children from the accessibility tree, so the prompt's
   * Accept / Decline buttons are NOT reachable by label (nor by VoiceOver).
   * Fallback: locate the sheet by its handle and tap by offset. Offsets are
   * from the prompt layout (buttons row ~160pt below the handle top).
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

  private async tapPromptButton(label: "Accept challenge" | "Decline challenge", xFrac: number): Promise<void> {
    // Let the sheet finish its present animation.
    await new Promise((r) => setTimeout(r, 600));
    const els = await this.idb.describe();
    const btn = await this.idb.find({ label, type: "Button" }, els);
    if (btn) return this.idb.tap(btn);
    const sheet = this.promptSheet(els);
    if (!sheet) throw new ExpectationTimeout("the incoming challenge prompt", 0, summarise(els));
    await this.idb.tapXY(sheet.frame.x + sheet.frame.width * xFrac, sheet.frame.y + 160);
  }

  async acceptPrompt(): Promise<void> {
    await this.tapPromptButton("Accept challenge", 0.74);
  }

  async declinePrompt(): Promise<void> {
    await this.tapPromptButton("Decline challenge", 0.26);
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
    await this.idb.tapQ({ id: "result-outcome-submission" });
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

  async recordSubmission(winnerId: string, code: string, finishTime: string): Promise<void> {
    await this.idb.tapQ({ id: "result-outcome-submission" });
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
