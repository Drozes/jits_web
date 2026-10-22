import type { Scenario } from "../context";
import { cancelSessionMatch } from "@jits/shared/api/mutations";
import { readRestoreRecord, runTimekeeperTick, TK_WINDOW_KEYS, withFlags } from "../../fixtures/timekeeper";
import { lit, queryJson } from "../../lib/psql";
import { recipientsOf, tkDb } from "../../oracle/tk-db";
import { pollUntil } from "../../lib/util";
import { T } from "../flows";
import { bothRouted, checkRequestOpen, checkTkCreatedDb, tkCreationFlags, tkScenario, TK, waitPast } from "./tk-flows";

/**
 * The shortened request lapse (`tk_request_lapse`, seconds). Above the
 * beats between the ask and the lapse (the request reaching Gold through
 * realtime or its 2 s poll, then the open-request check), so the lapse never
 * races them; short enough that T0B stays under a minute.
 */
export const T0B_LAPSE_S = 20;

/**
 * T0B (an M7 addition to TEST-PLAN 4.2, beside T0): the sweep path with
 * bots only, so every timekeeper-tier run exercises the test-only windows
 * and the harness's own sweep on the stack on any build (it needs no mobile
 * slice: Blue stays idle and offline on the Arena, PM18). Without it the
 * window lifecycle (recorded before the write, removed in the finally) and
 * `runTimekeeperTick` would first meet the stack in the window scenarios
 * (T3, T4, T7, T8, T15, T16, T18), which all wait on slice M8.
 *
 * Red and Green are the athletes of a timekeeper-mode match (the flag on
 * for its creation only); Red asks Gold, who never answers, under a
 * `tk_request_lapse` of `T0B_LAPSE_S` seconds for the scenario. The request
 * is created with that lapse; once it has passed, the harness runs the
 * sweep until the request reads `expired` (through the sweep's step 1,
 * `_tk_lapse_request`, the same as T3); both athletes get TK-N3 exactly once
 * about Gold, still exactly once after one more sweep; the match is still
 * picking and both athletes are still routed to `crew`. Red then leaves
 * (`athlete_left`), so no pending match outlives the scenario. After the
 * scenario's fixtures are undone, no `tk_*` window is left on the stack and
 * the restore record holds none.
 */
const scenario: Scenario = {
  id: "T0B",
  tier: "timekeeper",
  title: "Bots-only sweep: a shortened request lapse, the harness's sweep, the request expired with TK-N3 once, the windows removed",
  needs: [],
  async run(ctx) {
    await tkScenario(ctx, { gold: true, blueLive: false, windows: { tk_request_lapse: T0B_LAPSE_S } }, async (cast) => {
      const red = cast.red;
      const green = cast.green.bot; // an athlete here; Green's timekeeper listener stays idle
      const tk = cast.gold!;
      const note = (what: string, payload: unknown) => ctx.trace.note("harness", what, payload);

      await ctx.step("Red and Green go live", async () => {
        await red.goLive();
        await green.goLive();
      });
      const challengeId = await ctx.step("Red challenges Green", () => red.challenge(green.me.id));
      const incoming = await ctx.step("Green receives the challenge", () => green.waitForIncoming(T.prompt, red.me.id));
      ctx.eq("bot:incoming-is-the-challenge", challengeId, incoming.id);
      const matchId = await ctx.step("Green accepts (timekeeper_role on for the match's creation only)", () =>
        withFlags(tkCreationFlags(true), () => green.accept(incoming.id), note),
      );
      const m = { challengeId, matchId, athletes: [red.me.id, green.me.id] as [string, string] };
      await checkTkCreatedDb(ctx, m, true);
      const sides = [ctx.tkAthleteSide(red, matchId, green.me.id, "challenger"), ctx.tkAthleteSide(green, matchId, red.me.id, "opponent")];
      await bothRouted(ctx, "bot:athletes-on-crew", "crew", sides);

      const asked = await ctx.step(`Red asks Gold (the request lapses after ${T0B_LAPSE_S} s)`, () => sides[0].requestTimekeeper(tk.me.id));
      if (!ctx.eq("bot:request-ok", true, asked.ok, asked.ok ? undefined : `${asked.error.code} ${asked.error.message}`)) return;
      const req = await ctx.step("Gold receives the request and never answers", () => tk.waitForRequest(TK.request, matchId));
      await checkRequestOpen(ctx, m, req, red.me.id, tk);
      const lapse = (await queryJson<{ lapse_s: number }>(
        `select round(extract(epoch from (expires_at - created_at)))::int as lapse_s from public.match_timekeeper_requests where id = ${lit(req.id)}`,
      ))[0]?.lapse_s;
      ctx.eq("db:request-lapse-shortened", T0B_LAPSE_S, lapse ?? null, "the test-only window (jr_be 024 6.4), not the 2 minute default");

      await ctx.step("the request's lapse passes with no answer", () => waitPast(req.expires_at, 0));
      const expired = await ctx.step("the harness runs the sweep: the request lapses", () =>
        pollUntil("the request to read expired", async () => {
          await runTimekeeperTick();
          const r = (await tkDb.requests(matchId)).find((x) => x.id === req.id);
          return r?.status === "expired" ? r : undefined;
        }, { timeoutMs: TK.sweep, intervalMs: 2_000 }),
      );
      ctx.eq("db:request-expired-unanswered", { status: "expired", responded_at: null }, { status: expired.status, responded_at: expired.responded_at });
      await ctx.step("one more sweep (a lapse is told once)", () => runTimekeeperTick());
      const n = await tkDb.notifications(matchId);
      ctx.eq("db:athletes-told-lapsed-once", [...m.athletes].sort(), recipientsOf(n, "timekeeper_declined", tk.me.id), "TK-N3 once each, about Gold");
      const row = await tkDb.match(matchId);
      ctx.eq("db:still-picking", { status: "pending", timekeeper_id: null }, { status: row?.status, timekeeper_id: row?.timekeeper_id });
      await bothRouted(ctx, "bot:athletes-still-on-crew", "crew", sides);

      // No pending match outlives the scenario: Red leaves as the crew step's Leave does.
      const left = await ctx.step("Red leaves while picking", () =>
        ctx.trace.rpc("red", "cancelSessionMatch", { matchId }, () => cancelSessionMatch(red.client, matchId)),
      );
      ctx.eq("bot:red-leave-ok", true, left.ok, left.ok ? undefined : `${left.error.code} ${left.error.message}`);
      const after = await tkDb.waitMatch(matchId, "cancelled", (x) => x.status === "cancelled", T.db).catch(() => tkDb.match(matchId));
      ctx.eq("db:left-while-picking", { status: "cancelled", cancel_reason: "athlete_left" }, { status: after?.status, cancel_reason: after?.cancel_reason });
    });
    // The scenario's fixtures are undone: the windows it wrote are gone from the stack and from the record.
    const left = await queryJson<{ key: string }>(`select key from public.server_settings where key in (${TK_WINDOW_KEYS.map(lit).join(", ")}) order by key`);
    ctx.eq("db:tk-windows-removed", [], left.map((r) => r.key), "withWindows removes what it wrote");
    ctx.eq("fixture:restore-record-holds-no-window", [], readRestoreRecord()?.windows ?? []);
  },
};
export default scenario;
