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
import { confirmDecision, handlerToEvent, liveGoAt, readyFromSnapshot, weightCheckAction, type ConfirmSignals } from "../bot/match-side";
import type { MatchWeightChecks, WeightCheck, WeightCheckStatus } from "@jits/shared/api/match-weight-checks";

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
    // The ready check moved into the face-off (match-flow redesign), which
    // repeats ready_signal (and its weigh-in / recording state) on this beat.
    appConst("apps/mobile/lib/match-flow/use-faceoff.ts", "FACEOFF_REPEAT_MS"),
  );
  // The confirm step's advance is a named delay since jits-02vo.7; pin both
  // the value and that it is the delay the advance is scheduled on.
  const confirmPath = "apps/mobile/components/match-flow/steps/confirm-step.tsx";
  assert.match(
    src(confirmPath),
    /setTimeout\(advance,\s*ADVANCE_AFTER_CONFIRM_MS\)/,
    "ConfirmStep no longer schedules its advance on ADVANCE_AFTER_CONFIRM_MS",
  );
  assert.equal(APP_TIMING.CONFIRM_ADVANCE_MS, appConst(confirmPath, "ADVANCE_AFTER_CONFIRM_MS"));
  // The 3-2-1 in front of the live step, and that GO is what the live stage
  // and the clock use (the bot's `liveGoAt` / auto-end).
  assert.equal(APP_TIMING.COUNTDOWN_MS, appConst("apps/mobile/components/match-flow/countdown/countdown.tsx", "COUNTDOWN_MS"));
  const stage = src("apps/mobile/components/match-flow/countdown/live-stage.tsx");
  assert.match(stage, /const serverGo = Date\.parse\(startedAt\) \+ COUNTDOWN_MS;/);
  assert.match(stage, /Math\.min\(serverGo, mountedAt \+ COUNTDOWN_MS\)/);
  assert.match(stage, /new Date\(t \+ COUNTDOWN_MS\)\.toISOString\(\)/);
});

test("live: GO is the server's start plus the countdown, capped at one countdown after mount", () => {
  const t0 = Date.parse("2026-10-19T20:00:00.000Z");
  // Mounted when the server started: GO = start + countdown.
  assert.equal(liveGoAt(new Date(t0).toISOString(), t0), t0 + APP_TIMING.COUNTDOWN_MS);
  // A phone that mounts late still has GO at the server's GO...
  assert.equal(liveGoAt(new Date(t0).toISOString(), t0 + 1_000), t0 + APP_TIMING.COUNTDOWN_MS);
  // ...and one that is ahead of the server never waits more than one countdown.
  assert.equal(liveGoAt(new Date(t0 + 10_000).toISOString(), t0), t0 + APP_TIMING.COUNTDOWN_MS);
  assert.equal(liveGoAt("not a date", t0), t0);
});

test("the confirm step does not treat a completed status as done (app source)", () => {
  const confirm = src("apps/mobile/components/match-flow/steps/confirm-step.tsx");
  assert.doesNotMatch(confirm, /matchStatus/, "ConfirmStep reads the match status again: re-check the bot's confirm logic");
});

test("the bot pulls in no React / React Native / Expo module", () => {
  // match-side (and through it protocol, reconcile, @jits/shared) is loaded
  // by the imports above. Anything from React land would mean the bot is
  // importing app code that is not pure, and could break or diverge.
  const bad = Object.keys(require.cache).filter((p) =>
    /[\\/]node_modules[\\/](react|react-native|expo[^\\/]*|@expo[\\/][^\\/]+|react-native-[^\\/]+)[\\/]/.test(p),
  );
  assert.ok(Object.keys(require.cache).some((p) => /bot[\\/]match-side\.ts$/.test(p)), "match-side not in require.cache");
  assert.deepEqual(bad, []);
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

// --- face-off weight check (jr_be-ahn.4, jits-c3vd) --------------------------------

function checks(mine: Partial<WeightCheck> & { status: WeightCheckStatus }): MatchWeightChecks {
  const base = { weightSeen: null, flagCount: 0, flaggedAt: null, reweighedAt: null, updatedAt: null };
  return {
    matchId: "m",
    required: false,
    blocked: false,
    canStart: true,
    weights: { [ME]: 170, [OPP]: 170 },
    checks: [
      { ...base, checkerId: OPP, subjectId: ME, status: "pending" },
      { ...base, checkerId: ME, subjectId: OPP, ...mine },
    ],
  };
}

test("weight step: the face-off waits for this athlete's own check (app source)", () => {
  // useFaceoff moves to ready only once my weight is in AND my check of the
  // opponent is confirmed (or the match has no checks). That is why the bot
  // confirms its check before entering ready.
  const faceoff = src("apps/mobile/lib/match-flow/use-faceoff.ts");
  assert.match(faceoff, /const myCheckDone = checkState\.mine\?\.status === "confirmed";/);
  assert.match(
    faceoff,
    /if \(checks\.status === "unavailable" \|\| checks\.status === "idle" \|\| myCheckDone\) pRef\.current\.onWeighedIn\(\);/,
  );
});

test("weight step: no checks (unavailable) or my check confirmed means straight to ready", () => {
  assert.equal(weightCheckAction(null, ME), "none");
  assert.equal(weightCheckAction(checks({ status: "confirmed" }), ME), "none");
});

test("weight step: a pending or recheck verdict is owed, so the bot confirms it", () => {
  assert.equal(weightCheckAction(checks({ status: "pending" }), ME), "confirm");
  assert.equal(weightCheckAction(checks({ status: "recheck" }), ME), "confirm");
});

test("weight step: my open flag holds the match; a re-weigh since the flag reopens the verdict", () => {
  const flaggedAt = "2026-10-19T10:00:00Z";
  assert.equal(weightCheckAction(checks({ status: "flagged", flaggedAt }), ME), "hold");
  assert.equal(weightCheckAction(checks({ status: "flagged", flaggedAt, reweighedAt: "2026-10-19T10:01:00Z" }), ME), "confirm");
});

test("weight step: only this athlete's own check counts", () => {
  // The opponent's check of me is pending above; mine decides.
  const state = checks({ status: "confirmed" });
  assert.equal(state.checks.find((c) => c.checkerId === OPP)?.status, "pending");
  assert.equal(weightCheckAction(state, ME), "none");
});
