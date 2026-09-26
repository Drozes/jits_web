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
    let pausing: Promise<unknown> = Promise.resolve();
    const unpauseOnce = () =>
      run("docker", ["unpause", container]).then(
        () => true,
        () => false,
      );
    // Wait out an in-flight `docker pause` (an interrupt can land mid-call),
    // unpause, and unpause once more after a beat in case the pause landed
    // after the first unpause.
    const unpause = async () => {
      await pausing.catch(() => undefined);
      await unpauseOnce();
      await pace(1_000);
      await unpauseOnce();
      const { stdout } = await run("docker", ["inspect", "-f", "{{.State.Paused}}", container]).catch(() => ({ stdout: "?" }));
      if (stdout.trim() !== "false") log(`UNPAUSE FAILED: ${container} paused=${stdout.trim()}`);
    };
    // Ctrl-C / SIGTERM mid-outage must still unpause (lib/cleanup.ts).
    const unregister = onInterrupt("e8-unpause-realtime", unpause);
    try {
      await ctx.step("pause realtime", () => (pausing = run("docker", ["pause", container])));
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
    // Blue's result_confirmed may die in the outage; like the app, Red's
    // confirm step then finishes from the DB (both confirmation rows).
    await ctx.expect("bot:red-sees-blue-confirm-after-outage", true, async () => {
      const outcome = await side.waitConfirmDone(T.handshake);
      ctx.trace.note("harness", "bot_confirm_via", outcome.via);
      return outcome.kind === "confirmed";
    });
    if ((await ctx.ui.currentStep()) === "summary") await exitToArena(ctx);
  },
};
export default scenario;
