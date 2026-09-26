import type { Scenario } from "../context";
import { db } from "../../oracle/db";
import {
  blueChallengesRed,
  blueOnWeight,
  checkLiveAfterExit,
  checkOfflineInMatch,
  checkSummary,
  exitToArena,
  prepare,
  readyToLive,
  stakesFor,
  T,
} from "../flows";

const scenario: Scenario = {
  id: "C6",
  tier: "core",
  title: "Red records a Red win, Blue disputes: disputed, ELO still applied, and Red's side must be told",
  async run(ctx) {
    await prepare(ctx);
    const red = await ctx.bot("red");
    await red.goLive();
    const stakes = await stakesFor(red); // Blue is the challenger
    const h = await blueChallengesRed(ctx, red);
    const side = await ctx.matchSide(red, h.matchId);
    await blueOnWeight(ctx);
    await checkOfflineInMatch(ctx, red);
    await readyToLive(ctx, side);
    await ctx.step("Red ends the match", () => side.endMatch());
    await ctx.step("Blue reaches the result step", () => ctx.ui.waitStep("result", T.step));
    await ctx.step("Red records a Red win", () =>
      side.record({ result: "submission", winnerId: ctx.ids.red, submissionCode: "kimura", finishTimeSeconds: 90 }),
    );
    await ctx.step("Blue is moved to the confirm step", () => ctx.ui.waitStep("confirm", T.step));
    await ctx.step("Blue disputes", () => ctx.ui.dispute("match loop dispute"));
    await ctx.step("Blue reaches the summary", () => ctx.ui.waitStep("summary", T.step));
    await checkSummary(ctx, "DISPUTED", null);
    const m = await db.waitMatchStatus(h.matchId, ["disputed"], T.db).catch(() => db.match(h.matchId));
    ctx.eq("db:match-disputed", "disputed", m?.status);
    const disputes = await db.disputes(h.matchId);
    ctx.eq("db:dispute-row", [{ raised_by: ctx.ids.blue }], disputes.map((d) => ({ raised_by: d.raised_by })));
    const b = await db.athlete(ctx.ids.blue);
    const r = await db.athlete(ctx.ids.red);
    ctx.eq("db:elo-still-applied", [1000 + stakes.opponent_win, 1000 + stakes.challenger_loss], [r?.current_elo, b?.current_elo]);
    // Blue's app sends match_disputed (awaited) before leaving confirm
    // (jits-wfpo); Red's confirm step must receive it and leave on it.
    await ctx.expect("protocol:blue-sent-match_disputed", { athlete_id: ctx.ids.blue }, async () => {
      const e = await side.spy.waitFor("Blue's match_disputed", (s) => s.event === "match_disputed", T.broadcast, 0);
      return { athlete_id: e.payload.athlete_id };
    });
    await ctx.expect("bot:red-told-of-dispute", { event: "match_disputed", athlete_id: ctx.ids.blue }, () =>
      side.waitDisputeSignal(T.broadcast),
    );
    await ctx.expect("bot:red-leaves-confirm-on-dispute", "disputed", async () => (await side.waitConfirmDone(T.broadcast)).kind);
    await exitToArena(ctx);
    await checkLiveAfterExit(ctx, red);
  },
};
export default scenario;
