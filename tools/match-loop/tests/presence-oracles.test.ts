/**
 * Presence/realtime oracle tests (jits-fa9x). Pure: no docker, no database,
 * no simulator.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { maskTokens, readRealtimeLog, scanRealtimeLog } from "../oracle/realtime";
import { checkBlueInLobbyBeforeMatch, checkOfflineInMatch } from "../scenarios/flows";
import { ExpectationTimeout, HarnessError } from "../lib/util";
import type { ScenarioCtx } from "../scenarios/context";
import type { MobileOpponent } from "../bot/opponent";

const LOG = [
  "12:00:01.000 [info] Joined channel realtime:lobby:online",
  "12:00:02.000 project=realtime-dev external_id=realtime-dev error_code=ClientPresenceRateLimitReached [error] Presence rate limit reached",
  "12:00:03.000 [warning] RateLimitReached for tenant",
  "12:00:04.000 [error] token eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJ4eXoifQ.c2lnbmF0dXJlX3h5eg rejected, key sb_publishable_abc123",
  "12:00:05.000 [info] heartbeat",
].join("\n");

test("scanRealtimeLog keeps only RateLimit/error lines and flags presence rate limits", () => {
  const s = scanRealtimeLog(LOG);
  assert.equal(s.lines.length, 3);
  assert.equal(s.presenceRateLimited.length, 1);
  assert.match(s.presenceRateLimited[0], /ClientPresenceRateLimitReached/);
  assert.ok(!s.lines.some((l) => /heartbeat|Joined channel/.test(l)));
});

test("scanRealtimeLog masks tokens and keys", () => {
  const joined = scanRealtimeLog(LOG).lines.join("\n");
  assert.ok(!joined.includes("eyJhbGciOiJIUzI1NiJ9"));
  assert.ok(!joined.includes("sb_publishable_abc123"));
  assert.match(joined, /<jwt>/);
  assert.match(joined, /<sb-key>/);
  assert.equal(maskTokens("plain line"), "plain line");
});

test("scanRealtimeLog on an empty log finds nothing", () => {
  assert.deepEqual(scanRealtimeLog(""), { lines: [], presenceRateLimited: [] });
});

test("readRealtimeLog refuses a non-local container before running docker", async () => {
  await assert.rejects(readRealtimeLog("prod_realtime", new Date().toISOString()), HarnessError);
  await assert.rejects(readRealtimeLog("supabase_realtime_x; rm -rf /", new Date().toISOString()), HarnessError);
});

interface Recorded {
  id: string;
  ok: boolean;
  expected: unknown;
  actual: unknown;
}

function fakeCtx(): { ctx: ScenarioCtx; oracles: Recorded[] } {
  const oracles: Recorded[] = [];
  const oracle = (id: string, ok: boolean, expected: unknown, actual: unknown) => {
    oracles.push({ id, ok, expected, actual });
    return ok;
  };
  const ctx = {
    ids: { blue: "blue-id", red: "red-id", green: "green-id" },
    oracles,
    oracle,
    async expect(id: string, expected: unknown, probe: () => Promise<unknown>) {
      try {
        const actual = await probe();
        return oracle(id, JSON.stringify(actual) === JSON.stringify(expected), expected, actual);
      } catch (e) {
        if (e instanceof ExpectationTimeout) return oracle(id, false, expected, { timeout: e.what });
        throw e;
      }
    },
  } as unknown as ScenarioCtx;
  return { ctx, oracles };
}

function fakeRed(inLobby: boolean): MobileOpponent {
  return {
    async waitLobby(id: string, present: boolean, timeoutMs: number) {
      if (inLobby !== present) throw new ExpectationTimeout(`${id} ${present ? "in" : "absent from"} lobby:online`, timeoutMs, []);
    },
  } as unknown as MobileOpponent;
}

test("checkBlueInLobbyBeforeMatch passes when the spy sees Blue in lobby:online", async () => {
  const { ctx, oracles } = fakeCtx();
  await checkBlueInLobbyBeforeMatch(ctx, fakeRed(true));
  assert.deepEqual(oracles.map((o) => [o.id, o.ok, o.expected]), [["presence:blue-in-lobby-before-match", true, true]]);
});

test("checkBlueInLobbyBeforeMatch fails (not vacuous) when Blue never joined the lobby", async () => {
  const { ctx, oracles } = fakeCtx();
  await checkBlueInLobbyBeforeMatch(ctx, fakeRed(false));
  assert.equal(oracles.length, 1);
  assert.equal(oracles[0].id, "presence:blue-in-lobby-before-match");
  assert.equal(oracles[0].ok, false);
  assert.equal(oracles[0].expected, true);
});

test("checkOfflineInMatch refuses to run without the pre-match lobby oracle", async () => {
  const { ctx, oracles } = fakeCtx();
  await assert.rejects(checkOfflineInMatch(ctx, fakeRed(false)), HarnessError);
  assert.equal(oracles.length, 0);
});
