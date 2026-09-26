import type { Scenario } from "../context";
import { run, pace, log } from "../../lib/util";
import { onInterrupt } from "../../lib/cleanup";
import { blueEnds, blueRecordsDraw, exitToArena, openToLive, prepare, T } from "../flows";

const scenario: Scenario = {
  id: "E8",
  tier: "extended",
  title: "Realtime outage (container paused 15s) during confirm: both sides still reach the summary",
  allowFailedSends: true,
  async run(ctx) {
    await prepare(ctx);
    const red = await ctx.bot("red");
    await red.goLive();
    const { side } = await openToLive(ctx, red);
    await blueEnds(ctx, side);
    await blueRecordsDraw(ctx, side);
    const container = ctx.cfg.realtimeContainer;
    const unpause = () =>
      run("docker", ["unpause", container]).then(
        () => undefined,
        (e) => log(`UNPAUSE FAILED: ${e instanceof Error ? e.message : e}`),
      );
    // Ctrl-C / SIGTERM mid-outage must still unpause (lib/cleanup.ts).
    const unregister = onInterrupt("e8-unpause-realtime", unpause);
    try {
      await ctx.step("pause realtime", () => run("docker", ["pause", container]));
      await ctx.step("both confirm during the outage", async () => {
        await ctx.ui.confirmResult();
        await side.confirm();
      });
      await pace(15_000);
    } finally {
      await unpause();
      unregister();
    }
    await ctx.expect("ui:blue-reaches-summary-after-outage", true, async () => {
      await ctx.ui.waitStep("summary", 45_000);
      return true;
    });
    await ctx.expect("bot:red-sees-blue-confirm-after-outage", true, async () => {
      await side.waitOpponentConfirmed(T.handshake);
      return true;
    });
    if ((await ctx.ui.currentStep()) === "summary") await exitToArena(ctx);
  },
};
export default scenario;
