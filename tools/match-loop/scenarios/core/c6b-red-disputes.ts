import type { Scenario } from "../context";
import { db } from "../../oracle/db";
import {
  blueChallengesRed,
  blueEnds,
  blueOnWeight,
  blueRecordsSubmission,
  checkLiveAfterExit,
  checkSummary,
  exitToArena,
  prepare,
  readyToLive,
  T,
} from "../flows";

/** Under the app's 4s confirm poll, so the DB reconciler alone is unlikely to
 * be what moved Blue (a poll can still land inside the window by chance; the
 * spy oracle is the hard delivery check). */
const BLUE_LEAVES_WITHIN_MS = 3_000;

const scenario: Scenario = {
  id: "C6B", // upper case: --only upper-cases its ids (like E3B)
  tier: "core",
  title: "Blue records a Blue win, Red disputes: Blue's confirm step is told by match_disputed and reaches the summary",
  async run(ctx) {
    await prepare(ctx);
    const red = await ctx.bot("red");
    await red.goLive();
    const h = await blueChallengesRed(ctx, red);
    const side = await ctx.matchSide(red, h.matchId);
    await blueOnWeight(ctx);
    await readyToLive(ctx, side);
    await blueEnds(ctx, side);
    await blueRecordsSubmission(ctx, side, ctx.ids.blue, "armbar", "90");
    await ctx.step("Red disputes", () => side.dispute("match loop dispute (red)"));
    await ctx.expect("protocol:red-sent-match_disputed", { athlete_id: ctx.ids.red }, async () => {
      const e = await side.spy.waitFor("Red's match_disputed", (s) => s.event === "match_disputed", T.broadcast, 0);
      return { athlete_id: e.payload.athlete_id };
    });
    await ctx.expect("ui:blue-leaves-confirm-on-dispute", "summary", async () => {
      await ctx.ui.waitStep("summary", BLUE_LEAVES_WITHIN_MS);
      return "summary";
    });
    // The broadcast path shows a "Result disputed" toast; the reconciler
    // path does not. Informational: toasts may not surface through idb.
    const els = await ctx.idb.describe().catch(() => []);
    const toast = els.some((e) => /disputed the result/i.test(e.AXLabel ?? ""));
    ctx.oracle("ui:blue-dispute-toast-seen", true, "informational", toast);
    await ctx.ui.waitStep("summary", T.step);
    await checkSummary(ctx, "DISPUTED", null);
    const m = await db.waitMatchStatus(h.matchId, ["disputed"], T.db).catch(() => db.match(h.matchId));
    ctx.eq("db:match-disputed", "disputed", m?.status);
    const disputes = await db.disputes(h.matchId);
    ctx.eq("db:dispute-row", [{ raised_by: ctx.ids.red }], disputes.map((d) => ({ raised_by: d.raised_by })));
    await exitToArena(ctx);
    await checkLiveAfterExit(ctx, red);
  },
};
export default scenario;
