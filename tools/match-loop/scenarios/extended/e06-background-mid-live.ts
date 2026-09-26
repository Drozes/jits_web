import type { Scenario } from "../context";
import { db } from "../../oracle/db";
import { pace } from "../../lib/util";
import { bothConfirm, exitToArena, openToLive, prepare, T } from "../flows";

const scenario: Scenario = {
  id: "E6",
  tier: "extended",
  title: "Blue backgrounds mid-live for 20s while Red ends and records: Blue must not be stranded (H7)",
  expectedFailure: "H7: broadcasts sent while backgrounded are lost and the live step never re-reads the row",
  async run(ctx) {
    await prepare(ctx);
    const red = await ctx.bot("red");
    await red.goLive();
    const { h, side } = await openToLive(ctx, red);
    await ctx.step("Blue goes to the home screen", () => ctx.idb.home());
    await ctx.step("Red ends and records a Red win", async () => {
      await side.endMatch();
      const r = await side.record({ result: "submission", winnerId: ctx.ids.red, submissionCode: "armbar", finishTimeSeconds: 60 });
      if (!r.ok) throw new Error(`record failed: ${r.error}`);
    });
    await pace(20_000 - 3_000);
    await ctx.step("Blue returns to the app", () => ctx.simctl.launch());
    ctx.eq("db:completed", "completed", (await db.match(h.matchId))?.status);
    const ok = await ctx.expect("ui:blue-reaches-confirm-or-summary", true, async () => {
      const { index } = await ctx.idb.waitAny([{ label: /^Step \d+ of \d+, Confirm$/ }, { label: /^Step \d+ of \d+, Summary$/ }], T.handshake);
      ctx.trace.note("harness", "blue_landed", index === 0 ? "confirm" : "summary");
      return true;
    });
    if (ok && (await ctx.ui.currentStep()) === "confirm") await bothConfirm(ctx, side);
    if (ok) await exitToArena(ctx);
  },
};
export default scenario;
