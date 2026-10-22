/**
 * fb-idb driver. The `idb` console script is broken on Python 3.14 (no event
 * loop in the main thread), so the client is invoked through a one-line shim
 * that installs a loop first, via execFile (no shell, so arguments are never
 * re-parsed). Every command line is redacted before it is logged.
 */
import { appendFileSync } from "node:fs";
import { redact } from "../lib/redact";
import { ExpectationTimeout, HarnessError, run } from "../lib/util";

const SHIM =
  "import asyncio,sys; asyncio.set_event_loop(asyncio.new_event_loop()); " +
  "from idb.cli.main import main; sys.argv=['idb']+sys.argv[1:]; sys.exit(main())";

export interface AXElement {
  AXLabel: string | null;
  AXUniqueId: string | null;
  AXValue: string | null;
  type: string;
  role?: string;
  enabled?: boolean;
  frame: { x: number; y: number; width: number; height: number };
}

export interface Query {
  /** testID (AXUniqueId), exact. */
  id?: string;
  /** Accessibility label: string = case-insensitive exact, RegExp = test. */
  label?: string | RegExp;
  /** Element type, e.g. "Button", "StaticText", "TextField". */
  type?: string;
  /**
   * Accessibility value (AXValue), case-insensitive exact. The header status
   * chip reports "live" / "offline" here whatever its copy says.
   */
  value?: string;
  /**
   * true: only an element that is not reported disabled (one idb reports
   * with no `enabled` field counts as enabled). The app's live toggle is
   * disabled while it saves and for 2s after each transition, and a tap on
   * it then is ignored, so taps on it wait for this.
   */
  enabled?: boolean;
}

export function describeQuery(q: Query): string {
  const parts: string[] = [];
  if (q.id) parts.push(`#${q.id}`);
  if (q.label !== undefined) parts.push(`label=${q.label instanceof RegExp ? q.label : JSON.stringify(q.label)}`);
  if (q.type) parts.push(`type=${q.type}`);
  if (q.value !== undefined) parts.push(`value=${JSON.stringify(q.value)}`);
  if (q.enabled) parts.push("enabled");
  return parts.join(" ");
}

export function matches(el: AXElement, q: Query): boolean {
  if (q.id && el.AXUniqueId !== q.id) return false;
  if (q.enabled && el.enabled === false) return false;
  // RN Pressables surface as Button, Link, Slider or GenericElement depending
  // on what else is mounted, so "Button" means any interactive-ish element.
  if (q.type === "Button") {
    if (el.type === "StaticText" || el.type === "Application") return false;
  } else if (q.type && el.type !== q.type) return false;
  if (q.value !== undefined && (el.AXValue ?? "").toLowerCase() !== q.value.toLowerCase()) {
    return false;
  }
  if (q.label !== undefined) {
    const label = el.AXLabel ?? "";
    if (q.label instanceof RegExp) {
      if (!q.label.test(label)) return false;
    } else if (label.toLowerCase() !== q.label.toLowerCase()) {
      return false;
    }
  }
  return true;
}

export class Idb {
  /** Screen height, learned from the Application element. */
  screenH = 874;
  screenW = 402;

  constructor(
    private readonly udid: string,
    private readonly python: string,
    private readonly cmdLog: string | null = null,
  ) {}

  private async idb(args: string[], timeoutMs = 30_000): Promise<string> {
    if (this.cmdLog) appendFileSync(this.cmdLog, redact(`${new Date().toISOString()} idb ${args.join(" ")}\n`));
    const { stdout } = await run(this.python, ["-c", SHIM, ...args], { timeoutMs });
    return stdout;
  }

  async describe(): Promise<AXElement[]> {
    const out = await this.idb(["ui", "describe-all", "--udid", this.udid]);
    try {
      const els = JSON.parse(out) as AXElement[];
      const app = els.find((e) => e.type === "Application");
      if (app) {
        this.screenH = app.frame.height || this.screenH;
        this.screenW = app.frame.width || this.screenW;
      }
      return els;
    } catch {
      throw new HarnessError(`idb describe-all returned non-JSON: ${out.slice(0, 200)}`);
    }
  }

  async find(q: Query, els?: AXElement[]): Promise<AXElement | undefined> {
    return (els ?? (await this.describe())).find((e) => matches(e, q));
  }

  async findAll(q: Query, els?: AXElement[]): Promise<AXElement[]> {
    return (els ?? (await this.describe())).filter((e) => matches(e, q));
  }

  /** True when the element's centre is inside the visible band. */
  onScreen(el: AXElement, topInset = 60, bottomInset = 100): boolean {
    const cy = el.frame.y + el.frame.height / 2;
    return cy > topInset && cy < this.screenH - bottomInset && el.frame.width > 0;
  }

