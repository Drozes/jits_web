/**
 * Bot protocol tests (node:test, run via `npm run match-loop:test`).
 * Pure: no database, no realtime, no simulator. They pin the bot to the
 * app's match protocol (Team A, 55061f5) so it cannot silently drift.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { APP_TIMING, SESSION_MATCH_EVENTS, validatePayload } from "../bot/protocol";
import { confirmDecision, handlerToEvent, readyFromSnapshot, type ConfirmSignals } from "../bot/match-side";

const ROOT = join(__dirname, "..", "..", "..");
const src = (rel: string) => readFileSync(join(ROOT, rel), "utf8");

/** `const NAME = 1_500;` -> 1500, from an app source file. */
function appConst(rel: string, name: string): number {
  const m = src(rel).match(new RegExp(`const ${name}\\s*=\\s*([\\d_]+)`));
  assert.ok(m, `${name} not found in ${rel}`);
  return Number(m[1].replace(/_/g, ""));
}

const ME = "red";
const OPP = "blue";

function signals(over: Partial<ConfirmSignals> = {}): ConfirmSignals {
  return {
    meId: ME,
    opponentId: OPP,
    myConfirmed: false,
    opponentConfirmed: false,
    opponentDisputed: false,
    snapshot: null,
    ...over,
  };
}

// --- drift guards -------------------------------------------------------------

test("APP_TIMING matches the app sources", () => {
  assert.equal(APP_TIMING.SEND_GRACE_MS, appConst("apps/mobile/lib/match-flow/match-sync-context.tsx", "SEND_GRACE_MS"));
  assert.equal(
    APP_TIMING.READY_REPEAT_MS,
    appConst("apps/mobile/components/match-flow/steps/ready-step.tsx", "READY_REPEAT_MS"),
  );
  const confirm = src("apps/mobile/components/match-flow/steps/confirm-step.tsx");
  const m = confirm.match(/setTimeout\(advance,\s*([\d_]+)\)/);
  assert.ok(m, "ConfirmStep's both-confirmed advance delay not found");
  assert.equal(APP_TIMING.CONFIRM_ADVANCE_MS, Number(m[1].replace(/_/g, "")));
});

test("the confirm step does not treat a completed status as done (app source)", () => {
  const confirm = src("apps/mobile/components/match-flow/steps/confirm-step.tsx");
  assert.doesNotMatch(confirm, /matchStatus/, "ConfirmStep reads the match status again: re-check the bot's confirm logic");
});

// --- events and payloads ------------------------------------------------------

test("every session-match event has a payload validator and a handler name", () => {
  for (const event of Object.values(SESSION_MATCH_EVENTS)) {
    assert.doesNotMatch(String(validatePayload(event, { athlete_id: "a", started_at: new Date().toISOString(), paused_at: "x", total_paused_duration: 0, result: "draw" })), /unknown event/, event);
    const handler = "on" + event.replace(/(^|_)([a-z])/g, (_m, _s, c: string) => c.toUpperCase());
    assert.equal(handlerToEvent(handler), event, handler);
  }
});

test("match_disputed is a known event and needs athlete_id", () => {
  assert.equal(SESSION_MATCH_EVENTS.MATCH_DISPUTED, "match_disputed");
  assert.equal(validatePayload("match_disputed", { athlete_id: "blue" }), null);
  assert.equal(validatePayload("match_disputed", {}), "athlete_id missing");
  assert.equal(handlerToEvent("onMatchDisputed"), "match_disputed");
});

test("a repeated ready_signal validates every time", () => {
  for (let i = 0; i < 3; i++) assert.equal(validatePayload("ready_signal", { athlete_id: "blue" }), null);
  assert.equal(validatePayload("ready_signal", {}), "athlete_id missing");
});

// --- ready step: DB snapshots -------------------------------------------------

test("ready step: pending waits, in_progress goes live, cancelled exits", () => {
  assert.equal(readyFromSnapshot(null), null);
  assert.equal(readyFromSnapshot("live"), "started");
  assert.equal(readyFromSnapshot("confirm"), "started");
  assert.equal(readyFromSnapshot("exit"), "cancelled");
});

// --- confirm step -------------------------------------------------------------

test("confirm: a completed row with nobody confirmed does NOT finish the step", () => {
  assert.equal(confirmDecision(signals({ snapshot: { status: "completed", confirmed: [] } })), null);
});

test("confirm: a completed row with only one confirmation does NOT finish it", () => {
  assert.equal(confirmDecision(signals({ myConfirmed: true, snapshot: { status: "completed", confirmed: [ME] } })), null);
  assert.equal(confirmDecision(signals({ snapshot: { status: "completed", confirmed: [OPP] } })), null);
});

test("confirm: a completed row whose confirmations read failed does NOT finish it", () => {
  assert.equal(confirmDecision(signals({ myConfirmed: true, snapshot: { status: "completed", confirmed: null } })), null);
});

test("confirm: both confirmation rows in the DB finish it at once", () => {
  assert.deepEqual(confirmDecision(signals({ snapshot: { status: "completed", confirmed: [ME, OPP] } })), {
    outcome: { kind: "confirmed", via: "reconciler" },
    delayMs: 0,
  });
});

test("confirm: a disputed row finishes it at once", () => {
  assert.deepEqual(confirmDecision(signals({ snapshot: { status: "disputed", confirmed: [] } })), {
    outcome: { kind: "disputed", via: "reconciler" },
    delayMs: 0,
  });
});

test("confirm: the opponent's match_disputed finishes it at once", () => {
  assert.deepEqual(confirmDecision(signals({ opponentDisputed: true, snapshot: { status: "completed", confirmed: [] } })), {
    outcome: { kind: "disputed", via: "broadcast" },
    delayMs: 0,
  });
});

test("confirm: both confirmed by broadcast finishes it after the app's delay", () => {
  assert.deepEqual(confirmDecision(signals({ myConfirmed: true, opponentConfirmed: true })), {
    outcome: { kind: "confirmed", via: "broadcast" },
    delayMs: APP_TIMING.CONFIRM_ADVANCE_MS,
  });
});

test("confirm: the opponent confirming alone does not finish it", () => {
  assert.equal(confirmDecision(signals({ opponentConfirmed: true })), null);
});

test("confirm: my tap plus the opponent's DB row finishes it after the delay", () => {
  assert.deepEqual(confirmDecision(signals({ myConfirmed: true, snapshot: { status: "completed", confirmed: [OPP] } })), {
    outcome: { kind: "confirmed", via: "reconciler" },
    delayMs: APP_TIMING.CONFIRM_ADVANCE_MS,
  });
});
