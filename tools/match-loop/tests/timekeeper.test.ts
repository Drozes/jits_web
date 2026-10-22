/**
 * Timekeeper-mode harness tests (slice M7, TEST-PLAN 4.2). Pure: no
 * simulator, no network, no database. They pin what the timekeeper
 * scenarios rely on: the bot's capability header option (off by default, so
 * every flag-OFF bot is the shipped client), the scoped fixtures (the shared
 * flag is only ever flipped by a window that restores it), the bot
 * timekeeper's decisions, the selectors built from the app's own copy deck,
 * the pending rule and the scenario registry.
 */
import { after, test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { RUNS_DIR } from "../config";
import { capabilityHeaders, CLIENT_CAPS_HEADER, makeClient, MobileOpponent, TIMEKEEPER_CAP } from "../bot/opponent";
import { clockSeconds, pendingRequestRow, startDecision, TimekeeperBot, TimekeeperSide, timekeeperVerdictsOwed, TkAthleteSide, tkAthleteRoles } from "../bot/timekeeper";
import { APP_TIMING, SESSION_MATCH_EVENTS as E, targetFor, TK_TIMING, validatePayload } from "../bot/protocol";
import {
  activateFourthSql,
  addFriendshipsSql,
  ATHLETE_RESTORE_COLUMNS,
  athleteColumnsSql,
  clearWindowsSql,
  CONSENT_COLUMNS,
  friendshipPairs,
  holderAlive,
  holdFlagForRun,
  INVITE_LIMITS,
  inviteCapProblem,
  inviteCleanupSql,
  inviteCountsSql,
  mergeRestore,
  planFlagWindow,
  PLATFORM_ROLE_COLUMNS,
  putBackFailures,
  readRestoreRecord,
  removeFriendshipsSql,
  recoverFixtures,
  RESTORE_FILE,
  roleOffProblem,
  setFlagsSql,
  timekeeperFlagState,
  timekeeperResetSql,
  TK_ROLE_FLAG,
  TK_WEIGHT_CHECK_FLAG,
  TK_WINDOW_KEYS,
  unrestoredSetColumns,
  windowsSql,
  withAthleteColumns,
  withFlags,
  withFriendships,
  withInviteCleanup,
  withWindows,
  type AthleteColumnIo,
  type AthleteRestore,
  type FlagIo,
  type RestoreRecord,
  type SqlIo,
} from "../fixtures/timekeeper";
import {
  APP_CLIENT_SOURCE,
  appSendsTimekeeperCap,
  CAP_SOURCE_DIRS,
  integratedSlices,
  pendingFails,
  pendingReason,
  SLICE_MARKERS,
  type MobileSlice,
} from "../scenarios/timekeeper/integration";
import { metroProjectRoot, metroTreeProblem } from "../oracle/logs";
import { TIMEKEEPER_DECK_MESSAGES } from "@jits/shared/api/timekeeper";
import { droppedOut, historyVerdict, recipientsOf } from "../oracle/tk-db";
import { anyNameRe, countdownSeconds, DEADLINE_CHIP_RE, NO_CONTEST_CHIP_RE, nameForms, TimekeeperScreens, TK_CONFIRM_SETTLE_MS, TK_UI, YOUR_RATING } from "../sim/timekeeper-screens";
import { INVITE_CLAIM_MARKERS, Screens } from "../sim/screens";
import type { Simctl } from "../sim/simctl";
import { PRACTICE_PARTNER, PRACTICE_UI, portraitIn } from "../sim/capture-screens";
import { appleScriptString, deviceNameIn, orientationOf, parseWindowSize, rotateScript } from "../sim/simctl";
import { acquireRunLock, psProbe, readRunLock, RUN_LOCK_FILE, runLockRefusal, selfStarted, type ProcessIdentity, type RunLock } from "../lib/run-lock";
import { onInterrupt, runCleanup } from "../lib/cleanup";
import { errorFingerprint, exitCodeFor, finalStatus, oracleFingerprint, pendingResult, scenarioResult, type ScenarioRun } from "../lib/results";
import { EnvError, ExpectationTimeout, HarnessError } from "../lib/util";
import { SCENARIOS, NOT_IMPLEMENTED, scenariosForTier } from "../scenarios";
import { TIMEKEEPER_COPY as C, SHIPPED_COPY } from "../../../apps/mobile/lib/match-flow/timekeeper-copy";
import { DOB_REQUIRED_COPY } from "../../../packages/shared/src/utils/invite-copy";
import { TK } from "../scenarios/timekeeper/tk-flows";
import type { Config } from "../config";
import { Trace } from "../bot/trace";
import { frameContains, Idb, tapPoint, type AXElement, type Query, type StillTiming } from "../sim/idb";

const ROOT = resolve(__dirname, "../../..");
const src = (rel: string) => readFileSync(join(ROOT, rel), "utf8");

/**
 * Every temp folder this file makes (the fake IO's restore records, the
 * recovery and run-lock tests), removed once the file's tests are done (M7
 * review minor 5). Only these folders: the shared restore record and run lock
 * under ~/.cache/elorated-match-loop are never touched.
 */
const tempDirs: string[] = [];
function tempDir(prefix: string): string {
  const dir = mkdtempSync(join(tmpdir(), prefix));
  tempDirs.push(dir);
  return dir;
}
after(() => {
  for (const dir of tempDirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

const cfg = {
  supabaseUrl: "http://127.0.0.1:54321",
  publishableKey: "sb_publishable_test",
} as Config;

// --- capability header ------------------------------------------------------------------

test("a bot sends no capability header unless asked (flag-OFF bots are the shipped client)", () => {
  assert.deepEqual(capabilityHeaders(undefined), {});
  assert.deepEqual(capabilityHeaders([]), {});
  assert.deepEqual(capabilityHeaders(["  "]), {});
  assert.deepEqual(capabilityHeaders([TIMEKEEPER_CAP]), { [CLIENT_CAPS_HEADER]: "timekeeper_v1" });
  assert.deepEqual(capabilityHeaders(["timekeeper_v1", "x_v2"]), { [CLIENT_CAPS_HEADER]: "timekeeper_v1,x_v2" });
  assert.equal(CLIENT_CAPS_HEADER, "x-elo-client-caps", "the header the server's _request_client_caps reads (jr_be 024 3.3)");
});

test("makeClient puts the header on PostgREST calls only when asked", () => {
  const plain = makeClient(cfg) as unknown as { rest: { headers: Headers } };
  const capable = makeClient(cfg, { capabilities: [TIMEKEEPER_CAP] }) as unknown as { rest: { headers: Headers } };
  assert.equal(plain.rest.headers.get(CLIENT_CAPS_HEADER), null);
  assert.equal(capable.rest.headers.get(CLIENT_CAPS_HEADER), "timekeeper_v1");
});

test("MobileOpponent defaults to no capability; the timekeeper option is explicit", () => {
  const trace = { note() {}, add() {} } as unknown as Trace;
  const me = { id: "r", email: "r@x", displayName: "Demo Red", key: "red" as const };
  assert.equal(new MobileOpponent(cfg, me, trace, "pw").timekeeperCapable, false);
  assert.equal(new MobileOpponent(cfg, me, trace, "pw", { capabilities: [TIMEKEEPER_CAP] }).timekeeperCapable, true);
});

// --- scoped fixtures -----------------------------------------------------------------------

test("every temp folder this file makes goes through tempDir, so the after hook removes it", () => {
  const self = readFileSync(__filename, "utf8");
  assert.equal(self.match(/mkdtempSync\(/g)?.length, 1, "only tempDir calls mkdtempSync");
});

test("a flag window flips only what differs and restores the original values", () => {
  const plan = planFlagWindow({ [TK_ROLE_FLAG]: true, [TK_WEIGHT_CHECK_FLAG]: true }, { [TK_ROLE_FLAG]: false, [TK_WEIGHT_CHECK_FLAG]: true }, new Map());
  assert.deepEqual(plan, { flip: { [TK_ROLE_FLAG]: true }, restore: { [TK_ROLE_FLAG]: false } });
  const off = planFlagWindow({ [TK_ROLE_FLAG]: true, [TK_WEIGHT_CHECK_FLAG]: false }, { [TK_ROLE_FLAG]: false, [TK_WEIGHT_CHECK_FLAG]: true }, new Map());
  assert.deepEqual(off, { flip: { [TK_ROLE_FLAG]: true, [TK_WEIGHT_CHECK_FLAG]: false }, restore: { [TK_ROLE_FLAG]: false, [TK_WEIGHT_CHECK_FLAG]: true } });
});

test("a flag window refuses a timekeeper_role somebody else left on, and a missing flag", () => {
  const foreign = planFlagWindow({ [TK_ROLE_FLAG]: true }, { [TK_ROLE_FLAG]: true }, new Map());
  assert.ok("refuse" in foreign && /did not turn it on/.test(foreign.refuse));
  const missing = planFlagWindow({ [TK_ROLE_FLAG]: true }, { [TK_ROLE_FLAG]: null }, new Map());
  assert.ok("refuse" in missing && /does not exist/.test(missing.refuse));
  // Held ON by this run (`--tk-flag-on`): nothing to flip, nothing to restore.
  assert.deepEqual(planFlagWindow({ [TK_ROLE_FLAG]: true }, { [TK_ROLE_FLAG]: true }, new Map([[TK_ROLE_FLAG, true]])), { flip: {}, restore: {} });
});

/**
 * A flag store for the window tests: the local stack's flags as a map, a
 * write that can be made to fail (a psql error while putting a flag back),
 * and a restore record in a temp folder, never the shared one.
 */
function fakeFlagIo(initial: Record<string, boolean>): { io: FlagIo; db: Record<string, boolean>; failWrites: { on: boolean }; writes: Record<string, boolean>[] } {
  const db = { ...initial };
  const failWrites = { on: false };
  const writes: Record<string, boolean>[] = [];
  const io: FlagIo = {
    restorePath: join(tempDir("tk-flags-"), "fixture-restore.json"),
    read: async (keys) => Object.fromEntries(keys.map((k) => [k, k in db ? db[k] : null])),
    write: async (values) => {
      writes.push(values);
      if (failWrites.on) throw new Error("psql failed putting the flag back");
      Object.assign(db, values);
    },
  };
  return { io, db, failWrites, writes };
}

test("a flag window whose put-back fails stops holding the flag: the leftover ON is refused, never run under", async () => {
  const { io, db, failWrites } = fakeFlagIo({ [TK_ROLE_FLAG]: false });
  const notes: string[] = [];
  await assert.rejects(
    withFlags(
      { [TK_ROLE_FLAG]: true },
      async () => {
        assert.deepEqual(await timekeeperFlagState(io), { enabled: true, heldByThisRun: true }, "held inside the window");
        failWrites.on = true;
      },
      (what) => notes.push(what),
      io,
    ),
    /psql failed putting the flag back/,
    "the failed put-back propagates",
  );
  assert.equal(db[TK_ROLE_FLAG], true, "the shared flag is still ON");
  assert.deepEqual(await timekeeperFlagState(io), { enabled: true, heldByThisRun: false }, "no longer held by this run");
  assert.deepEqual(notes, ["flag_window_open", "flag_restore_failed"], "the trace says the put-back failed, not that the window closed");
  // tkScenario's env:timekeeper-role-off-before, and the next window, now see a foreign ON.
  const state = await timekeeperFlagState(io);
  assert.equal(state.enabled === true && !state.heldByThisRun, true);
  assert.match(roleOffProblem(state.enabled, state.heldByThisRun) ?? "", /no match-loop run set it/);
  let ran = false;
  await assert.rejects(
    withFlags({ [TK_ROLE_FLAG]: true }, async () => {
      ran = true;
    }, undefined, io),
    (e: unknown) => e instanceof EnvError && /this run did not turn it on/.test(e.message),
  );
  assert.equal(ran, false, "a later timekeeper window refuses before running");
  await assert.rejects(holdFlagForRun(io), (e: unknown) => e instanceof EnvError, "so does --tk-flag-on");
  // The record and the interrupt hook are kept, so the run's exit puts the flag back.
  assert.deepEqual(JSON.parse(readFileSync(io.restorePath, "utf8")).flags, { [TK_ROLE_FLAG]: false });
  failWrites.on = false;
  await runCleanup();
  assert.equal(db[TK_ROLE_FLAG], false, "the kept hook restored it at exit");
  assert.equal(existsSync(io.restorePath), false, "and settled the record");
});

/**
 * The scenario's own failure (the error a fixture body throws in the M7
 * review's reproduction), to check that a failing put-back never replaces it.
 */
const bodyFailure = () => new ExpectationTimeout("the app never showed TK-D9", 10, null);
/** How a fixture's trace names an error (`errorText` in fixtures/timekeeper.ts). */
const errorTextOf = (e: Error) => `${e.name}: ${e.message}`;

test("a flag window whose put-back fails after the scenario failed rethrows the scenario's error; the put-back rides along (M7 review)", async () => {
  const { io, db, failWrites } = fakeFlagIo({ [TK_ROLE_FLAG]: false });
  const notes: { what: string; payload: unknown }[] = [];
  const body = bodyFailure();
  await assert.rejects(
    withFlags({ [TK_ROLE_FLAG]: true }, async () => {
      failWrites.on = true;
      throw body;
    }, (what, payload) => notes.push({ what, payload }), io),
    (e: unknown) => e === body,
    "the scenario's error, unchanged: its status, message and fingerprint are the run's",
  );
  assert.deepEqual(putBackFailures(body), ["flag_window: Error: psql failed putting the flag back"], "the result lists the failed put-back");
  assert.deepEqual(notes.map((n) => n.what), ["flag_window_open", "flag_restore_failed", "flag_window_body_error"]);
  assert.deepEqual(notes[2].payload, { error: `ExpectationTimeout: ${body.message}` }, "the trace names what the put-back would have hidden");
  assert.deepEqual(putBackFailures(new Error("any other")), [], "none on an error that hid nothing");
  failWrites.on = false;
  await runCleanup();
  assert.equal(db[TK_ROLE_FLAG], false, "the kept hook still puts the flag back at exit");
});

test("a flag window that puts the flag back stops holding it and unhooks", async () => {
  const { io, db, writes } = fakeFlagIo({ [TK_ROLE_FLAG]: false, [TK_WEIGHT_CHECK_FLAG]: true });
  assert.equal(await withFlags({ [TK_ROLE_FLAG]: true, [TK_WEIGHT_CHECK_FLAG]: true }, async () => "made", undefined, io), "made");
  assert.deepEqual(writes, [{ [TK_ROLE_FLAG]: true }, { [TK_ROLE_FLAG]: false }], "only the differing flag is flipped and put back");
  assert.deepEqual(await timekeeperFlagState(io), { enabled: false, heldByThisRun: false });
  assert.equal(existsSync(io.restorePath), false);
  await runCleanup();
  assert.equal(writes.length, 2, "no hook left behind to write again");
  assert.equal(db[TK_ROLE_FLAG], false);
});

test("--tk-flag-on's release stops holding the flag even when the put-back fails", async () => {
  const { io, db, failWrites } = fakeFlagIo({ [TK_ROLE_FLAG]: false });
  const release = await holdFlagForRun(io);
  assert.deepEqual(await timekeeperFlagState(io), { enabled: true, heldByThisRun: true });
  failWrites.on = true;
  await assert.rejects(release(), /psql failed putting the flag back/);
  assert.deepEqual(await timekeeperFlagState(io), { enabled: true, heldByThisRun: false }, "a leftover ON is foreign from now on");
  await assert.rejects(withFlags({ [TK_ROLE_FLAG]: true }, async () => undefined, undefined, io), (e: unknown) => e instanceof EnvError);
  failWrites.on = false;
  await runCleanup();
  assert.equal(db[TK_ROLE_FLAG], false, "the kept hook restored it at exit");
});

test("--tk-flag-on whose flip fails does not hold the flag", async () => {
  const { io, failWrites } = fakeFlagIo({ [TK_ROLE_FLAG]: false });
  failWrites.on = true;
  await assert.rejects(holdFlagForRun(io), /psql failed/);
  assert.equal((await timekeeperFlagState(io)).heldByThisRun, false);
  failWrites.on = false;
  await runCleanup();
});

/**
 * A database for the window and invite fixture tests: every statement is
 * recorded, the restore record is read at each one (to prove it was written
 * BEFORE the change), and a statement matching `fail` throws.
 */
function fakeSqlIo(answer: (sql: string) => string = () => "1") {
  const sql: string[] = [];
  const recordAt: (RestoreRecord | null)[] = [];
  const fail: { re: RegExp | null } = { re: null };
  const io: SqlIo = {
    restorePath: join(tempDir("tk-sql-"), "fixture-restore.json"),
    exec: async (s) => {
      sql.push(s);
      recordAt.push(readRestoreRecord(io.restorePath));
      if (fail.re?.test(s)) throw new Error("psql failed");
      return answer(s);
    },
  };
  return { io, sql, recordAt, fail };
}

test("a window is recorded before it is written, removed in the finally, and the record settled", async () => {
  const { io, sql, recordAt } = fakeSqlIo();
  const notes: string[] = [];
  let during: string[] | undefined;
  const out = await withWindows({ tk_request_lapse: 20 }, async () => {
    during = readRestoreRecord(io.restorePath)?.windows;
    return "ran";
  }, (what) => notes.push(what), io);
  assert.equal(out, "ran");
  assert.deepEqual(sql, [windowsSql({ tk_request_lapse: 20 }), clearWindowsSql(["tk_request_lapse"])]);
  assert.deepEqual(recordAt[0]?.windows, ["tk_request_lapse"], "recorded before the upsert");
  assert.deepEqual(during, ["tk_request_lapse"], "and kept while the scenario runs");
  assert.equal(existsSync(io.restorePath), false, "settled once removed");
  assert.deepEqual(notes, ["windows_set", "windows_cleared"]);
  await runCleanup();
  assert.equal(sql.length, 2, "no hook left behind");
});

test("a scenario that throws still has its windows removed", async () => {
  const { io, sql } = fakeSqlIo();
  await assert.rejects(withWindows({ tk_pause_window: 30 }, async () => {
    throw new Error("scenario failed");
  }, undefined, io), /scenario failed/);
  assert.equal(sql[sql.length - 1], clearWindowsSql(["tk_pause_window"]));
  assert.equal(existsSync(io.restorePath), false);
});

test("a window whose removal fails keeps its hook and record: the run's exit removes it", async () => {
  const { io, sql, fail } = fakeSqlIo();
  fail.re = /^delete from public\.server_settings/;
  const notes: string[] = [];
  await assert.rejects(withWindows({ tk_stall_window: 20 }, async () => "ran", (what) => notes.push(what), io), /psql failed/);
  assert.deepEqual(notes, ["windows_set", "windows_clear_failed"], "the trace says the removal failed, not that it happened");
  assert.deepEqual(readRestoreRecord(io.restorePath)?.windows, ["tk_stall_window"], "the record stays for the next run's start");
  fail.re = null;
  await runCleanup();
  assert.equal(sql.filter((s) => s === clearWindowsSql(["tk_stall_window"])).length, 2, "the kept hook removed it at exit");
  assert.equal(existsSync(io.restorePath), false);
});

test("a window whose removal fails after the scenario failed rethrows the scenario's error; the removal rides along (M7 review)", async () => {
  const { io, sql, fail } = fakeSqlIo();
  const notes: string[] = [];
  const body = bodyFailure();
  await assert.rejects(withWindows({ tk_stall_window: 20 }, async () => {
    fail.re = /^delete from public\.server_settings/;
    throw body;
  }, (what) => notes.push(what), io), (e: unknown) => e === body);
  assert.deepEqual(putBackFailures(body), ["windows: Error: psql failed"]);
  assert.deepEqual(notes, ["windows_set", "windows_clear_failed", "windows_body_error"]);
  assert.deepEqual(readRestoreRecord(io.restorePath)?.windows, ["tk_stall_window"], "the record stays for the next run's start");
  fail.re = null;
  await runCleanup();
  assert.equal(sql.filter((x) => x === clearWindowsSql(["tk_stall_window"])).length, 2, "the kept hook removed it at exit");
});

test("a bad window is refused before anything is recorded or written; none is a no-op", async () => {
  const { io, sql } = fakeSqlIo();
  await assert.rejects(withWindows({ tk_pause_window: 0 }, async () => "ran", undefined, io), /positive/);
  assert.deepEqual(sql, []);
  assert.equal(existsSync(io.restorePath), false);
  assert.equal(await withWindows({}, async () => "ran", undefined, io), "ran");
  assert.deepEqual(sql, []);
});

test("T17's invite cleanup deletes every challenge invite the inviter created since it started (which also uncounts its booking)", () => {
  const one = inviteCleanupSql([{ inviter: "red", since: "2026-10-21 23:00:00.5+00" }]);
  assert.match(
    one,
    /^with gone as \(\s+delete from public\.invites where kind = 'challenge' and \(\(inviter_id = 'red' and created_at >= '2026-10-21 23:00:00\.5\+00'::timestamptz\)\) returning id\s+\) select count\(\*\) from gone$/,
  );
  const two = inviteCleanupSql([
    { inviter: "red", since: "t1" },
    { inviter: "red", since: "t2" },
  ]);
  assert.match(two, /\(inviter_id = 'red' and created_at >= 't1'::timestamptz\) or \(inviter_id = 'red' and created_at >= 't2'::timestamptz\)/);
  assert.equal(inviteCleanupSql([]), "select 0");
  assert.doesNotMatch(one, /challenges|matches|feature_flags/, "only the invites: the foreign keys null the booking's invite_id, which is all the weekly cap reads");
});

test("withInviteCleanup records the inviter and the database time first, deletes in the finally whatever happened, and settles", async () => {
  const since = "2026-10-21 23:00:00.5+00";
  const { io, sql, recordAt, fail } = fakeSqlIo((s) => (s === "select now()::text" ? since : "1"));
  const notes: { what: string; payload: unknown }[] = [];
  let during: RestoreRecord | null = null;
  assert.equal(await withInviteCleanup("red", async () => {
    during = readRestoreRecord(io.restorePath);
    return "booked";
  }, (what, payload) => notes.push({ what, payload }), io), "booked");
  assert.deepEqual(sql, ["select now()::text", inviteCleanupSql([{ inviter: "red", since }])]);
  assert.deepEqual((during as RestoreRecord | null)?.invites, [{ inviter: "red", since }], "recorded before the scenario creates an invite");
  assert.equal(recordAt[0], null, "nothing recorded before the database time is read");
  assert.equal(existsSync(io.restorePath), false, "settled");
  assert.deepEqual(notes, [{ what: "invites_deleted", payload: { inviter: "red", since, deleted: 1 } }]);
  // A failing scenario still deletes.
  sql.length = 0;
  await assert.rejects(withInviteCleanup("red", async () => {
    throw new Error("claim failed");
  }, undefined, io), /claim failed/);
  assert.equal(sql[sql.length - 1], inviteCleanupSql([{ inviter: "red", since }]));
  // A failing delete keeps the hook and the record: the run's exit, or the next run's start, deletes them.
  sql.length = 0;
  fail.re = /^with gone as/;
  await assert.rejects(withInviteCleanup("red", async () => "booked", undefined, io), /psql failed/);
  assert.deepEqual(readRestoreRecord(io.restorePath)?.invites, [{ inviter: "red", since }]);
  fail.re = null;
  await runCleanup();
  assert.equal(sql.filter((s) => s.startsWith("with gone as")).length, 2, "the kept hook deleted them at exit");
  assert.equal(existsSync(io.restorePath), false);
});

test("withInviteCleanup whose delete fails after the scenario failed rethrows the scenario's error; the delete rides along (M7 review)", async () => {
  const since = "2026-10-21 23:00:00.5+00";
  const { io, sql, fail } = fakeSqlIo((x) => (x === "select now()::text" ? since : "1"));
  const notes: string[] = [];
  const body = bodyFailure();
  await assert.rejects(withInviteCleanup("red", async () => {
    fail.re = /^with gone as/;
    throw body;
  }, (what) => notes.push(what), io), (e: unknown) => e === body);
  assert.deepEqual(putBackFailures(body), ["invites: Error: psql failed"]);
  assert.deepEqual(notes, ["invites_cleanup_failed", "invites_body_error"]);
  assert.deepEqual(readRestoreRecord(io.restorePath)?.invites, [{ inviter: "red", since }]);
  fail.re = null;
  await runCleanup();
  assert.equal(sql.filter((x) => x.startsWith("with gone as")).length, 2, "the kept hook deleted them at exit");
});

test("nested fixtures that all fail to put back keep the scenario's error and list every put-back, innermost first", async () => {
  const flags = fakeFlagIo({ [TK_ROLE_FLAG]: false });
  const win = fakeSqlIo();
  const body = bodyFailure();
  await assert.rejects(
    withFlags({ [TK_ROLE_FLAG]: true }, () =>
      withWindows({ tk_pause_window: 30 }, async () => {
        flags.failWrites.on = true;
        win.fail.re = /^delete from public\.server_settings/;
        throw body;
      }, undefined, win.io), undefined, flags.io),
    (e: unknown) => e === body,
  );
  assert.deepEqual(putBackFailures(body), ["windows: Error: psql failed", "flag_window: Error: psql failed putting the flag back"]);
  flags.failWrites.on = false;
  win.fail.re = null;
  await runCleanup();
  assert.equal(flags.db[TK_ROLE_FLAG], false);
});

/** The friendships T11 and T17 add: the insert answers with the pairs it created. */
const FRIEND_PAIR: [string, string] = ["1111", "2222"];
const friendsAnswer = (x: string) => (x.startsWith("with ins as") ? JSON.stringify([{ athlete_a: FRIEND_PAIR[0], athlete_b: FRIEND_PAIR[1] }]) : "DELETE 1");

test("withFriendships adds the missing friendships, removes only the ones it added in the finally, and unhooks", async () => {
  const { io, sql } = fakeSqlIo(friendsAnswer);
  const notes: string[] = [];
  assert.equal(await withFriendships(["2222", "1111"], async () => "ran", (what) => notes.push(what), io), "ran");
  assert.deepEqual(sql, [addFriendshipsSql([FRIEND_PAIR]), removeFriendshipsSql([FRIEND_PAIR])]);
  assert.deepEqual(notes, []);
  await runCleanup();
  assert.equal(sql.length, 2, "no hook left behind");
  // A scenario that throws still has them removed.
  sql.length = 0;
  await assert.rejects(withFriendships(["1111", "2222"], async () => {
    throw new Error("scenario failed");
  }, undefined, io), /scenario failed/);
  assert.equal(sql[sql.length - 1], removeFriendshipsSql([FRIEND_PAIR]));
});

test("withFriendships whose removal fails after the scenario failed rethrows the scenario's error, notes the failure and keeps its hook (W3FIX review minor 3)", async () => {
  const { io, sql, fail } = fakeSqlIo(friendsAnswer);
  const notes: { what: string; payload: unknown }[] = [];
  const body = bodyFailure();
  await assert.rejects(withFriendships(["1111", "2222"], async () => {
    fail.re = /^delete from public\.athlete_friendships/;
    throw body;
  }, (what, payload) => notes.push({ what, payload }), io), (e: unknown) => e === body, "the body's error, unchanged");
  assert.deepEqual(putBackFailures(body), ["friendships: Error: psql failed"]);
  assert.deepEqual(notes, [
    { what: "friendships_remove_failed", payload: { pairs: [FRIEND_PAIR], error: "psql failed" } },
    { what: "friendships_body_error", payload: { error: errorTextOf(body) } },
  ]);
  fail.re = null;
  await runCleanup();
  assert.equal(sql.filter((x) => x === removeFriendshipsSql([FRIEND_PAIR])).length, 2, "the kept hook removed them at exit");
});

test("withFriendships whose removal alone fails throws the removal's error and keeps its hook", async () => {
  const { io, sql, fail } = fakeSqlIo(friendsAnswer);
  fail.re = /^delete from public\.athlete_friendships/;
  const notes: string[] = [];
  await assert.rejects(withFriendships(["1111", "2222"], async () => "ran", (what) => notes.push(what), io), /psql failed/);
  assert.deepEqual(notes, ["friendships_remove_failed"]);
  fail.re = null;
  await runCleanup();
  assert.equal(sql.filter((x) => x === removeFriendshipsSql([FRIEND_PAIR])).length, 2, "the kept hook removed them at exit");
});

test("Red's invite limits are create_invite's; a reached one is an env_error naming its HINT, checked before T17 runs", () => {
  assert.deepEqual(INVITE_LIMITS, { weeklyMatches: 3, openInvites: 5, dailyInvites: 20 });
  assert.equal(inviteCapProblem({ weeklyMatches: 2, openInvites: 4, dailyInvites: 19 }), null);
  assert.match(inviteCapProblem({ weeklyMatches: 3, openInvites: 0, dailyInvites: 0 }, "Demo Red") ?? "", /^Demo Red has reached weekly_invite_match_cap \(3 invite matches in 7 days, cap 3; /);
  assert.match(inviteCapProblem({ weeklyMatches: 0, openInvites: 5, dailyInvites: 0 }) ?? "", /too_many_open_invites \(5 open, cap 5\)/);
  assert.match(inviteCapProblem({ weeklyMatches: 0, openInvites: 0, dailyInvites: 20 }) ?? "", /daily_invite_limit \(20 in 24 hours, cap 20\)/);
  const counts = inviteCountsSql("red");
  assert.match(counts, /public\._invite_weekly_matches_used\('red'\) as "weeklyMatches"/);
  assert.match(counts, /kind = 'challenge'\s+and status = 'open' and link_expires_at > now\(\)\) as "openInvites"/);
  assert.match(counts, /kind = 'challenge'\s+and created_at > now\(\) - interval '24 hours'\) as "dailyInvites"/);
  const t17 = src("tools/match-loop/scenarios/timekeeper/t17-invite-booking.ts");
  const capped = t17.indexOf("inviteCapProblem(await readInviteCounts(ctx.ids.red)");
  assert.ok(capped > 0 && capped < t17.indexOf("await withAthleteColumns("), "checked before any fixture or the app is touched");
  assert.match(t17, /if \(capped\) throw new EnvError\(/);
  assert.match(t17, /await withInviteCleanup\(cast\.red\.me\.id, \(\) => inviteBooking\(ctx, cast\), note\);/);
  assert.ok(t17.indexOf("withInviteCleanup(") < t17.indexOf("createInvite(red.client"), "the cleanup is in place before the first invite exists");
  assert.match(t17, /ctx\.simctl\.openUrl\(invite\.scheme_url\)[^]*?\} finally \{[^]*?ctx\.ui\.dropPendingInvite\(\)/, "the device's pending invite is dropped when the claim did not book");
});

test("the restore record keeps the ORIGINAL value of a flag changed twice", () => {
  const first = mergeRestore(null, { flags: { [TK_ROLE_FLAG]: false } });
  const nested = mergeRestore(first, { flags: { [TK_ROLE_FLAG]: true, [TK_WEIGHT_CHECK_FLAG]: true }, windows: ["tk_pause_window"] });
  assert.deepEqual(nested.flags, { [TK_ROLE_FLAG]: false, [TK_WEIGHT_CHECK_FLAG]: true });
  assert.deepEqual(nested.windows, ["tk_pause_window"]);
});

test("the restore record keeps the ORIGINAL value of an athlete column recorded twice", () => {
  const first = mergeRestore(null, { athletes: [{ id: "b", column: "date_of_birth", value: null }] });
  const nested = mergeRestore(first, {
    athletes: [
      { id: "b", column: "date_of_birth", value: "1995-01-01" },
      { id: "g", column: "ai_processing_consent_at", value: null },
    ],
  });
  assert.deepEqual(nested.athletes, [
    { id: "b", column: "date_of_birth", value: null },
    { id: "g", column: "ai_processing_consent_at", value: null },
  ]);
});

test("the restore record lives at one path every worktree shares, outside any checkout", () => {
  assert.ok(RESTORE_FILE.startsWith(homedir()), RESTORE_FILE);
  assert.ok(!RESTORE_FILE.startsWith(RUNS_DIR), "a per-worktree .runs record is never seen by a run in another worktree");
  assert.ok(!RESTORE_FILE.startsWith(resolve(ROOT)), "outside this checkout");
});

test("recovering an empty restore record only removes the file", async () => {
  const dir = tempDir("tk-restore-");
  const path = join(dir, "fixture-restore.json");
  writeFileSync(path, JSON.stringify({ flags: {}, windows: [], pid: 1, at: "x" }));
  assert.deepEqual(await recoverFixtures(path), []);
  assert.equal(existsSync(path), false);
  assert.deepEqual(await recoverFixtures(path), [], "nothing to recover");
});

const HARNESS_PS: ProcessIdentity = { started: "Wed 21 Oct 10:00:00 2026", command: "node /w/node_modules/tsx/dist/cli.mjs tools/match-loop/run.ts --tier core" };
const LONG_AGO = "Thu  1 Jan 00:00:00 2026";

test("a record's holder is alive only while its pid is still the process that wrote it (start time, else a harness command)", () => {
  const is = (who: ProcessIdentity | null) => () => who;
  assert.equal(holderAlive({ pid: process.pid, started: HARNESS_PS.started }, is(HARNESS_PS)), false, "never this process");
  assert.equal(holderAlive({ pid: 0 }, is(HARNESS_PS)), false);
  assert.equal(holderAlive({ pid: 1 }, is(HARNESS_PS)), false, "pid 1 is never a harness run");
  assert.equal(holderAlive({ pid: 4242, started: HARNESS_PS.started }, is(null)), false, "no such process");
  assert.equal(holderAlive({ pid: 4242, started: HARNESS_PS.started }, is(HARNESS_PS)), true, "the same process: the same start time");
  // After a reboot or a pid wrap the pid names another process, a root-owned one included: not the writer.
  assert.equal(holderAlive({ pid: 4242, started: HARNESS_PS.started }, is({ started: "Thu 22 Oct 08:00:00 2026", command: "/usr/libexec/syspolicyd" })), false);
  assert.equal(holderAlive({ pid: 4242, started: HARNESS_PS.started }, is({ ...HARNESS_PS, started: "Thu 22 Oct 08:00:00 2026" })), false, "a later run on the same pid is not the writer either");
  // A record without a start time (an older harness, or ps unreadable then): only a harness command line counts.
  assert.equal(holderAlive({ pid: 4242 }, is(HARNESS_PS)), true);
  assert.equal(holderAlive({ pid: 4242, started: null }, is({ started: "x", command: "/sbin/launchd" })), false);
  // The real probe reads ps, which reports any user's process (no EPERM case to guess about).
  const me = psProbe(process.pid);
  assert.ok(me && me.started.length > 0 && me.command.length > 0, "ps reads this process");
  assert.ok((psProbe(1)?.started ?? "").length > 0, "and a root-owned one");
  assert.equal(psProbe(99_999_999), null, "no such process");
  assert.equal(selfStarted(), me.started, "every lock and restore record names this process's start time");
  const parent = psProbe(process.ppid);
  assert.ok(parent);
  assert.equal(holderAlive({ pid: process.ppid, started: parent.started }), true, "a live process with its own start time");
  assert.equal(holderAlive({ pid: process.ppid, started: LONG_AGO }), false, "the same pid with another start time: recycled");
});

test("a restore record whose run is still alive is in flight, not left behind: recovery refuses; a recycled pid's record is repaired", async () => {
  const dir = tempDir("tk-restore-");
  const path = join(dir, "fixture-restore.json");
  const parent = psProbe(process.ppid)!;
  const noSql = async (): Promise<string> => {
    throw new Error("no SQL while the writer runs");
  };
  writeFileSync(path, JSON.stringify({ flags: { [TK_ROLE_FLAG]: false }, windows: [], pid: process.ppid, started: parent.started, at: "x" }));
  await assert.rejects(recoverFixtures(path, { exec: noSql }), /another match-loop run \(pid \d+\) holds timekeeper fixtures/);
  assert.equal(existsSync(path), true, "the in-flight record is kept");
  // The same pid with another start time (a reboot, a wrap): left behind, so it is repaired, never a refusal of every run.
  writeFileSync(path, JSON.stringify({ flags: {}, windows: ["tk_pause_window"], pid: process.ppid, started: LONG_AGO, at: "x" }));
  const sql: string[] = [];
  assert.deepEqual(await recoverFixtures(path, { exec: async (s) => (sql.push(s), "0") }), ["windows cleared tk_pause_window"]);
  assert.deepEqual(sql, [clearWindowsSql(["tk_pause_window"])]);
  assert.equal(existsSync(path), false);
});

test("the next run's start undoes every kind of fixture a killed run recorded, T17's invites included", async () => {
  const dir = tempDir("tk-restore-");
  const path = join(dir, "fixture-restore.json");
  const athletes = [{ id: "b", column: "date_of_birth" as const, value: null }];
  const invites = [{ inviter: "red", since: "2026-10-21 23:00:00.5+00" }];
  writeFileSync(path, JSON.stringify({ flags: { [TK_ROLE_FLAG]: false }, windows: ["tk_request_lapse"], athletes, invites, pid: 1, started: null, at: "x" }));
  const sql: string[] = [];
  const done = await recoverFixtures(path, { exec: async (s) => (sql.push(s), "1") });
  assert.deepEqual(sql, [setFlagsSql({ [TK_ROLE_FLAG]: false }), clearWindowsSql(["tk_request_lapse"]), athleteColumnsSql(athletes), inviteCleanupSql(invites)]);
  assert.equal(done.length, 4);
  assert.match(done[3], /^challenge invites deleted \(1\) red since 2026-10-21 23:00:00\.5\+00$/);
  assert.equal(existsSync(path), false);
});

test("one run at a time: a live holder refuses, a stale lock is taken over, release removes only my own lock", () => {
  const dir = tempDir("run-lock-");
  const path = join(dir, "run.lock");
  const other: RunLock = { pid: 4242, at: "t", cwd: "/elsewhere", argv: ["--tier", "core"] };
  assert.equal(runLockRefusal(null, () => true), null);
  assert.equal(runLockRefusal({ ...other, pid: process.pid }, () => true), null, "never refused by itself");
  assert.equal(runLockRefusal(other, () => false), null, "a dead holder is stale");
  assert.match(runLockRefusal(other, () => true) ?? "", /another match-loop run \(pid 4242, started t in \/elsewhere: --tier core\)/);
  // Free: taken, and the file names this process and its start time.
  const release = acquireRunLock(path, () => true);
  assert.equal(readRunLock(path)?.pid, process.pid);
  assert.equal(readRunLock(path)?.started, selfStarted());
  release();
  // With the real check: a lock whose pid now has another start time is stale and taken over; a live one refuses.
  const parent = psProbe(process.ppid)!;
  writeFileSync(path, JSON.stringify({ ...other, pid: process.ppid, started: LONG_AGO }));
  acquireRunLock(path)();
  writeFileSync(path, JSON.stringify({ ...other, pid: process.ppid, started: parent.started }));
  assert.throws(() => acquireRunLock(path), (e: unknown) => e instanceof EnvError && /one run at a time/.test(e.message));
  rmSync(path, { force: true });
  assert.equal(existsSync(path), false);
  // Held by a live run: refused, and its lock is kept.
  writeFileSync(path, JSON.stringify(other));
  assert.throws(() => acquireRunLock(path, () => true), (e: unknown) => e instanceof EnvError && /one run at a time/.test(e.message));
  assert.equal(readRunLock(path)?.pid, 4242);
  // Held by a dead run: taken over.
  const again = acquireRunLock(path, () => false);
  assert.equal(readRunLock(path)?.pid, process.pid);
  // A release after another run took the lock over leaves theirs alone.
  writeFileSync(path, JSON.stringify(other));
  again();
  assert.equal(readRunLock(path)?.pid, 4242);
});

test("the run lock lives at one path every worktree shares, and the runner takes it before anything else", () => {
  assert.equal(RUN_LOCK_FILE, join(homedir(), ".cache", "elorated-match-loop", "run.lock"));
  const runner = src("tools/match-loop/run.ts");
  const lock = runner.indexOf("releaseRunLock = acquireRunLock()");
  assert.ok(lock > 0, "the runner takes the lock");
  for (const later of ['run("docker", ["unpause"', "recoverFixtures()", "timekeeperRoleOffProblem()"]) {
    const at = runner.indexOf(later, lock);
    assert.ok(at > lock, `${later} runs after the lock is taken`);
  }
  // Released only after every cleanup hook (both exits of main()).
  assert.equal(runner.match(/await runCleanup\(\);\n\s+releaseRunLock\(\);/g)?.length, 2);
});

test("athlete column SQL sets only the allowlisted columns, NULL included", () => {
  const sql = athleteColumnsSql([
    { id: "b", column: "date_of_birth", value: null },
    { id: "g", column: "ai_processing_consent_at", value: "2026-10-20 21:53:07+00" },
  ]);
  assert.match(sql, /update public\.athletes set date_of_birth = null where id = 'b';/);
  assert.match(sql, /update public\.athletes set ai_processing_consent_at = '2026-10-20 21:53:07\+00' where id = 'g';/);
  assert.throws(() => athleteColumnsSql([{ id: "b", column: "status" as never, value: "active" }]), /not a restorable athlete column/);
  assert.equal(athleteColumnsSql([]), "select 0");
  assert.deepEqual([...CONSENT_COLUMNS], ["ai_processing_consent_at", "ai_processing_consent_version"], "what record_ai_processing_consent writes");
});

test("T8's admin is an allowlisted, restorable column: platform_role, set and put back as postgres", () => {
  assert.ok((ATHLETE_RESTORE_COLUMNS as readonly string[]).includes("platform_role"));
  assert.deepEqual([...PLATFORM_ROLE_COLUMNS], ["platform_role"]);
  assert.match(athleteColumnsSql([{ id: "gold", column: "platform_role", value: "admin" }]), /update public\.athletes set platform_role = 'admin' where id = 'gold';/);
  assert.match(athleteColumnsSql([{ id: "gold", column: "platform_role", value: "member" }]), /set platform_role = 'member' where id = 'gold';/, "the restore");
  // A run killed while Gold is an admin is repaired from the ORIGINAL role.
  const first = mergeRestore(null, { athletes: [{ id: "gold", column: "platform_role", value: "member" }] });
  const again = mergeRestore(first, { athletes: [{ id: "gold", column: "platform_role", value: "admin" }] });
  assert.deepEqual(again.athletes, [{ id: "gold", column: "platform_role", value: "member" }]);
  // T8 sets it through the scoped fixture, never by hand.
  const t8 = src("tools/match-loop/scenarios/timekeeper/t08-result-stall.ts");
  assert.match(t8, /withAthleteColumns\(\[gold\], PLATFORM_ROLE_COLUMNS, [^]*\{ platform_role: "admin" \}, undefined, note\)/);
  assert.match(t8, /throw new EnvError\(/, "no admin to tell is an env_error, never a pass on two empty lists");
});

test("withAthleteColumns refuses to set a column it does not record (it would never be put back)", async () => {
  assert.deepEqual(unrestoredSetColumns(PLATFORM_ROLE_COLUMNS, { platform_role: "admin" }), []);
  assert.deepEqual(unrestoredSetColumns(["date_of_birth"], { platform_role: "admin", date_of_birth: "1990-01-01" }), ["platform_role"]);
  let ran = false;
  await assert.rejects(
    withAthleteColumns(["a1"], ["date_of_birth"], async () => {
      ran = true;
    }, { platform_role: "admin" }),
    (e: unknown) => {
      assert.ok(e instanceof HarnessError, String(e));
      assert.match(e.message, /platform_role without restoring it/);
      return true;
    },
  );
  assert.equal(ran, false, "refused before anything is read, written or run");
});

/** `fakeSqlIo` plus the originals read, recording the restore record at the read. */
function fakeAthleteIo(originals: AthleteRestore[]) {
  const fake = fakeSqlIo();
  const reads: { ids: readonly string[]; columns: readonly string[]; recordAt: RestoreRecord | null }[] = [];
  const io: AthleteColumnIo = {
    ...fake.io,
    read: async (ids, columns) => {
      reads.push({ ids, columns, recordAt: readRestoreRecord(fake.io.restorePath) });
      return originals.filter((o) => ids.includes(o.id) && columns.includes(o.column));
    },
  };
  return { ...fake, io, reads };
}

test("withAthleteColumns records the originals before its set write, restores in the finally, and settles the record", async () => {
  const originals: AthleteRestore[] = [{ id: "gold", column: "platform_role", value: "member" }];
  const { io, sql, recordAt, reads } = fakeAthleteIo(originals);
  const setSql = athleteColumnsSql([{ id: "gold", column: "platform_role", value: "admin" }]);
  const restoreSql = athleteColumnsSql(originals);
  let during: RestoreRecord | null = null;
  const out = await withAthleteColumns(["gold"], PLATFORM_ROLE_COLUMNS, async () => {
    during = readRestoreRecord(io.restorePath);
    return "ran";
  }, { platform_role: "admin" }, io);
  assert.equal(out, "ran");
  assert.deepEqual(reads, [{ ids: ["gold"], columns: PLATFORM_ROLE_COLUMNS, recordAt: null }], "the originals are read once, before anything is recorded");
  assert.deepEqual(sql, [setSql, restoreSql], "the set write, then the restore");
  assert.deepEqual(recordAt[0]?.athletes, originals, "the originals are recorded BEFORE the set write");
  assert.deepEqual((during as RestoreRecord | null)?.athletes, originals, "and kept while the scenario runs");
  assert.equal(existsSync(io.restorePath), false, "settled once restored");
  await runCleanup();
  assert.equal(sql.length, 2, "no hook left behind");
});

test("withAthleteColumns puts the columns back when the scenario, or its own set write, throws", async () => {
  const originals: AthleteRestore[] = [
    { id: "green", column: "ai_processing_consent_at", value: null },
    { id: "green", column: "ai_processing_consent_version", value: null },
  ];
  const { io, sql, fail } = fakeAthleteIo(originals);
  const restoreSql = athleteColumnsSql(originals);
  await assert.rejects(withAthleteColumns(["green"], CONSENT_COLUMNS, async () => {
    throw new Error("scenario failed");
  }, {}, io), /scenario failed/);
  assert.deepEqual(sql, [restoreSql], "no set write asked for, so only the restore");
  assert.equal(existsSync(io.restorePath), false);
  // The set write fails: the scenario never runs, the restore still does.
  sql.length = 0;
  fail.re = /set ai_processing_consent_at = '2026/;
  let ran = false;
  await assert.rejects(withAthleteColumns(["green"], CONSENT_COLUMNS, async () => {
    ran = true;
  }, { ai_processing_consent_at: "2026-10-21 12:00:00+00" }, io), /psql failed/);
  assert.equal(ran, false);
  assert.equal(sql[sql.length - 1], restoreSql, "restored in the finally");
  assert.equal(existsSync(io.restorePath), false);
  await runCleanup();
  assert.equal(sql.filter((s) => s === restoreSql).length, 1, "no hook left behind");
});

test("withAthleteColumns whose restore fails keeps its hook and record: the run's exit, or the next run's start, puts them back", async () => {
  const originals: AthleteRestore[] = [{ id: "blue", column: "date_of_birth", value: null }];
  const { io, sql, fail } = fakeAthleteIo(originals);
  const restoreSql = athleteColumnsSql(originals);
  fail.re = /set date_of_birth = null/;
  await assert.rejects(withAthleteColumns(["blue"], ["date_of_birth"], async () => "claimed", { date_of_birth: "1990-01-01" }, io), /psql failed/);
  assert.deepEqual(readRestoreRecord(io.restorePath)?.athletes, originals, "the record stays for the next run's start");
  fail.re = null;
  await runCleanup();
  assert.equal(sql.filter((s) => s === restoreSql).length, 2, "the kept hook restored them at exit");
  assert.equal(existsSync(io.restorePath), false, "and settled the record");
});

test("withAthleteColumns whose restore fails after the scenario failed rethrows the scenario's error; the restore rides along (M7 review)", async () => {
  const originals: AthleteRestore[] = [{ id: "gold", column: "platform_role", value: "member" }];
  const { io, sql, fail } = fakeAthleteIo(originals);
  const restoreSql = athleteColumnsSql(originals);
  const notes: string[] = [];
  const body = bodyFailure();
  await assert.rejects(withAthleteColumns(["gold"], PLATFORM_ROLE_COLUMNS, async () => {
    fail.re = /set platform_role = 'member'/;
    throw body;
  }, { platform_role: "admin" }, io, (what) => notes.push(what)), (e: unknown) => e === body);
  assert.deepEqual(putBackFailures(body), ["athlete_columns: Error: psql failed"]);
  assert.deepEqual(notes, ["athlete_columns_restore_failed", "athlete_columns_body_error"]);
  assert.deepEqual(readRestoreRecord(io.restorePath)?.athletes, originals);
  fail.re = null;
  await runCleanup();
  assert.equal(sql.filter((x) => x === restoreSql).length, 2, "the kept hook restored them at exit");
});

test("withAthleteColumns on athletes it cannot read runs the scenario and records nothing", async () => {
  const { io, sql } = fakeAthleteIo([]);
  assert.equal(await withAthleteColumns(["nobody"], ["date_of_birth"], async () => "ran", { date_of_birth: "1990-01-01" }, io), "ran");
  assert.deepEqual(sql, []);
  assert.equal(existsSync(io.restorePath), false);
});

test("flag SQL touches only the named flags and checks they exist", () => {
  const sql = setFlagsSql({ [TK_ROLE_FLAG]: true });
  assert.match(sql, /update public\.feature_flags set enabled = true where key = 'timekeeper_role';/);
  assert.match(sql, /select count\(\*\) from public\.feature_flags where key in \('timekeeper_role'\)/);
  assert.doesNotMatch(sql, /admin_set_feature_flag/);
});

test("window SQL writes only the test-only tk_* keys, in seconds", () => {
  assert.match(windowsSql({ tk_pause_window: 30 }), /\('tk_pause_window', jsonb_build_object\('seconds', 30\)\)/);
  assert.throws(() => windowsSql({ ["arena_ranges" as never]: 5 }), /unknown timekeeper window/);
  assert.throws(() => windowsSql({ tk_pause_window: 0 }), /positive/);
  assert.equal(clearWindowsSql(["arena_ranges"]), "select 0", "never deletes another setting");
  assert.match(clearWindowsSql(TK_WINDOW_KEYS), /delete from public\.server_settings where key in \('tk_pick_deadline'/);
  assert.equal(TK_WINDOW_KEYS.length, 8, "the eight keys `_tk_window` reads (jr_be 024 6.4)");
});

test("friendships are canonical pairs (athlete_a < athlete_b), one per pair", () => {
  const pairs = friendshipPairs(["d", "b", "a", "c", "b"]);
  assert.equal(pairs.length, 6);
  for (const [a, b] of pairs) assert.ok(a < b);
  assert.deepEqual(friendshipPairs(["a"]), []);
});

test("the friendship insert is a CTE (a data-modifying statement cannot sit in queryJson's FROM subquery)", () => {
  const sql = addFriendshipsSql([["1111", "2222"]]);
  assert.match(sql, /^with ins as \(\s+insert into public\.athlete_friendships \(athlete_a, athlete_b, source\)/);
  assert.match(sql, /values \('1111'::uuid, '2222'::uuid, 'manual'\)\s+on conflict do nothing returning athlete_a, athlete_b/);
  assert.match(sql, /\) select coalesce\(json_agg\(ins\), '\[\]'::json\) from ins$/);
});

test("the reset hygiene touches only the harness accounts and is scoped to timekeeper state", () => {
  const sql = timekeeperResetSql(["11111111-1111-1111-1111-111111111111", "22222222-2222-2222-2222-222222222222"]);
  assert.match(sql, /where requires_timekeeper and status in \('pending', 'in_progress'\) and timekeeper_id in \('1111/);
  assert.match(sql, /update public\.match_timekeeper_requests set status = 'cancelled'/);
  assert.match(sql, /delete from public\.athlete_friendships\s+where source = 'manual' and athlete_a in \('1111[^)]*\) and athlete_b in/);
  assert.doesNotMatch(sql, /feature_flags/, "the reset never changes a flag");
  // The windows' table (#40) may be missing on a stack that has the timekeeper tables: only that DELETE is guarded.
  assert.match(sql, /if to_regclass\('public\.server_settings'\) is not null then\s+delete from public\.server_settings where key in \('tk_pick_deadline'/);
});

test("the timekeeper_role check fails closed: ON that this run did not set is refused whatever tables the stack has", () => {
  assert.equal(roleOffProblem(false, false), null);
  assert.equal(roleOffProblem(null, false), null, "no flag row (before jr_be #38): nothing can read it");
  assert.equal(roleOffProblem(true, true), null, "held by this run (--tk-flag-on)");
  assert.match(roleOffProblem(true, false) ?? "", /timekeeper_role is ON on the shared local stack and no match-loop run set it/);
  const fixtures = src("tools/match-loop/fixtures/timekeeper.ts");
  const body = fixtures.slice(fixtures.indexOf("export async function timekeeperRoleOffProblem"), fixtures.indexOf("// --- windows"));
  assert.doesNotMatch(body, /hasTimekeeperSchema|server_settings/, "the flag check never depends on another table");
  assert.doesNotMatch(src("tools/match-loop/preflight.ts"), /hasTimekeeperSchema/, "nor does preflight's");
});

test("the fourth account is activated as an active, human, 170 lbs free agent with no AI consent", () => {
  const sql = activateFourthSql("abc", "Demo Gold");
  assert.match(sql, /display_name = 'Demo Gold'/);
  assert.match(sql, /status = 'active'/);
  assert.match(sql, /is_bot = false/);
  assert.match(sql, /current_weight = 170/);
  assert.match(sql, /ai_processing_consent_at = null, ai_processing_consent_version = null/);
  assert.match(sql, /where id = 'abc'/);
});

// --- the bot timekeeper's decisions ------------------------------------------------------------

test("verdicts owed: none without the sub-flag; a missing or recheck verdict is owed, confirmed and flagged are not", () => {
  const st = (checks: { subjectId: string; status: "confirmed" | "flagged" | "recheck" }[]) => ({ timekeeperChecks: checks });
  assert.deepEqual(timekeeperVerdictsOwed(st([]), ["a", "b"], false), [], "A19: no timekeeper check");
  assert.deepEqual(timekeeperVerdictsOwed(null, ["a", "b"], true), ["a", "b"]);
  assert.deepEqual(timekeeperVerdictsOwed(st([{ subjectId: "a", status: "confirmed" }]), ["a", "b"], true), ["b"]);
  assert.deepEqual(timekeeperVerdictsOwed(st([{ subjectId: "a", status: "recheck" }, { subjectId: "b", status: "flagged" }]), ["a", "b"], true), ["a"]);
});

test("Start waits on the server's first blocker and goes when there is none", () => {
  assert.deepEqual(startDecision(null), { start: false, blocker: "no_state" });
  assert.deepEqual(startDecision({ startBlockers: ["athletes_not_ready", "timekeeper_not_recording"] }), { start: false, blocker: "athletes_not_ready" });
  assert.deepEqual(startDecision({ startBlockers: [] }), { start: true });
});

test("the clock reading runs from GO, without the paused time", () => {
  const started = "2026-10-20T10:00:00.000Z";
  const t0 = Date.parse(started);
  assert.equal(clockSeconds({ started_at: null, total_paused_duration: 0, paused_at: null }, t0 + 60_000), 0);
  assert.equal(clockSeconds({ started_at: started, total_paused_duration: 0, paused_at: null }, t0 + APP_TIMING.COUNTDOWN_MS - 500), 0, "never negative in the countdown");
  assert.equal(clockSeconds({ started_at: started, total_paused_duration: 10, paused_at: null }, t0 + APP_TIMING.COUNTDOWN_MS + 70_000), 60);
  const pausedAt = new Date(t0 + APP_TIMING.COUNTDOWN_MS + 30_000).toISOString();
  assert.equal(clockSeconds({ started_at: started, total_paused_duration: 0, paused_at: pausedAt }, t0 + APP_TIMING.COUNTDOWN_MS + 50_000), 30, "the current pause counts as paused");
});

test("the bot athlete routes through the app's timekeeper-mode targetFor (spec 6.2)", () => {
  const roles = tkAthleteRoles("me", "opp", "challenger");
  const t = (s: Partial<Parameters<typeof targetFor>[0]>) => targetFor({ status: "pending", confirmedAthleteIds: [], ...s }, roles);
  assert.equal(t({ timekeeperId: null }), "crew");
  assert.equal(t({ timekeeperId: "tk" }), "weight");
  assert.equal(t({ status: "in_progress", endedAt: null }), "live");
  assert.equal(t({ status: "in_progress", endedAt: "2026-10-20T10:00:00Z" }), "result");
  assert.equal(t({ status: "completed", confirmedAthleteIds: ["me"] }), "confirm");
  assert.equal(t({ status: "completed", confirmedAthleteIds: ["me", "opp"] }), "summary");
  assert.equal(t({ status: "cancelled" }), "exit");
});

test("the bot athlete reads its step through the app's own snapshot (no second derivation)", () => {
  const bot = src("tools/match-loop/bot/timekeeper.ts");
  assert.match(bot, /targetFor\(matchSnapshot\(m, /);
});

/**
 * A client that answers `get_match_details` with `editCount` (null: the read
 * fails) and `confirm_match_result` with `confirm`, recording every call.
 */
function confirmClient(editCount: number | null, confirm: { data: unknown; error: unknown } = { data: { success: true }, error: null }) {
  const calls: [string, unknown][] = [];
  const client = {
    async rpc(name: string, args: unknown) {
      calls.push([name, args]);
      if (name === "get_match_details") {
        return editCount === null
          ? { data: null, error: { message: "boom" } }
          : { data: { match: { id: "m1", status: "completed", result_edit_count: editCount }, participants: [] }, error: null };
      }
      if (name === "confirm_match_result") return confirm;
      throw new Error(`unexpected rpc ${name}`);
    },
  };
  return { client, calls };
}

const athleteSide = (client: unknown, trace = new Trace(null)) => new TkAthleteSide(client as never, trace, "m1", "me", "opp", "opponent", "red");

test("the bot athlete confirms through the shared confirmMatchResult with the edit count the server holds now (PM27 (c))", async () => {
  for (const n of [2, 0]) {
    const { client, calls } = confirmClient(n);
    const trace = new Trace(null);
    assert.deepEqual(await athleteSide(client, trace).confirm(), { ok: true });
    assert.deepEqual(
      calls,
      [
        ["get_match_details", { p_match_id: "m1" }],
        ["confirm_match_result", { p_match_id: "m1", p_expected_edit_count: n }],
      ],
      `the count read (${n}) is the count sent; a zero count is still sent (without it a timekeeper-mode confirm is refused result_changed)`,
    );
    const rpc = trace.entries.filter((e) => e.kind === "rpc" && e.name === "confirmMatchResult");
    assert.deepEqual(rpc.map((e) => [e.payload, e.ok]), [[{ matchId: "m1", expectedEditCount: n }, true]], "traced like every other bot call");
  }
});

test("the bot athlete never confirms without the count: a failed details read still sends one, and a stale count is refused RESULT_CHANGED", async () => {
  const unread = confirmClient(null);
  await athleteSide(unread.client).confirm();
  assert.deepEqual(unread.calls[1], ["confirm_match_result", { p_match_id: "m1", p_expected_edit_count: 0 }]);
  const stale = confirmClient(1, { data: null, error: { message: "Result changed", hint: "result_changed", code: "P0001" } });
  assert.deepEqual(
    await athleteSide(stale.client).confirm(),
    { ok: false, code: "RESULT_CHANGED", message: TIMEKEEPER_DECK_MESSAGES.resultChanged },
    "the shared wrapper's DomainError code, like every other bot call",
  );
});

test("the bot athlete passes the edit count to the shared confirmMatchResult and has no by-name confirm of its own", () => {
  const bot = src("tools/match-loop/bot/timekeeper.ts");
  assert.match(bot, /confirmMatchResult\(this\.client, this\.matchId, count\)/);
  assert.doesNotMatch(bot, /rpc\(\s*["']confirm_match_result["']/, "PM27 (c): one path to the RPC, the shared wrapper's");
});

test("the bot timekeeper polls its requests through the app listener's typed read (M2), never a raw table read", async () => {
  const bot = src("tools/match-loop/bot/timekeeper.ts");
  assert.doesNotMatch(bot, /\.from\(/, "no by-name table read: every read and write is a typed @jits/shared wrapper");
  assert.match(bot, /getIncomingTimekeeperRequest\(this\.client, this\.me\.id\)/);
  assert.deepEqual(
    pendingRequestRow({ requestId: "q1", matchId: "m1", expiresAt: "2026-10-21T22:00:00Z" }, "g"),
    { id: "q1", match_id: "m1", invitee_id: "g", status: "pending", expires_at: "2026-10-21T22:00:00Z" },
  );
  // Driven against a client double: the read is the invitee's pending rows, newest first.
  const eqs: [string, unknown][] = [];
  let row: Record<string, unknown> | null = { id: "q1", match_id: "m1", expires_at: "2026-10-21T22:00:00Z" };
  let error: unknown = null;
  const builder = {
    select: () => builder,
    eq: (col: string, v: unknown) => (eqs.push([col, v]), builder),
    order: () => builder,
    limit: () => builder,
    maybeSingle: async () => ({ data: row, error }),
  };
  const tables: string[] = [];
  const client = { from: (t: string) => (tables.push(t), builder) };
  const trace = new Trace(null);
  const me = { id: "g", email: "g@x", displayName: "Demo Green", key: "green" as const };
  const tk = new TimekeeperBot(cfg, { me, client } as unknown as MobileOpponent, trace) as unknown as {
    pollPending(push: (kind: "insert", row: unknown, via: "poll") => void): Promise<void>;
  };
  const pushed: unknown[] = [];
  const push = (_k: "insert", r: unknown) => void pushed.push(r);
  await tk.pollPending(push);
  assert.deepEqual(tables, ["match_timekeeper_requests"]);
  assert.deepEqual(eqs, [["invitee_id", "g"], ["status", "pending"]]);
  assert.deepEqual(pushed, [{ id: "q1", match_id: "m1", invitee_id: "g", status: "pending", expires_at: "2026-10-21T22:00:00Z" }]);
  row = null;
  await tk.pollPending(push);
  assert.equal(pushed.length, 1, "no pending request: nothing pushed");
  error = { message: "boom", code: "XX000" };
  await tk.pollPending(push);
  assert.equal(pushed.length, 1, "a failed read pushes nothing");
  assert.equal(trace.entries.filter((e) => e.name === "request_poll_failed").length, 1, "and is traced");
});

// --- protocol -------------------------------------------------------------------------------

test("actor_id is additive: valid where timekeeper mode sends it, refused elsewhere and when empty", () => {
  assert.equal(validatePayload(E.MATCH_ENDED, {}), null, "a flag-OFF payload as before");
  assert.equal(validatePayload(E.MATCH_ENDED, { actor_id: "tk" }), null);
  assert.equal(validatePayload(E.TIMER_STARTED, { started_at: "2026-10-20T10:00:00Z", actor_id: "tk" }), null);
  assert.equal(validatePayload(E.RESULT_SUBMITTED, { result: "draw", actor_id: "tk" }), null);
  assert.match(validatePayload(E.MATCH_ENDED, { actor_id: "" }) ?? "", /not a non-empty string/);
  assert.match(validatePayload(E.READY_SIGNAL, { athlete_id: "a", actor_id: "tk" }) ?? "", /never carries one/);
});

test("the heartbeat is the spec's 15 s (R23), pinned to the app's presence hook once it exists", { skip: !existsSync(join(ROOT, "apps/mobile/lib/match-flow/use-timekeeper-presence.ts")) && "slice M4 has not added use-timekeeper-presence.ts yet" }, () => {
  const m = src("apps/mobile/lib/match-flow/use-timekeeper-presence.ts").match(/const \w*HEARTBEAT\w*\s*=\s*([\d_]+)/);
  assert.ok(m, "no HEARTBEAT constant in use-timekeeper-presence.ts");
  assert.equal(TK_TIMING.HEARTBEAT_MS, Number(m[1].replace(/_/g, "")));
});

test("TK_TIMING keeps the spec values until the app pins them", () => {
  assert.equal(TK_TIMING.HEARTBEAT_MS, 15_000);
  assert.equal(TK_TIMING.SEND_CEILING_MS, 20_000, "PM29 (1)");
});

// --- selectors from the copy deck ----------------------------------------------------------------

test("every name-bearing selector accepts the full name and the deck's short name", () => {
  assert.deepEqual(nameForms("Demo Green"), ["Demo Green", "D. Green"]);
  assert.ok(TK_UI.ask("Demo Green").test(C["TK-P7"].a11y("D. Green")));
  assert.ok(TK_UI.ask("Demo Green").test(C["TK-P7"].a11y("Demo Green")));
  assert.ok(!TK_UI.ask("Demo Green").test(C["TK-P7"].a11y("D. Gold")));
  assert.ok(TK_UI.declined("Demo Gold").test(C["TK-P21"]("D. Gold")));
  assert.ok(TK_UI.lapsed("Demo Gold").test(C["TK-P22"]("D. Gold")));
  assert.ok(TK_UI.otherAsked("Demo Red", "Demo Green").test(C["TK-P20"]({ athlete: "D. Red", name: "D. Green" })));
  assert.ok(TK_UI.timekeeperLeft("Demo Green").test(C["TK-D1"]("D. Green")));
  assert.ok(TK_UI.startsTheMatch("Demo Green").test(C["TK-F5"]("D. Green")));
  assert.ok(TK_UI.weightFlagged("Demo Green").test(C["TK-F7"]("D. Green")));
  assert.ok(TK_UI.runsTheClock("Demo Green").test("D. GREEN RUNS THE CLOCK"));
  assert.ok(TK_UI.offline("Demo Green").test("D. GREEN IS OFFLINE"));
  assert.ok(TK_UI.resultReview("Demo Green").test(C["TK-D8"]("D. Green")));
  assert.ok(TK_UI.recordedBy("Demo Green").test("RESULT RECORDED BY D. GREEN"));
  assert.ok(TK_UI.changedResult("Demo Green").test("D. GREEN CHANGED THE RESULT"));
  assert.ok(TK_UI.readyButton.test("Weight looks right, I'm ready"));
  assert.equal(YOUR_RATING, "YOUR RATING");
});

test("the face-off's timekeeper row and its weight check state are read as text or as the row's merged label (T12)", () => {
  const row = TK_UI.timekeeperRow("Demo Green");
  assert.ok(row.test(C["TK-F1"]), "the TIMEKEEPER text alone");
  assert.ok(row.test(`${C["TK-F1"]}, D. Green`));
  assert.ok(row.test(`${C["TK-F1"]}, Demo Green, ${C["TK-F2"]}`));
  assert.ok(!row.test(`${C["TK-F1"]}, D. Gold`), "a merged label must name this timekeeper");
  assert.ok(!row.test(C["TK-F5"]("D. Green")));
  for (const state of [C["TK-F2"], C["TK-F3"]]) {
    assert.ok(TK_UI.verdictState.test(state), state);
    assert.ok(TK_UI.verdictState.test(`${C["TK-F1"]}, D. Green, ${state}`), `${state} in the merged label`);
  }
  assert.ok(!TK_UI.verdictState.test(`${C["TK-F1"]}, D. Green`), "the row without a state");
  assert.ok(!TK_UI.verdictState.test(C["TK-F4"]));
  assert.ok(TK_UI.arenaWaitingHelper.test(C["TK-AR2"]));
  assert.ok(!TK_UI.arenaWaitingHelper.test(C["TK-AR1"]));
});

test("T12's absence check has a positive anchor, read in the same screen read, after the seat and after both readies", () => {
  const t12 = src("tools/match-loop/scenarios/timekeeper/t12-subflag-off.ts");
  assert.match(t12, /TK_UI\.timekeeperRow\(/);
  assert.match(t12, /checkNoVerdictState\(ctx, cast, "after-seat"\)/);
  assert.match(t12, /onBothReady: \(\) => checkNoVerdictState\(ctx, cast, "after-ready"\)/);
  assert.match(src("tools/match-loop/scenarios/timekeeper/tk-flows.ts"), /await opts\.onBothReady\?\.\(\);\n\s+const blockers = await ctx\.step\(/, "before any verdict or the Start");
});

test("the countdown chips match both their text and their spoken label", () => {
  assert.ok(NO_CONTEST_CHIP_RE.test(C["TK-D9"].text(581)));
  assert.ok(NO_CONTEST_CHIP_RE.test(C["TK-D9"].a11y(581)));
  assert.ok(NO_CONTEST_CHIP_RE.test("NO CONTEST IN 10:00"));
  assert.ok(!NO_CONTEST_CHIP_RE.test("NO CONTEST"));
  assert.ok(DEADLINE_CHIP_RE.test(C["TK-W1"].text(42)));
  assert.ok(DEADLINE_CHIP_RE.test(C["TK-W1"].a11y(42)));
});

test("a countdown chip's time left is read from its text or its spoken label (TK-D9 counts down, T7 and T16)", () => {
  assert.equal(countdownSeconds(C["TK-D9"].text(581)), 581);
  assert.equal(countdownSeconds(C["TK-D9"].a11y(581)), 581);
  assert.equal(countdownSeconds(C["TK-W1"].text(42)), 42);
  assert.equal(countdownSeconds(C["TK-W1"].a11y(42)), 42);
  assert.equal(countdownSeconds(C["TK-D9"].text(0)), 0);
  assert.equal(countdownSeconds("NO CONTEST"), null);
  assert.equal(countdownSeconds(null), null);
});

test("the crew Leave the harness taps is the crew step's (testID and the face-off's Leave label)", () => {
  // The crew step's Leave lives in M2's crew-top-bar.tsx; read across the
  // crew folder so a move within it stays green.
  const dir = join(ROOT, "apps/mobile/components/match-flow/crew");
  const files = readdirSync(dir).filter((f) => /\.tsx?$/.test(f)).map((f) => readFileSync(join(dir, f), "utf8"));
  assert.ok(files.some((t) => /testID="crew-leave"/.test(t)), "a crew control carries testID crew-leave");
  assert.ok(files.some((t) => /SHIPPED_COPY\.leave\.a11y/.test(t)), "its spoken label is the face-off's Leave (SHIPPED_COPY.leave.a11y)");
  assert.equal(TK_UI.crewLeave.label, SHIPPED_COPY.leave.a11y);
});

test("a bot call a timekeeper scenario starts early and awaits later is handled at once (no unhandled-rejection noise)", () => {
  const dir = join(ROOT, "tools/match-loop/scenarios/timekeeper");
  let early = 0;
  for (const f of readdirSync(dir).filter((x) => x.endsWith(".ts"))) {
    const text = readFileSync(join(dir, f), "utf8");
    for (const m of text.matchAll(/const (\w+) = (?!await\b)[\w.!]+\.(?:markReady|confirm|requestTimekeeper|startMatch|leave)\(/g)) {
      early++;
      assert.match(text.slice(m.index), new RegExp(`\\n\\s*${m[1]}\\.catch\\(\\(\\) => undefined\\);`), `${f}: ${m[1]} gets .catch(() => undefined) before its await`);
    }
  }
  assert.ok(early >= 2, "T5's and T10's early Red ready are found");
});

test("T10 re-weighs through the match re-weigh (reweigh_for_match), never the face-off header's profile weight editor", () => {
  const check = src("apps/mobile/components/match-flow/faceoff/faceoff-weight-check.tsx");
  const top = src("apps/mobile/components/match-flow/faceoff/faceoff-top.tsx");
  const body = src("apps/mobile/components/match-flow/faceoff/faceoff-body.tsx");
  for (const id of [TK_UI.reweigh.prompt.id, TK_UI.reweigh.input, TK_UI.reweigh.submit.id]) {
    assert.match(check, new RegExp(`testID="${id}"`), `${id} is the weight check's re-weigh prompt`);
    assert.doesNotMatch(top, new RegExp(`testID="${id}"`), `${id} is not on the header's profile editor`);
  }
  // The submit calls the match re-weigh, not the profile weight (editWeight writes athletes.current_weight).
  const submit = check.match(new RegExp(`testID="${TK_UI.reweigh.submit.id}"[^]*?onPress=\\{([^}]*)\\}`));
  assert.ok(submit, "the re-weigh submit's onPress");
  assert.match(submit[1], /weightCheck\.reweigh\(/);
  assert.doesNotMatch(submit[1], /editWeight/);
  assert.match(src("apps/mobile/lib/match-flow/use-weight-check-actions.ts"), /const reweigh = [^]*?reweighForMatch\(/, "weightCheck.reweigh is reweighForMatch");
  assert.match(src("packages/shared/src/api/match-weight-checks.ts"), /rpc\("reweigh_for_match"/);
  assert.match(body, new RegExp(`testID="${TK_UI.weighIn.id}"`));
});

test("T10 weighs Blue in first and waits for TK-F7 on ready, then re-weighs through the prompt and presses TK-F4", () => {
  const t10 = src("tools/match-loop/scenarios/timekeeper/t10-weight-flag.ts");
  const order = [/cast\.ui\.weighIn\(/, /side\.verdict\(ctx\.ids\.blue, "flag"\)/, /TK_UI\.weightFlagged\(/, /cast\.ui\.reweigh\(/, /db:reweigh-voids-and-clears/, /cast\.ui\.weighInAndReady\(/];
  let at = 0;
  for (const re of order) {
    const i = t10.slice(at).search(re);
    assert.ok(i >= 0, `T10 does ${re} after the previous beat`);
    at += i + 1;
  }
});

// --- Blue's face-off in timekeeper mode (weighInAndReady), on a scripted simulator ---------------

type El = AXElement;
/** The scripted simulators' screens never move unless a test moves them: one confirming read is enough. */
const FAST_STILL: StillTiming = { stillMs: 0, gapMs: 1, timeoutMs: 200 };
const el = (over: Partial<El>): El => ({ AXLabel: null, AXUniqueId: null, AXValue: null, type: "Button", frame: { x: 0, y: 300, width: 100, height: 44 }, ...over });
const stepMarker = (label: string) => el({ AXLabel: `Step ${label === "Weights" ? 2 : 3} of 8, ${label}`, type: "GenericElement" });
const weighInBtn = el({ AXUniqueId: "weight-confirm", AXLabel: "Confirm 170 lbs", enabled: true });
const tkF4 = (enabled = true) => el({ AXUniqueId: "ready-button", AXLabel: C["TK-F4"], enabled });
const waitingLine = el({ AXUniqueId: "merged-ready-waiting", AXLabel: "WAITING FOR D. RED...", type: "StaticText" });

/**
 * A simulator whose screen follows the taps, never the clock: `screen(taps)`
 * draws what the app shows after those taps (deterministic, like the
 * endMatch test in prompt-guard.test.ts).
 */
function tkScripted(screen: (t: { weigh: number; ready: number }) => El[]) {
  const taps: string[] = [];
  const t = { weigh: 0, ready: 0 };
  const idb = {
    screenH: 874,
    screenW: 402,
    async describe() {
      return screen(t);
    },
    async tap(e: El) {
      taps.push(e.AXUniqueId ?? String(e.AXLabel));
      if (e.AXUniqueId === "weight-confirm") t.weigh++;
      if (e.AXUniqueId === "ready-button") t.ready++;
    },
    async scrollTo(q: Query) {
      return el({ AXUniqueId: q.id ?? null });
    },
    onScreen() {
      return true;
    },
  } as unknown as Idb;
  const ui = new TimekeeperScreens(idb, new Screens(idb, {} as Simctl, 0), { pollMs: 5, retapMs: 60, probeMs: 10, keyboardMs: 0, still: FAST_STILL });
  return { ui, taps };
}

test("weighInAndReady: the weigh-in moves weight to ready, then one TK-F4 press is honoured (readyPresses 1)", async () => {
  const { ui, taps } = tkScripted(({ weigh, ready }) => {
    if (weigh === 0) return [stepMarker("Weights"), weighInBtn];
    if (ready === 0) return [stepMarker("Ready"), tkF4()];
    return [stepMarker("Ready"), waitingLine];
  });
  assert.deepEqual(await ui.weighInAndReady(2_000), { weighedIn: true, readyPresses: 1 });
  assert.deepEqual(taps, ["weight-confirm", "ready-button"], "never returns on leaving weight before TK-F4");
});

test("weighInAndReady: a busy TK-F4 (the call in flight) is never pressed again; TK-F5 honours it", async () => {
  let reads = 0;
  const { ui, taps } = tkScripted(({ ready }) => {
    if (ready === 0) return [stepMarker("Ready"), tkF4()];
    reads++;
    return reads < 20 ? [stepMarker("Ready"), tkF4(false)] : [stepMarker("Ready"), el({ AXLabel: C["TK-F5"]("D. Green"), type: "StaticText" })];
  });
  assert.deepEqual(await ui.weighInAndReady(2_000), { weighedIn: false, readyPresses: 1 });
  assert.deepEqual(taps, ["ready-button"]);
});

test("weighInAndReady: a dropped first press (TK-F4 still offered and enabled past the retap window) counts 2", async () => {
  const { ui, taps } = tkScripted(({ weigh, ready }) => {
    if (weigh === 0) return [stepMarker("Weights"), weighInBtn];
    if (ready < 2) return [stepMarker("Ready"), tkF4()];
    return [stepMarker("Ready"), el({ AXLabel: "You, ready", type: "GenericElement" })];
  });
  assert.deepEqual(await ui.weighInAndReady(2_000), { weighedIn: true, readyPresses: 2 });
  assert.deepEqual(taps, ["weight-confirm", "ready-button", "ready-button"]);
});

test("weighInAndReady: Blue already weighed in and on ready still presses TK-F4", async () => {
  const { ui, taps } = tkScripted(({ ready }) => (ready === 0 ? [stepMarker("Ready"), tkF4()] : [stepMarker("Ready"), waitingLine]));
  assert.deepEqual(await ui.weighInAndReady(2_000), { weighedIn: false, readyPresses: 1 });
  assert.deepEqual(taps, ["ready-button"]);
});

test("weighInAndReady: the server's ready row honours the press when the screen has not caught up, before any second press", async () => {
  let rows = 0;
  const { ui, taps } = tkScripted(() => [stepMarker("Ready"), tkF4()]);
  const r = await ui.weighInAndReady(2_000, {
    serverReady: async () => {
      rows++;
      return true;
    },
  });
  assert.deepEqual(r, { weighedIn: false, readyPresses: 1 });
  assert.deepEqual(taps, ["ready-button"]);
  assert.ok(rows >= 1);
});

test("weighInAndReady: the match moving on to live ends the wait; a press never made reads 0", async () => {
  const live = el({ AXUniqueId: "match-step-live", type: "GenericElement" });
  const { ui, taps } = tkScripted(() => [live]);
  assert.deepEqual(await ui.weighInAndReady(2_000), { weighedIn: false, readyPresses: 0 });
  assert.deepEqual(taps, []);
});

test("weighInAndReady: a TK-F4 never honoured times out naming TK-F4, after at most two presses", async () => {
  const { ui, taps } = tkScripted(() => [stepMarker("Ready"), tkF4()]);
  await assert.rejects(ui.weighInAndReady(400), (e: unknown) => {
    assert.ok(e instanceof ExpectationTimeout, String(e));
    assert.match(e.message, /TK-F4/);
    assert.equal((e.lastSeen as { readyPresses: number }).readyPresses, 2);
    return true;
  });
  assert.deepEqual(taps, ["ready-button", "ready-button"], "never a third press");
});

/**
 * The Wave 3 gate's T10 race (run 2026-10-22T05-52-40-251Z), replayed: the
 * notice above TK-F4 ("Waiting for D. Red to check your new weight.") goes
 * away right after the read that found TK-F4, so both buttons move up 60 pt
 * before the tap. A tap resolves against the screen as it is WHEN idb taps.
 */
function raceScripted() {
  const marker = stepMarker("Ready");
  const notice = el({ AXUniqueId: "weight-await-recheck", AXLabel: "Waiting for D. Red to check your new weight.", type: "StaticText", frame: { x: 16, y: 640, width: 370, height: 48 } });
  const before = [marker, notice, el({ AXUniqueId: "ready-button", AXLabel: C["TK-F4"], enabled: true, frame: { x: 16, y: 700, width: 370, height: 72 } }), el({ AXUniqueId: "weight-check-flag", AXLabel: SHIPPED_COPY.flag, enabled: true, frame: { x: 16, y: 784, width: 370, height: 64 } })];
  const after = [marker, el({ AXUniqueId: "ready-button", AXLabel: C["TK-F4"], enabled: true, frame: { x: 16, y: 640, width: 370, height: 72 } }), el({ AXUniqueId: "weight-check-flag", AXLabel: SHIPPED_COPY.flag, enabled: true, frame: { x: 16, y: 724, width: 370, height: 64 } })];
  // weighIn's step read and pressReady's first read see the notice; it goes right after.
  let reads = 0;
  let pressed: string | null = null;
  const now = () => (pressed === "ready-button" ? [marker, waitingLine] : reads >= 2 ? after : before);
  const hits: string[] = [];
  const idb = {
    screenH: 874,
    screenW: 402,
    async describe() {
      reads++;
      return reads <= 2 ? before : now();
    },
    async tap(e: El) {
      const hit = now().find((x) => x.AXUniqueId && frameContains(x, tapPoint(e)));
      hits.push(hit?.AXUniqueId ?? "nothing");
      pressed = hit?.AXUniqueId ?? null;
    },
    async scrollTo() {
      throw new Error("TK-F4 is on screen");
    },
    onScreen() {
      return true;
    },
  } as unknown as Idb;
  const ui = new TimekeeperScreens(idb, new Screens(idb, {} as Simctl, 0), { pollMs: 5, retapMs: 60, probeMs: 10, keyboardMs: 0, still: FAST_STILL });
  return { ui, hits, before, after };
}

test("TK-F4 is never tapped where one read put it: the T10 race taps TK-F4 where it settled, never Doesn't look right", async () => {
  const { ui, hits, before, after } = raceScripted();
  // What the gate's harness did: a tap at the point from the read before the notice went lands on the flag.
  const stale = tapPoint(before.find((x) => x.AXUniqueId === "ready-button")!);
  assert.equal(after.find((x) => x.AXUniqueId && frameContains(x, stale))?.AXUniqueId, "weight-check-flag");
  assert.deepEqual(await ui.weighInAndReady(2_000), { weighedIn: false, readyPresses: 1 });
  assert.deepEqual(hits, ["ready-button"], "one press, on TK-F4 where it settled");
});

/**
 * A control below the fold that turns busy while the harness scrolls it into
 * view (review W3FIX minor 6a): `scrollTo` brings it back disabled, it is
 * enabled again only after two more reads, and a tap on it while busy is
 * dropped by the app (recorded as "dropped"). `after` is the screen once the
 * press is honoured.
 */
function belowFoldScripted(step: string, control: (enabled: boolean) => El, after: El[]) {
  const marker = stepMarker(step);
  let scrolled = false;
  let reads = 0;
  let honoured = false;
  const taps: string[] = [];
  const enabledNow = () => scrolled && reads > 2;
  const idb = {
    screenH: 874,
    screenW: 402,
    async describe() {
      if (honoured) return after;
      if (!scrolled) return [marker, control(true)];
      reads++;
      return [marker, control(enabledNow())];
    },
    async tap(e: El) {
      if (honoured || !enabledNow()) return void taps.push("dropped");
      honoured = true;
      taps.push(e.AXUniqueId ?? String(e.AXLabel));
    },
    async scrollTo() {
      scrolled = true;
      return control(false);
    },
    onScreen() {
      return scrolled;
    },
  } as unknown as Idb;
  const ui = new TimekeeperScreens(idb, new Screens(idb, {} as Simctl, 0), { pollMs: 5, retapMs: 60, probeMs: 10, keyboardMs: 0, still: FAST_STILL });
  return { ui, taps };
}

test("TK-F4 below the fold that turned busy while scrolled into view is never pressed there: one press, once it is enabled", async () => {
  const { ui, taps } = belowFoldScripted("Ready", tkF4, [stepMarker("Ready"), waitingLine]);
  assert.deepEqual(await ui.weighInAndReady(2_000), { weighedIn: false, readyPresses: 1 });
  assert.deepEqual(taps, ["ready-button"], "no press counted on a busy TK-F4");
});

test("the weigh-in below the fold that turned disabled while scrolled into view is not counted as tapped", async () => {
  const { ui, taps } = belowFoldScripted("Weights", (enabled) => ({ ...weighInBtn, enabled }), [stepMarker("Ready"), tkF4()]);
  assert.deepEqual(await ui.weighIn(2_000), { weighedIn: true, step: "ready" });
  assert.deepEqual(taps, ["weight-confirm"]);
});

test("Ask is tapped where its row settled: a row that moved between the read and the tap is never missed for its neighbour (W3FIX review minor 3)", async () => {
  const askRow = (name: string, y: number) => el({ AXLabel: C["TK-P7"].a11y(name), enabled: true, frame: { x: 300, y, width: 80, height: 44 } });
  // Someone comes online right after the first read and sorts above Gold:
  // the screen idb taps is `after`, where Green's Ask sits where Gold's was.
  const before = [askRow("Dana Gold", 300), askRow("Gary Green", 360)];
  const after = [askRow("Gary Green", 300), askRow("Dana Gold", 360)];
  let reads = 0;
  const hits: string[] = [];
  const idb = {
    screenH: 874,
    screenW: 402,
    async describe() {
      reads++;
      return reads === 1 ? before : after;
    },
    async tap(e: El) {
      hits.push(after.find((x) => frameContains(x, tapPoint(e)))?.AXLabel ?? "nothing");
    },
    async scrollTo() {
      throw new Error("the row is on screen");
    },
    onScreen() {
      return true;
    },
  } as unknown as Idb;
  const ui = new TimekeeperScreens(idb, new Screens(idb, {} as Simctl, 0), { pollMs: 5, still: FAST_STILL });
  // A tap at the first read's point would land on Green's row.
  assert.equal(after.find((x) => frameContains(x, tapPoint(before[0])))?.AXLabel, C["TK-P7"].a11y("Gary Green"));
  await ui.ask("Dana Gold", 2_000);
  assert.deepEqual(hits, [C["TK-P7"].a11y("Dana Gold")], "one tap, on Gold's Ask where it settled");
});

test("weighIn alone stops on ready (T10 waits for TK-F7 there), with no TK-F4 press", async () => {
  const { ui, taps } = tkScripted(({ weigh }) => (weigh === 0 ? [stepMarker("Weights"), weighInBtn] : [stepMarker("Ready"), tkF4()]));
  assert.deepEqual(await ui.weighIn(2_000), { weighedIn: true, step: "ready" });
  assert.deepEqual(taps, ["weight-confirm"]);
});

/** The re-weigh prompt on a scripted simulator: it goes once the submit is tapped, unless `stays`. */
function reweighScripted(stays = false) {
  const calls: string[] = [];
  let value = "170";
  let submitted = false;
  const input = () => el({ AXUniqueId: TK_UI.reweigh.input, AXValue: value, type: "TextField" });
  const submit = () => el({ AXUniqueId: TK_UI.reweigh.submit.id, AXLabel: "Re-weigh", enabled: true, frame: { x: 200, y: 600, width: 150, height: 56 } });
  const idb = {
    screenH: 874,
    screenW: 402,
    async describe() {
      return submitted ? [] : [input(), submit()];
    },
    onScreen() {
      return true;
    },
    async waitFor(q: Query) {
      calls.push(`wait:${q.id}`);
      return input();
    },
    async scrollTo() {
      return input();
    },
    async tap(e: El) {
      calls.push(`tap:${e.AXUniqueId}`);
      if (e.AXUniqueId === TK_UI.reweigh.submit.id) submitted = true;
    },
    async clearFocused() {
      value = "";
    },
    async typeText(t: string) {
      value = t;
      calls.push(`type:${t}`);
    },
    async find() {
      return input();
    },
    async tapQ(q: Query) {
      calls.push(`tapQ:${q.id}${q.enabled ? ":enabled" : ""}`);
      if (q.id === TK_UI.reweigh.submit.id) submitted = true;
      return el({ AXUniqueId: q.id ?? null });
    },
    async waitGone(q: Query, ms: number) {
      calls.push(`gone:${q.id}`);
      if (!submitted || stays) throw new ExpectationTimeout(`UI element #${q.id} to disappear`, ms, []);
    },
  } as unknown as Idb;
  const ui = new TimekeeperScreens(idb, new Screens(idb, {} as Simctl, 0), { pollMs: 5, keyboardMs: 0, still: FAST_STILL });
  return { ui, calls };
}

test("reweigh types the new weight into the match re-weigh prompt, taps its enabled submit once it holds still and waits for the prompt to go", async () => {
  const { ui, calls } = reweighScripted();
  await ui.reweigh(171, 100, 100);
  assert.deepEqual(calls, [
    `wait:${TK_UI.reweigh.input}`,
    `tap:${TK_UI.reweigh.input}`,
    "type:171",
    `tap:${TK_UI.reweigh.submit.id}`,
    `gone:${TK_UI.reweigh.input}`,
  ]);
  assert.doesNotMatch(src("tools/match-loop/sim/timekeeper-screens.ts"), /idb\.tapQ\(/, "no tap on Blue's timekeeper-mode screens from a single read");
});

test("reweigh fails when the prompt never goes (the re-weigh did not clear TK-F7)", async () => {
  const { ui } = reweighScripted(true);
  await assert.rejects(ui.reweigh(171, 100, 100), ExpectationTimeout);
});

test("the honoured-ready evidence is the app's: the shipped waiting line, Blue's ready plate, TK-F5 for any name", () => {
  const body = src("apps/mobile/components/match-flow/faceoff/faceoff-body.tsx");
  assert.match(body, /`WAITING FOR \$\{oppName\}\.\.\.`/, "the shipped waiting line the merged ready reuses");
  assert.match(body, /accessibilityLabel=\{`You, \$\{f\.myReady \? "ready" : "waiting"\}`\}/, "Blue's ready plate");
  const any = anyNameRe(C["TK-F5"]);
  assert.ok(any.test(C["TK-F5"]("D. Green")));
  assert.ok(any.test(C["TK-F5"]("Demo Gold")));
  assert.ok(!any.test(C["TK-F4"]));
  const waiting = TK_UI.readyHonoured.find((q) => q.label instanceof RegExp && q.label.test("WAITING FOR D. RED..."));
  assert.ok(waiting, "the waiting line");
  assert.ok(!(waiting.label as RegExp).test("WAITING FOR WEIGHT CHECKS"), "never the weight-check hold");
  assert.ok(!(waiting.label as RegExp).test("Waiting for D. Red to check your new weight."), "never the recheck notice");
});

test("the merged ready's waiting line keeps the testID the harness reads, once slice M3 draws it", { skip: !existsSync(join(ROOT, "apps/mobile/components/match-flow/faceoff/merged-ready.tsx")) && "slice M3 has not added merged-ready.tsx yet" }, () => {
  const merged = src("apps/mobile/components/match-flow/faceoff/merged-ready.tsx");
  assert.match(merged, /testID="merged-ready-waiting"/);
  assert.match(merged, /testID="ready-button"[^]*?label=\{TIMEKEEPER_COPY\["TK-F4"\]\}/, "TK-F4 is the ready button's label");
});

test("portrait is read from the app window's frame", () => {
  const app = (w: number, h: number) => [{ type: "Application", AXLabel: "ELO RATED", frame: { x: 0, y: 0, width: w, height: h } } as AXElement];
  assert.equal(portraitIn(app(402, 874)), true);
  assert.equal(portraitIn(app(874, 402)), false);
  assert.equal(portraitIn([]), false);
});

test("the device's turn is read from the Simulator window's shape (T14 never checks the app on a rotation that did not happen)", () => {
  assert.deepEqual(parseWindowSize("456, 972\n"), { width: 456, height: 972 });
  assert.deepEqual(parseWindowSize("910, 518"), { width: 910, height: 518 });
  assert.equal(parseWindowSize("execution error: not allowed assistive access"), null);
  assert.equal(orientationOf({ width: 456, height: 972 }), "portrait");
  assert.equal(orientationOf({ width: 910, height: 518 }), "landscape");
  const list = JSON.stringify({
    devices: {
      "com.apple.CoreSimulator.SimRuntime.iOS-26-3": [
        { udid: "AAA", name: "iPhone 17" },
        { udid: "D8D2", name: "iPhone 17 Pro" },
      ],
    },
  });
  assert.equal(deviceNameIn(list, "D8D2"), "iPhone 17 Pro");
  assert.equal(deviceNameIn(list, "nope"), null);
  assert.equal(appleScriptString('iPhone "17" \\ Pro'), '"iPhone \\"17\\" \\\\ Pro"');
  const left = rotateScript("iPhone 17 Pro", "left");
  assert.match(left, /  if frontmost then\n    perform action "AXRaise"[^\n]*\n    click menu item/, "never clicks a background Simulator");
  assert.match(left, /first window whose name starts with "iPhone 17 Pro"/);
  assert.match(left, /click menu item "Rotate Left" of menu "Device" of menu bar 1/);
  assert.match(rotateScript("iPhone 17 Pro", "right"), /click menu item "Rotate Right"/);
  assert.doesNotMatch(left, /key code|keystroke/, "a keystroke would go to whatever app is in front");
  assert.match(left, /return clicked$/, "true only when it clicked");
});

test("a rotation gives the front back to the app that had it (typing on the Mac never reaches the device)", () => {
  const script = rotateScript("iPhone 17 Pro", "left");
  const lines = script.split("\n");
  const noted = lines.findIndex((l) => /set previousApp to name of first application process whose frontmost is true/.test(l));
  const activate = lines.findIndex((l) => /tell application "Simulator" to activate/.test(l));
  const click = lines.findIndex((l) => /click menu item/.test(l));
  const restore = lines.findIndex((l) => /set frontmost of process previousApp to true/.test(l));
  assert.ok(noted >= 0 && noted < activate, "the front app is noted before Simulator is brought forward");
  assert.ok(restore > click, "and given back after the click");
  assert.match(script, /if previousApp is not "Simulator" then/, "nothing to give back when Simulator already had the front");
  assert.ok(restore < lines.length - 1 && lines[lines.length - 1] === "return clicked", "given back on both paths, before the result");
});

test("practice's controls the capture scenario drives are the app's (T14)", () => {
  assert.match(src("apps/mobile/lib/practice/constants.ts"), new RegExp(`PRACTICE_BOT_NAME = "${PRACTICE_PARTNER}"`));
  const steps = src("apps/mobile/components/practice/practice-steps.tsx");
  for (const id of [PRACTICE_UI.weighIn.id, PRACTICE_UI.ready.id]) assert.match(steps, new RegExp(`testID="${id}"`));
  // The tip is read by its text: its testID sits on a View idb never reports.
  assert.match(steps, new RegExp(`>\\s*${PRACTICE_UI.tip.label}\\s*</Text>`, "i"));
  assert.match(steps, /<GoLivePlate/);
  assert.match(src("apps/mobile/components/arena/go-live-plate.tsx"), /accessibilityLabel=\{isLive \? "Go offline" : "Go live"\}/);
  assert.match(src("apps/mobile/components/arena/competitor-row.tsx"), /accessibilityLabel=\{`Challenge \$\{displayName\}`\}/);
  const screen = src("apps/mobile/app/(app)/practice.tsx");
  assert.match(screen, new RegExp(`<AppHeader title="${PRACTICE_UI.header.label}"`));
  assert.match(screen, /\{live \? null : \(\s*<AppHeader/, "the header is off on live (the live chrome check)");
  assert.match(screen, new RegExp(`testID="${PRACTICE_UI.exit.id}"`));
  assert.match(src("apps/mobile/components/practice/practice-live.tsx"), new RegExp(`testID="${PRACTICE_UI.exit.id}"`));
  assert.match(src("apps/mobile/components/match-flow/live/hold-to-end-button.tsx"), new RegExp(`testID="${PRACTICE_UI.liveEnd.id}"`));
  assert.match(src("apps/mobile/components/match-flow/live/pause-button.tsx"), new RegExp(`testID="${PRACTICE_UI.pause.id}"`));
});

// --- DB oracle helpers -----------------------------------------------------------------------------

test("only left_prestart, offline_prestart, left_live and offline_live are drop-outs (A26)", () => {
  const h = (left_reason: string | null) => [{ timekeeper_id: "tk", seated_at: "x", left_at: left_reason ? "y" : null, left_reason }];
  for (const r of ["left_prestart", "offline_prestart", "left_live", "offline_live"]) assert.equal(droppedOut(h(r), "tk"), true, r);
  for (const r of ["faceoff_timeout", "pause_timeout", "admin_void", "match_cancelled", "completed", null]) assert.equal(droppedOut(h(r), "tk"), false, String(r));
  assert.equal(droppedOut(h("left_live"), "someone-else"), false);
});

test("recipientsOf lists one entry per row, so a duplicate push is visible", () => {
  const rows = [
    { kind: "timekeeper_declined", recipient_athlete_id: "b", subject_athlete_id: "g" },
    { kind: "timekeeper_declined", recipient_athlete_id: "a", subject_athlete_id: "g" },
    { kind: "timekeeper_accepted", recipient_athlete_id: "a", subject_athlete_id: "g" },
  ];
  assert.deepEqual(recipientsOf(rows, "timekeeper_declined"), ["a", "b"]);
  assert.deepEqual(recipientsOf([...rows, rows[0]], "timekeeper_declined"), ["a", "b", "b"]);
});

test("the no-contest history oracle fails on a failed read: it needs no error and Red's newest completed match in the rows", () => {
  const rows = (...ids: string[]) => ids.map((match_id) => ({ match_id }));
  // A working read, anchored on the newest completed match.
  assert.deepEqual(historyVerdict({ data: rows("done-2", "done-1"), error: null }, "done-2", "nc"), { anchor: "ok", inHistory: false });
  assert.deepEqual(historyVerdict({ data: rows("nc", "done-2"), error: null }, "done-2", "nc"), { anchor: "ok", inHistory: true }, "a no contest in history fails db:not-in-history");
  // getMatchHistory's [] on an error, as the anchor sees it: not absent, failed.
  const empty = historyVerdict({ data: [], error: null }, "done-2", "nc");
  assert.equal(empty.inHistory, "history read failed");
  assert.match(empty.anchor, /does not list the newest completed match done-2/);
  const errored = historyVerdict({ data: null, error: { message: "permission denied" } }, "done-2", "nc");
  assert.deepEqual(errored, { anchor: "the read failed: permission denied", inHistory: "history read failed" });
  assert.equal(historyVerdict({ data: null, error: null }, null, "nc").inHistory, "history read failed", "no rows array is a failed read");
  // A database with no completed match for Red: only the error check anchors it.
  assert.deepEqual(historyVerdict({ data: [], error: null }, null, "nc"), { anchor: "ok", inHistory: false });
  assert.equal(historyVerdict({ data: null, error: { message: "boom" } }, null, "nc").inHistory, "history read failed");
});

test("checkNoContest reads history through the RPC with its error and anchors it, never through getMatchHistory's swallowed error", () => {
  const flows = src("tools/match-loop/scenarios/timekeeper/tk-flows.ts");
  const body = flows.slice(flows.indexOf("export async function checkNoContest"), flows.indexOf("export async function expectChipCountsDown"));
  assert.doesNotMatch(flows, /getMatchHistory\(/);
  assert.match(body, /const newest = await tkDb\.newestCompletedMatch\(red\.me\.id\);\s+const read = await red\.client\.rpc\("get_match_history", \{ p_athlete_id: red\.me\.id \}\);/, "the anchor is read BEFORE the RPC");
  assert.match(body, /ctx\.eq\("db:history-read-anchored", "ok", history\.anchor/);
  assert.match(body, /ctx\.eq\("db:not-in-history", false, history\.inHistory\)/);
});

test("T1 and T1B both pause and resume (TEST-PLAN 4.2: one happy path, run as challenger and as opponent)", () => {
  for (const f of ["t01-happy-path-challenger.ts", "t01b-happy-path-opponent.ts"]) {
    const s = src(`tools/match-loop/scenarios/timekeeper/${f}`);
    assert.match(s, /await tkFaceoffToLive\([^)]*\);\s+await tkPauseResume\(ctx, cast, m, side\);\s+const \{ finalElapsedS \} = await tkEnd\(/, f);
  }
});

// --- pending and the registry ----------------------------------------------------------------------

test("every slice is read from the app source, never declared by hand", () => {
  assert.equal(appSendsTimekeeperCap(`headers: { "x-elo-client-caps": "timekeeper_v1" }`), true);
  assert.equal(appSendsTimekeeperCap(`headers: { "x-elo-platform": Platform.OS }`), false);
  // M8 is detected by the quoted capability in code, however the header is spelled.
  assert.equal(appSendsTimekeeperCap(`const CAPS = ['timekeeper_v1'];\nheaders: { [CLIENT_CAPS_HEADER]: CAPS.join(",") }`), true);
  assert.equal(appSendsTimekeeperCap("export const TIMEKEEPER_CAP = `timekeeper_v1`;"), true);
  assert.equal(appSendsTimekeeperCap(`// M8 will send "timekeeper_v1" here\nheaders: {}`), false, "a line comment is not code");
  assert.equal(appSendsTimekeeperCap(`/** sends "timekeeper_v1" from M8 on */\nheaders: {}`), false, "nor is a block comment");
  assert.equal(appSendsTimekeeperCap(`url: "http://x"; headers: { caps: "timekeeper_v1" }`), true, "a URL's // is not a comment");
  assert.equal(appSendsTimekeeperCap(`"timekeeper_v10"`), false);
  assert.deepEqual([...CAP_SOURCE_DIRS], ["apps/mobile/lib/supabase", "packages/shared/src"]);
  const files = (present: Record<string, string>) => (rel: string) => present[rel] ?? null;
  const listed = (present: Record<string, string>) => (dir: string) => Object.keys(present).filter((rel) => rel.startsWith(`${dir}/`));
  const slices = (present: Record<string, string>) => [...integratedSlices(files(present), listed(present))].sort();
  assert.deepEqual(slices({}), [], "nothing but M1");
  assert.deepEqual(
    slices({ [SLICE_MARKERS.M2]: "", [SLICE_MARKERS.M5]: "", [APP_CLIENT_SOURCE]: `"x-elo-platform": "ios"` }),
    ["M2", "M5"],
    "the client without the capability is not M8",
  );
  const all = Object.fromEntries(Object.values(SLICE_MARKERS).map((rel) => [rel, ""]));
  assert.deepEqual(slices({ ...all, [APP_CLIENT_SOURCE]: `"x-elo-client-caps": "timekeeper_v1"` }), ["M10", "M2", "M3", "M4", "M5", "M6", "M8", "M9"]);
  assert.deepEqual(
    slices({ [APP_CLIENT_SOURCE]: `import { CLIENT_CAPS } from "@jits/shared/constants";`, "packages/shared/src/constants.ts": `export const CLIENT_CAPS = "timekeeper_v1";` }),
    ["M8"],
    "a constant the client imports from the shared package",
  );
  assert.deepEqual(
    slices({ "apps/mobile/lib/supabase/__tests__/client.test.ts": `"timekeeper_v1"`, "packages/shared/src/api/caps.test.ts": `"timekeeper_v1"` }),
    [],
    "a test file is not the app",
  );
  // One marker per slice, each a file of that slice's own (PLAN 3.2), all distinct.
  assert.deepEqual(Object.keys(SLICE_MARKERS).sort(), ["M10", "M2", "M3", "M4", "M5", "M6", "M9"]);
  assert.equal(new Set(Object.values(SLICE_MARKERS)).size, Object.keys(SLICE_MARKERS).length);
  assert.ok(!src("tools/match-loop/scenarios/timekeeper/integration.ts").includes("INTEGRATED_SLICES"), "no hand-maintained list");
});

test("a scenario is pending until every slice it drives is integrated, and says which", () => {
  const present = new Set<MobileSlice>(["M2", "M8"]);
  assert.equal(pendingReason(undefined, present), null);
  assert.equal(pendingReason(["M2", "M8"], present), null);
  const why = pendingReason(["M2", "M3", "M8"], present);
  assert.ok(why && /needs M3 \(the athlete face-off/.test(why) && !/M2/.test(why));
});

test("a pending scenario fails the run on a build with M8, or with --no-pending", () => {
  assert.equal(pendingFails(new Set<MobileSlice>(["M2", "M3"]), false), false, "a partial Wave 2 build: pending is not a failure");
  assert.equal(pendingFails(new Set<MobileSlice>(["M2", "M8"]), false), true, "M8 lands after every slice: a missing slice is an integration defect");
  assert.equal(pendingFails(new Set<MobileSlice>(), true), true, "--no-pending (the Wave 3 gate)");
  // The runner's wiring (the rules themselves are exercised below).
  const run = src("tools/match-loop/run.ts");
  assert.match(run, /pendingResult\(s, pending, failPending\)/);
  assert.match(run, /const failPending = pendingFails\(present, args\.noPending\)/);
  assert.match(run, /return exitCodeFor\(results\);/);
});

test("a pending scenario the run may leave is pending and passes the run; one it may not is a fingerprinted fail that fails it (M7 review)", () => {
  const s = { id: "T4", title: "Nobody accepts" };
  const reason = "needs M3 (the athlete face-off)";
  const left = pendingResult(s, reason, false);
  assert.deepEqual(
    { status: left.status, attempts: left.attempts, fingerprint: left.fingerprint, fingerprints: left.fingerprints, error: left.error },
    { status: "pending", attempts: 0, fingerprint: null, fingerprints: [], error: reason },
  );
  assert.equal(exitCodeFor([left]), 0, "a partial build's pending scenario never fails the run");
  const failed = pendingResult(s, reason, true);
  assert.equal(failed.status, "fail");
  assert.equal(failed.attempts, 0);
  assert.ok(failed.error?.startsWith(reason));
  assert.ok(failed.error?.endsWith("(a build with M8, or --no-pending, must run every timekeeper scenario)"), failed.error);
  assert.equal(failed.fingerprint, errorFingerprint("T4", failed.error!));
  assert.deepEqual(failed.fingerprints, [failed.fingerprint]);
  assert.equal(exitCodeFor([failed]), 1, "--tier timekeeper --no-pending with every scenario pending exits 1");
});

test("the exit code: fail, harness_error and env_error fail the run; pass, known, flake and an allowed pending do not", () => {
  assert.equal(exitCodeFor([]), 0);
  for (const ok of ["pass", "known", "flake", "pending"] as const) assert.equal(exitCodeFor([{ status: ok }]), 0, ok);
  for (const bad of ["fail", "harness_error", "env_error"] as const) {
    assert.equal(exitCodeFor([{ status: "pass" }, { status: bad }]), 1, bad);
  }
});

test("known only when every failure is filed and no put-back failed: one new failure, or a failed put-back, keeps it fail (W3FIX review minor 3)", () => {
  const known = new Map([["fp-a", "jits-aaa"], ["fp-b", "jits-bbb"]]);
  assert.equal(finalStatus("fail", ["fp-a", "fp-b"], known, []), "known");
  assert.equal(finalStatus("fail", ["fp-a", "fp-new"], known, []), "fail", "one new failure");
  assert.equal(finalStatus("fail", ["fp-a"], known, ["windows: Error: psql failed"]), "fail", "a failed put-back is never filed");
  assert.equal(finalStatus("fail", [], known, []), "fail", "nothing to match");
  for (const other of ["pass", "harness_error", "env_error"] as const) assert.equal(finalStatus(other, ["fp-a"], known, []), other, other);
});

test("a scenario result: a known failure with a failed put-back stays fail, lists the put-back and fails the run; without it, known (W3FIX review minor 3)", () => {
  const oracle = { id: "ui:tk-d9", ok: false, status: "fail" as const, expected: "TK-D9 on screen", actual: "absent" };
  const fp = oracleFingerprint("T7", oracle);
  const known = new Map([[fp, "jits-o47s.99"]]);
  const run = (putBacks: string[]): ScenarioRun => ({
    scenario: { id: "T7", title: "The timekeeper drops out", expectedFailure: undefined },
    status: "fail",
    steps: [],
    oracles: [oracle, { id: "db:ok", ok: true, status: "skipped", expected: 1, actual: null }],
    artifacts: {},
    error: "ExpectationTimeout: the app never showed TK-D9",
    putBacks,
    ms: 12,
  });
  const withPutBack = scenarioResult(run(["windows: Error: psql failed"]), known);
  assert.equal(withPutBack.status, "fail");
  assert.deepEqual(withPutBack.putBackFailures, ["windows: Error: psql failed"]);
  assert.equal(withPutBack.error, "ExpectationTimeout: the app never showed TK-D9", "the error stays the scenario's own");
  assert.deepEqual(withPutBack.fingerprints, [fp]);
  assert.equal(withPutBack.fingerprint, fp);
  assert.deepEqual(withPutBack.knownBeads, [`${fp}=jits-o47s.99`]);
  assert.deepEqual(withPutBack.skippedOracles, ["db:ok"]);
  assert.equal(exitCodeFor([withPutBack]), 1);
  const clean = scenarioResult(run([]), known);
  assert.equal(clean.status, "known");
  assert.equal("putBackFailures" in clean, false, "listed only when one failed");
  assert.equal(exitCodeFor([clean]), 0);
  // Died with no failed oracle: the error's fingerprint. A pass has none.
  const died = scenarioResult({ ...run([]), oracles: [] }, known);
  assert.deepEqual(died.fingerprints, [errorFingerprint("T7", "ExpectationTimeout: the app never showed TK-D9")]);
  assert.equal(died.status, "fail");
  assert.deepEqual(scenarioResult({ ...run([]), status: "pass", oracles: [] }, known).fingerprints, []);
  // The runner builds every result this way, with the put-backs of the scenario's own error.
  assert.match(src("tools/match-loop/run.ts"), /const putBacks = putBackFailures\(error\);\n\s+const result = scenarioResult\(\n\s+\{ scenario: s, status, [^}]*putBacks[^}]*\},\n\s+known,\n\s+\);/);
});

test("every runner start repairs a killed run, then refuses to run with timekeeper_role left on", () => {
  const run = src("tools/match-loop/run.ts");
  const recover = run.indexOf("await recoverFixtures()");
  const check = run.indexOf("await timekeeperRoleOffProblem()");
  const scenarios = run.indexOf("for (const s of selected)");
  assert.ok(recover > 0 && check > recover && scenarios > check, "recover, then check, then run (with or without --preflight)");
});

test("--tier all is the flag-OFF guard (core and extended); the timekeeper tier runs only when asked", () => {
  const ids = (tier: Parameters<typeof scenariosForTier>[0]) => scenariosForTier(tier).map((s) => s.id);
  assert.deepEqual(ids("all"), SCENARIOS.filter((s) => s.tier === "core" || s.tier === "extended").map((s) => s.id));
  assert.ok(!ids("all").some((id) => id.startsWith("T")), "no timekeeper scenario in --tier all");
  assert.deepEqual(ids("timekeeper"), SCENARIOS.filter((s) => s.tier === "timekeeper").map((s) => s.id));
  assert.deepEqual(ids("core"), ["C1", "C2", "C3", "C4", "C5", "C6", "C6B"]);
  assert.match(src("tools/match-loop/run.ts"), /: scenariosForTier\(args\.tier\)/);
});

test("T11 holds the flag ON for the whole scenario, with C1's handshake, and relaunches the app around it", () => {
  const t11 = src("tools/match-loop/scenarios/timekeeper/t11-capability-mixed.ts");
  assert.match(
    t11,
    /withFlags\(\s*\{ \[TK_ROLE_FLAG\]: true \},\s*\(\) => \{\s*unhookAppClose = onInterrupt\("t11-app-close", \(\) => ctx\.simctl\.terminate\(\)\);\s*return mixedPairC1\(ctx, slices\);\s*\},\s*note,\s*\)/,
    "the window holds the flag for C1, and closes the app on an interrupt after the put-back",
  );
  assert.match(t11, /await relaunch\(ctx, [^]*?\);\n\s+unhookAppClose\(\);/, "the interrupt close stays until the relaunch");
  assert.match(t11, /ctx\.simctl\.terminate\(\)\);\n\s+await prepare\(ctx\);/, "the app launches with the flag ON");
  assert.match(t11, /await blueChallengesRed\(ctx, red, \{/, "C1's handshake (db:challenge-created)");
  assert.match(t11, /stakesFor\(ctx, red\)/);
  assert.match(t11, /\} finally \{\n[^]*?await relaunch\(ctx,/, "relaunched afterwards");
  assert.doesNotMatch(t11, /red\.accept\(/, "no inline copy of the handshake");
  const flows = src("tools/match-loop/scenarios/timekeeper/tk-flows.ts");
  assert.match(flows, /await blueChallengesRed\(ctx, red, \{\n\s+step: "Red accepts \(timekeeper_role on for the match's creation only\)",\n\s+wrap: \(accept\) => withFlags\(/);
});

test("--tk-flag-on closes the app after the flag is set and after it is restored, so the app reads it", () => {
  const run = src("tools/match-loop/run.ts");
  // And on Ctrl-C or SIGTERM: a hook registered after the hold's own put-back closes the app (M7 review).
  assert.match(run, /const releaseFlag = args\.tkFlagOn \? await holdFlagForRun\(\) : null;\n[^]*?const unhookAppClose = releaseFlag \? onInterrupt\("tk-flag-run-app-close", \(\) => simctl\.terminate\(\)\) : \(\) => undefined;/);
  assert.match(run, /await simctl\.terminate\(\);\n\s+unhookAppClose\(\);/, "removed only after the normal path closed the app");
  assert.match(run, /const releaseFlag = args\.tkFlagOn \? await holdFlagForRun\(\) : null;\n[^]*?if \(releaseFlag\) await simctl\.terminate\(\);/);
  assert.match(run, /await releaseFlag\(\);\n[^\n]*\n\s+await simctl\.terminate\(\);/);
});

test("on an interrupt the flag goes back before the app is closed: hooks run in the order they were registered (M7 review)", async () => {
  const order: string[] = [];
  const { io, db } = fakeFlagIo({ [TK_ROLE_FLAG]: false });
  const release = await holdFlagForRun({ ...io, write: async (v) => (order.push(`flag:${JSON.stringify(v)}`), Object.assign(db, v), undefined) });
  order.length = 0;
  const unhook = onInterrupt("test-app-close", () => void order.push("app closed"));
  await runCleanup();
  assert.deepEqual(order, [`flag:${JSON.stringify({ [TK_ROLE_FLAG]: false })}`, "app closed"], "the app relaunches onto the flag as it was put back");
  assert.equal(db[TK_ROLE_FLAG], false);
  unhook();
  // What the runner's normal path then does: stop holding the flag (this process would have exited).
  await release();
  assert.equal((await timekeeperFlagState(io)).heldByThisRun, false);
});

test("T3 reads TK-N3 after one more sweep, and only the rows about Gold (M7 review)", () => {
  const t3 = src("tools/match-loop/scenarios/timekeeper/t03-request-lapses.ts");
  const expired = t3.indexOf('ctx.eq("db:request-expired"');
  const tick = t3.indexOf("runTimekeeperTick()", expired);
  const read = t3.indexOf("tkDb.notifications(m.matchId)", expired);
  assert.ok(expired > 0 && tick > expired && read > tick, "a sweep that told them again would show: one more runs before the read");
  assert.match(t3, /recipientsOf\(n, "timekeeper_declined", gold\.me\.id\)/, "TK-N3 with Gold as the subject");
});

test("the simulator's Metro must serve this checkout: its project root is read from the Metro log", () => {
  const log = "env: load .env.local .env\nStarting project at /w/jits_web-tk-build/apps/mobile\nStarting Metro Bundler\n";
  assert.equal(metroProjectRoot(log), "/w/jits_web-tk-build/apps/mobile");
  assert.equal(metroProjectRoot(`${log}...\nStarting project at /w/other/apps/mobile\n`), "/w/other/apps/mobile", "the last start wins");
  assert.equal(metroProjectRoot("iOS Bundled 5588ms"), null);
  const id = (p: string) => p;
  assert.equal(metroTreeProblem("/w/jits_web-tk-build/apps/mobile", "/w/jits_web-tk-build", id), null);
  assert.match(metroTreeProblem("/w/jits_web-tk-build/apps/mobile", "/w/jits_web-tk-m7", id) ?? "", /serves \/w\/jits_web-tk-build\/apps\/mobile, not this checkout's app \(\/w\/jits_web-tk-m7\/apps\/mobile\)/);
  assert.equal(metroTreeProblem(null, "/w/jits_web-tk-m7", id), null, "a log that names no project cannot tell");
  const run = src("tools/match-loop/run.ts");
  const at = run.indexOf("metroTreeProblem(metroRoot, REPO_ROOT)");
  assert.ok(at > run.indexOf("await timekeeperRoleOffProblem()") && at < run.indexOf("for (const s of selected)"), "checked at every runner start, before any scenario");
  assert.match(src("tools/match-loop/preflight.ts"), /check\(r, "metro-serves-this-checkout"/);
});

test("the timekeeper tier holds T1 to T18 (T13 moved to the device script) plus the bots-only T0 and T0B, and never touches the flag-OFF tiers", () => {
  const tk = SCENARIOS.filter((s) => s.tier === "timekeeper").map((s) => s.id);
  assert.deepEqual(
    [...tk].sort(),
    ["T0", "T0B", "T1", "T1B", "T2", "T3", "T4", "T5", "T6", "T7", "T8", "T9", "T10", "T11", "T12", "T14", "T15", "T16", "T17", "T18"].sort(),
  );
  assert.deepEqual(SCENARIOS.find((s) => s.id === "T0")?.needs, [], "T0 runs on every build, so every timekeeper-tier run drives the bot");
  assert.deepEqual(SCENARIOS.find((s) => s.id === "T0B")?.needs, [], "and T0B, so every run drives the windows and the sweep");
  assert.ok(NOT_IMPLEMENTED.some((n) => n.id === "T13" && /device script/.test(n.reason)));
  assert.equal(new Set(SCENARIOS.map((s) => s.id)).size, SCENARIOS.length, "scenario ids are unique");
  // The flag-OFF guard is unchanged: the same ids, none of them pending.
  assert.deepEqual(SCENARIOS.filter((s) => s.tier === "core").map((s) => s.id), ["C1", "C2", "C3", "C4", "C5", "C6", "C6B"]);
  assert.equal(SCENARIOS.filter((s) => s.tier === "extended").length, 20);
  assert.ok(SCENARIOS.filter((s) => s.tier !== "timekeeper").every((s) => !s.needs), "a flag-OFF scenario never waits on a timekeeper slice");
  // Without the app's header no simulator pair can be a timekeeper match;
  // T0 and T0B (bots only), T11 (mixed on purpose) and T14 (capture policy, flag OFF) are the exceptions.
  for (const s of SCENARIOS.filter((x) => x.tier === "timekeeper" && !["T0", "T0B", "T11", "T14"].includes(x.id))) {
    assert.ok(s.needs?.includes("M8"), `${s.id} must need M8`);
  }
});

// --- T17's pending invite on the device ---------------------------------------------------------

/** A simulator showing `screen` until a tap, then the Arena. */
function inviteScripted(screen: El[]) {
  const taps: string[] = [];
  let now = screen;
  const idb = {
    screenH: 874,
    screenW: 402,
    async describe() {
      return now;
    },
    async tap(e: El) {
      taps.push(String(e.AXLabel));
      now = [el({ AXLabel: "Arena" })];
    },
    async scrollTo() {
      throw new Error("no scroll on this screen");
    },
    onScreen() {
      return true;
    },
  } as unknown as Idb;
  return { ui: new Screens(idb, {} as Simctl, 0), taps };
}

const text = (label: string) => el({ AXLabel: label, type: "StaticText" });
const notNowBtn = (enabled = true) => el({ AXLabel: "Not now", enabled });

test("a pending invite left on the device is dropped with the claim screen's own Not now, and only there", async () => {
  const confirm = inviteScripted([text("OPEN THIS INVITE?"), el({ AXLabel: "Continue" }), el({ AXLabel: "Sign out" }), notNowBtn()]);
  assert.equal(await confirm.ui.dropPendingInvite(), true);
  assert.deepEqual(confirm.taps, ["Not now"]);
  const dob = inviteScripted([text(DOB_REQUIRED_COPY), notNowBtn()]);
  assert.equal(await dob.ui.dropPendingInvite(), true, "the date of birth step");
  const saving = inviteScripted([text(DOB_REQUIRED_COPY), notNowBtn(false)]);
  assert.equal(await saving.ui.dropPendingInvite(), false, "never a disabled Not now (the date of birth saving)");
  // Other screens' Not now: the practice offer, the go-live location sheet, the AI consent sheet.
  for (const other of [[text("PRACTICE MATCH"), notNowBtn()], [text("Turn on location"), notNowBtn()]]) {
    const o = inviteScripted(other);
    assert.equal(await o.ui.dropPendingInvite(), false);
    assert.deepEqual(o.taps, []);
  }
  const booked = inviteScripted([text("BOOKED"), el({ AXLabel: "Go to the Arena" })]);
  assert.equal(await booked.ui.dropPendingInvite(), false, "booked: the app already cleared it");
  // The markers and the Not now are the claim screen's own.
  const claim = src("apps/mobile/app/(app)/invite/claim.tsx");
  assert.match(claim, />Open this invite\?</);
  assert.match(claim, /const notNow = async \(\) => \{\n\s+await clearPendingInvite\(\);/, "Not now drops the pending invite");
  assert.match(claim, /label="Not now" onPress=\{\(\) => void notNow\(\)\}/);
  for (const id of ["claim-confirm", "claim-message"]) assert.match(claim, new RegExp(`testID="${id}"`));
  const dobStep = src("apps/mobile/components/invite/claim-dob-step.tsx");
  assert.match(dobStep, /testID="claim-dob"/);
  assert.match(dobStep, /label="Not now" disabled=\{busy\} onPress=\{onNotNow\}/);
  assert.ok(INVITE_CLAIM_MARKERS.some((q) => q.label === DOB_REQUIRED_COPY));
  // normaliseApp drops one a killed run left, before it pops pushed screens (the claim screen is one).
  const flows = src("tools/match-loop/scenarios/flows.ts");
  const drop = flows.indexOf("await ui.dropPendingInvite(els)");
  assert.ok(drop > 0 && drop < flows.indexOf("matches(e, GO_BACK)"));
});

// --- the timekeeper's live Leave -------------------------------------------------------------------

test("the timekeeper's live Leave broadcasts match_cancelled with actor_id, as the live step's Leave does; a Leave before the start sends nothing", async () => {
  for (const [status, sent] of [
    ["cancelled", [[E.MATCH_CANCELLED, { actor_id: "tk" }]]],
    ["pending", []],
  ] as const) {
    const calls: string[] = [];
    const client = {
      async rpc(name: string) {
        calls.push(name);
        return { data: { match_id: "m1", left: true, status }, error: null };
      },
    };
    const trace = new Trace(null);
    const side = new TimekeeperSide(cfg, client as never, trace, "m1", "tk", ["a", "b"], "tk:green");
    const sends: [string, unknown][] = [];
    (side as unknown as { handle: unknown }).handle = { send: async (event: string, payload: unknown) => (sends.push([event, payload]), "ok") };
    const r = await side.leave();
    assert.equal(r.ok && r.data.status, status);
    assert.deepEqual(calls, ["leave_match_as_timekeeper"]);
    assert.deepEqual(sends, sent, status === "cancelled" ? "a no contest is told on the match topic, naming the timekeeper" : "unseated before the start: silent");
    for (const [event, payload] of sends) assert.equal(validatePayload(event, payload), null, "protocol:payload-shapes accepts it");
    assert.equal(trace.entries.filter((e) => e.kind === "broadcast_sent").length, sends.length, "traced like every other broadcast");
  }
  // Pinned to the app.
  const live = src("apps/mobile/lib/match-flow/use-timekeeper-live-leave.ts");
  assert.match(live, /if \(outcome === "no_contest"\) \{[^}]*await settleWithin\(broadcastMatchCancelled\(\), SEND_GRACE_MS\);/);
  assert.match(src("apps/mobile/lib/match-flow/match-sync-context.tsx"), /sendCancel\(actorId \?\? timekeeperModeSelfId\)/, "the step channel's cancel names the timekeeper's phone");
  const faceoff = src("apps/mobile/lib/match-flow/use-faceoff-leave.ts");
  const seatLeave = faceoff.slice(faceoff.indexOf("const doLeaveSeat"), faceoff.indexOf("const leave = React.useCallback"));
  assert.ok(seatLeave.length > 0);
  assert.doesNotMatch(seatLeave, /broadcastMatchCancelled/, "the face-off's seat Leave sends nothing");
});

// --- Blue's Confirm in timekeeper mode (PM29 (5)) -------------------------------------------------------

/** A confirm step whose Confirm is offered disabled (busy, or waiting for a newer result) for `busyReads` reads. */
function confirmScripted(busyReads: number) {
  const taps: string[] = [];
  let reads = 0;
  const idb = {
    screenH: 874,
    screenW: 402,
    async describe() {
      reads++;
      return [stepMarker("Confirm"), el({ AXUniqueId: "confirm-result", AXLabel: "Confirm result", enabled: reads > busyReads })];
    },
    async tap(e: El) {
      taps.push(String(e.AXUniqueId));
    },
    async scrollTo(q: Query) {
      return el({ AXUniqueId: q.id ?? null });
    },
    onScreen() {
      return true;
    },
  } as unknown as Idb;
  return { ui: new TimekeeperScreens(idb, new Screens(idb, {} as Simctl, 0), { pollMs: 2, still: FAST_STILL }), taps, reads: () => reads };
}

test("Blue's timekeeper-mode Confirm is pressed once, only once offered and enabled, never while busy (PM29 (5))", async () => {
  const busy = confirmScripted(3);
  assert.equal(await busy.ui.confirmOnce(2_000), 1);
  assert.deepEqual(busy.taps, ["confirm-result"], "one press");
  assert.equal(busy.reads(), 5, "it waited out the busy reads, then read once more to see Confirm hold still, before the press");
  const stuck = confirmScripted(Number.POSITIVE_INFINITY);
  await assert.rejects(stuck.ui.confirmOnce(30), (e: unknown) => e instanceof ExpectationTimeout && /confirm-result/.test(e.what));
  assert.deepEqual(stuck.taps, [], "a Confirm never enabled is never tapped");
  // The shipped testID, and the scenarios use the one-press helper only.
  assert.match(src("apps/mobile/components/match-flow/steps/confirm-step.tsx"), /testID="confirm-result"/);
  const dir = join(ROOT, "tools/match-loop/scenarios/timekeeper");
  for (const f of readdirSync(dir)) assert.doesNotMatch(readFileSync(join(dir, f), "utf8"), /ui\.confirmResult\(/, `${f} confirms through blueConfirmsOnce`);
  const flows = src("tools/match-loop/scenarios/timekeeper/tk-flows.ts");
  assert.match(flows, /\.confirmOnce\(TK\.step\)\);\n\s+ctx\.eq\("ui:tk-confirm-one-press", 1, presses/);
  assert.match(flows, /await blueConfirmsOnce\(ctx, "Blue confirms"\);[^]*?waitStep\("summary", TK\.handshake\)/);
  assert.match(src("tools/match-loop/scenarios/timekeeper/t09-result-edit.ts"), /await blueConfirmsOnce\(ctx, "Blue confirms the \(wrong\) result"\);\n\s+await ctx\.step\("Blue reaches the verdict", \(\) => ctx\.ui\.waitStep\("summary", TK\.handshake\)\);/);
});

test("a Confirm that settles in the bottom band (the LogBox toast's) is never tapped there: it is scrolled into view first (W3FIX review minor 2)", async () => {
  const confirmAt = (y: number) => el({ AXUniqueId: "confirm-result", AXLabel: "Confirm result", enabled: true, frame: { x: 16, y, width: 370, height: 56 } });
  const taps: number[] = [];
  let reads = 0;
  let scrolled = false;
  const idb = {
    screenH: 874,
    screenW: 402,
    async describe() {
      reads++;
      // On screen in the first read; an edit landing then pushes it down into the bottom band.
      return [stepMarker("Confirm"), confirmAt(scrolled ? 400 : reads === 1 ? 500 : 800)];
    },
    async tap(e: El) {
      taps.push(e.frame.y);
    },
    async scrollTo() {
      scrolled = true;
      return confirmAt(400);
    },
    onScreen(e: El) {
      return Idb.prototype.onScreen.call(this as unknown as Idb, e);
    },
  } as unknown as Idb;
  assert.equal(idb.onScreen(confirmAt(500)), true);
  assert.equal(idb.onScreen(confirmAt(800)), false, "the bottom band, where the dev build's LogBox toast lies");
  const ui = new TimekeeperScreens(idb, new Screens(idb, {} as Simctl, 0), { pollMs: 2, still: FAST_STILL });
  assert.equal(await ui.confirmOnce(2_000), 1);
  assert.deepEqual(taps, [400], "one press, after the scroll, never at 800");
});

test("the verdict wait after a timekeeper Confirm covers the send ceiling, the advance and a margin (PM29 (5))", () => {
  assert.equal(TK_CONFIRM_SETTLE_MS, TK_TIMING.SEND_CEILING_MS + APP_TIMING.CONFIRM_ADVANCE_MS + 5_000);
  assert.ok(TK.handshake >= TK_CONFIRM_SETTLE_MS, `TK.handshake ${TK.handshake} < ${TK_CONFIRM_SETTLE_MS}`);
});

test("the send ceiling is PM29's 20 s, pinned to the app's send-timing.ts once it exists", { skip: !existsSync(join(ROOT, "apps/mobile/lib/match-flow/send-timing.ts")) && "the PM29 change has not added lib/match-flow/send-timing.ts yet" }, () => {
  const m = src("apps/mobile/lib/match-flow/send-timing.ts").match(/SEND_CEILING_MS\s*(?::\s*\w+\s*)?=\s*([\d_]+)/);
  assert.ok(m, "no SEND_CEILING_MS constant in send-timing.ts");
  assert.equal(TK_TIMING.SEND_CEILING_MS, Number(m[1].replace(/_/g, "")));
});

// --- T0B: the windows and the sweep on every build ---------------------------------------------------

test("T0B drives the test-only window and the harness's sweep on the stack, bots only, and checks the window is gone afterwards", () => {
  const t0b = SCENARIOS.find((s) => s.id === "T0B");
  assert.ok(t0b);
  assert.equal(t0b.tier, "timekeeper");
  assert.deepEqual(t0b.needs, [], "runs on every build, before M8");
  const body = src("tools/match-loop/scenarios/timekeeper/t00b-bot-sweep.ts");
  assert.match(body, /tkScenario\(ctx, \{ gold: true, blueLive: false, windows: \{ tk_request_lapse: T0B_LAPSE_S \} \}/);
  assert.match(body, /await runTimekeeperTick\(\);/);
  assert.match(body, /"db:request-lapse-shortened", T0B_LAPSE_S/, "the window reached the server");
  assert.match(body, /recipientsOf\(n, "timekeeper_declined", tk\.me\.id\)/, "TK-N3 once each, after one more sweep");
  const close = body.indexOf("    });\n    // The scenario's fixtures are undone");
  assert.ok(close > 0 && body.indexOf('"db:tk-windows-removed"') > close, "the window check runs after tkScenario has undone its fixtures");
  assert.doesNotMatch(body, /ctx\.(ui|idb)\./, "bots only: the simulator is never driven");
});