  async tapXY(x: number, y: number): Promise<void> {
    await this.idb(["ui", "tap", "--udid", this.udid, String(Math.round(x)), String(Math.round(y))]);
  }

  async tap(el: AXElement): Promise<void> {
    const p = tapPoint(el);
    await this.tapXY(p.x, p.y);
  }

  /** Press and hold an element's frame centre for `seconds` (idb `ui tap --duration`). */
  async longPress(el: AXElement, seconds: number): Promise<void> {
    const x = el.frame.x + el.frame.width / 2;
    const y = el.frame.y + el.frame.height / 2;
    await this.idb(["ui", "tap", "--duration", String(seconds), "--udid", this.udid, String(Math.round(x)), String(Math.round(y))]);
  }

  /** Wait for an element, then tap its frame centre. */
  async tapQ(q: Query, timeoutMs = 10_000): Promise<AXElement> {
    const el = await this.waitFor(q, timeoutMs);
    await this.tap(el);
    return el;
  }

  /**
   * Type into the focused field. The text is redacted from every log the
   * harness writes, BUT it is passed on idb's argv (idb has no stdin mode for
   * `ui text`), so while this call runs the value is visible to anyone who can
   * list processes on this machine (`ps`). Acceptable for the local-only seed
   * password; never use this for a real credential.
   */
  async typeText(text: string): Promise<void> {
    await this.idb(["ui", "text", "--udid", this.udid, text]);
  }

  /**
   * Delete up to `n` characters on each side of the caret in the focused
   * field (HID Backspace 42, then Delete Forward 76).
   */
  async clearFocused(n: number): Promise<void> {
    if (n <= 0) return;
    const keys = [...Array(n).fill("42"), ...Array(n).fill("76")];
    await this.idb(["ui", "key-sequence", "--udid", this.udid, ...keys]);
  }

  async swipe(x1: number, y1: number, x2: number, y2: number, durationS = 0.3): Promise<void> {
    await this.idb([
      "ui", "swipe", "--udid", this.udid, "--duration", String(durationS),
      String(Math.round(x1)), String(Math.round(y1)), String(Math.round(x2)), String(Math.round(y2)),
    ]);
  }

  async home(): Promise<void> {
    await this.idb(["ui", "button", "--udid", this.udid, "HOME"]);
  }

  async waitFor(q: Query, timeoutMs = 10_000, intervalMs = 350): Promise<AXElement> {
    const start = Date.now();
    let last: AXElement[] = [];
    for (;;) {
      last = await this.describe();
      const hit = last.find((e) => matches(e, q));
      if (hit) return hit;
      if (Date.now() - start > timeoutMs) {
        throw new ExpectationTimeout(`UI element ${describeQuery(q)}`, timeoutMs, summarise(last));
      }
      await new Promise((r) => setTimeout(r, intervalMs));
    }
  }

  async waitGone(q: Query, timeoutMs = 10_000): Promise<void> {
    const start = Date.now();
    for (;;) {
      const els = await this.describe();
      if (!els.some((e) => matches(e, q))) return;
      if (Date.now() - start > timeoutMs) {
        throw new ExpectationTimeout(`UI element ${describeQuery(q)} to disappear`, timeoutMs, summarise(els));
      }
      await new Promise((r) => setTimeout(r, 350));
    }
  }

  /** Wait until any of several queries matches; returns the index that hit. */
  async waitAny(qs: Query[], timeoutMs = 10_000): Promise<{ index: number; el: AXElement }> {
    const start = Date.now();
    for (;;) {
      const els = await this.describe();
      for (let i = 0; i < qs.length; i++) {
        const el = els.find((e) => matches(e, qs[i]));
        if (el) return { index: i, el };
      }
      if (Date.now() - start > timeoutMs) {
        throw new ExpectationTimeout(`any of ${qs.map(describeQuery).join(" | ")}`, timeoutMs, summarise(els));
      }
      await new Promise((r) => setTimeout(r, 350));
    }
  }

  /**
   * Scroll the main scroll view until the element's centre is on screen.
   * Swipes up (content moves up) by default.
   */
  async scrollTo(q: Query, maxSwipes = 8, direction: "up" | "down" = "up", bottomInset = 50): Promise<AXElement> {
    let lastY: number | null = null;
    for (let i = 0; i <= maxSwipes; i++) {
      const el = await this.settled(q);
      if (el && this.onScreen(el, 60, bottomInset)) return el;
      // Content cannot scroll further: take it if it is inside the screen at all.
      if (el && lastY !== null && Math.abs(el.frame.y - lastY) < 1 && this.onScreen(el, 60, 20)) return el;
      lastY = el ? el.frame.y : null;
      if (i === maxSwipes) break;
      const x = this.screenW / 2;
      const [from, to] =
        direction === "up" ? [this.screenH * 0.7, this.screenH * 0.35] : [this.screenH * 0.35, this.screenH * 0.7];
      await this.swipe(x, from, x, to, 0.25);
    }
    throw new ExpectationTimeout(`UI element ${describeQuery(q)} after scrolling`, maxSwipes, null);
  }

