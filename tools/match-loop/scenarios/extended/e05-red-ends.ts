import type { Scenario } from "../context";
import { blueRecordsSubmission, bothConfirm, checkSummary, exitToArena, openToLive, prepare, stakesFor, T } from "../flows";

const scenario: Scenario = {
  id: "E5",
  tier: "extended",
  title: "Red ends the match: Blue follows to the result step and records",
  async run(ctx) {
    await prepare(ctx);
    const red = await ctx.bot("red");
    await red.goLive();
    const stakes = await stakesFor(red);
    const { side } = await openToLive(ctx, red);
    await ctx.step("Red ends the match", () => side.endMatch());
    await ctx.step("Blue reaches the result step", () => ctx.ui.waitStep("result", T.step));
    await blueRecordsSubmission(ctx, side, ctx.ids.blue, "triangle_choke", "45");
    await bothConfirm(ctx, side);
    await checkSummary(ctx, "YOU WON", stakes.challenger_win);
    await exitToArena(ctx);
  },
};
export default scenario;
