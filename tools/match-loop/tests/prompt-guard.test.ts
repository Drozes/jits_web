/**
 * The harness answers the incoming prompt by testID and label (never by
 * element type, which idb reports inconsistently), after the app's input
 * guard (AC-S3). The app drops (does not queue) a tap inside the guard, so the
 * harness must wait for the button to report itself enabled, and fail naming
 * the guard when it never does, rather than stalling on a lost tap.
 *
 * Also the strict presses (end of file): the weight check's Confirm, End and
 * Back to Arena report how many presses they took, so a dropped one is a
 * failed oracle instead of a silent retry.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { PROMPT_INPUT_GUARD_MS } from "../../../apps/mobile/lib/arena/constants";
import { PROMPT_TAP_DELAY_MS, Screens, WEIGHT_CHECK } from "../sim/screens";
import type { AXElement, Idb, Query } from "../sim/idb";
import type { Simctl } from "../sim/simctl";
import { ExpectationTimeout } from "../lib/util";

test("the prompt tap waits out the app's input guard with a margin", () => {
  assert.ok(PROMPT_TAP_DELAY_MS >= PROMPT_INPUT_GUARD_MS + 200);
});

/** A fake Idb whose tapQ plays the given outcomes in order. */
function fakeIdb(outcomes: Array<"ok" | "timeout" | Error>) {
  const calls: Array<{ q: Query; timeoutMs: number | undefined }> = [];
  const idb = {
    async tapQ(q: Query, timeoutMs?: number) {
      calls.push({ q, timeoutMs });
      const next = outcomes.shift() ?? "ok";
      if (next === "timeout") throw new ExpectationTimeout(`UI element ${String(q.label)}`, timeoutMs ?? 0, []);
      if (next instanceof Error) throw next;
    },
    async describe() {
      return [];
    },
  };
  return { idb: idb as unknown as Idb, calls };
}

const simctl = {} as Simctl;
/** For the tests that do not assert the delay: no real 850ms sleep each. */
const NO_DELAY = 0;

test("acceptPrompt waits out the guard by default, then taps only an ENABLED Accept button", async () => {
  const { idb, calls } = fakeIdb(["ok"]);
  const started = Date.now();
  await new Screens(idb, simctl).acceptPrompt();
  assert.ok(Date.now() - started >= PROMPT_TAP_DELAY_MS - 20, "tapped before the guard delay");
  assert.equal(calls.length, 1);
  assert.deepEqual(calls[0].q, { id: "challenge-prompt-accept", label: "Accept challenge", enabled: true });
});

test("declinePrompt taps only an ENABLED Decline button", async () => {
  const { idb, calls } = fakeIdb(["ok"]);
  await new Screens(idb, simctl, NO_DELAY).declinePrompt();
  assert.deepEqual(calls[0].q, { id: "challenge-prompt-decline", label: "Decline challenge", enabled: true });
});

test("a button that never enables fails naming the input guard", async () => {
  const { idb, calls } = fakeIdb(["timeout"]);
  await assert.rejects(new Screens(idb, simctl, NO_DELAY).acceptPrompt(), (e: unknown) => {
    assert.ok(e instanceof ExpectationTimeout);
    assert.match(e.message, new RegExp(`input guard ${PROMPT_INPUT_GUARD_MS}ms`));
    assert.match(e.message, /Accept challenge/);
    return true;
  });
  assert.deepEqual(calls[0].q, { id: "challenge-prompt-accept", label: "Accept challenge", enabled: true });
});

test("a non-timeout failure is passed through unchanged", async () => {
  const boom = new Error("idb crashed");
  const { idb } = fakeIdb([boom]);
  await assert.rejects(new Screens(idb, simctl, NO_DELAY).declinePrompt(), (e: unknown) => e === boom);
});

// --- strict presses: confirmWeights, endMatch, exitSummary ------------------------
//
// The flag-OFF guard must be able to fail: a press the app dropped is
// counted (and recorded by the flows as a failed oracle), never retried
// away in silence.

type El = AXElement;
const el = (over: Partial<El>): El => ({
  AXLabel: null,
  AXUniqueId: null,
  AXValue: null,
  type: "Button",
  frame: { x: 0, y: 300, width: 100, height: 44 },
  ...over,
});
const marker = (label: string) => el({ AXLabel: label, type: "GenericElement" });

/** A fake Idb that serves screens in order (the last one repeats) and records taps. */
function scriptedIdb(screens: El[][], opts: { logBoxClosed?: boolean[]; goneAfterTap?: number[] } = {}) {
  const taps: string[] = [];
  let i = 0;
  let tapCount = 0;
  const closed = [...(opts.logBoxClosed ?? [])];
  const idb = {
    screenH: 874,
    screenW: 402,
    async describe() {
      const s = screens[Math.min(i, screens.length - 1)];
      i++;
      return s;
    },
    async tapQ(q: Query) {
      taps.push(`tapQ:${q.id ?? String(q.label)}`);
      return el({ AXUniqueId: q.id ?? null });
    },
    async tap(e: El) {
      tapCount++;
      taps.push(`tap:${e.AXUniqueId ?? e.AXLabel}`);
    },
    async longPress(e: El) {
      taps.push(`hold:${e.AXUniqueId}`);
    },
    async waitFor(q: Query) {
      return el({ AXUniqueId: q.id ?? null, enabled: true });
    },
    async scrollTo(q: Query) {
      return el({ AXUniqueId: q.id ?? null });
    },
    onScreen() {
      return true;
    },
    async dismissLogBox() {
      return closed.shift() ?? false;
    },
    async waitGone(q: Query, ms: number) {
      if ((opts.goneAfterTap ?? []).includes(tapCount)) return;
      throw new ExpectationTimeout(`UI element #${q.id} to disappear`, ms, []);
    },
  };
  return { idb: idb as unknown as Idb, taps };
}

