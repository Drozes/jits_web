import type { Scenario } from "../context";
import { pace } from "../../lib/util";
import { blueChallengesRed, blueOnWeight, prepare, T } from "../flows";

const scenario: Scenario = {
  id: "E3B",
  tier: "extended",
  title: "Blue cancels while Red is still on the weight step: Red must still learn the match is cancelled",
  async run(ctx) {
    await prepare(ctx);
    const red = await ctx.bot("red");
    await red.goLive();
    const h = await blueChallengesRed(ctx, red);
    const side = await ctx.matchSide(red, h.matchId);
    side.enter("weight"); // Red is reading the scale (the weight step mounts a channel since jits-bh2v)
    await blueOnWeight(ctx);
    await ctx.step("Blue confirms weights", async () => {
      await ctx.ui.confirmWeights();
      await ctx.ui.waitStep("ready", T.step);
    });
    await ctx.step("Blue cancels the match", () => ctx.ui.cancelMatch());
    await ctx.step("spy sees match_cancelled", () => side.spy.waitFor("match_cancelled", (e) => e.event === "match_cancelled", 10_000, 0));
    await pace(1_500);
    ctx.eq("bot:red-weight-step-received-cancel", true, side.cancelledOnWeight());
    // Red leaves from the weight step; were the broadcast lost, the ready
    // step's DB reconciler (status cancelled) would still exit.
    await ctx.expect("bot:red-learns-cancel", { kind: "cancelled" }, async () => {
      const outcome = await side.readyAndStart(20_000);
      ctx.trace.note("harness", "red_cancel_via", outcome.kind === "cancelled" ? outcome.via : null);
      return { kind: outcome.kind };
    });
  },
};
export default scenario;
