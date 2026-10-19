import type { Scenario } from "../context";
import { db } from "../../oracle/db";
import {
  blueEnds,
  blueRecordsSubmission,
  bothConfirm,
  checkSummary,
  exitToArena,
  openToLive,
  participantDelta,
  prepare,
  stakeOracle,
  stakesFor,
} from "../flows";

const scenario: Scenario = {
  id: "E12",
  tier: "extended",
  title: "Weight gap (Red 200 lbs): the gap is stamped on the match and shown on the verdict",
  async run(ctx) {
    await prepare(ctx, { weights: { red: 200 } });
    const red = await ctx.bot("red");
    await red.goLive();
    const stakes = await stakesFor(ctx, red, 1000, 1000, 170, 200);
    stakeOracle(ctx, "stakes:gap-positive", true, (stakes?.weight_division_gap ?? 0) > 0, stakes !== null);
    const { h, side } = await openToLive(ctx, red);
    await blueEnds(ctx, side);
    await blueRecordsSubmission(ctx, side, ctx.ids.blue);
    await bothConfirm(ctx, side);
    await checkSummary(ctx, "YOU WON", { matchId: h.matchId, stake: stakes?.challenger_win ?? null });
    const parts = await db.participants(h.matchId);
    ctx.oracle("db:gap-stamped", (parts[0]?.weight_division_gap ?? 0) > 0, ">0", parts.map((p) => p.weight_division_gap));
    stakeOracle(
      ctx,
      "stakes:gap-and-deltas-match-preview",
      { gap: stakes?.weight_division_gap, blue: stakes?.challenger_win, red: stakes?.opponent_loss },
      {
        gap: parts[0]?.weight_division_gap,
        blue: participantDelta(parts.find((p) => p.athlete_id === ctx.ids.blue)),
        red: participantDelta(parts.find((p) => p.athlete_id === ctx.ids.red)),
      },
      stakes !== null,
    );
    const gapText = await ctx.idb.find({ label: /weight class(es)? apart/i });
    ctx.eq("ui:summary-gap-note", true, !!gapText);
    await exitToArena(ctx);
  },
};
export default scenario;
