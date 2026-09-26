import type { Scenario } from "../context";
import {
  blueChallengesRed,
  blueEnds,
  blueOnWeight,
  blueRecordsDraw,
  bothConfirm,
  checkBlueInLobbyBeforeMatch,
  checkDrawDb,
  checkLiveAfterExit,
  checkOfflineInMatch,
  checkSummary,
  exitToArena,
  prepare,
  readyToLive,
  stakesFor,
} from "../flows";

const scenario: Scenario = {
  id: "C3",
  tier: "core",
  title: "Draw recorded by Blue: both athletes lose ELO (Pressure Score)",
  async run(ctx) {
    await prepare(ctx);
    const red = await ctx.bot("red");
    await red.goLive();
    await checkBlueInLobbyBeforeMatch(ctx, red);
    const stakes = await stakesFor(red);
    ctx.eq("stakes:draw-symmetric", stakes.challenger_draw, stakes.opponent_draw);
    const h = await blueChallengesRed(ctx, red);
    const side = await ctx.matchSide(red, h.matchId);
    await blueOnWeight(ctx);
    await checkOfflineInMatch(ctx, red);
    await readyToLive(ctx, side);
    await blueEnds(ctx, side);
    await blueRecordsDraw(ctx, side);
    ctx.eq("ui:confirm-verdict", "DRAW", (await ctx.ui.readConfirmVerdict())?.toUpperCase() ?? null);
    await bothConfirm(ctx, side);
    await checkSummary(ctx, "DRAW", stakes.challenger_draw);
    await checkDrawDb(ctx, h, stakes.challenger_draw);
    await exitToArena(ctx);
    await checkLiveAfterExit(ctx, red);
  },
};
export default scenario;