const WEIGHT = marker("Step 1 of 7, Weights");
const READY = marker("Step 2 of 7, Ready");
const plate = el({ AXUniqueId: WEIGHT_CHECK.plate, type: "GenericElement" });
const confirm = el({ AXUniqueId: WEIGHT_CHECK.confirm, enabled: true });

test("confirmWeights counts one press of the check plate's Confirm", async () => {
  const { idb, taps } = scriptedIdb([[WEIGHT, plate, confirm], [READY]]);
  const r = await new Screens(idb, simctl, NO_DELAY).confirmWeights(5_000);
  assert.deepEqual(r, { weightCheck: true, confirmPresses: 1 });
  assert.deepEqual(taps, ["tapQ:weight-confirm", `tap:${WEIGHT_CHECK.confirm}`]);
});

test("confirmWeights counts a second press when the app dropped the first", async () => {
  // The plate stays up and enabled past the retap window, then the app moves on.
  const stuck = Array.from({ length: 12 }, () => [WEIGHT, plate, confirm]);
  const { idb } = scriptedIdb([...stuck, [READY]]);
  const r = await new Screens(idb, simctl, NO_DELAY).confirmWeights(10_000);
  assert.equal(r.confirmPresses, 2);
});

test("confirmWeights without a check plate reports no press", async () => {
  const { idb } = scriptedIdb([[WEIGHT], [READY]]);
  assert.deepEqual(await new Screens(idb, simctl, NO_DELAY).confirmWeights(5_000), { weightCheck: false, confirmPresses: 0 });
});

const LIVE_END = el({ AXUniqueId: "live-end", AXLabel: "Hold to end match", enabled: true });

test("endMatch counts one hold when the live step ends", async () => {
  const { idb, taps } = scriptedIdb([[marker("Step 4 of 7, Ended")]]);
  assert.deepEqual(await new Screens(idb, simctl, NO_DELAY).endMatch(300), { holds: 1 });
  assert.deepEqual(taps, ["hold:live-end"]);
});

test("endMatch counts a second hold when the first did not end the live step (jits-o47s.28)", async () => {
  // Deterministic: what the screen shows depends on how many holds were
  // made, never on timing. Until the second hold the live step stays up with
  // End enabled (the app dropped the first hold); after it the end step shows.
  let holds = 0;
  const taps: string[] = [];
  const idb = {
    async waitFor(q: Query) {
      return el({ AXUniqueId: q.id ?? null, enabled: true });
    },
    async longPress(e: El) {
      holds++;
      taps.push(`hold:${e.AXUniqueId}`);
    },
    async describe() {
      return holds >= 2 ? [marker("Step 5 of 8, Ended")] : [LIVE_END];
    },
  } as unknown as Idb;
  assert.deepEqual(await new Screens(idb, simctl, NO_DELAY).endMatch(300), { holds: 2 });
  assert.deepEqual(taps, ["hold:live-end", "hold:live-end"]);
});

