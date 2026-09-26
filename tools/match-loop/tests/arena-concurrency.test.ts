/**
 * Arena concurrency helpers (node:test, run via `npm run match-loop:test`).
 * Pure or stubbed: no database, no realtime, no simulator. They pin the bot's
 * challenge handling to apps/mobile/lib/arena/use-arena-challenge.ts (crossing
 * tie-break, accepted fallback, statuses) and cover the toast oracle.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { APP_TIMING, CHALLENGE_EVENTS } from "../bot/protocol";
import {
  LIVE_CHALLENGE_STATUSES,
  MobileOpponent,
  crossingPlan,
  outgoingStatusAction,
  type ArenaEvent,
} from "../bot/opponent";
import { Trace } from "../bot/trace";
import { mergeToasts, toastsIn } from "../oracle/ui";
import type { AXElement } from "../sim/idb";
import type { Config } from "../config";

const ROOT = join(__dirname, "..", "..", "..");
const HOOK = readFileSync(join(ROOT, "apps/mobile/lib/arena/use-arena-challenge.ts"), "utf8");

// --- drift guards -------------------------------------------------------------

test("ACCEPTED_FALLBACK_MS matches the app", () => {
  const m = HOOK.match(/const ACCEPTED_FALLBACK_MS\s*=\s*([\d_]+)/);
  assert.ok(m, "ACCEPTED_FALLBACK_MS not found in use-arena-challenge.ts");
  assert.equal(APP_TIMING.ACCEPTED_FALLBACK_MS, Number(m[1].replace(/_/g, "")));
});

test("LIVE_CHALLENGE_STATUSES matches the app", () => {
  const m = HOOK.match(/const LIVE_CHALLENGE_STATUSES = new Set\(\[([^\]]*)\]\)/);
  assert.ok(m, "LIVE_CHALLENGE_STATUSES not found in use-arena-challenge.ts");
  const app = [...m[1].matchAll(/"([a-z_]+)"/g)].map((x) => x[1]).sort();
  assert.deepEqual([...LIVE_CHALLENGE_STATUSES].sort(), app);
});

test("the app's crossing tie-break is still lower-challenge-id-canonical", () => {
  assert.match(HOOK, /const crossing = !!mine && mine\.opponentId === current\.challengerId;/);
  assert.match(HOOK, /crossing && !!mine && current\.challengeId < mine\.challengeId;/);
});

test("the app's challenge broadcasts are the bot's CHALLENGE_EVENTS", () => {
  const m = HOOK.match(/event: "([a-z_]+)" \| "([a-z_]+)"/);
  assert.ok(m, "broadcast() event union not found");
  assert.deepEqual([m[1], m[2]].sort(), Object.values(CHALLENGE_EVENTS).sort());
});

// --- crossing tie-break -------------------------------------------------------

test("crossingPlan: no own challenge, or one to someone else, is not crossing", () => {
  assert.deepEqual(crossingPlan("b", "red", null), { crossing: false, acceptCanonical: false });
  assert.deepEqual(crossingPlan("b", "red", { challengeId: "a", opponentId: "green" }), {
    crossing: false,
    acceptCanonical: false,
  });
});

test("crossingPlan: exactly one side of a crossing pair accepts canonically, the lower id", () => {
  const ids = ["0f3c", "7a21", "a9e0", "ffff", "0000", "5b5b"];
  for (const x of ids) {
    for (const y of ids) {
      if (x === y) continue;
      // Blue sent x to Red, Red sent y to Blue. Blue accepts y; Red accepts x.
      const blue = crossingPlan(y, "red", { challengeId: x, opponentId: "red" });
      const red = crossingPlan(x, "blue", { challengeId: y, opponentId: "blue" });
      assert.ok(blue.crossing && red.crossing);
      assert.equal(Number(blue.acceptCanonical) + Number(red.acceptCanonical), 1, `${x} vs ${y}`);
      // The canonical challenge is the lower id; its RECIPIENT accepts it directly.
      const canonical = x < y ? x : y;
      assert.equal(red.acceptCanonical, canonical === x);
      assert.equal(blue.acceptCanonical, canonical === y);
    }
  }
});

// --- challenger status handling ----------------------------------------------

test("outgoingStatusAction: enter only on started, arm the net on accepted, end on terminal", () => {
  assert.equal(outgoingStatusAction("pending"), "wait");
  assert.equal(outgoingStatusAction("accepted"), "arm_fallback");
  assert.equal(outgoingStatusAction("started"), "enter");
  for (const s of ["declined", "cancelled", "expired", "something_new"]) assert.equal(outgoingStatusAction(s), "end", s);
});

// --- waitOutgoingOutcome, with a stubbed client -------------------------------

interface Stub {
  bot: MobileOpponent;
  rpcCalls: string[];
  /** What getChallengeStatus reads. */
  status: { value: string };
}

