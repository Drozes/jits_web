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
import {
  HEADER_CHIP_ID,
  HEADER_LIVE_DOT_ID,
  LIVE_CHIP,
  STEP_BY_LABEL,
  STEP_MARKER_RE,
  FACEOFF_LEAVE,
  HOLD_TO_END_MS,
  PROMPT_BUTTONS,
  STEP_BY_CONTROL,
  STEP_TEST_ID_PREFIX,
  WEIGHT_CHECK,
  stepFromControls,
  stepFromTestId,
} from "../sim/screens";
import { participantDelta, verdictChipDelta } from "../scenarios/flows";
import { parseDelta } from "../oracle/ui";
import { matches, type AXElement } from "../sim/idb";
import { MATCH_STEPS } from "../../../apps/mobile/lib/match-flow/step-router";

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
const WIZARD = src("components/match-flow/match-flow-wizard.tsx");
const FACEOFF_BODY = src("components/match-flow/faceoff/faceoff-body.tsx");
const WEIGHT_CHECK_UI = src("components/match-flow/faceoff/faceoff-weight-check.tsx");
const RATING_MOMENT = src("components/match-flow/verdict/rating-moment.tsx");

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
  // Screens.isPromptVisible / tapPromptButton query { label, type: "Button" }.
  assert.match(SHEET, /accessibilityRole="button"\s+accessibilityLabel="Accept challenge"/);
  assert.match(SHEET, /accessibilityRole="button"\s+accessibilityLabel="Decline challenge"/);
  assert.match(SHEET, /accessibilityRole="button"\s+accessibilityLabel="Later"/);
  // Screens selects them by testID and label (PROMPT_BUTTONS).
  for (const { id, label } of Object.values(PROMPT_BUTTONS)) {
    assert.match(SHEET, new RegExp(`testID="${id}"\\s+accessibilityRole="button"\\s+accessibilityLabel="${label}"`));
  }
  // The title is the second visibility signal (Screens.promptSheet).
  assert.match(SHEET, /^\s*INCOMING CHALLENGE\s*$/m);
  // A centered React Native Modal since jits-02vo.3, no longer a gorhom
  // sheet (which collapsed its content into one "Bottom Sheet" leaf unless
  // `accessible={false}`), and nothing in it makes the card one accessible
  // leaf either, so the buttons stay separate elements to idb.
  assert.match(SHEET, /import \{[^}]*\bModal\b[^}]*\} from "react-native"/);
  assert.doesNotMatch(SHEET, /@gorhom\/bottom-sheet/);
  assert.doesNotMatch(SHEET, /^\s*accessible(=\{(?!false\})[^}]*\})?\s*$/m);
  // A card fading out after its challenge cleared leaves the tree, so its
  // title never counts as a prompt still up.
  assert.match(SHEET, /accessibilityElementsHidden=\{!visible\}/);
});

test("the harness reads every wizard step from the step marker's label", () => {
  // StepMarker's label is "Step N of T, <Label>" (Screens.currentStep).
  assert.match(
    WIZARD,
    /accessibilityLabel=\{exposed \? `Step \$\{idx \+ 1\} of \$\{MATCH_STEPS\.length\}, \$\{STEP_LABELS\[step\]\}` : undefined\}/,
  );
  const block = WIZARD.match(/const STEP_LABELS: Record<MatchStep, string> = \{([^}]*)\}/);
  assert.ok(block, "STEP_LABELS not found in match-flow-wizard.tsx");
  const labels = [...block[1].matchAll(/(\w+): "([^"]+)"/g)].map((m) => ({ step: m[1], label: m[2] }));
  assert.deepEqual(labels.map((l) => l.step).sort(), [...MATCH_STEPS].sort(), "STEP_LABELS names every MatchStep");
  labels.forEach(({ step, label }, i) => {
    const marker = `Step ${i + 1} of ${labels.length}, ${label}`.match(STEP_MARKER_RE);
    assert.ok(marker, `the marker label for ${step} ("${label}") does not parse`);
    assert.equal(STEP_BY_LABEL[marker[1].toLowerCase()], step, `the harness misreads "${label}"`);
  });
  // Nothing for a step the app no longer has (such as the deleted wait step).
  assert.deepEqual(Object.values(STEP_BY_LABEL).sort(), [...MATCH_STEPS].sort());
});

test("a match-step testID reads as a step only for one of the app's MATCH_STEPS", () => {
  assert.match(WIZARD, new RegExp(`testID=\\{\`${STEP_TEST_ID_PREFIX}\\$\\{step\\}\``));
  for (const step of MATCH_STEPS) assert.equal(stepFromTestId(`${STEP_TEST_ID_PREFIX}${step}`), step);
  // The deleted wait step, a typo and anything else never read as a step.
  for (const id of ["match-step-wait", "match-step-", "match-step-Weight", "match-step-summary-x", "faceoff-leave", null, undefined]) {
    assert.equal(stepFromTestId(id), null, String(id));
  }
});

