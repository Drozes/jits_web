import type { Scenario } from "../context";
import { checkLiveAfterExit, checkSummary, exitToArena } from "../flows";
import {
  checkTkDone,
  finishWithin,
  pickAndSeat,
  tkBlueChallengesRed,
  tkBothConfirm,
  tkEnd,
  tkFaceoffToLive,
  tkPauseResume,
  tkRecord,
  tkScenario,
} from "./tk-flows";

/**
 * T1 (TEST-PLAN 4.2), Blue the challenger: Blue picks Green on the picker,
 * Green (a bot) accepts and is seated, weigh-in and the timekeeper's verdicts,
 * both ready, Green starts, pauses and resumes, ends, records a Blue win, both
 * athletes confirm. Expected: the verdict on Blue, the rating applied once,
 * and the timekeeper's done state in the DB.
 */
const scenario: Scenario = {
  id: "T1",
  tier: "timekeeper",
  title: "Timekeeper happy path, Blue challenges: Blue picks Green, verdicts, ready, start, pause/resume, end, record, both confirm",
  needs: ["M2", "M3", "M4", "M5", "M8"],
  async run(ctx) {
    await tkScenario(ctx, {}, async (cast) => {
      const m = await tkBlueChallengesRed(ctx, cast);
      const side = await pickAndSeat(ctx, cast, m, cast.green, "blue");
      await tkFaceoffToLive(ctx, cast, m, cast.green, side);
      await tkPauseResume(ctx, cast, m, side);
      const { finalElapsedS } = await tkEnd(ctx, m, side);
      const finish = finishWithin(finalElapsedS);
      await tkRecord(ctx, cast, m, cast.green, side, { result: "submission", winnerId: ctx.ids.blue, submissionCode: "armbar", finishTimeSeconds: finish });
      await tkBothConfirm(ctx, m);
      await checkSummary(ctx, "YOU WON", { matchId: m.matchId, stake: null });
      await checkTkDone(ctx, m, cast.green, side, { winner: ctx.ids.blue, loser: ctx.ids.red, code: "armbar", finish });
      await exitToArena(ctx);
      await checkLiveAfterExit(ctx, cast.red);
    });
  },
};
export default scenario;
