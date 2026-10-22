import type { Scenario, ScenarioCtx } from "../context";
import { TIMEKEEPER_CAP } from "../../bot/opponent";
import { readFlags, TK_ROLE_FLAG, withFlags } from "../../fixtures/timekeeper";
import { onInterrupt } from "../../lib/cleanup";
import { tkDb } from "../../oracle/tk-db";
import { db } from "../../oracle/db";
import { TK_UI } from "../../sim/timekeeper-screens";
import {
  blueChallengesRed,
  blueEnds,
  blueOnWeight,
  blueRecordsSubmission,
  bothConfirm,
  checkBlueInLobbyBeforeMatch,
  checkDecisiveDb,
  checkLiveAfterExit,
  checkOfflineInMatch,
  checkSummary,
  exitToArena,
  prepare,
  readyToLive,
  relaunch,
  stakesFor,
  T,
} from "../flows";
import { integratedSlices, type MobileSlice } from "./integration";

/**
 * The app side of the flag (slice M6): with `timekeeper_role` known ON the
 * Arena draws TK-AR2 under Blue's waiting strip. It is copy only (spec 4.2,
 * `use-timekeeper-enabled.ts`): the match a mixed pair creates is still
 * flag OFF, which the rest of T11 asserts. Read while the waiting plate is
 * up, before Red accepts.
 */
async function checkArenaReadsFlagOn(ctx: ScenarioCtx, slices: ReadonlySet<MobileSlice>): Promise<void> {
  const id = "ui:arena-waiting-helper-tk-ar2";
  if (!slices.has("M6")) {
    ctx.skip(id, "slice M6 (the Arena's timekeeper copy) is not in this build");
    return;
  }
  await ctx.expect(id, true, async () => {
    await ctx.idb.waitFor({ label: TK_UI.arenaWaitingHelper }, T.step);
    return true;
  });
}

/** C1 with a capability-mixed pair, the flag held ON by the caller. */
async function mixedPairC1(ctx: ScenarioCtx, slices: ReadonlySet<MobileSlice>): Promise<void> {
  // The app reads the flag on mount and on foreground only (M6's
  // useTimekeeperEnabled): close it, so prepare launches it with the flag ON.
  await ctx.step("close the app so it reads timekeeper_role ON at launch", () => ctx.simctl.terminate());
  await prepare(ctx);
  const appCapable = slices.has("M8");
  const red = await ctx.bot("red", appCapable ? {} : { capabilities: [TIMEKEEPER_CAP] });
  ctx.trace.note("harness", "capability_mix", { app: appCapable, bot: red.timekeeperCapable });
  await red.goLive();
  await checkBlueInLobbyBeforeMatch(ctx, red);
  const stakes = await stakesFor(ctx, red);
  const h = await blueChallengesRed(ctx, red, {
    wrap: async (accept) => {
      await checkArenaReadsFlagOn(ctx, slices);
      return accept();
    },
  });
  ctx.eq("env:timekeeper-role-on-at-creation", true, (await readFlags([TK_ROLE_FLAG]))[TK_ROLE_FLAG]);
  const caps = await tkDb.challengeCaps(h.challengeId);
  ctx.eq("db:challenge-capability-mixed", { challenger_tk_capable: appCapable, opponent_tk_capable: !appCapable }, caps);
  const m = await tkDb.match(h.matchId);
  ctx.eq("db:match-is-flag-off", { requires_timekeeper: false, tk_weight_check_required: false, timekeeper_deadline_at: null }, {
    requires_timekeeper: m?.requires_timekeeper,
    tk_weight_check_required: m?.tk_weight_check_required,
    timekeeper_deadline_at: m?.timekeeper_deadline_at ?? null,
  });
  const side = await ctx.matchSide(red, h.matchId);
  await blueOnWeight(ctx);
  await checkOfflineInMatch(ctx, red);
  await readyToLive(ctx, side);
  await blueEnds(ctx, side);
  await blueRecordsSubmission(ctx, side, ctx.ids.blue, "armbar", "90");
  await bothConfirm(ctx, side);
  await checkSummary(ctx, "YOU WON", { matchId: h.matchId, stake: stakes?.challenger_win ?? null });
  await checkDecisiveDb(ctx, {
    handshake: h,
    winner: ctx.ids.blue,
    loser: ctx.ids.red,
    winnerDelta: stakes?.challenger_win ?? null,
    loserDelta: stakes?.opponent_loss ?? null,
    code: "armbar",
    finish: 90,
    confirmations: 2,
  });
  ctx.eq("db:no-timekeeper-requests", 0, (await tkDb.requests(h.matchId)).length);
  ctx.eq("db:two-participants-no-timekeeper", 2, (await db.participants(h.matchId)).length);
  await exitToArena(ctx);
  await checkLiveAfterExit(ctx, red);
}

/**
 * T11 (TEST-PLAN 4.2 and 4.1): a capability-MIXED pair with `timekeeper_role`
 * ON must run the flag-OFF flow end to end, with every C1 assertion (C1's
 * own blocks, `db:challenge-created` included). One side sends the
 * capability header and the other does not, so the match snapshots
 * `requires_timekeeper = false` (jr_be 024 3.4). Which side lacks it depends
 * on the build: before slice M8 the app sends no header, so Red's bot sends
 * it; from M8 on the app sends it, so Red's bot does not. Either way the pair
 * is mixed.
 *
 * The flag is held ON for the whole scenario, from before the app launches
 * to the exit, so Blue's app sees it too: the Arena's copy follows the flag
 * (TK-AR2, asserted once slice M6 is in) while the flow stays flag OFF. The
 * app is relaunched afterwards so the next scenario starts on the flag as it
 * is then. The run-level `--tk-flag-on` covers the flag-OFF tiers the same
 * way.
 */
const scenario: Scenario = {
  id: "T11",
  tier: "timekeeper",
  title: "Capability-mixed pair with the flag ON: the flag-OFF flow end to end (C1 assertions)",
  async run(ctx) {
    const slices = integratedSlices();
    const note = (what: string, payload: unknown) => ctx.trace.note("harness", what, payload);
    // On Ctrl-C or SIGTERM the cleanup hooks run in the order they were
    // registered: the window's flag put-back first, then this one,
    // registered inside the window, which closes the app so it does not keep
    // the ON it read (M7 review). It stays until the relaunch below.
    let unhookAppClose: () => void = () => undefined;
    try {
      await withFlags(
        { [TK_ROLE_FLAG]: true },
        () => {
          unhookAppClose = onInterrupt("t11-app-close", () => ctx.simctl.terminate());
          return mixedPairC1(ctx, slices);
        },
        note,
      );
    } finally {
      // The app keeps the value it last read until it launches or
      // foregrounds again; setup only, never an oracle.
      await relaunch(ctx, "t11_app_rereads_the_flag", { after: "timekeeper_role window" }).catch((e: unknown) =>
        note("t11_relaunch_after_failed", e instanceof Error ? e.message : String(e)),
      );
      unhookAppClose();
    }
  },
};
export default scenario;
