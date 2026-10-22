import type { Scenario } from "../context";
import { checkSummary, exitToArena } from "../flows";
import { recipientsOf, tkDb } from "../../oracle/tk-db";
import { TK_UI } from "../../sim/timekeeper-screens";
import { pollUntil } from "../../lib/util";
import {
  blueAsks,
  checkTkDone,
  seat,
  tkBlueChallengesRed,
  tkBothConfirm,
  tkEnd,
  tkFaceoffToLive,
  tkRecord,
  tkScenario,
  TK,
} from "./tk-flows";

/**
 * T2 (TEST-PLAN 4.2), Blue the challenger: Blue asks Gold, Gold declines
 * (TK-P21 on Blue's picker, TK-N3 to both athletes with Gold as the
 * subject, the request `declined`), Blue asks Green, Green accepts, and the
 * match runs to a recorded draw that both confirm.
 */
const scenario: Scenario = {
  id: "T2",
  tier: "timekeeper",
  title: "Gold declines (TK-P21), Blue picks Green instead, the match runs to a confirmed draw",
  needs: ["M2", "M3", "M4", "M5", "M8"],
  async run(ctx) {
    await tkScenario(ctx, { gold: true }, async (cast) => {
      const gold = cast.gold!;
      const m = await tkBlueChallengesRed(ctx, cast);
      const first = await blueAsks(ctx, cast, gold, m);
      const d = await ctx.step("Gold declines", () => gold.respond(first.id, false));
      ctx.eq("bot:decline-ok", true, d.ok);
      const reqs = await tkDb.requests(m.matchId);
      ctx.eq("db:request-declined", "declined", reqs.find((r) => r.id === first.id)?.status);
      const n = await pollUntil("TK-N3 to both athletes", async () => {
        const rows = await tkDb.notifications(m.matchId);
        return recipientsOf(rows, "timekeeper_declined").length >= 2 ? rows : undefined;
      }, { timeoutMs: 5_000 }).catch(() => tkDb.notifications(m.matchId));
      ctx.eq("db:athletes-told-declined", [...m.athletes].sort(), recipientsOf(n, "timekeeper_declined"), "TK-N3");
      ctx.eq(
        "db:declined-subject-is-gold",
        [gold.me.id],
        [...new Set(n.filter((r) => r.kind === "timekeeper_declined").map((r) => r.subject_athlete_id))],
      );
      await ctx.expect("ui:declined-tk-p21", true, async () => {
        await cast.ui.waitLabel(TK_UI.declined(gold.me.displayName), TK.step);
        return true;
      });
      const second = await blueAsks(ctx, cast, cast.green, m);
      const side = await seat(ctx, cast.green, second, m);
      await tkFaceoffToLive(ctx, cast, m, cast.green, side);
      await tkEnd(ctx, m, side);
      await tkRecord(ctx, cast, m, cast.green, side, { result: "draw" });
      await tkBothConfirm(ctx, m);
      await checkSummary(ctx, "DRAW", { matchId: m.matchId, stake: null });
      await checkTkDone(ctx, m, cast.green, side, { draw: true });
      await exitToArena(ctx);
    });
  },
};
export default scenario;
