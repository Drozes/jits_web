import type { Scenario } from "../context";
import { checkLiveAfterExit, checkSummary, exitToArena } from "../flows";
import {
  checkTkDone,
  finishWithin,
  pickAndSeat,
  tkBothConfirm,
  tkEnd,
  tkFaceoffToLive,
  tkPauseResume,
  tkRecord,
  tkRedChallengesBlue,
  tkScenario,
} from "./tk-flows";

/**
 * T1, second run (TEST-PLAN 4.2: "challenger, opponent (two runs)"), Blue the
 * opponent: Red challenges, Blue accepts on the prompt (its app creates the
 * timekeeper match), Red's bot asks Green while Blue's picker follows it live
 * (TK-P20), Green starts, pauses and resumes (TK-D9 on Blue while paused;
 * T1 covers that on the challenger's device, this run on the opponent's),
 * ends, records a Red win, both confirm.
 */
const scenario: Scenario = {
  id: "T1B",
  tier: "timekeeper",
  title: "Timekeeper happy path, Blue accepts: Red picks Green, start, pause/resume, end, records a Red win, both confirm",
  needs: ["M2", "M3", "M4", "M5", "M8"],
  async run(ctx) {
    await tkScenario(ctx, { tab: "Home" }, async (cast) => {
      const m = await tkRedChallengesBlue(ctx, cast);
      const side = await pickAndSeat(ctx, cast, m, cast.green, "red", { pickerUi: true });
      await tkFaceoffToLive(ctx, cast, m, cast.green, side);
      await tkPauseResume(ctx, cast, m, side);
      const { finalElapsedS } = await tkEnd(ctx, m, side);
      const finish = finishWithin(finalElapsedS, 45);
      await tkRecord(ctx, cast, m, cast.green, side, { result: "submission", winnerId: ctx.ids.red, submissionCode: "rear_naked_choke", finishTimeSeconds: finish });
      await tkBothConfirm(ctx, m);
      await checkSummary(ctx, "YOU LOST", { matchId: m.matchId, stake: null });
      await checkTkDone(ctx, m, cast.green, side, { winner: ctx.ids.red, loser: ctx.ids.blue, code: "rear_naked_choke", finish });
      await exitToArena(ctx);
      await checkLiveAfterExit(ctx, cast.red);
    });
  },
};
export default scenario;
