import type { Scenario } from "../context";
import { db } from "../../oracle/db";
import { ChallengeRefused } from "../../bot/opponent";
import { blueEnds, finishWithDraw, openToLive, prepare } from "../flows";

const scenario: Scenario = {
  id: "E16",
  tier: "extended",
  title: "Green challenges Blue mid-match: refused (Blue is offline) and Blue is never prompted",
  async run(ctx) {
    await prepare(ctx);
    const red = await ctx.bot("red");
    await red.goLive();
    const { side } = await openToLive(ctx, red);
    const green = await ctx.bot("green");
    await green.goLive();
    const blueLooking = (await db.athlete(ctx.ids.blue))?.looking_for_ranked;
    const res = await ctx.step("Green tries to challenge Blue", () =>
      green.challenge(ctx.ids.blue).then(
        (id) => ({ refused: false, id }),
        (e: unknown) => {
          if (e instanceof ChallengeRefused) return { refused: true, code: e.code, pgCode: e.pgCode };
          throw e;
        },
      ),
    );
    // The refusal must be the RLS WITH CHECK (42501; opponent_accepts_match_type
    // fails because Blue is offline in the match), which mapPostgrestError
    // reports as MAX_PENDING_CHALLENGES on this insert.
    ctx.eq(
      "db:mid-match-challenge-refused-by-rls",
      { blueLooking: false, refused: true, code: "MAX_PENDING_CHALLENGES", pgCode: "42501" },
      { blueLooking, ...res, id: undefined },
    );
    ctx.eq("ui:no-prompt-in-match", false, await ctx.ui.isPromptVisible());
    await blueEnds(ctx, side);
    await finishWithDraw(ctx, side);
    ctx.eq("ui:no-prompt-after-match", false, await ctx.ui.isPromptVisible());
  },
};
export default scenario;
