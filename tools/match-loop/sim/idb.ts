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
}

export function describeQuery(q: Query): string {
  const parts: string[] = [];
  if (q.id) parts.push(`#${q.id}`);
  if (q.label !== undefined) parts.push(`label=${q.label instanceof RegExp ? q.label : JSON.stringify(q.label)}`);
  if (q.type) parts.push(`type=${q.type}`);
  return parts.join(" ");
}

export function matches(el: AXElement, q: Query): boolean {
  if (q.id && el.AXUniqueId !== q.id) return false;
  // RN Pressables surface as Button, Link, Slider or GenericElement depending
  // on what else is mounted, so "Button" means any interactive-ish element.
  if (q.type === "Button") {
    if (el.type === "StaticText" || el.type === "Application") return false;
  } else if (q.type && el.type !== q.type) return false;
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
    await this.tapXY(el.frame.x + el.frame.width / 2, el.frame.y + el.frame.height / 2);
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
   * right edge hits the close glyph. Returns true when one was closed.
   */
  async dismissLogBox(els?: AXElement[]): Promise<boolean> {
    const all = els ?? (await this.describe());
    const toast = all.find((e) => /open debugger to view/i.test(e.AXLabel ?? ""));
    if (!toast) return false;
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

/** Compact dump of a screen for evidence: type, label, id. */
export function summarise(els: AXElement[]): string[] {
  return els
    .filter((e) => e.type !== "Application")
    .map((e) => `${e.type}:${e.AXLabel ?? ""}${e.AXUniqueId ? `#${e.AXUniqueId}` : ""}`)
    .slice(0, 80);
}
