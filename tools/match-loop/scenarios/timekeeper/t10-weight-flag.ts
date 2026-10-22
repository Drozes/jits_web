import type { Scenario } from "../context";
import { tkDb } from "../../oracle/tk-db";
import { TK_UI } from "../../sim/timekeeper-screens";
import { pollUntil } from "../../lib/util";
import { startDecision } from "../../bot/timekeeper";
import { blueReadyOnServer, pickAndSeat, tkBothConfirm, tkEnd, tkRecord, tkRedChallengesBlue, tkScenario, TK } from "./tk-flows";

const REWEIGH_LBS = 171;

/**
 * T10 (TEST-PLAN 4.2), Blue the opponent: the timekeeper flags Blue's
 * weight. Blue weighs in first (the shipped `Confirm {w} lbs` on `weight`
 * moves Blue to `ready`, where the merged ready and its re-weigh live, spec
 * 4.2). Blue sees TK-F7 and the flag is one of the Start blockers (not the
 * first: `_tk_start_blockers` lists `athletes_not_ready` before any weight
 * hint, Blue has not readied, and a `flag` verdict also clears the flagged
 * athlete's ready), so a Start attempt is refused. Blue re-weighs for the
 * match through the prompt under TK-F7 (`weight-reweigh-*`, the match
 * re-weigh `reweigh_for_match`; never the face-off header's profile weight
 * editor), which voids every check on Blue and clears both readies (R9), and
 * the rated weight is the new one. Both ready again (Blue with TK-F4), the
 * timekeeper confirms the new weight quoting the new rated weight (PM26),
 * the flag is no longer a blocker and Start goes through. The match then
 * runs to a confirmed draw.
 */
const scenario: Scenario = {
  id: "T10",
  tier: "timekeeper",
  title: "The timekeeper flags Blue's weight: TK-F7, Start held, Blue re-weighs, the timekeeper confirms, Start enabled",
  needs: ["M3", "M4", "M5", "M8"],
  async run(ctx) {
    await tkScenario(ctx, { tab: "Home" }, async (cast) => {
      const m = await tkRedChallengesBlue(ctx, cast);
      const side = await pickAndSeat(ctx, cast, m, cast.green, "red");
      const w = await ctx.step("Blue weighs in (weight to ready)", () => cast.ui.weighIn(TK.step));
      ctx.eq("ui:blue-weighed-in-to-ready", { weighedIn: true, step: "ready" }, w);
      const rr = await ctx.step("Red readies", () => m.red.markReady());
      ctx.eq("bot:red-ready-ok", true, rr.ok);
      await ctx.step("Green confirms Red's weigh-in", () => side.verdict(ctx.ids.red, "confirm"));
      const flag = await ctx.step("Green flags Blue's weigh-in", () => side.verdict(ctx.ids.blue, "flag"));
      ctx.eq("bot:flag-ok", true, flag.ok);
      ctx.eq("db:blue-flagged", [{ subject_id: ctx.ids.blue, status: "flagged" }], (await tkDb.timekeeperChecks(m.matchId)).filter((c) => c.subject_id === ctx.ids.blue));
      await ctx.expect("ui:weight-flagged-tk-f7", true, async () => {
        await cast.ui.waitLabel(TK_UI.weightFlagged(cast.green.me.displayName), TK.step);
        return true;
      });
      const held = await side.state();
      ctx.eq(
        "bot:start-held-by-the-flag",
        { start: false, flagged: true },
        { start: startDecision(held).start, flagged: held?.startBlockers.includes("weight_flagged") ?? null },
        `the flag is one of the Start blockers: ${JSON.stringify(held?.startBlockers ?? null)}`,
      );
      const refused = await ctx.step("Green tries to start anyway", () => side.startMatch());
      ctx.eq("bot:start-refused-before-the-recheck", false, refused.ok, refused.ok ? "started" : `${refused.error.code} (any blocker; the flag is checked above)`);
      await ctx.step(`Blue re-weighs for the match at ${REWEIGH_LBS} lbs (the prompt under TK-F7)`, () => cast.ui.reweigh(REWEIGH_LBS));
      const after = await pollUntil("the re-weigh voids the checks on Blue and clears the readies", async () => {
        const [tkc, ready] = await Promise.all([tkDb.timekeeperChecks(m.matchId), tkDb.ready(m.matchId)]);
        const blue = tkc.find((c) => c.subject_id === ctx.ids.blue)?.status;
        return blue === "recheck" && ready.length === 0 ? { blue, ready } : undefined;
      }, { timeoutMs: TK.db }).catch(async () => ({ blue: (await tkDb.timekeeperChecks(m.matchId)).find((c) => c.subject_id === ctx.ids.blue)?.status, ready: await tkDb.ready(m.matchId) }));
      ctx.eq("db:reweigh-voids-and-clears", { blue: "recheck", ready: [] }, after);
      const st = await side.state();
      ctx.eq("db:rated-weight-is-the-new-one", REWEIGH_LBS, st?.weights.find((x) => x.athleteId === ctx.ids.blue)?.weight ?? null, "PM26: the verdict quotes the rated weight");
      // Both ready again; the timekeeper confirms the new weight and starts.
      const rr2 = m.red.markReady();
      // Awaited after Blue's taps: handled now so a rejection in between is not an unhandled one.
      rr2.catch(() => undefined);
      const weigh = await ctx.step("Blue taps TK-F4 again", () => cast.ui.weighInAndReady(TK.step, { serverReady: blueReadyOnServer(ctx, m) }));
      ctx.trace.note("harness", "tk_ready_after_reweigh", weigh);
      ctx.eq("ui:tk-ready-one-press", 1, weigh.readyPresses, "TK-F4 is offered again once the re-weigh voided the flag");
      ctx.eq("bot:red-ready-again-ok", true, (await rr2).ok);
      const blockers = await ctx.step("Green confirms the new weight and waits for no blocker", () => side.waitStartable(true, TK.start));
      ctx.trace.note("harness", "start_blockers_seen", blockers);
      ctx.eq("db:blue-confirmed-at-new-weight", "confirmed", (await tkDb.timekeeperChecks(m.matchId)).find((c) => c.subject_id === ctx.ids.blue)?.status);
      ctx.eq("bot:flag-cleared-before-start", false, (await side.state())?.startBlockers.includes("weight_flagged") ?? null);
      const started = await ctx.step("Green starts", () => side.startMatch());
      ctx.eq("bot:start-enabled-after-recheck", true, started.ok);
      await ctx.step("Blue reaches the live screen", () => cast.ui.waitLabel(TK_UI.runsTheClock(cast.green.me.displayName), TK.handshake));
      await tkEnd(ctx, m, side);
      await tkRecord(ctx, cast, m, cast.green, side, { result: "draw" });
      await tkBothConfirm(ctx, m);
    });
  },
};
export default scenario;
