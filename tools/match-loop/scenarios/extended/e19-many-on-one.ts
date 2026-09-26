import type { Scenario } from "../context";
import { db } from "../../oracle/db";
import { ToastWatch } from "../../oracle/ui";
import { ExpectationTimeout, pace, pollUntil } from "../../lib/util";
import {
  blueCancelsFromReady,
  blueOnWeight,
  checkToasts,
  matchesFor,
  prepare,
  promptShownWithin,
  settledChallenge,
  T,
} from "../flows";

/**
 * Several challengers, one target (use-arena-challenge.ts
 * `settleOthersAfterEntry`): Red and Green both challenge Blue; Blue accepts
 * whichever prompt is on screen (the first INSERT keeps the surface). Entering
 * the match must decline the other challenge, per row, with the `declined`
 * broadcast, so that challenger's plate clears instead of waiting on someone
 * who is now busy, and Blue must never be prompted mid-match.
 */
const scenario: Scenario = {
  id: "E19",
  tier: "extended",
  title: "Many on one: Red and Green both challenge Blue; entering the match declines the other, who is told",
  async run(ctx) {
    await prepare(ctx);
    const red = await ctx.bot("red");
    const green = await ctx.bot("green");
    await red.goLive();
    await green.goLive();

    const [redChallenge, greenChallenge] = await ctx.step("Red and Green both challenge Blue", async () => {
      const r = await red.challenge(ctx.ids.blue);
      await pace(300);
      const g = await green.challenge(ctx.ids.blue);
      return [r, g] as const;
    });
    await ctx.step("Blue sees a prompt", () => ctx.ui.waitPrompt(T.prompt));

    const toasts = new ToastWatch(ctx.idb);
    let winnerMatchId: string;
    let winner = red;
    try {
      await ctx.step("Blue accepts the prompt on screen", () => ctx.ui.acceptPrompt());
      // The sheet's children are not in the accessibility tree, so which
      // challenger was on screen is read from the database.
      const acceptedId = await ctx.step("one challenge is accepted", () =>
        pollUntil(
          "Red's or Green's challenge to leave pending as accepted/started",
          async () => {
            const [r, g] = await Promise.all([db.challenge(redChallenge), db.challenge(greenChallenge)]);
            if (r && (r.status === "accepted" || r.status === "started")) return redChallenge;
            if (g && (g.status === "accepted" || g.status === "started")) return greenChallenge;
            return undefined;
          },
          { timeoutMs: T.db, intervalMs: 250 },
        ),
      );
      winner = acceptedId === redChallenge ? red : green;
      const loser = winner === red ? green : red;
      const loserChallenge = acceptedId === redChallenge ? greenChallenge : redChallenge;
      ctx.trace.note("harness", "many_on_one", { accepted: winner.me.key, declined: loser.me.key, acceptedId, loserChallenge });

      const out = await ctx.step(`${winner.me.displayName} is told the match started`, () => winner.waitOutgoingOutcome(T.prompt));
      ctx.eq("bot:accepted-challenger-lands-in-match", "match_started", out.kind);
      if (out.kind !== "match_started") throw new ExpectationTimeout("match_started for the accepted challenger", T.prompt, out);
      winnerMatchId = out.matchId;

      await blueOnWeight(ctx);

      const ms = await matchesFor([redChallenge, greenChallenge]);
      ctx.eq("db:exactly-one-match", [winnerMatchId], ms.map((m) => m.id));
      ctx.eq("db:match-for-the-accepted-challenge", acceptedId, ms[0]?.challenge_id ?? null);

      try {
        const row = await settledChallenge(loserChallenge);
        ctx.eq("db:other-challenge-declined", "declined", row.status);
      } catch (e) {
        if (!(e instanceof ExpectationTimeout)) throw e;
        ctx.oracle("db:other-challenge-declined", false, "declined", "pending");
      }
      await ctx.expect("bot:other-challenger-received-declined", true, async () => {
        await loser.events.waitFor(
          `declined broadcast on ${loserChallenge}`,
          (e) => e.kind === "declined" && e.challengeId === loserChallenge,
          T.broadcast,
          0, // filtered by challenge id
        );
        return true;
      });
      // What the other challenger's app concludes: its plate clears.
      await ctx.expect("bot:other-challenger-plate-clears", "declined", async () => (await loser.waitOutgoingOutcome(5_000)).kind);

      ctx.eq("ui:no-second-prompt-mid-match", false, await promptShownWithin(ctx, 6_000));
      ctx.eq("ui:still-on-weight-step", "weight", await ctx.ui.currentStep());
      await checkToasts(ctx, toasts);
    } finally {
      await toasts.stop();
    }

    const side = await ctx.matchSide(winner, winnerMatchId);
    await blueCancelsFromReady(ctx, side);
    // The declined challenge must not come back as a queued re-offer.
    ctx.eq("ui:no-prompt-after-match", false, await promptShownWithin(ctx, 5_000));
  },
};
export default scenario;
