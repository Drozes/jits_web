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
    await ctx.step("Red pauses", () => side.pause());
    await ctx.expect("ui:blue-shows-resume", "RESUME", () =>
      pollUntil("RESUME label", async () => ((await ctx.ui.pauseLabel()) === "RESUME" ? "RESUME" : undefined), { timeoutMs: 8_000 }),
    );
    ctx.eq("db:paused_at-set", true, !!(await db.match(h.matchId))?.paused_at);
    await ctx.step("Red resumes", () => side.resume());
    await ctx.expect("ui:blue-shows-pause", "PAUSE", () =>
      pollUntil("PAUSE label", async () => ((await ctx.ui.pauseLabel()) === "PAUSE" ? "PAUSE" : undefined), { timeoutMs: 8_000 }),
    );
    const m = await db.match(h.matchId);
    ctx.eq("db:resumed", { paused: false, pausedTotalPositive: true }, { paused: !!m?.paused_at, pausedTotalPositive: (m?.total_paused_duration ?? 0) > 0 });
    await blueEnds(ctx, side);
    await finishWithDraw(ctx, side);
  },
};
export default scenario;
