import type { Scenario } from "../context";
import { recipientsOf, tkDb } from "../../oracle/tk-db";
import { runTimekeeperTick } from "../../fixtures/timekeeper";
import { TK_UI } from "../../sim/timekeeper-screens";
import { pollUntil } from "../../lib/util";
import { blueLeavesFromCrew, redAsks, tkRedChallengesBlue, tkScenario, TK, waitPast } from "./tk-flows";

/** Above the UI wait for TK-P20 (up to TK.step) that precedes the lapse. */
const LAPSE_S = 60;

/**
 * T3 (TEST-PLAN 4.2), Blue the opponent: Red's bot asks Gold, who never
 * answers. With the request lapse shortened to 60 s (`tk_request_lapse`,
 * jr_be 024 6.4) the request turns `expired` (through the sweep's step 1,
 * `_tk_lapse_request`), both athletes get TK-N3 exactly once with Gold as
 * the subject, Blue sees TK-P22 and the picker is back (an Ask row shows
 * again). Blue then leaves from crew (`athlete_left`).
 */
const scenario: Scenario = {
  id: "T3",
  tier: "timekeeper",
  title: "A request lapses after the (shortened) 2 minutes: TK-P22, the picker returns",
  needs: ["M2", "M8"],
  async run(ctx) {
    await tkScenario(ctx, { gold: true, windows: { tk_request_lapse: LAPSE_S } }, async (cast) => {
      const gold = cast.gold!;
      const m = await tkRedChallengesBlue(ctx, cast);
      const req = await redAsks(ctx, cast, gold, m, { pickerUi: true });
      await ctx.step("the request's lapse passes with no answer", () => waitPast(req.expires_at, 0));
      const expired = await ctx.step("the sweep lapses the request", () =>
        pollUntil("the request to read expired", async () => {
          await runTimekeeperTick();
          const r = (await tkDb.requests(m.matchId)).find((x) => x.id === req.id);
          return r?.status === "expired" ? r : undefined;
        }, { timeoutMs: TK.sweep, intervalMs: 2_000 }),
      );
      ctx.eq("db:request-expired", "expired", expired.status);
      // A sweep that told them again would add rows: one more before the read (as T0B does).
      await ctx.step("one more sweep (a lapse is told once)", () => runTimekeeperTick());
      const n = await tkDb.notifications(m.matchId);
      ctx.eq("db:athletes-told-lapsed-once", [...m.athletes].sort(), recipientsOf(n, "timekeeper_declined", gold.me.id), "TK-N3 once each, about Gold");
      const row = await tkDb.match(m.matchId);
      ctx.eq("db:still-picking", { status: "pending", timekeeper_id: null }, { status: row?.status, timekeeper_id: row?.timekeeper_id });
      await ctx.expect("ui:lapsed-tk-p22", true, async () => {
        await cast.ui.waitLabel(TK_UI.lapsed(gold.me.displayName), TK.step);
        return true;
      });
      await ctx.expect("ui:picker-returns", true, async () => {
        await cast.ui.waitLabel(TK_UI.ask(cast.green.me.displayName), TK.step);
        return true;
      });
      await blueLeavesFromCrew(ctx);
      const after = await tkDb.waitMatch(m.matchId, "cancelled", (x) => x.status === "cancelled", TK.db).catch(() => tkDb.match(m.matchId));
      ctx.eq("db:left-while-picking", { status: "cancelled", cancel_reason: "athlete_left" }, { status: after?.status, cancel_reason: after?.cancel_reason });
    });
  },
};
export default scenario;
