/**
 * idb element matching (node:test, run via `npm run match-loop:test`).
 * Pure: no simulator.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { describeQuery, Idb, logBoxInspectorMinimize, logBoxOver, matches, sameFrame, tapPoint, tapWhenStill, type AXElement, type Query, type StillTiming } from "../sim/idb";

function el(over: Partial<AXElement> = {}): AXElement {
  return {
    AXLabel: "Go live",
    AXUniqueId: null,
    AXValue: null,
    type: "Button",
    frame: { x: 0, y: 0, width: 100, height: 44 },
    ...over,
  };
}

test("enabled: true skips an element reported disabled (the live toggle's cooldown)", () => {
  const q = { label: "Go live", type: "Button", enabled: true };
  assert.equal(matches(el({ enabled: false }), q), false);
  assert.equal(matches(el({ enabled: true }), q), true);
});

test("enabled: true treats an element with no enabled field as enabled", () => {
  assert.equal(matches(el(), { label: "Go live", enabled: true }), true);
});

test("without enabled, a disabled element still matches (waits on presence only)", () => {
  assert.equal(matches(el({ enabled: false }), { label: "Go live", type: "Button" }), true);
});

test("describeQuery names the enabled requirement", () => {
  assert.equal(describeQuery({ label: "Go live", enabled: true }), 'label="Go live" enabled');
});

test("value matches AXValue case-insensitively (the header chip's live/offline)", () => {
  const chip = el({ AXLabel: "Live status: 3 on the mat. Open live menu", AXUniqueId: "header-status-chip", AXValue: "live" });
  assert.equal(matches(chip, { id: "header-status-chip", value: "live" }), true);
  assert.equal(matches(chip, { id: "header-status-chip", value: "LIVE" }), true);
  assert.equal(matches({ ...chip, AXValue: "offline" }, { id: "header-status-chip", value: "live" }), false);
  assert.equal(matches({ ...chip, AXValue: null }, { id: "header-status-chip", value: "live" }), false);
});

test("the header chip never answers the Arena toggle's exact Go live / Go offline queries", () => {
  const chip = el({ AXLabel: "Live status: 12 on the mat. Go live", AXUniqueId: "header-status-chip", AXValue: "offline" });
  assert.equal(matches(chip, { label: "Go live", type: "Button" }), false);
  assert.equal(matches({ ...chip, AXLabel: "Live status: 12 on the mat. Open live menu" }, { label: "Go offline", type: "Button" }), false);
  assert.equal(matches({ ...chip, AXLabel: "Live status: waiting for Alex, 8 minutes left. Open Arena" }, { label: /^Waiting for / }), false);
});

test("describeQuery names the value requirement", () => {
  assert.equal(describeQuery({ id: "header-status-chip", value: "live" }), '#header-status-chip value="live"');
});

// --- dev-build LogBox ---------------------------------------------------------------

const toast = el({ AXLabel: "! Open debugger to view warnings.", type: "GenericElement", frame: { x: 8, y: 780, width: 386, height: 48 } });

test("logBoxOver finds a toast only when its frame holds the point", () => {
  assert.equal(logBoxOver([toast], { x: 200, y: 800 }), toast);
  assert.equal(logBoxOver([toast], { x: 200, y: 600 }), undefined);
  // A control in the same place is not a toast.
  assert.equal(logBoxOver([el({ frame: toast.frame })], { x: 200, y: 800 }), undefined);
});

test("tapPoint is the frame's centre (where Idb.tap presses)", () => {
  assert.deepEqual(tapPoint(el({ frame: { x: 10, y: 300, width: 100, height: 44 } })), { x: 60, y: 322 });
});

test("the LogBox inspector needs both its Log n of m title and Minimize", () => {
  const title = el({ AXLabel: "Log 1 of 3", type: "StaticText" });
  const minimize = el({ AXLabel: "Minimize" });
  assert.equal(logBoxInspectorMinimize([title, el({ AXLabel: "Dismiss" }), minimize]), minimize);
  assert.equal(logBoxInspectorMinimize([minimize]), undefined);
  assert.equal(logBoxInspectorMinimize([title]), undefined);
  assert.equal(logBoxInspectorMinimize([el({ AXLabel: "Log 1 of 3 matches" }), minimize]), undefined);
});

/** An Idb that serves screens in order and records tap points, with no simulator. */
class ScriptedIdb extends Idb {
  readonly tapped: Array<{ x: number; y: number }> = [];
  constructor(private readonly screens: AXElement[][]) {
    super("udid", "python");
  }
  override async describe(): Promise<AXElement[]> {
    return this.screens.shift() ?? [];
  }
  override async tapXY(x: number, y: number): Promise<void> {
    this.tapped.push({ x, y });
  }
}

test("dismissLogBox closes a toast with its right-edge close glyph", async () => {
  const idb = new ScriptedIdb([[toast]]);
  assert.equal(await idb.dismissLogBox(), true);
  assert.deepEqual(idb.tapped, [{ x: 8 + 386 - 24, y: 804 }]);
});

test("dismissLogBox minimises an open inspector first, then closes the toast it returns to", async () => {
  const minimize = el({ AXLabel: "Minimize", frame: { x: 201, y: 800, width: 201, height: 48 } });
  const idb = new ScriptedIdb([[el({ AXLabel: "Log 1 of 1", type: "StaticText" }), minimize], [toast]]);
  assert.equal(await idb.dismissLogBox(), true);
  assert.deepEqual(idb.tapped, [tapPoint(minimize), { x: 8 + 386 - 24, y: 804 }]);
});