/** A bot whose Supabase client never touches the network. */
function stubBot(): Stub {
  const cfg = { supabaseUrl: "http://127.0.0.1:9", publishableKey: "sb_publishable_test" } as unknown as Config;
  const bot = new MobileOpponent(cfg, { id: "red", email: "r@example.test", displayName: "Red", key: "red" }, new Trace(null), "x");
  const rpcCalls: string[] = [];
  const status = { value: "accepted" };
  // A chainable query builder: every filter returns itself; `maybeSingle` is
  // the status read, awaiting the chain is the pending-challenges read.
  const chain: Record<string, unknown> = {};
  for (const k of ["select", "eq", "gt", "or", "order", "update", "in"]) chain[k] = () => chain;
  chain.maybeSingle = async () => ({ data: { status: status.value, expires_at: null }, error: null });
  chain.then = (resolve: (v: unknown) => void) => resolve({ data: [], error: null });
  const client = bot.client as unknown as Record<string, unknown>;
  client.from = () => chain;
  client.rpc = async (name: string) => {
    rpcCalls.push(name);
    return { data: { match_id: "m1" }, error: null };
  };
  bot.outgoingId = "c1";
  bot.outgoingOpponentId = "blue";
  return { bot, rpcCalls, status };
}

const row = (status: string): ArenaEvent => ({
  kind: "outgoing_update",
  row: { id: "c1", challenger_id: "red", opponent_id: "blue", status },
});

test("waitOutgoingOutcome: accepted alone never starts; the broadcast takes it in", async () => {
  const { bot, rpcCalls } = stubBot();
  bot.events.push(row("accepted"));
  setTimeout(() => bot.events.push({ kind: "match_started", challengeId: "c1", matchId: "m9" }), 50);
  const out = await bot.waitOutgoingOutcome(2_000, 1_000);
  assert.deepEqual(out, { kind: "match_started", matchId: "m9", via: "broadcast" });
  assert.ok(!rpcCalls.includes("start_match_from_challenge"), "started on accepted");
  await bot.lastSettle;
  await bot.close();
});

test("waitOutgoingOutcome: still accepted after the fallback, the challenger starts it", async () => {
  const { bot, rpcCalls, status } = stubBot();
  status.value = "accepted";
  bot.events.push(row("accepted"));
  const t0 = Date.now();
  const out = await bot.waitOutgoingOutcome(2_000, 150);
  assert.deepEqual(out, { kind: "match_started", matchId: "m1", via: "accepted_fallback" });
  assert.ok(Date.now() - t0 >= 140, "started before the fallback delay");
  assert.deepEqual(rpcCalls, ["start_match_from_challenge"]);
  await bot.lastSettle;
  await bot.close();
});

test("waitOutgoingOutcome: a row that went terminal during the fallback ends the plate", async () => {
  const { bot, rpcCalls, status } = stubBot();
  status.value = "cancelled";
  bot.events.push(row("accepted"));
  assert.deepEqual(await bot.waitOutgoingOutcome(2_000, 100), { kind: "cancelled" });
  assert.deepEqual(rpcCalls, []);
  await bot.close();
});

test("waitOutgoingOutcome: started joins at once, declined ends via status", async () => {
  const a = stubBot();
  a.bot.events.push(row("started"));
  assert.deepEqual(await a.bot.waitOutgoingOutcome(1_000, 10_000), { kind: "match_started", matchId: "m1", via: "status_fallback" });
  await a.bot.lastSettle;
  await a.bot.close();

  const b = stubBot();
  b.bot.events.push(row("declined"));
  assert.deepEqual(await b.bot.waitOutgoingOutcome(1_000), { kind: "declined", via: "status" });
  await b.bot.close();
});

test("waitOutgoingOutcome: entering drops the plate (the crossing check sees no own challenge)", async () => {
  const { bot } = stubBot();
  bot.events.push({ kind: "match_started", challengeId: "c1", matchId: "m9" });
  await bot.waitOutgoingOutcome(1_000);
  assert.equal(bot.outgoingId, null);
  assert.equal(bot.outgoingOpponentId, null);
  await bot.lastSettle;
  await bot.close();
});

// --- toast oracle -------------------------------------------------------------

const el = (over: Partial<AXElement>): AXElement => ({
  AXLabel: null,
  AXUniqueId: null,
  AXValue: null,
  type: "GenericElement",
  frame: { x: 0, y: 0, width: 10, height: 10 },
  ...over,
});

test("toastsIn reads BrandToast testIDs and ignores everything else", () => {
  const els = [
    el({ AXUniqueId: "toast-error", AXLabel: "Couldn't accept that challenge. Try again." }),
    el({ AXUniqueId: "toast-info", AXLabel: "Demo Red declined." }),
    el({ AXUniqueId: "toast-errorish" }),
    el({ AXLabel: "toast-error" }),
  ];
  assert.deepEqual(toastsIn(els), [
    { type: "error", label: "Couldn't accept that challenge. Try again." },
    { type: "info", label: "Demo Red declined." },
  ]);
});

test("mergeToasts keeps one entry per distinct toast across samples", () => {
  const a = { type: "error" as const, label: "x" };
  const b = { type: "info" as const, label: "y" };
  assert.deepEqual(mergeToasts(mergeToasts([], [a]), [a, b]), [a, b]);
});
