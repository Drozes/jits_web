import type { Scenario } from "../context";
import { db } from "../../oracle/db";
import { pollUntil } from "../../lib/util";
import { blueEnds, blueRecordsDraw, bothConfirm, exitToArena, openToLive, prepare, T } from "../flows";

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
    // The row is 'completed' after record, so the mount-time step is summary;
    // the wizard's first DB snapshot moves an athlete who has not confirmed
    // back to confirm (jits-bmei). A brief summary before that is expected.
    const onConfirm = await ctx.expect("ui:resumes-on-confirm-after-kill", "confirm", async () => {
      await ctx.ui.waitStep("confirm", T.step);
      return "confirm";
    });
    if (onConfirm) {
      await bothConfirm(ctx, side);
      const conf = await pollUntil(
        "2 confirmations",
        async () => {
          const c = await db.confirmations(h.matchId);
          return c.length >= 2 ? c : undefined;
        },
        { timeoutMs: 8_000 },
      ).catch(() => db.confirmations(h.matchId));
      ctx.eq("db:both-confirmed-after-relaunch", [ctx.ids.blue, ctx.ids.red].sort(), conf.map((c) => c.athlete_id).sort());
    }
    if ((await ctx.ui.currentStep()) === "summary") await exitToArena(ctx);
  },
};
export default scenario;
