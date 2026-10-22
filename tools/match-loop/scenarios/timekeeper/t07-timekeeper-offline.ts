import type { Scenario } from "../context";
import { TK_UI } from "../../sim/timekeeper-screens";
import { pollUntil } from "../../lib/util";
import {
  checkNoContest,
  C,
  expectChipCountsDown,
  expectExitToast,
  pickAndSeat,
  short,
  sweepUntil,
  tkBlueChallengesRed,
  tkFaceoffToLive,
  tkScenario,
  TK,
  waitPast,
  watchToasts,
} from "./tk-flows";

/** Above the bot's 15 s heartbeat (TK_TIMING.HEARTBEAT_MS), so a live bot never reads offline between beats. */
const GRACE_S = 25;
/** Above the TK-D7 and TK-D9 UI waits (up to TK.step each) that precede the sweep. */
const WINDOW_S = 60;

/**
 * T7 (TEST-PLAN 4.2), Blue the challenger: the timekeeper's phone goes dark
 * mid-match (the bot stops its heartbeats). With the offline grace and
 * window shortened (`tk_offline_grace` 25 s, `tk_offline_window` 60 s;
 * production 60 s and 10 minutes) and the match 10 minutes long, so full
 * time cannot come first: Blue sees TK-D7 then the TK-D9 countdown, the
 * athletes' state reads `presence = offline` with a `no_contest_at`, and the
 * sweep makes it a no contest `timekeeper_offline` (a drop-out,
 * `offline_live`), TK-NC2 on Blue.
 */
const scenario: Scenario = {
  id: "T7",
  tier: "timekeeper",
  title: "The timekeeper goes offline mid-match: TK-D7, TK-D9, no contest timekeeper_offline",
  needs: ["M3", "M4", "M8"],
  async run(ctx) {
    await tkScenario(ctx, { windows: { tk_offline_grace: GRACE_S, tk_offline_window: WINDOW_S } }, async (cast) => {
      const m = await tkBlueChallengesRed(ctx, cast);
      const side = await pickAndSeat(ctx, cast, m, cast.green, "red");
      await tkFaceoffToLive(ctx, cast, m, cast.green, side);
      side.stopHeartbeat();
      const offline = await ctx.step("the athletes' state reads the timekeeper offline", () =>
        pollUntil("presence offline with a no-contest time", async () => {
          const st = await m.red.state();
          return st?.presence === "offline" && st.noContestAt ? st : undefined;
        }, { timeoutMs: (GRACE_S + 30) * 1000, intervalMs: 2_000 }),
      );
      ctx.eq("db:offline-state", { presence: "offline", no_contest_at: true }, { presence: offline.presence, no_contest_at: !!offline.noContestAt });
      await ctx.expect("ui:timekeeper-offline-tk-d7", true, async () => {
        await cast.ui.waitLabel(TK_UI.offline(cast.green.me.displayName), TK.step);
        return true;
      });
      await expectChipCountsDown(ctx, cast, "ui:no-contest-countdown-tk-d9");
      const watch = watchToasts(ctx);
      await ctx.step("the offline window passes", () => waitPast(offline.noContestAt, 0));
      await ctx.step("the sweep makes it a no contest", () => sweepUntil(ctx, m, "cancelled timekeeper_offline", (r) => r.status === "cancelled"));
      await expectExitToast(ctx, watch, "exit-toast-tk-nc2", C["TK-NC2"](short(cast.green.me.displayName)));
      await checkNoContest(
        ctx,
        m,
        {
          reason: "timekeeper_offline",
          timekeeperId: cast.green.me.id,
          historyReason: "offline_live",
          dropOut: true,
          notified: [{ kind: "match_no_contest", recipients: [...m.athletes, cast.green.me.id] }],
        },
        cast.red,
      );
    });
  },
};
export default scenario;
