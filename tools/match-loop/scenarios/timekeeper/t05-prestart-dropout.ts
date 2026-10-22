import type { Scenario } from "../context";
import { checkSummary, exitToArena } from "../flows";
import { droppedOut, recipientsOf, tkDb } from "../../oracle/tk-db";
import { TK_UI } from "../../sim/timekeeper-screens";
import { pace, pollUntil } from "../../lib/util";
import {
  blueAsks,
  blueReadyOnServer,
  checkTkDone,
  finishWithin,
  seat,
  tkBlueChallengesRed,
  tkBothConfirm,
  tkEnd,
  tkFaceoffToLive,
  tkRecord,
  tkScenario,
  TK,
} from "./tk-flows";

/**
 * T5 (TEST-PLAN 4.2), Blue the challenger: a pre-start drop-out back to the
 * picker (A5). Green is seated, both athletes ready and Green confirms both
 * weigh-ins, then Green leaves at ready: the match stays `pending` with
 * nobody seated and a fresh 10-minute deadline, both readies and the
 * timekeeper's two verdicts are gone, the
 * athletes' own weigh-in checks are kept, the seat history records
 * `left_prestart` (a drop-out), TK-N5 goes to both athletes and Blue is
 * back on `crew` with TK-D1. Then the fourth account (Gold) is asked,
 * accepts and runs the match to a recorded Blue win.
 */
const scenario: Scenario = {
  id: "T5",
  tier: "timekeeper",
  title: "Green leaves at ready: back to the picker (TK-D1), weigh-ins kept; Gold completes the match",
  needs: ["M2", "M3", "M4", "M5", "M8"],
  async run(ctx) {
    await tkScenario(ctx, { gold: true }, async (cast) => {
      const gold = cast.gold!;
      const m = await tkBlueChallengesRed(ctx, cast);
      const req = await blueAsks(ctx, cast, cast.green, m);
      const greenSide = await seat(ctx, cast.green, req, m);
      // Both athletes ready, then the timekeeper backs out before the start.
      const rr = m.red.markReady();
      // Awaited after Blue's taps: handled now so a rejection in between is not an unhandled one.
      rr.catch(() => undefined);
      const weigh = await ctx.step("Blue weighs in and taps TK-F4", () => cast.ui.weighInAndReady(TK.step, { serverReady: blueReadyOnServer(ctx, m) }));
      ctx.eq("ui:tk-ready-one-press", 1, weigh.readyPresses);
      ctx.eq("bot:red-ready-ok", true, (await rr).ok);
      await ctx.step("Blue waits for the timekeeper (ready)", () => ctx.ui.waitStep("ready", TK.step));
      // Verdicts in first, so the drop-out has something of the timekeeper's to void.
      await ctx.step("Green confirms both weigh-ins", () => greenSide.confirmWeights(true));
      ctx.eq(
        "db:timekeeper-checks-before-leave",
        [...m.athletes].sort().map((subject_id) => ({ subject_id, status: "confirmed" })),
        await tkDb.timekeeperChecks(m.matchId),
      );
      await pace(ctx.opts.timing === "human" ? 2_000 : 200);
      const left = await ctx.step("Green leaves before the start", () => greenSide.leave());
      ctx.eq("bot:timekeeper-leave-prestart", { ok: true, status: "pending" }, left.ok ? { ok: true, status: left.data.status } : { ok: false, status: left.error.code });
      const row = await tkDb.waitMatch(m.matchId, "nobody seated", (x) => x.timekeeper_id === null, TK.db).catch(() => tkDb.match(m.matchId));
      const deadline = Date.parse(row?.timekeeper_deadline_at ?? "");
      ctx.eq(
        "db:back-to-picking",
        { status: "pending", timekeeper_id: null, fresh_deadline: true },
        { status: row?.status, timekeeper_id: row?.timekeeper_id ?? null, fresh_deadline: Number.isFinite(deadline) && deadline - Date.now() > 9 * 60_000 },
        "a fresh 10-minute pick deadline from the drop-out",
      );
      ctx.eq("db:readies-cleared", [], await tkDb.ready(m.matchId));
      ctx.eq("db:timekeeper-checks-voided", [], await tkDb.timekeeperChecks(m.matchId));
      const checks = await tkDb.athleteChecks(m.matchId);
      ctx.eq("db:athlete-checks-kept", ["confirmed", "confirmed"], checks.map((c) => c.status));
      const hist = await tkDb.history(m.matchId);
      ctx.eq("db:green-left-prestart", { left_reason: "left_prestart", droppedOut: true }, { left_reason: hist.find((h) => h.timekeeper_id === cast.green.me.id)?.left_reason ?? null, droppedOut: droppedOut(hist, cast.green.me.id) });
      const n = await pollUntil("TK-N5 to both athletes", async () => {
        const rows = await tkDb.notifications(m.matchId);
        return recipientsOf(rows, "timekeeper_left").length >= 2 ? rows : undefined;
      }, { timeoutMs: 5_000 }).catch(() => tkDb.notifications(m.matchId));
      ctx.eq("db:athletes-told-timekeeper-left", [...m.athletes].sort(), recipientsOf(n, "timekeeper_left"), "TK-N5");
      await ctx.step("Blue is back on crew", () => ctx.ui.waitStep("crew", TK.step));
      await ctx.expect("ui:timekeeper-left-tk-d1", true, async () => {
        await cast.ui.waitLabel(TK_UI.timekeeperLeft(cast.green.me.displayName), TK.step);
        return true;
      });
      // The fourth account takes over.
      const req2 = await blueAsks(ctx, cast, gold, m);
      const goldSide = await seat(ctx, gold, req2, m);
      await tkFaceoffToLive(ctx, cast, m, gold, goldSide);
      const { finalElapsedS } = await tkEnd(ctx, m, goldSide);
      const finish = finishWithin(finalElapsedS, 30);
      await tkRecord(ctx, cast, m, gold, goldSide, { result: "submission", winnerId: ctx.ids.blue, submissionCode: "armbar", finishTimeSeconds: finish });
      await tkBothConfirm(ctx, m);
      await checkSummary(ctx, "YOU WON", { matchId: m.matchId, stake: null });
      await checkTkDone(ctx, m, gold, goldSide, { winner: ctx.ids.blue, loser: ctx.ids.red, code: "armbar", finish });
      await exitToArena(ctx);
    });
  },
};
export default scenario;
