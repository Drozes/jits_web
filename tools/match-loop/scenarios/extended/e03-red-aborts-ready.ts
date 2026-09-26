import type { Scenario } from "../context";
import { blueChallengesRed, blueOnWeight, checkAbortDb, checkLiveAfterExit, prepare, T } from "../flows";

const scenario: Scenario = {
  id: "E3",
  tier: "extended",
  title: "Red aborts the ready check while Blue is on the ready step: Blue is sent back to the Arena",
  async run(ctx) {
    await prepare(ctx);
    const red = await ctx.bot("red");
    await red.goLive();
    const h = await blueChallengesRed(ctx, red);
    const side = await ctx.matchSide(red, h.matchId);
    await blueOnWeight(ctx);
    await ctx.step("Blue confirms weights", async () => {
      await ctx.ui.confirmWeights();
      await ctx.ui.waitStep("ready", T.step);
    });
    await ctx.step("Red reaches the ready step", () => side.confirmWeights());
    await ctx.step("Red cancels", () => side.cancelReady());
    await ctx.step("Blue is returned to the Arena", () =>
      ctx.idb.waitAny([{ label: "Go live", type: "Button" }, { label: "Go offline", type: "Button" }], T.step),
    );
    await checkAbortDb(ctx, h);
    await checkLiveAfterExit(ctx, red);
  },
};
export default scenario;
