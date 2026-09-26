import type { Scenario } from "../context";
import { db } from "../../oracle/db";
import { ToastWatch } from "../../oracle/ui";
import { ExpectationTimeout } from "../../lib/util";
import {
  blueCancelsFromReady,
  blueOnWeight,
  checkToasts,
  matchesFor,
  prepare,
  settledChallenge,
  T,
} from "../flows";

/**
 * Crossing challenges (use-arena-challenge.ts `accept`): Blue and Red
 * challenge each other within ~200ms, then both accept the other's challenge
 * at once. The lower challenge id is canonical: its recipient accepts it
 * straight away, the other side withdraws it first, pending-guarded. Exactly
 * one of those writes wins the row, and either way both land in ONE match.
 * Which side is the canonical accepter depends on the ids (random), so runs
 * exercise both branches; the trace notes which one ran.
 */
const scenario: Scenario = {
  id: "E18",
  tier: "extended",
  title: "Crossing challenges: Blue and Red challenge each other and both accept at once, one match, no error toast",
  async run(ctx) {
    await prepare(ctx);
    const red = await ctx.bot("red");
    await red.goLive();

    const redChallenge = await ctx.step("Blue and Red challenge each other (Red right after Blue's tap)", async () => {
      await ctx.ui.challenge(ctx.cfg.names.red);
      return red.challenge(ctx.ids.blue);
    });
    const blueChallenge = (await ctx.step("Red receives Blue's challenge", () => red.waitForIncoming(T.prompt, ctx.ids.blue))).id;
    const [dbBlue, dbRed] = await Promise.all([db.challenge(blueChallenge), db.challenge(redChallenge)]);
    ctx.eq("db:both-challenges-pending", ["pending", "pending"], [dbBlue?.status, dbRed?.status]);
    const gapMs = dbBlue && dbRed ? Math.abs(Date.parse(dbRed.created_at) - Date.parse(dbBlue.created_at)) : null;
    ctx.oracle("env:crossing-insert-gap-ms", true, "informational", gapMs, "created_at gap between the two inserts");
    await ctx.step("Blue sees Red's prompt", () => ctx.ui.waitPrompt(T.prompt));

    const canonical = blueChallenge < redChallenge ? blueChallenge : redChallenge;
    ctx.trace.note("harness", "crossing", {
      blueChallenge,
      redChallenge,
      canonical,
      // The recipient of the canonical challenge accepts it without withdrawing.
      canonicalAccepter: canonical === redChallenge ? "blue" : "red",
    });

    const toasts = new ToastWatch(ctx.idb);
    let botMatchId: string;
    try {
      const accepted = await ctx.step("Blue and Red both accept", async () => {
        await ctx.ui.acceptPrompt();
        return red.acceptLikeApp(blueChallenge, ctx.ids.blue);
      });
      ctx.trace.note("harness", "red_accept_outcome", accepted);
      if (accepted.kind === "entered") {
        botMatchId = accepted.matchId;
      } else if (accepted.kind === "waiting_on_outgoing") {
        const out = await ctx.step("Red's own challenge takes it into the match", () => red.waitOutgoingOutcome(T.handshake));
        ctx.eq("bot:red-lands-in-match", "match_started", out.kind);
        if (out.kind !== "match_started") throw new ExpectationTimeout("Red into the match", T.handshake, out);
        ctx.trace.note("harness", "red_path", out.via);
        botMatchId = out.matchId;
      } else {
        ctx.eq("bot:red-accept-resolves", "entered | waiting_on_outgoing", accepted);
        throw new ExpectationTimeout("Red's accept to resolve", 0, accepted);
      }

      await blueOnWeight(ctx);
      await red.lastSettle;

      const ms = await matchesFor([blueChallenge, redChallenge]);
      ctx.eq("db:exactly-one-match", 1, ms.length);
      ctx.eq("db:red-in-the-db-match", [botMatchId], ms.map((m) => m.id));
      const parts = await db.participants(botMatchId);
      ctx.eq("db:match-is-blue-vs-red", [ctx.ids.blue, ctx.ids.red].sort(), parts.map((p) => p.athlete_id).sort());
      const matchChallenge = ms[0]?.challenge_id ?? null;
      ctx.eq("db:match-challenge-started", "started", matchChallenge ? (await db.challenge(matchChallenge))?.status : null);

      const other = matchChallenge === blueChallenge ? redChallenge : blueChallenge;
      try {
        const row = await settledChallenge(other);
        ctx.oracle("db:other-challenge-withdrawn", ["cancelled", "declined"].includes(row.status), "cancelled | declined", row.status);
      } catch (e) {
        if (!(e instanceof ExpectationTimeout)) throw e;
        ctx.oracle("db:other-challenge-withdrawn", false, "cancelled | declined", "pending");
      }

      const els = await ctx.idb.describe();
      ctx.eq("ui:no-prompt-in-match", false, await ctx.ui.isPromptVisible(els));
      ctx.eq("ui:no-waiting-plate-in-match", false, els.some((e) => /^Waiting for /.test(e.AXLabel ?? "")));
      // A quiet crossing withdrawal: no error, and no "declined." either.
      await checkToasts(ctx, toasts);
    } finally {
      await toasts.stop();
    }

    // Ends it through the match topic: Blue's match_cancelled reaching the
    // bot's match proves both apps are in the same match id.
    const side = await ctx.matchSide(red, botMatchId);
    await blueCancelsFromReady(ctx, side);
  },
};
export default scenario;
