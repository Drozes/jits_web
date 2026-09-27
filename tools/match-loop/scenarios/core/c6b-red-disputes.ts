import type { Scenario } from "../context";
import { db } from "../../oracle/db";
import { pollUntil } from "../../lib/util";
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

/** How fast Blue's verdict must show the dispute on the broadcast alone. */
const BLUE_REACTS_WITHIN_MS = 3_000;

/**
 * Blue records a Blue win and, as the recorder, is auto-confirmed (jr_be B2)
 * and lands on the verdict without a confirm step. Red then disputes. The
 * recorder's verdict must learn of it and show DISPUTED (the calm variant,
 * no celebration).
 *
 * DELIBERATE HARNESS-ONLY REORDER. The app disputes RPC first, then
 * broadcasts match_disputed. Here Red broadcasts FIRST, while the row is
 * still `completed`: a DB re-read cannot show a dispute yet, so Blue's
 * verdict flipping to DISPUTED within the window can only be the verdict's
 * onMatchDisputed broadcast handler. The RPC follows; the DB oracles check
 * it landed and the verdict still reads DISPUTED after it.
 */
const scenario: Scenario = {
  id: "C6B", // upper case: --only upper-cases its ids (like E3B)
  tier: "core",
  title: "Blue records a Blue win (auto-confirmed, straight to the verdict), Red disputes: Blue's verdict turns DISPUTED",
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
    ctx.eq("ui:recorder-skips-confirm", "summary", await ctx.ui.currentStep());
    const before = await ctx.ui.readSummary();
    ctx.eq("ui:recorder-verdict-before-dispute", "YOU WON", before.verdict?.toUpperCase() ?? null);
    const conf0 = await db.confirmations(h.matchId);
    ctx.eq("db:recorder-auto-confirmed", [ctx.ids.blue], conf0.map((c) => c.athlete_id));
    await ctx.step("Red broadcasts match_disputed (before the RPC, harness-only order)", () => side.disputeBroadcastOnly());
    await ctx.expect("protocol:red-sent-match_disputed", { athlete_id: ctx.ids.red }, async () => {
      const e = await side.spy.waitFor("Red's match_disputed", (s) => s.event === "match_disputed", T.broadcast, 0);
      return { athlete_id: e.payload.athlete_id };
    });
    const m0 = await db.match(h.matchId);
    ctx.eq("db:still-completed-before-dispute-rpc", "completed", m0?.status);
    await ctx.expect("ui:blue-verdict-shows-dispute-on-broadcast", "DISPUTED", async () => {
      const v = await pollUntil(
        "verdict DISPUTED",
        async () => {
          const r = await ctx.ui.readSummary();
          return r.verdict?.toUpperCase() === "DISPUTED" ? r.verdict.toUpperCase() : undefined;
        },
        { timeoutMs: BLUE_REACTS_WITHIN_MS },
      );
      return v;
    });
    await ctx.step("Red records the dispute (RPC)", () => side.disputeRpcAfterBroadcast("match loop dispute (red)"));
    const m = await db.waitMatchStatus(h.matchId, ["disputed"], T.db).catch(() => db.match(h.matchId));
    ctx.eq("db:match-disputed", "disputed", m?.status);
    const disputes = await db.disputes(h.matchId);
    ctx.eq("db:dispute-row", [{ raised_by: ctx.ids.red }], disputes.map((d) => ({ raised_by: d.raised_by })));
    const s = await ctx.ui.readSummary();
    ctx.eq("ui:blue-verdict-after-dispute-rpc", "DISPUTED", s.verdict?.toUpperCase() ?? null);
    await exitToArena(ctx);
    await checkLiveAfterExit(ctx, red);
  },
};
export default scenario;
