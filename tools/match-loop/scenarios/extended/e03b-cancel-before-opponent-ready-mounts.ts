import type { Scenario } from "../context";
import { pace } from "../../lib/util";
import { blueChallengesRed, blueOnWeight, prepare, T } from "../flows";

const scenario: Scenario = {
  id: "E3B",
  tier: "extended",
  title: "Blue cancels while Red is still on the weight step: Red must still learn the match is cancelled",
  expectedFailure: "H6 variant: the weight step mounts no channel, so match_cancelled is lost",
  async run(ctx) {
    await prepare(ctx);
    const red = await ctx.bot("red");
    await red.goLive();
    const h = await blueChallengesRed(ctx, red);
    const side = await ctx.matchSide(red, h.matchId);
    side.enter("weight"); // Red is reading the scale
    await blueOnWeight(ctx);
    await ctx.step("Blue confirms weights", async () => {
      await ctx.ui.confirmWeights();
      await ctx.ui.waitStep("ready", T.step);
    });
    await ctx.step("Blue cancels the match", () => ctx.ui.cancelMatch());
    await ctx.step("spy sees match_cancelled", () => side.spy.waitFor("match_cancelled", (e) => e.event === "match_cancelled", 10_000, 0));
    await pace(1_500);
    side.enter("ready");
    await ctx.expect("bot:red-learns-cancel", { kind: "cancelled" }, () => side.readyAndStart(20_000));
  },
};
export default scenario;
