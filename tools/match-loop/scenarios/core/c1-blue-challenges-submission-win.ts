import type { Scenario } from "../context";
import {
  blueChallengesRed,
  blueEnds,
  blueOnWeight,
  blueRecordsSubmission,
  bothConfirm,
  checkBlueInLobbyBeforeMatch,
  checkDecisiveDb,
  checkLiveAfterExit,
  checkOfflineInMatch,
  checkSummary,
  exitToArena,
  prepare,
  readyToLive,
  stakesFor,
} from "../flows";

const scenario: Scenario = {
  id: "C1",
  tier: "core",
  title: "Blue challenges Red, Red accepts, Blue records a submission win, both confirm",
  async run(ctx) {
    await prepare(ctx);
    const red = await ctx.bot("red");
    await red.goLive();
    await checkBlueInLobbyBeforeMatch(ctx, red);
    const stakes = await stakesFor(red);
    const h = await blueChallengesRed(ctx, red);
    const side = await ctx.matchSide(red, h.matchId);
    await blueOnWeight(ctx);
    await checkOfflineInMatch(ctx, red);
    await readyToLive(ctx, side);
    await blueEnds(ctx, side);
    await blueRecordsSubmission(ctx, side, ctx.ids.blue, "armbar", "90");
    await bothConfirm(ctx, side);
    await checkSummary(ctx, "YOU WON", stakes.challenger_win);
    await checkDecisiveDb(ctx, {
      handshake: h,
      winner: ctx.ids.blue,
      loser: ctx.ids.red,
      winnerDelta: stakes.challenger_win,
      loserDelta: stakes.opponent_loss,
      code: "armbar",
      finish: 90,
      confirmations: 2,
    });
    await exitToArena(ctx);
    await checkLiveAfterExit(ctx, red);
  },
};
export default scenario;
