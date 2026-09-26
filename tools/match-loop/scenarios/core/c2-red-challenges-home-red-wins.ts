import type { Scenario } from "../context";
import {
  blueAccepts,
  blueOnWeight,
  bothConfirm,
  checkBlueInLobbyBeforeMatch,
  checkDecisiveDb,
  checkLiveAfterExit,
  checkOfflineInMatch,
  checkSummary,
  exitToArena,
  prepare,
  readyToLive,
  redChallengesBlue,
  stakesFor,
  T,
} from "../flows";

const scenario: Scenario = {
  id: "C2",
  tier: "core",
  title: "Red challenges Blue while Blue is on Home (app-wide prompt), Blue accepts, Red records a Red win, both confirm",
  async run(ctx) {
    await prepare(ctx, { tab: "Home" });
    const red = await ctx.bot("red");
    await red.goLive();
    await checkBlueInLobbyBeforeMatch(ctx, red);
    const stakes = await stakesFor(red); // Red is the challenger
    const challengeId = await redChallengesBlue(ctx, red);
    const h = await blueAccepts(ctx, red, challengeId);
    const side = await ctx.matchSide(red, h.matchId);
    await blueOnWeight(ctx);
    await checkOfflineInMatch(ctx, red);
    await readyToLive(ctx, side);
    await ctx.step("Red ends the match", () => side.endMatch());
    await ctx.step("Blue reaches the result step", () => ctx.ui.waitStep("result", T.step));
    const rec = await ctx.step("Red records a Red win", () =>
      side.record({ result: "submission", winnerId: ctx.ids.red, submissionCode: "rear_naked_choke", finishTimeSeconds: 90 }),
    );
    ctx.eq("bot:record-ok", { ok: true }, rec);
    await ctx.step("Blue is moved to the confirm step", () => ctx.ui.waitStep("confirm", T.step));
    ctx.eq("ui:confirm-verdict", "YOU LOST", (await ctx.ui.readConfirmVerdict())?.toUpperCase() ?? null);
    await bothConfirm(ctx, side);
    await checkSummary(ctx, "YOU LOST", stakes.opponent_loss);
    await checkDecisiveDb(ctx, {
      handshake: h,
      winner: ctx.ids.red,
      loser: ctx.ids.blue,
      winnerDelta: stakes.challenger_win,
      loserDelta: stakes.opponent_loss,
      code: "rear_naked_choke",
      finish: 90,
      confirmations: 2,
    });
    await exitToArena(ctx);
    await checkLiveAfterExit(ctx, red);
  },
};
export default scenario;
