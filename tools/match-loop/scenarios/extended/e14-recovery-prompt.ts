import type { Scenario } from "../context";
import { lit, psql } from "../../lib/psql";
import { db } from "../../oracle/db";
import { waitLivePill } from "../../oracle/ui";
import { prepare, settledChallenge, T } from "../flows";

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
    ctx.trace.note("harness", "challenge", id);
    ctx.eq("ui:no-prompt-while-offline", false, await ctx.ui.isPromptVisible());
    // Going live runs the pending-challenge recovery
    // (lib/arena/use-pending-challenge-recovery.ts), and the recovered prompt
    // is a centered modal (jits-02vo.3) that hides the Arena (chip and
    // control bar included) from idb. So the tap does not wait for
    // `Go offline`: the prompt is what going live must produce.
    await ctx.step("Blue taps Go live", () => ctx.ui.tapGoLive());
    await ctx.expect("ui:recovered-prompt", true, async () => {
      await ctx.ui.waitPrompt(20_000);
      return true;
    });
    await ctx.expect("db:blue-live", true, () => db.waitLooking(ctx.ids.blue, true, T.db));
    await ctx.step("Blue declines", () => ctx.ui.declinePrompt());
    await ctx.step("the prompt closes", () => ctx.ui.waitPromptGone(8_000));
    const c = await settledChallenge(id).catch(() => db.challenge(id));
    ctx.eq("db:recovered-challenge-declined", "declined", c?.status);
    // Answering the prompt is not leaving the mat: Blue is still live.
    ctx.eq("ui:live-after-decline", true, await waitLivePill(ctx.ui, true, 10_000));
  },
};
export default scenario;
