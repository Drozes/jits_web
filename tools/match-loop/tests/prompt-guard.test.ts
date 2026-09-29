/**
 * The harness answers the incoming prompt by label, after the app's input
 * guard (AC-S3). The app drops (does not queue) a tap inside the guard, so the
 * harness must wait for the button to report itself enabled, and fail naming
 * the guard when it never does, rather than stalling on a lost tap.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { PROMPT_INPUT_GUARD_MS } from "../../../apps/mobile/lib/arena/constants";
import { PROMPT_TAP_DELAY_MS, Screens } from "../sim/screens";
import type { Idb, Query } from "../sim/idb";
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
  assert.deepEqual(calls[0].q, { label: "Accept challenge", type: "Button", enabled: true });
});

test("declinePrompt taps only an ENABLED Decline button", async () => {
  const { idb, calls } = fakeIdb(["ok"]);
  await new Screens(idb, simctl, NO_DELAY).declinePrompt();
  assert.deepEqual(calls[0].q, { label: "Decline challenge", type: "Button", enabled: true });
});

test("a button that never enables fails naming the input guard", async () => {
  const { idb, calls } = fakeIdb(["timeout"]);
  await assert.rejects(new Screens(idb, simctl, NO_DELAY).acceptPrompt(), (e: unknown) => {
    assert.ok(e instanceof ExpectationTimeout);
    assert.match(e.message, new RegExp(`input guard ${PROMPT_INPUT_GUARD_MS}ms`));
    assert.match(e.message, /Accept challenge/);
    return true;
  });
  assert.deepEqual(calls[0].q, { label: "Accept challenge", type: "Button", enabled: true });
});

test("a non-timeout failure is passed through unchanged", async () => {
  const boom = new Error("idb crashed");
  const { idb } = fakeIdb([boom]);
  await assert.rejects(new Screens(idb, simctl, NO_DELAY).declinePrompt(), (e: unknown) => e === boom);
});
