import type { Scenario } from "../context";
import { blueChallengesRed, blueOnWeight, checkAbortDb, checkLiveAfterExit, checkOfflineInMatch, prepare, T } from "../flows";

const scenario: Scenario = {
  id: "C5",
  tier: "core",
  title: "Blue aborts the ready check: match cancelled, Red is sent back, no ELO change",
  async run(ctx) {
    await prepare(ctx);
    const red = await ctx.bot("red");
    await red.goLive();
    const h = await blueChallengesRed(ctx, red);
    const side = await ctx.matchSide(red, h.matchId);
    await blueOnWeight(ctx);
    await checkOfflineInMatch(ctx, red);
    const botReady = side.confirmWeights().then(() => side.readyAndStart(T.handshake));
    await ctx.step("Blue confirms weights", async () => {
      await ctx.ui.confirmWeights();
      await ctx.ui.waitStep("ready", T.step);
    });
    // Cancel only once Red is on the ready step and has readied (the case where
    // Red is still on the weight step is E3B: the weight step's channel).
    await ctx.step("Red is ready (Blue's opponent panel)", async () => {
      await side.spy.waitFor("Red's ready_signal", (e) => e.event === "ready_signal" && e.payload.athlete_id === ctx.ids.red, T.handshake, 0);
      await ctx.ui.waitOpponentReady(10_000);
    });
    await ctx.step("Blue cancels the match", () => ctx.ui.cancelMatch());
    const outcome = await ctx.step("bot is told the match was cancelled", () => botReady);
    ctx.eq("bot:ready-cancelled", { kind: "cancelled" }, { kind: outcome.kind });
    // The bot's ready step can also exit from a DB snapshot, so check that
    // Blue's app actually broadcast the cancel. `via` is not asserted: the RPC
    // lands before the broadcast and a poll may legitimately win the race.
    await ctx.expect("protocol:blue-sent-match_cancelled", true, async () => {
      await side.spy.waitFor("Blue's match_cancelled", (e) => e.event === "match_cancelled", T.broadcast, 0);
      return true;
    });
    ctx.oracle("bot:ready-cancelled-via", true, "informational", outcome.kind === "cancelled" ? outcome.via : null);
    await ctx.step("Blue is back on the Arena", () =>
      ctx.idb.waitAny([{ label: "Go live", type: "Button" }, { label: "Go offline", type: "Button" }], T.step),
    );
    await checkAbortDb(ctx, h);
    await checkLiveAfterExit(ctx, red);
  },
};
export default scenario;
