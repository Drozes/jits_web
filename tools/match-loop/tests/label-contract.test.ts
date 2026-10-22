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
  PAUSE_TOGGLE,
  STEP_BY_LABEL,
  STEP_MARKER_RE,
  FACEOFF_LEAVE,
  HOLD_TO_END_MS,
  PROMPT_BUTTONS,
  READY_CAPTURE_HINT,
  STEP_BY_CONTROL,
  STEP_TEST_ID_PREFIX,
  TAB_LABELS,
  WEIGHT_CHECK,
  BACK_MIN_CENTRE_Y,
  GO_BACK,
  Screens,
  backRevealMove,
  backTappable,
  pauseToggleState,
  stepFromControls,
  stepFromTestId,
} from "../sim/screens";
import { APP_ERROR_TITLE, TAB_PROOF, appErrorIn, bandMove, hittableBand } from "../sim/match-detail";
import { drawSymmetric, participantDelta, participantDeltaConsistent, verdictChipDelta } from "../scenarios/flows";
import { parseDelta } from "../oracle/ui";
import { matches, type AXElement, type Idb, type Query } from "../sim/idb";
import type { Simctl } from "../sim/simctl";
import { ExpectationTimeout } from "../lib/util";
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

test("the prompt sheet keeps Accept / Decline by testID and label and exposes them to idb", () => {
  // Screens.isPromptVisible / tapPromptButton query PROMPT_BUTTONS (testID
  // plus label, never an element type).
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

test("the live pause toggle's labels are the ones the harness reads", () => {
  // E4 reads the action the toggle offers from its accessibility label.
  const BTN = src("components/match-flow/live/pause-button.tsx");
  assert.match(BTN, new RegExp(`testID="${PAUSE_TOGGLE.id}"`));
  assert.ok(
    BTN.includes(`accessibilityLabel={paused ? "${PAUSE_TOGGLE.resume}" : "${PAUSE_TOGGLE.pause}"}`),
    "PauseButton's accessibilityLabel changed: update PAUSE_TOGGLE",
  );
  assert.equal(pauseToggleState(PAUSE_TOGGLE.pause), "PAUSE");
  assert.equal(pauseToggleState(PAUSE_TOGGLE.resume), "RESUME");
  // A relabel reads as itself (evidence), never as either state.
  assert.equal(pauseToggleState("Pause"), "Pause");
  assert.equal(pauseToggleState(null), null);
});

test("the tab bar's labels are the harness's TAB_LABELS, in order", () => {
  const LAYOUT = src("app/(app)/(tabs)/_layout.tsx");
  const titles = [...LAYOUT.matchAll(/^\s*title: "([^"]+)",$/gm)].map((m) => m[1]);
  assert.deepEqual(titles, [...TAB_LABELS]);
  // The Matches tab is labelled Film (route still `matches`).
  assert.match(LAYOUT, /name="matches"\s+options=\{\{\s+title: "Film",/);
});

test("the Film tab root is proven by BrandHeader's heading, never by the tab bar's button", () => {
  const HEADER = src("components/layout/brand-header.tsx");
  assert.match(HEADER, /testID=\{`tab-header-title-\$\{title\.toLowerCase\(\)\}`\}\s+accessibilityRole="header"/);
  const heading = el({ AXLabel: "Film", type: "Heading", frame: { x: 0, y: 58, width: 1, height: 1 } });
  const tabButton = el({ AXLabel: "Film", type: "Button", frame: { x: 161, y: 782, width: 80, height: 57 } });
  assert.ok(TAB_PROOF.Film.some((q) => matches(heading, q)), "the heading must prove the Film tab");
  assert.ok(!TAB_PROOF.Film.some((q) => matches(tabButton, q)), "the tab bar's Film button must not prove the tab");
  // Match detail's FilmAngles header is a Heading too, reading "FILM" with one
  // usable angle: it must not pass for the Film tab root.
  const ANGLES = src("components/match-detail/film-angles.tsx");
  assert.match(ANGLES, /accessibilityRole="header"[^>]*>\s*\{count > 1 \? `FILM · \$\{count\} ANGLES` : "FILM"\}/);
  const anglesHeading = el({ AXLabel: "FILM", type: "Heading", frame: { x: 16, y: 520, width: 40, height: 14 } });
  assert.ok(!TAB_PROOF.Film.some((q) => matches(anglesHeading, q)), "match detail's FILM header must not prove the Film tab");
});

test("taps stay inside the band between the header bar and the tab bar", () => {
  const H = 874;
  // A pushed screen (AppHeader: Go back + live dot), as on Stats.
  const pushed = [
    el({ AXLabel: "Go back", type: "Button", frame: { x: 16, y: 74, width: 28, height: 28 } }),
    el({ AXLabel: "You are live in the Arena", AXUniqueId: "header-live-dot", type: "GenericElement", frame: { x: 372, y: 76, width: 14, height: 28 } }),
  ];
  const band = hittableBand(pushed, H);
  assert.equal(band.top, 130, "the 56pt bar ends at 118, plus the margin");
  assert.equal(band.bottom, H - 12);
  // E17, 2026-10-20: a Stats row centred at y=117 sat under the header.
  assert.ok(!(117 > band.top), "a row under the header must not count as hittable");
  // A tab root (BrandHeader controls, tab bar at 782).
  const tabRoot = [
    el({ AXLabel: "Your rating 1001", AXUniqueId: "header-elo", type: "GenericElement", frame: { x: 100, y: 68, width: 51, height: 44 } }),
    ...TAB_LABELS.map((l, i) => el({ AXLabel: l, type: "Button", frame: { x: i * 80, y: 782, width: 80, height: 57 } })),
    el({ AXLabel: "Film", type: "Heading", frame: { x: 0, y: 58, width: 1, height: 1 } }),
  ];
  assert.deepEqual(hittableBand(tabRoot, H), { top: 130, bottom: 770 });
  // Nothing reported for the header: the iPhone 17 Pro's bar bottom.
  assert.equal(hittableBand([], H).top, 130);
});

test("a header control scrolled above the safe area never moves the band's top (jits-o47s.28)", () => {
  const H = 874;
  // Match detail scrolled down: its hero's back control is reported at its
  // real, off-screen frame (E17, 2026-10-20: y=-169) and covers nothing.
  const heroBack = el({ AXLabel: "Go back", AXUniqueId: "match-back", type: "Button", frame: { x: 4, y: -191.3, width: 44, height: 44 } });
  const band = hittableBand([heroBack], H);
  assert.ok(band.top >= BACK_MIN_CENTRE_Y, `band top ${band.top} must not start above the safe area`);
  assert.equal(band.top, 130, "with no on-screen header control, the conservative fallback");
  // Half scrolled under the status bar (centre above the safe area): ignored too.
  assert.equal(hittableBand([el({ AXLabel: "Go back", type: "Button", frame: { x: 4, y: 20, width: 44, height: 44 } })], H).top, 130);
  // At rest the same control still counts: centre 90, bar to 118, plus the margin.
  assert.equal(hittableBand([el({ AXLabel: "Go back", type: "Button", frame: { x: 4, y: 68, width: 44, height: 44 } })], H).top, 130);
  // AppHeader's chevron alone (centre 88) ends the bar at 116.
  assert.equal(hittableBand([el({ AXLabel: "Go back", type: "Button", frame: { x: 16, y: 74, width: 28, height: 28 } })], H).top, 128);
});

test("a scroll move aims at the band's middle, capped and slow", () => {
  const band = { top: 130, bottom: 770 };
  // Below the band (E17's first Stats row at 830): the finger moves up.
  const down = bandMove(830, band, 874);
  assert.ok(down.fromY > down.toY);
  assert.equal(down.fromY - down.toY, 830 - 450);
  // Above the band (flung under the header): the finger moves down.
  const up = bandMove(117, band, 874);
  assert.ok(up.toY > up.fromY);
  assert.equal(up.toY - up.fromY, 450 - 117);
  // Far away: one move is at most 80% of the band, and slow.
  const far = bandMove(5_000, band, 874);
  assert.equal(far.fromY - far.toY, 512);
  assert.ok(far.durationS >= 512 / 300 - 1e-9);
  assert.ok(bandMove(460, band, 874).durationS >= 0.3);
});

test("every pushed screen's back control is labelled Go back, and the match hero's scrolls with the detail", () => {
  assert.equal(GO_BACK.label, "Go back");
  assert.match(src("components/layout/app-header.tsx"), /accessibilityRole="button"\s+accessibilityLabel="Go back"/);
  assert.match(src("components/film-room/film-back-button.tsx"), /accessibilityRole="button"\s+accessibilityLabel=\{label\}/);
  assert.match(src("components/match-detail/match-hero.tsx"), /<FilmBackButton label="Go back" [^>]*testID="match-back" \/>/);
  // The hero is inside the detail's ScrollView, so its back control scrolls away (what Screens.goBack handles).
  assert.match(src("app/(app)/match-detail/[matchId].tsx"), /<ScrollView[^]*?<MatchHero/);
});

test("only a back control a tap can reach counts; an off-screen one is scrolled back into reach, slowly", () => {
  const H = 874;
  const W = 402;
  const back = (x: number, cy: number) => el({ AXLabel: "Go back", AXUniqueId: "match-back", frame: { x, y: cy - 22, width: 44, height: 44 } });
  // E17, 2026-10-20: the Stats detail's hero back control, scrolled away.
  assert.equal(backTappable(back(4, -169.3), W, H), false);
  // At rest: the match hero's (centre 90) and AppHeader's (centre 88).
  assert.equal(backTappable(back(4, 90), W, H), true);
  assert.equal(backTappable(el({ AXLabel: "Go back", frame: { x: 16, y: 74, width: 28, height: 28 } }), W, H), true);
  // Under the status bar, off to the side, below the screen, or zero-sized: out of reach.
  assert.equal(backTappable(back(4, BACK_MIN_CENTRE_Y - 1), W, H), false);
  assert.equal(backTappable(back(-60, 90), W, H), false);
  assert.equal(backTappable(back(4, H + 40), W, H), false);
  assert.equal(backTappable(el({ AXLabel: "Go back", frame: { x: 4, y: 68, width: 0, height: 0 } }), W, H), false);
  // The move brings the control's centre into reach, finger down, slowly.
  const m = backRevealMove(-169.3, H);
  assert.ok(m.toY > m.fromY, "the finger moves down to bring the content down");
  assert.ok(backTappable(back(4, -169.3 + (m.toY - m.fromY)), W, H), "one move lands it in reach");
  assert.ok(m.durationS >= (m.toY - m.fromY) / 300 - 1e-9);
  // Far above: one move is capped at 60% of the screen and stays on it.
  const far = backRevealMove(-5_000, H);
  assert.ok(Math.abs(far.toY - far.fromY - H * 0.6) < 1e-9);
  assert.ok(far.fromY >= 0 && far.toY <= H);
});

/**
 * A fake Idb with one "Go back" whose frame a swipe moves by the finger's
 * travel, down to where its scroll view stops at the top (centre 90), or
 * not at all (`stuck`). A tap on it pops the screen unless `ignoresTap`.
 */
function backIdb(startCentreY: number | null, opts: { stuck?: boolean; ignoresTap?: boolean } = {}) {
  let cy = startCentreY;
  const taps: number[] = [];
  const swipes: number[] = [];
  const read = () => (cy === null ? [] : [el({ AXLabel: "Go back", AXUniqueId: "match-back", frame: { x: 4, y: cy - 22, width: 44, height: 44 } })]);
  const idb = {
    screenH: 874,
    screenW: 402,
    async describe() {
      return read();
    },
    async settled(q: Query) {
      return read().find((e) => matches(e, q));
    },
    async swipe(_x1: number, y1: number, _x2: number, y2: number) {
      swipes.push(y2 - y1);
      if (cy !== null && !opts.stuck) cy = Math.min(90, cy + (y2 - y1));
    },
    async tap(e: AXElement) {
      taps.push(e.frame.y + e.frame.height / 2);
      if (!opts.ignoresTap) cy = null;
    },
  };
  return { ui: new Screens(idb as unknown as Idb, {} as Simctl, 0), taps, swipes };
}

test("goBack scrolls a scrolled-away back control into reach before its one tap", async () => {
  const { ui, taps, swipes } = backIdb(-169.3);
  assert.equal(await ui.goBack(), true);
  assert.equal(swipes.length, 1);
  assert.ok(swipes[0] > 0, "content scrolled down");
  assert.deepEqual(taps, [90], "one tap, on the control at rest, never at its off-screen frame");
});

test("goBack taps a reachable back control at once, and reports a tab root as nothing to pop", async () => {
  const pushed = backIdb(88);
  assert.equal(await pushed.ui.goBack(), true);
  assert.deepEqual(pushed.swipes, []);
  assert.deepEqual(pushed.taps, [88]);
  const root = backIdb(null);
  assert.equal(await root.ui.goBack(), false);
  assert.deepEqual(root.taps, []);
});

test("a back control that never comes into reach fails, without a tap off screen", async () => {
  const { ui, taps, swipes } = backIdb(-169.3, { stuck: true });
  await assert.rejects(ui.goBack(), (e: unknown) => {
    assert.ok(e instanceof ExpectationTimeout, String(e));
    assert.match(e.message, /"Go back" within reach/);
    return true;
  });
  assert.deepEqual(taps, []);
  assert.equal(swipes.length, 4);
});

test("backToTabRoot fails naming the screen when a pop does not leave it", async () => {
  const { ui, taps } = backIdb(88, { ignoresTap: true });
  await assert.rejects(ui.backToTabRoot(1), (e: unknown) => {
    assert.ok(e instanceof ExpectationTimeout, String(e));
    assert.match(e.message, /a tab root within 1 pops/);
    return true;
  });
  assert.deepEqual(taps, [88]);
  // A pop that leaves it is a clean return.
  const ok = backIdb(88);
  await ok.ui.backToTabRoot(2);
  assert.deepEqual(ok.taps, [88]);
});

test("the app's error screen is read from the error boundary or the dev red box", () => {
  const BOUNDARY = src("components/error-boundary.tsx");
  assert.ok(BOUNDARY.includes(APP_ERROR_TITLE), "the error boundary's title changed");
  const text = (AXLabel: string) => el({ AXLabel, type: "StaticText" });
  const msg = "cannot add `postgres_changes` callbacks for realtime:video_progress:x after `subscribe()`.";
  assert.equal(
    appErrorIn([text(APP_ERROR_TITLE), text("The app hit an unexpected error. Try again, or sign out."), text(msg)]),
    msg,
  );
  assert.equal(appErrorIn([text(APP_ERROR_TITLE)]), APP_ERROR_TITLE);
  assert.equal(appErrorIn([text("Render Error"), text(msg)]), msg);
  assert.equal(appErrorIn([text("Match detail"), text("Watch your recording")]), null);
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

test("the ready step's capture hint keeps the harness's testID and the copy deck's words (T14)", () => {
  const SURFACE = src("components/match-flow/match-recorder-surface.tsx");
  const COPY = src("lib/video/capture-copy.ts");
  assert.match(SURFACE, new RegExp(`READY_HINT_TEST_ID = "${READY_CAPTURE_HINT.id}"`));
  assert.match(SURFACE, /testID=\{READY_HINT_TEST_ID\}/);
  assert.ok(COPY.includes(`"TK-REC2": "${READY_CAPTURE_HINT.athlete}"`));
  assert.ok(COPY.includes(`"TK-REC1": "${READY_CAPTURE_HINT.timekeeperWideLens}"`));
  assert.ok(COPY.includes(`"TK-REC1b": "${READY_CAPTURE_HINT.timekeeperStepBack}"`));
  // The sideways hint is retired in both modes and in practice (A21, A23).
  for (const rel of ["components/match-flow/match-recorder-surface.tsx", "lib/video/capture-copy.ts", "app/(app)/practice.tsx"]) {
    assert.ok(!src(rel).includes(READY_CAPTURE_HINT.retired), rel);
  }
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

test("a rated participant row is consistent only with all three values written and agreeing", () => {
  assert.equal(participantDeltaConsistent({ elo_before: 1000, elo_after: 1012, elo_delta: 12 }), true);
  assert.equal(participantDeltaConsistent({ elo_before: 1000, elo_after: 1000, elo_delta: 0 }), true);
  assert.equal(participantDeltaConsistent({ elo_before: 1000, elo_after: 1012, elo_delta: 11 }), false);
  // A missing delta fails (participantDelta's fallback would hide it).
  assert.equal(participantDeltaConsistent({ elo_before: 1000, elo_after: 1012, elo_delta: null }), false);
  assert.equal(participantDeltaConsistent({ elo_before: null, elo_after: 1012, elo_delta: 12 }), false);
});

test("a draw between equals is symmetric: two written, equal deltas", () => {
  const row = (elo_delta: number | null) => ({ elo_before: 1000, elo_after: 1000 + (elo_delta ?? 0), elo_delta });
  assert.equal(drawSymmetric([row(0), row(0)]), true);
  assert.equal(drawSymmetric([row(-4), row(-4)]), true);
  assert.equal(drawSymmetric([row(-4), row(4)]), false);
  assert.equal(drawSymmetric([row(null), row(null)]), false);
  assert.equal(drawSymmetric([row(0)]), false);
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