test("endMatch failing both holds is the app not ending (ExpectationTimeout), not a harness error", async () => {
  const { idb, taps } = scriptedIdb([[LIVE_END]]);
  await assert.rejects(new Screens(idb, simctl, NO_DELAY).endMatch(300), (e: unknown) => {
    assert.ok(e instanceof ExpectationTimeout, String(e));
    assert.match(e.message, /two .*holds on #live-end/);
    return true;
  });
  assert.deepEqual(taps, ["hold:live-end", "hold:live-end"]);
});

test("exitSummary takes one tap when the verdict closes", async () => {
  const { idb, taps } = scriptedIdb([[]], { goneAfterTap: [1] });
  assert.deepEqual(await new Screens(idb, simctl, NO_DELAY).exitSummary(), { taps: 1, logBoxRetap: false });
  assert.deepEqual(taps, ["tap:summary-exit"]);
});

test("exitSummary never taps Back to Arena twice without a LogBox", async () => {
  const { idb, taps } = scriptedIdb([[]], { goneAfterTap: [2] });
  await assert.rejects(new Screens(idb, simctl, NO_DELAY).exitSummary(), (e: unknown) => {
    assert.ok(e instanceof ExpectationTimeout, String(e));
    assert.match(e.message, /one tap on Back to Arena .*no LogBox/);
    return true;
  });
  assert.deepEqual(taps, ["tap:summary-exit"]);
});

// The fake's scrollTo returns the exit at the default frame, so the tap lands
// at its centre (50, 322). Screen reads per attempt: one just before the tap,
// one after a tap the verdict ignored.
const LOGBOX_LABEL = "! Open debugger to view warnings.";
/** A toast lying over the exit's tap point. */
const toastOverExit = el({ AXLabel: LOGBOX_LABEL, type: "GenericElement", frame: { x: 0, y: 300, width: 402, height: 48 } });
/** A toast in its usual band at the bottom, well away from the scrolled-up exit. */
const toastAtBottom = el({ AXLabel: LOGBOX_LABEL, type: "GenericElement", frame: { x: 8, y: 780, width: 386, height: 48 } });
/** The LogBox inspector (react-native LogBoxInspectorHeader / Footer). */
const inspector = [el({ AXLabel: "Log 1 of 2", type: "StaticText" }), el({ AXLabel: "Dismiss" }), el({ AXLabel: "Minimize" })];

test("exitSummary taps again when a toast lay over the exit's tap point at tap time, and says so", async () => {
  const { idb, taps } = scriptedIdb([[toastOverExit], [toastOverExit], []], { goneAfterTap: [2] });
  assert.deepEqual(await new Screens(idb, simctl, NO_DELAY).exitSummary(), {
    taps: 2,
    logBoxRetap: true,
    logBoxExcuse: "toast-over-tap",
  });
  assert.deepEqual(taps, ["tap:summary-exit", "tap:summary-exit"]);
});

test("exitSummary taps again when a toast closed just before the first tap opened the inspector (on screen at tap time)", async () => {
  // The close tap missed the glyph and opened the inspector, which the read
  // just before the exit tap shows: physical evidence it took that tap.
  const { idb, taps } = scriptedIdb([inspector, [], []], { goneAfterTap: [2], logBoxClosed: [true] });
  assert.deepEqual(await new Screens(idb, simctl, NO_DELAY).exitSummary(), {
    taps: 2,
    logBoxRetap: true,
    logBoxExcuse: "closed-before",
  });
  assert.deepEqual(taps, ["tap:summary-exit", "tap:summary-exit"]);
});

test("exitSummary: a toast closed before the tap excuses nothing without physical evidence (jits-o47s.28)", async () => {
  // A clean close (no inspector at tap time, none after, no toast over the
  // point) is only an inference that a LogBox took the tap: no second tap.
  const { idb, taps } = scriptedIdb([[]], { goneAfterTap: [2], logBoxClosed: [true] });
  await assert.rejects(new Screens(idb, simctl, NO_DELAY).exitSummary(), (e: unknown) => {
    assert.ok(e instanceof ExpectationTimeout, String(e));
    assert.match(e.message, /one tap on Back to Arena .*no LogBox could have taken the tap/);
    return true;
  });
  assert.deepEqual(taps, ["tap:summary-exit"]);
});

test("exitSummary: the inspector open at tap time excuses a second tap even with nothing closed before", async () => {
  const { idb } = scriptedIdb([inspector, [], []], { goneAfterTap: [2] });
  assert.deepEqual(await new Screens(idb, simctl, NO_DELAY).exitSummary(), {
    taps: 2,
    logBoxRetap: true,
    logBoxExcuse: "inspector-open",
  });
});

test("exitSummary taps again when the LogBox inspector is open after the first tap", async () => {
  const { idb } = scriptedIdb([[], inspector, []], { goneAfterTap: [2] });
  assert.deepEqual(await new Screens(idb, simctl, NO_DELAY).exitSummary(), {
    taps: 2,
    logBoxRetap: true,
    logBoxExcuse: "inspector-open",
  });
});

test("exitSummary: a toast on screen but away from the exit excuses nothing (a dropped tap fails)", async () => {
  const { idb, taps } = scriptedIdb([[toastAtBottom]], { goneAfterTap: [2] });
  await assert.rejects(new Screens(idb, simctl, NO_DELAY).exitSummary(), (e: unknown) => {
    assert.ok(e instanceof ExpectationTimeout, String(e));
    assert.match(e.message, /one tap on Back to Arena .*no LogBox could have taken the tap/);
    return true;
  });
  assert.deepEqual(taps, ["tap:summary-exit"]);
});

test("exitSummary: a toast that reaches the tap point only after the tap excuses nothing", async () => {
  const { idb, taps } = scriptedIdb([[], [toastOverExit]], { goneAfterTap: [2] });
  await assert.rejects(new Screens(idb, simctl, NO_DELAY).exitSummary(), ExpectationTimeout);
  assert.deepEqual(taps, ["tap:summary-exit"]);
});

test("exitSummary: a second ignored tap still fails, even after an excused first", async () => {
  const { idb, taps } = scriptedIdb([[toastOverExit]], { goneAfterTap: [] });
  await assert.rejects(new Screens(idb, simctl, NO_DELAY).exitSummary(), (e: unknown) => {
    assert.ok(e instanceof ExpectationTimeout, String(e));
    assert.match(e.message, /two taps on Back to Arena/);
    return true;
  });
  assert.deepEqual(taps, ["tap:summary-exit", "tap:summary-exit"]);
});
