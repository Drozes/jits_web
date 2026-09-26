import type { Scenario } from "../context";
import { lit, psql } from "../../lib/psql";
import { prepare } from "../flows";

const scenario: Scenario = {
  id: "E14",
  tier: "extended",
  title: "Recovery: a challenge that landed while Blue was offline is offered when Blue goes live",
  async run(ctx) {
    await prepare(ctx, { blueLive: false });
    const red = await ctx.bot("red");
    await red.goLive();
    // RLS refuses a challenge to an offline athlete, so the missed INSERT is
    // simulated as postgres: the row exists, no realtime prompt was raised.
    const id = await ctx.step("a challenge from Red lands while Blue is offline", async () =>
      psql(
        `insert into public.challenges (challenger_id, opponent_id, match_type, challenger_weight)
         values (${lit(ctx.ids.red)}, ${lit(ctx.ids.blue)}, 'ranked', 170) returning id`,
      ).then((o) => o.split("\n")[0].trim()),
    );
    ctx.eq("ui:no-prompt-while-offline", false, await ctx.ui.isPromptVisible());
    await ctx.step("Blue goes live", () => ctx.ui.ensureLive());
    await ctx.expect("ui:recovered-prompt", true, async () => {
      await ctx.ui.waitPrompt(20_000);
      return true;
    });
    await ctx.step("Blue declines", () => ctx.ui.declinePrompt());
    ctx.trace.note("harness", "challenge", id);
  },
};
export default scenario;
