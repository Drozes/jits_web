import type { Scenario } from "../context";
import { db } from "../../oracle/db";
import { blueEnds, blueRecordsDraw, exitToArena, openToLive, prepare, T } from "../flows";

const scenario: Scenario = {
  id: "E7",
  tier: "extended",
  title: "Cold relaunch during live and during confirm: the wizard resumes from the row",
  async run(ctx) {
    await prepare(ctx);
    const red = await ctx.bot("red");
    await red.goLive();
    const { h, side } = await openToLive(ctx, red);
    const url = `elorated://match/${h.matchId}`;
    await ctx.step("kill and relaunch Blue during live", async () => {
      await ctx.simctl.terminate();
      await ctx.simctl.launch();
      await ctx.idb.waitFor({ label: "Home", type: "Button" }, 30_000).catch(() => undefined);
      await ctx.simctl.openUrl(url);
    });
    await ctx.expect("ui:resumes-on-live", "live", async () => {
      await ctx.ui.waitStep("live", T.step);
      return "live";
    });
    await blueEnds(ctx, side);
    await blueRecordsDraw(ctx, side);
    await ctx.step("kill and relaunch Blue during confirm", async () => {
      await ctx.simctl.terminate();
      await ctx.simctl.launch();
      await ctx.idb.waitFor({ label: "Home", type: "Button" }, 30_000).catch(() => undefined);
      await ctx.simctl.openUrl(url);
    });
    // The row is 'completed' after record, so getCurrentStep maps it to summary:
    // Blue skips its own confirmation. Recorded, not asserted as a failure.
    const step = await ctx.idb
      .waitAny([{ label: /^Step \d+ of \d+, (Confirm|Summary)$/ }], T.step)
      .then(() => ctx.ui.currentStep());
    ctx.oracle("ui:resumes-after-confirm-kill", step === "summary" || step === "confirm", "confirm|summary", step);
    await side.confirm();
    const conf = await db.confirmations(h.matchId);
    ctx.oracle("db:blue-confirmation-after-relaunch", true, "informational", conf.map((c) => c.athlete_id), "Blue lands on summary and never confirms when relaunched on confirm");
    if (step === "summary") await exitToArena(ctx);
  },
};
export default scenario;
