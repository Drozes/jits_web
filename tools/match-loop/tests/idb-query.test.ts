/**
 * idb element matching (node:test, run via `npm run match-loop:test`).
 * Pure: no simulator.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { describeQuery, matches, type AXElement } from "../sim/idb";

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
