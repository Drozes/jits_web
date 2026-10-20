/**
 * idb element matching (node:test, run via `npm run match-loop:test`).
 * Pure: no simulator.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { describeQuery, Idb, logBoxInspectorMinimize, logBoxOver, matches, tapPoint, type AXElement } from "../sim/idb";

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
