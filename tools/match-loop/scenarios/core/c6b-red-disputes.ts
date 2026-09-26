import type { Scenario } from "../context";
import { db } from "../../oracle/db";
import {
  blueChallengesRed,
  blueEnds,
  blueOnWeight,
  blueRecordsSubmission,
  checkLiveAfterExit,
  exitToArena,
  prepare,
  readyToLive,
  T,
} from "../flows";

const BLUE_LEAVES_WITHIN_MS = 3_000;

/**
 * DELIBERATE HARNESS-ONLY REORDER. The app disputes RPC first, then
 * broadcasts match_disputed. Here Red broadcasts FIRST, while the row is
 * still `completed` with no confirmations: the app's `targetFor` maps that
 * row to confirm, so Blue's DB reconciler (4s poll, row UPDATE trigger)
 * cannot move Blue. Blue reaching the summary within the window can then
 * only be the onMatchDisputed broadcast handler. The RPC follows, and the DB
 * oracles check it landed.
 */
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
    await ctx.step("Red broadcasts match_disputed (before the RPC, harness-only order)", () => side.disputeBroadcastOnly());
    await ctx.expect("protocol:red-sent-match_disputed", { athlete_id: ctx.ids.red }, async () => {
      const e = await side.spy.waitFor("Red's match_disputed", (s) => s.event === "match_disputed", T.broadcast, 0);
      return { athlete_id: e.payload.athlete_id };
    });
    // The row is still completed + unconfirmed here, so only the broadcast
    // handler can move Blue.
    const m0 = await db.match(h.matchId);
    ctx.eq("db:still-completed-before-dispute-rpc", "completed", m0?.status);
    await ctx.expect("ui:blue-leaves-confirm-on-match_disputed", "summary", async () => {
      await ctx.ui.waitStep("summary", BLUE_LEAVES_WITHIN_MS);
      return "summary";
    });
    const els = await ctx.idb.describe().catch(() => []);
    ctx.oracle(
      "ui:blue-dispute-toast-seen",
      true,
      "informational",
      els.some((e) => /disputed the result/i.test(e.AXLabel ?? "")),
    );
    await ctx.step("Red records the dispute (RPC)", () => side.disputeRpcAfterBroadcast("match loop dispute (red)"));
    const m = await db.waitMatchStatus(h.matchId, ["disputed"], T.db).catch(() => db.match(h.matchId));
    ctx.eq("db:match-disputed", "disputed", m?.status);
    const disputes = await db.disputes(h.matchId);
    ctx.eq("db:dispute-row", [{ raised_by: ctx.ids.red }], disputes.map((d) => ({ raised_by: d.raised_by })));
    // Blue's summary read the row before the RPC and does not poll, so its
    // verdict is informational only.
    const s = await ctx.ui.readSummary().catch(() => null);
    ctx.oracle("ui:blue-summary-verdict", true, "informational", s?.verdict ?? null);
    await exitToArena(ctx);
    await checkLiveAfterExit(ctx, red);
  },
};
export default scenario;
