import type { Scenario } from "../context";
import { db } from "../../oracle/db";
import { pollUntil } from "../../lib/util";
import { blueEnds, finishWithDraw, openToLive, prepare } from "../flows";

const scenario: Scenario = {
  id: "E4",
  tier: "extended",
  title: "Red pauses and resumes: Blue's timer follows, DB records the pause",
  async run(ctx) {
    await prepare(ctx);
    const red = await ctx.bot("red");
    await red.goLive();
    const { h, side } = await openToLive(ctx, red);
    // The toggle names the action it offers (`Screens.pauseLabel`, from its
    // accessibility label): RESUME while paused, PAUSE while running. The
    // last reading is kept as evidence, so a relabel reads as itself.
    const toggleOffers = (want: "PAUSE" | "RESUME") => {
      let last: string | null = null;
      return pollUntil(
        `the live pause toggle to offer ${want}`,
        async () => {
          last = await ctx.ui.pauseLabel();
          return last === want ? want : undefined;
        },
        { timeoutMs: 8_000, lastSeen: () => ({ toggle: last }) },
      );
    };
    await ctx.step("Red pauses", () => side.pause());
    await ctx.expect("ui:blue-shows-resume", "RESUME", () => toggleOffers("RESUME"));
    ctx.eq("db:paused_at-set", true, !!(await db.match(h.matchId))?.paused_at);
    await ctx.step("Red resumes", () => side.resume());
    await ctx.expect("ui:blue-shows-pause", "PAUSE", () => toggleOffers("PAUSE"));
    const m = await db.match(h.matchId);
    ctx.eq("db:resumed", { paused: false, pausedTotalPositive: true }, { paused: !!m?.paused_at, pausedTotalPositive: (m?.total_paused_duration ?? 0) > 0 });
    await blueEnds(ctx, side);
    await finishWithDraw(ctx, side);
  },
};
export default scenario;