  /**
   * The element once its frame has stopped moving (scroll momentum, layout
   * animation): two consecutive reads within 1pt. Undefined if absent.
   */
  async settled(q: Query, timeoutMs = 3_000): Promise<AXElement | undefined> {
    const start = Date.now();
    let prev = (await this.describe()).find((e) => matches(e, q));
    while (prev && Date.now() - start < timeoutMs) {
      await new Promise((r) => setTimeout(r, 150));
      const cur = (await this.describe()).find((e) => matches(e, q));
      if (!cur) return undefined;
      if (Math.abs(cur.frame.y - prev.frame.y) < 1 && Math.abs(cur.frame.x - prev.frame.x) < 1) return cur;
      prev = cur;
    }
    return prev;
  }

  /** Pull-to-refresh on the current scroll view. */
  async pullToRefresh(): Promise<void> {
    const x = this.screenW / 2;
    await this.swipe(x, this.screenH * 0.25, x, this.screenH * 0.75, 0.4);
  }

  /**
   * Close the dev-build LogBox toast ("Open debugger to view warnings"): it
   * sits over the tab bar and swallows taps meant for the tabs. Tapping its
   * right edge hits the close glyph. A tap that misses the glyph opens the
   * full-screen LogBox inspector instead, which swallows every tap after it,
   * so an open inspector is minimised first (back to the toast), then the
   * toast is closed. Returns true when either was closed.
   */
  async dismissLogBox(els?: AXElement[]): Promise<boolean> {
    let all = els ?? (await this.describe());
    let closed = false;
    const minimize = logBoxInspectorMinimize(all);
    if (minimize) {
      await this.tap(minimize);
      closed = true;
      await new Promise((r) => setTimeout(r, 400));
      all = await this.describe();
    }
    const toast = all.find(isLogBox);
    if (!toast) return closed;
    await this.tapXY(toast.frame.x + toast.frame.width - 24, toast.frame.y + toast.frame.height / 2);
    return true;
  }

  /**
   * A system sheet from another process (iOS "Save Password?") hides the
   * app's whole tree: describe-all returns only the Application element.
   * A splash / cold launch looks the same for a moment, so this only acts
   * when the tree has stayed empty for `settleMs` (a splash resolves, the
   * sheet does not), and only when the caller says such a sheet is plausible
   * right now (after a sign-in). It then taps where "Not Now" sits.
   */
  async dismissForeignSheet(settleMs = 6_000): Promise<boolean> {
    const start = Date.now();
    while (Date.now() - start < settleMs) {
      const els = await this.describe();
      if (els.length > 1) return false;
      await new Promise((r) => setTimeout(r, 500));
    }
    await this.tapXY(this.screenW * 0.316, this.screenH * 0.634);
    return true;
  }

  /**
   * Dismiss stray alerts the harness did not ask for (a leftover RN Alert, a
   * permission prompt that leaked into the app's tree). Returns the labels
   * tapped. Only well-known, safe answers are pressed.
   */
  async dismissSystemAlerts(): Promise<string[]> {
    const safe = [/^don.t allow$/i, /^not now$/i, /^ok$/i, /^keep waiting$/i, /^cancel$/i, /^close$/i];
    const tapped: string[] = [];
    for (let i = 0; i < 3; i++) {
      const els = await this.describe();
      // An alert shows up as buttons with no testID over the whole screen; only
      // act when a known alert title-ish text is present alongside the button.
      // A modal alert hides the rest of the tree: no tab bar, no header.
      const tabsVisible = els.some((e) => e.AXLabel === "Home" && (e.type === "Button" || e.type === "Link"));
      const alertish =
        els.some((e) => e.type === "Alert" || /would like to|are you sure/i.test(e.AXLabel ?? "")) ||
        (!tabsVisible && els.filter((e) => e.type === "Button").length <= 3 && els.length <= 8);
      if (!alertish) break;
      const btn = els.find((e) => e.type === "Button" && safe.some((r) => r.test(e.AXLabel ?? "")));
      if (!btn) break;
      await new Promise((r) => setTimeout(r, 400));
      await this.tap(btn);
      tapped.push(btn.AXLabel ?? "?");
      await new Promise((r) => setTimeout(r, 600));
    }
    return tapped;
  }
}

