import type { Scenario } from "../context";
import { db } from "../../oracle/db";
import { pace } from "../../lib/util";
import { blueEnds, bothConfirm, exitToArena, openToLive, prepare, T } from "../flows";

const scenario: Scenario = {
  id: "E10",
  tier: "extended",
  title: "Both record at the same moment: one result wins and neither side is stranded (H4)",
  async run(ctx) {
    ctx.opts.timing = "fast";
    await prepare(ctx);
    const red = await ctx.bot("red");
    await red.goLive();
    const { h, side } = await openToLive(ctx, red);
    await blueEnds(ctx, side);
    const rec = await ctx.step("Blue fills a Blue win (not yet recorded)", () => ctx.ui.fillSubmission(ctx.ids.blue, "armbar", "90"));
    // Fire both together: Blue's tap is a single idb call on the known frame
    // (~300-500ms), the bot records after a matching delay.
    const [, botRes] = await Promise.all([
      ctx.step("Blue taps Record", () => ctx.idb.tap(rec)),
      pace(350).then(() => side.record({ result: "submission", winnerId: ctx.ids.red, submissionCode: "kimura", finishTimeSeconds: 90 })),
    ]);
    ctx.trace.note("harness", "bot_record", botRes);
    ctx.eq("db:one-submission-row", 1, (await db.submission(h.matchId)) ? 1 : 0);
    await ctx.expect("ui:blue-reaches-confirm", true, async () => {
      await ctx.ui.waitStep("confirm", T.step);
      return true;
    });
    if (!botRes.ok) {
      await ctx.expect("bot:loser-of-race-moved-to-confirm", true, async () => {
        await side.waitForResult(T.broadcast);
        return true;
      });
    }
    await bothConfirm(ctx, side);
    await exitToArena(ctx);
  },
};
export default scenario;
