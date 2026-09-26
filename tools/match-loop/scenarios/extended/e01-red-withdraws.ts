import type { Scenario } from "../context";
import { db } from "../../oracle/db";
import { prepare, redChallengesBlue } from "../flows";

const scenario: Scenario = {
  id: "E1",
  tier: "extended",
  title: "Red withdraws while Blue's prompt is up: the prompt closes by itself",
  async run(ctx) {
    await prepare(ctx);
    const red = await ctx.bot("red");
    await red.goLive();
    const id = await redChallengesBlue(ctx, red);
    await ctx.step("Red withdraws", () => red.cancelOutgoing());
    await ctx.expect("ui:prompt-dismissed", true, async () => {
      await ctx.ui.waitPromptGone(10_000);
      return true;
    });
    ctx.eq("db:challenge-cancelled", "cancelled", (await db.challenge(id))?.status);
    ctx.eq("ui:no-wizard", null, await ctx.ui.currentStep());
  },
};
export default scenario;
