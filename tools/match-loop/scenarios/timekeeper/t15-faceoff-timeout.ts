import type { Scenario } from "../context";
import { tkDb } from "../../oracle/tk-db";
import { pollUntil } from "../../lib/util";
import { checkNoContest, C, expectExitToast, pickAndSeat, sweepUntil, tkBlueChallengesRed, tkScenario, TK, waitPast, watchToasts } from "./tk-flows";

/** From the seat: above the seat's own UI waits plus the TK-D9 wait that precede the sweep. */
const FACEOFF_S = 60;

/**
 * T15 (TEST-PLAN 4.2, A26), Blue the challenger: the timekeeper is seated
 * and online, Red readies, Blue never does. With the face-off window
 * shortened to 60 s (`tk_faceoff_window`; production 10 minutes from the
 * seat) the sweep makes it a no contest `faceoff_timeout`: NOT a drop-out
 * (the timekeeper was online), TK-N11 to all three, and Blue sees the TK-D9
 * countdown on the face-off, then TK-NC5.
 */
const scenario: Scenario = {
  id: "T15",
  tier: "timekeeper",
  title: "Face-off timeout: seated, Blue never readies, no contest faceoff_timeout (not a drop-out), TK-NC5",
  needs: ["M3", "M4", "M8"],
  async run(ctx) {
    await tkScenario(ctx, { windows: { tk_faceoff_window: FACEOFF_S } }, async (cast) => {
      const m = await tkBlueChallengesRed(ctx, cast);
      const side = await pickAndSeat(ctx, cast, m, cast.green, "red");
      ctx.eq("bot:red-ready-ok", true, (await m.red.markReady()).ok);
      await ctx.step("Green confirms both weigh-ins and waits", () => side.confirmWeights(true));
      await ctx.expect("ui:faceoff-timeout-chip-tk-d9", true, () =>
        pollUntil("TK-D9 on the face-off", async () => ((await cast.ui.noContestChip()) ? true : undefined), { timeoutMs: TK.step }),
      );
      const hist = await tkDb.history(m.matchId);
      const seatedAt = hist.find((h) => h.timekeeper_id === cast.green.me.id && !h.left_at)?.seated_at ?? null;
      const watch = watchToasts(ctx);
      await ctx.step("the face-off window passes", () => waitPast(seatedAt, FACEOFF_S));
      await ctx.step("the sweep times the face-off out", () => sweepUntil(ctx, m, "cancelled faceoff_timeout", (r) => r.status === "cancelled"));
      await expectExitToast(ctx, watch, "exit-toast-tk-nc5", C["TK-NC5"]);
      await checkNoContest(
        ctx,
        m,
        {
          reason: "faceoff_timeout",
          timekeeperId: cast.green.me.id,
          historyReason: "faceoff_timeout",
          dropOut: false,
          notified: [{ kind: "match_timed_out", recipients: [...m.athletes, cast.green.me.id] }],
        },
        cast.red,
      );
    });
  },
};
export default scenario;