/** A dev-build LogBox toast ("Open debugger to view warnings"). */
export function isLogBox(e: AXElement): boolean {
  return /open debugger to view/i.test(e.AXLabel ?? "");
}

/** Where `Idb.tap` presses an element: its frame's centre. */
export function tapPoint(e: AXElement): { x: number; y: number } {
  return { x: e.frame.x + e.frame.width / 2, y: e.frame.y + e.frame.height / 2 };
}

/** True when the point is inside the element's frame (edges included). */
export function frameContains(e: AXElement, p: { x: number; y: number }): boolean {
  const f = e.frame;
  return p.x >= f.x && p.x <= f.x + f.width && p.y >= f.y && p.y <= f.y + f.height;
}

/** True when two reads put an element in the same place (every edge within 1 pt). */
export function sameFrame(a: AXElement, b: AXElement): boolean {
  const f = a.frame;
  const g = b.frame;
  return Math.abs(f.x - g.x) < 1 && Math.abs(f.y - g.y) < 1 && Math.abs(f.width - g.width) < 1 && Math.abs(f.height - g.height) < 1;
}

/** When `tapWhenStill` taps. Tests shorten all three. */
export interface StillTiming {
  /** The element must have kept one frame across reads that started at least this far apart. */
  stillMs: number;
  /** Between reads. */
  gapMs: number;
  /** Give up, with no tap, when the element has not held still for this long. */
  timeoutMs: number;
}

/**
 * One confirming read after the caller's (a read takes about 200 ms on a
 * simulator), so a tap waits about a third of a second for the screen to
 * settle after a bot action moved it.
 */
export const STILL_TIMING: StillTiming = { stillMs: 300, gapMs: 150, timeoutMs: 3_000 };

/**
 * Tap the element `q` finds, but only once the screen holds it still. A tap
 * goes to a point computed from a read that is already a few hundred ms old
 * when idb taps, and a bot action can move the screen in between: in the
 * Wave 3 gate (T10) a notice above TK-F4 went away after the read, the two
 * buttons moved up, and the tap meant for TK-F4 landed on "Doesn't look
 * right" and flagged the opponent. So this reads again, right before the
 * tap, and taps only when the element is still where an earlier read put it
 * and has stayed there for `stillMs`; then it taps the newest read's frame.
 *
 * `first` is the element as the caller's own read found it, with the time
 * that read started. Returns the element tapped, or undefined with NO tap
 * when the element went away (or turned disabled, for a query that asks for
 * enabled) or kept moving for `timeoutMs`: the caller reads the screen
 * again and decides.
 */
export async function tapWhenStill(
  idb: Pick<Idb, "describe" | "tap">,
  q: Query,
  first: { el: AXElement; at: number },
  timing: StillTiming = STILL_TIMING,
): Promise<AXElement | undefined> {
  const start = Date.now();
  let held = first.el;
  let since = first.at;
  for (;;) {
    await new Promise((r) => setTimeout(r, timing.gapMs));
    const at = Date.now();
    const cur = (await idb.describe()).find((e) => matches(e, q));
    if (!cur) return undefined;
    if (!sameFrame(cur, held)) {
      held = cur;
      since = at;
    } else if (at - since >= timing.stillMs) {
      await idb.tap(cur);
      return cur;
    }
    if (Date.now() - start > timing.timeoutMs) return undefined;
  }
}

/** The LogBox toast lying over a point, i.e. the toast that would take a tap there. */
export function logBoxOver(els: AXElement[], p: { x: number; y: number }): AXElement | undefined {
  return els.find((e) => isLogBox(e) && frameContains(e, p));
}

/**
 * The open LogBox inspector's Minimize button, or undefined when the
 * inspector is not open. The inspector (react-native
 * Libraries/LogBox/UI/LogBoxInspectorHeader.js and
 * LogBoxInspectorFooter.js) has a "Log <n> of <total>" title and Dismiss /
 * Minimize footer buttons and no testIDs; both the title and Minimize must be
 * on screen, so no app screen can pass for it (the app has neither label).
 */
export function logBoxInspectorMinimize(els: AXElement[]): AXElement | undefined {
  if (!els.some((e) => /^Log \d+ of \d+$/.test(e.AXLabel ?? ""))) return undefined;
  return els.find((e) => e.AXLabel === "Minimize" && e.type !== "StaticText") ?? els.find((e) => e.AXLabel === "Minimize");
}

/** Compact dump of a screen for evidence: type, label, id. */
export function summarise(els: AXElement[]): string[] {
  return els
    .filter((e) => e.type !== "Application")
    .map((e) => `${e.type}:${e.AXLabel ?? ""}${e.AXUniqueId ? `#${e.AXUniqueId}` : ""}`)
    .slice(0, 80);
}
