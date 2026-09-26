import type { Scenario } from "../context";
import { db } from "../../oracle/db";
import { waitLivePill } from "../../oracle/ui";
import { prepare, redChallengesBlue, T } from "../flows";

const scenario: Scenario = {
  id: "C4",
  tier: "core",
  title: "Red challenges, Blue declines: Red is told, no match is created, Blue stays live",
  async run(ctx) {
    await prepare(ctx);
    const red = await ctx.bot("red");
    await red.goLive();
    const challengeId = await redChallengesBlue(ctx, red);
    await ctx.step("Blue declines", () => ctx.ui.declinePrompt());
    const outcome = await ctx.step("Red is told", () => red.waitOutgoingOutcome(T.prompt));
    ctx.eq("bot:declined-via-broadcast", { kind: "declined", via: "broadcast" }, outcome);
    await ctx.step("prompt dismissed", () => ctx.ui.waitPromptGone(8_000));
    const ch = await db.challenge(challengeId);
    ctx.eq("db:challenge-declined", "declined", ch?.status);
    ctx.eq("db:no-match", 0, (await db.matchesForChallenge(challengeId)).length);
    ctx.eq("ui:still-live", true, await waitLivePill(ctx.ui, true, 5_000));
    ctx.eq("db:still-looking", true, (await db.athlete(ctx.ids.blue))?.looking_for_ranked);
    ctx.eq("ui:no-wizard", null, await ctx.ui.currentStep());
  },
};
export default scenario;
