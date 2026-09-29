/**
 * The harness drives the app by accessibility label and testID (spec 9.3,
 * "Match-loop harness contract"). The app's components import React Native,
 * so they cannot load under node; this test reads their SOURCE instead and
 * pins every selector the harness depends on, so a relabel in the app fails
 * here (no simulator needed) instead of stalling a device run on a timeout.
 *
 * Pure: no simulator, no network.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { HEADER_CHIP_ID, HEADER_LIVE_DOT_ID, LIVE_CHIP } from "../sim/screens";
import { matches, type AXElement } from "../sim/idb";

const HERE = dirname(fileURLToPath(import.meta.url));
const MOBILE = resolve(HERE, "../../../apps/mobile");

function src(rel: string): string {
  return readFileSync(resolve(MOBILE, rel), "utf8");
}

// The chip component plus its pure model (states, copy and labels live in
// lib/arena/header-chip-model.ts; the component renders them).
const CHIP =
  src("components/layout/header-status-chip.tsx") + "\n" + src("lib/arena/header-chip-model.ts");
const LIVE_DOT = src("components/layout/header-live-dot.tsx");
const POPOVER = src("components/layout/live-menu-popover.tsx");
const MAT_BOARD = src("components/arena/mat-board.tsx");
const SHEET = src("components/arena/challenge-prompt-sheet.tsx");

test("the harness's header testIDs are the ones the app exports", () => {
  assert.match(CHIP, new RegExp(`HEADER_CHIP_TEST_ID = "${HEADER_CHIP_ID}"`));
  assert.match(LIVE_DOT, new RegExp(`HEADER_LIVE_DOT_TEST_ID = "${HEADER_LIVE_DOT_ID}"`));
  assert.equal(LIVE_CHIP.id, HEADER_CHIP_ID);
});

test("the chip reports live/offline through accessibilityValue (what LIVE_CHIP reads)", () => {
  assert.match(CHIP, /accessibilityValue=\{chipAccessibilityValue\(model\)\}/);
  assert.match(CHIP, /text: m\.live \? "live" : "offline"/);
  assert.equal(LIVE_CHIP.value, "live");
});

test("every chip label starts with the Live status prefix, so none is exactly Go live / Go offline", () => {
  assert.match(CHIP, /export const CHIP_LABEL_PREFIX = "Live status:"/);
  const labels = [...CHIP.matchAll(/accessibilityLabel:\s*(`[^`]*`|"[^"]*")/g)].map((m) => m[1]);
  assert.ok(labels.length >= 5, `expected the chip's state labels, found ${labels.length}`);
  for (const l of labels) {
    assert.ok(l.startsWith("`${CHIP_LABEL_PREFIX}"), `chip label ${l} does not use CHIP_LABEL_PREFIX`);
  }
  // The CONFIRM segment has its own fixed label.
  assert.match(CHIP, /accessibilityLabel="Confirm result"/);
});

test("the live popover's Go offline button carries a distinct label", () => {
  assert.match(POPOVER, /label="Go offline"\s+a11y="Live menu: go offline"/);
  assert.doesNotMatch(POPOVER, /accessibilityLabel="Go offline"/);
});

test("the Mat Board keeps the harness's Arena labels", () => {
  // Control bar: the segment that would change state carries the action.
  assert.match(MAT_BOARD, /live \? "Go live" : "Go offline"/);
  // Roster rows and the Closest Match CTA.
  assert.match(MAT_BOARD, /accessibilityLabel=\{`Challenge \$\{displayName\}`\}/);
  assert.match(MAT_BOARD, /`Challenge \$\{name\}`/);
  // Waiting strip: StaticText head + Cancel.
  assert.match(MAT_BOARD, /headAccessibilityLabel=\{`Waiting for \$\{name\}`\}/);
  assert.match(MAT_BOARD, /accessibilityLabel="Cancel challenge"/);
  // The offline offer's go-live must not collide with the toggle.
  assert.match(MAT_BOARD, /accessibilityLabel=\{`Go live to answer \$\{name\}`\}/);
});

test("the prompt sheet keeps Accept / Decline by label and exposes them to idb", () => {
  assert.match(SHEET, /accessibilityLabel="Accept challenge"/);
  assert.match(SHEET, /accessibilityLabel="Decline challenge"/);
  assert.match(SHEET, /accessibilityLabel="Later"/);
  // gorhom collapses the content into one "Bottom Sheet" leaf unless this is off.
  assert.match(SHEET, /accessible=\{false\}/);
});

function el(over: Partial<AXElement>): AXElement {
  return { AXLabel: null, AXUniqueId: null, AXValue: null, type: "Button", frame: { x: 0, y: 0, width: 100, height: 44 }, ...over };
}

test("look-alike controls never answer the harness's exact queries", () => {
  const lookalikes = [
    el({ AXLabel: "Live menu: go offline" }),
    el({ AXLabel: "Go live to answer Alex" }),
    el({ AXLabel: "Go live to roll" }),
    el({ AXLabel: "You are live" }),
    el({ AXLabel: "You are offline" }),
    el({ AXLabel: "Live status: 12 on the mat. Go live", AXUniqueId: HEADER_CHIP_ID, AXValue: "offline" }),
  ];
  for (const e of lookalikes) {
    assert.equal(matches(e, { label: "Go live", type: "Button" }), false, `${e.AXLabel} answered Go live`);
    assert.equal(matches(e, { label: "Go offline", type: "Button" }), false, `${e.AXLabel} answered Go offline`);
  }
  // An offline chip is not the live chip.
  assert.equal(matches(lookalikes[5], LIVE_CHIP), false);
});