test("the step-only controls the harness falls back on are where it expects them", () => {
  // Screens.currentStep reads these when idb reports no StepMarker (the
  // full-bleed live step).
  const owners: Record<string, string> = {
    "live-end": "components/match-flow/live/hold-to-end-button.tsx",
    "live-pause-toggle": "components/match-flow/live/pause-button.tsx",
    "summary-exit": "components/match-flow/verdict/verdict-step.tsx",
  };
  for (const { id } of STEP_BY_CONTROL) {
    assert.ok(owners[id], `no owner listed for ${id}`);
    assert.match(src(owners[id]), new RegExp(`testID="${id}"`), `${id} moved out of ${owners[id]}`);
  }
  assert.equal(stepFromControls([el({ AXUniqueId: "live-end", AXLabel: "Hold to end match" })]), "live");
  assert.equal(stepFromControls([el({ AXUniqueId: "summary-exit" })]), "summary");
  assert.equal(stepFromControls([el({ AXUniqueId: "weight-confirm" })]), null);
});

test("End is a hold, for the time the harness holds it", () => {
  // Screens.endMatch long-presses #live-end; a tap never ends the match.
  const m = src("lib/match-flow/live-view-state.ts").match(/export const HOLD_TO_END_MS = ([\d_]+);/);
  assert.ok(m, "HOLD_TO_END_MS not found in live-view-state.ts");
  assert.equal(HOLD_TO_END_MS, Number(m[1].replace(/_/g, "")));
  const btn = src("components/match-flow/live/hold-to-end-button.tsx");
  assert.match(btn, /testID="live-end"/);
  assert.match(btn, /setTimeout\(\(\) => \{\s*holdTimerRef\.current = null;\s*handleHoldCompleteRef\.current\(\);\s*\}, HOLD_TO_END_MS\)/);
});

test("the face-off weigh-in and weight check keep the harness's testIDs", () => {
  // Screens.confirmWeights: "Confirm <N> lbs", then Blue's check of the
  // opponent's weigh-in on the check plate (jits-c3vd).
  assert.match(FACEOFF_BODY, /testID="weight-confirm"/);
  assert.match(FACEOFF_BODY, /<WeightCheckPlate opponentName=/);
  assert.match(WEIGHT_CHECK_UI, new RegExp(`testID="${WEIGHT_CHECK.plate}"`));
  assert.match(WEIGHT_CHECK_UI, new RegExp(`testID="${WEIGHT_CHECK.confirm}"\\s+label="Confirm"`));
  assert.match(WEIGHT_CHECK_UI, new RegExp(`testID="${WEIGHT_CHECK.flag}"\\s+label="Doesn't look right"`));
  // Screens.cancelMatch: the face-off's Leave, by testID and label.
  const TOP = src("components/match-flow/faceoff/faceoff-top.tsx");
  assert.match(TOP, new RegExp(`testID="${FACEOFF_LEAVE.id}"\\s+accessibilityRole="button"[\\s\\S]{0,200}accessibilityLabel="${String(FACEOFF_LEAVE.label)}"`));
  // Confirm answers with the "confirm" verdict.
  assert.match(WEIGHT_CHECK_UI, /onPress=\{\(\) => void w\.check\("confirm"\)\}/);
});

test("the verdict shows a delta only for a non-zero change", () => {
  // checkSummary expects no delta for a zero change (Rating V9 rates a draw
  // between equals as no change): no chip, and a card label with no delta.
  assert.match(RATING_MOMENT, /delta != null && delta !== 0 \? \(/);
  assert.match(RATING_MOMENT, /testID="summary-elo-delta"/);
  assert.equal(verdictChipDelta(null), null);
  assert.equal(verdictChipDelta(0), null);
  assert.equal(verdictChipDelta(7), 7);
  assert.equal(verdictChipDelta(-3), -3);
});

test("the verdict's rating card speaks the delta, and the harness reads it", () => {
  // The card is ONE accessible element (idb never sees the chip inside it),
  // labelled "Rating <after>, up|down <n>", or just "Rating <after>".
  assert.match(RATING_MOMENT, /testID="verdict-rating-card" accessible accessibilityRole="text" accessibilityLabel=\{spoken\}/);
  assert.match(RATING_MOMENT, /const spoken = delta != null && delta !== 0 \? `Rating \$\{after\}, \$\{spokenDelta\(delta\)\}` : `Rating \$\{after\}`;/);
  const CHIP = src("components/ui/elo-system/delta-chip.tsx");
  assert.match(CHIP, /if \(delta > 0\) return `up \$\{delta\}`;/);
  assert.match(CHIP, /if \(delta < 0\) return `down \$\{Math\.abs\(delta\)\}`;/);
  assert.equal(parseDelta("Rating 1001, up 1"), 1);
  assert.equal(parseDelta("Rating 990, down 10"), -10);
  assert.equal(parseDelta("Rating 1000"), null);
  assert.equal(parseDelta("Rating 1000, no change"), null);
  // The rendered chip still parses when idb exposes it.
  assert.equal(parseDelta("▲ +14"), 14);
  assert.equal(parseDelta("▼ \u22129"), -9);
});

test("a participant row's delta is elo_delta, else after minus before", () => {
  assert.equal(participantDelta({ elo_before: 1000, elo_after: 1012, elo_delta: 12 }), 12);
  assert.equal(participantDelta({ elo_before: 1000, elo_after: 991, elo_delta: null }), -9);
  assert.equal(participantDelta({ elo_before: null, elo_after: 991, elo_delta: null }), null);
  assert.equal(participantDelta(undefined), null);
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