test("dismissLogBox with no LogBox taps nothing", async () => {
  const idb = new ScriptedIdb([[el()]]);
  assert.equal(await idb.dismissLogBox(), false);
  assert.deepEqual(idb.tapped, []);
});

// --- tapWhenStill: a tap only where the screen holds the control still (Wave 3 gate, T10) ---

/** The real on-screen band (an 874 pt screen: top 60 pt and bottom 100 pt are off screen). */
const BAND = new Idb("udid", "python3");

/** A screen that serves `reads` in turn (the last one repeats) and records each tap's frame. */
function stillScreen(reads: AXElement[][]) {
  let n = 0;
  const taps: AXElement[] = [];
  const idb = {
    async describe() {
      const r = reads[Math.min(n, reads.length - 1)];
      n++;
      return r;
    },
    async tap(e: AXElement) {
      taps.push(e);
    },
    onScreen: (e: AXElement) => BAND.onScreen(e),
  } as unknown as Pick<Idb, "describe" | "tap" | "onScreen">;
  return { idb, taps, reads: () => n };
}

const READY: Query = { label: "Weight looks right, I'm ready", enabled: true, type: "Button" };
const readyAt = (y: number, enabled = true) => el({ AXLabel: "Weight looks right, I'm ready", enabled, frame: { x: 16, y, width: 370, height: 72 } });
const QUICK: StillTiming = { stillMs: 0, gapMs: 1, timeoutMs: 100 };

test("sameFrame: every edge within 1 pt", () => {
  assert.equal(sameFrame(readyAt(700), readyAt(700.5)), true);
  assert.equal(sameFrame(readyAt(700), readyAt(640)), false);
  assert.equal(sameFrame(readyAt(700), el({ ...readyAt(700), frame: { x: 16, y: 700, width: 370, height: 60 } })), false, "a resize is a move");
});

test("tapWhenStill never taps on the caller's read alone: one more read must find the control in the same place", async () => {
  const s = stillScreen([[readyAt(700)]]);
  const tapped = await tapWhenStill(s.idb, READY, { el: readyAt(700), at: Date.now() }, QUICK);
  assert.equal(tapped?.frame.y, 700);
  assert.equal(s.reads(), 1, "exactly one confirming read");
  assert.deepEqual(s.taps.map((t) => t.frame.y), [700]);
});

test("tapWhenStill taps a control that moved where it settled, never where the first read put it (T10)", async () => {
  const s = stillScreen([[readyAt(640)], [readyAt(640)]]);
  const tapped = await tapWhenStill(s.idb, READY, { el: readyAt(700), at: Date.now() }, QUICK);
  assert.equal(tapped?.frame.y, 640);
  assert.equal(s.reads(), 2, "the move restarts the wait: a second read confirms the new place");
  assert.deepEqual(s.taps.map((t) => t.frame.y), [640]);
});

test("tapWhenStill waits stillMs of reads in one place before it taps", async () => {
  const s = stillScreen([[readyAt(700)]]);
  const t0 = Date.now();
  await tapWhenStill(s.idb, READY, { el: readyAt(700), at: t0 }, { stillMs: 40, gapMs: 5, timeoutMs: 1_000 });
  assert.ok(Date.now() - t0 >= 40, "not before the control held still for stillMs");
  assert.ok(s.reads() >= 2);
  assert.equal(s.taps.length, 1);
});

test("tapWhenStill never taps a control that settled outside the on-screen band (the LogBox toast's bottom band): the caller reads again and scrolls (W3FIX review minor 2)", async () => {
  assert.equal(BAND.onScreen(readyAt(700)), true, "the caller's read: on screen");
  assert.equal(BAND.onScreen(readyAt(800)), false, "settled: in the bottom band");
  const s = stillScreen([[readyAt(800)]]);
  assert.equal(await tapWhenStill(s.idb, READY, { el: readyAt(700), at: Date.now() }, QUICK), undefined);
  assert.deepEqual(s.taps, [], "no tap where onScreen says none goes");
  const top = stillScreen([[readyAt(10)]]);
  assert.equal(await tapWhenStill(top.idb, READY, { el: readyAt(700), at: Date.now() }, QUICK), undefined, "nor under the top band");
  assert.deepEqual(top.taps, []);
});

test("tapWhenStill taps nothing when the control goes, turns disabled, or never holds still", async () => {
  const gone = stillScreen([[]]);
  assert.equal(await tapWhenStill(gone.idb, READY, { el: readyAt(700), at: Date.now() }, QUICK), undefined);
  assert.equal(gone.taps.length, 0);
  const busy = stillScreen([[readyAt(700, false)]]);
  assert.equal(await tapWhenStill(busy.idb, READY, { el: readyAt(700), at: Date.now() }, QUICK), undefined, "a busy TK-F4 is never pressed");
  assert.equal(busy.taps.length, 0);
  let y = 700;
  const moving = {
    async describe() {
      y -= 10;
      return [readyAt(y)];
    },
    async tap() {
      throw new Error("tapped a moving control");
    },
  } as unknown as Pick<Idb, "describe" | "tap" | "onScreen">;
  assert.equal(await tapWhenStill(moving, READY, { el: readyAt(700), at: Date.now() }, { stillMs: 0, gapMs: 1, timeoutMs: 30 }), undefined);
});
