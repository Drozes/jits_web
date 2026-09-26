import type { Scenario, ScenarioCtx } from "../context";
import {
  T,
  blueChallengesRed,
  blueEnds,
  blueOnWeight,
  blueRecordsSubmission,
  bothConfirm,
  checkDecisiveDb,
  exitToArena,
  prepare,
  readyToLive,
  stakesFor,
} from "../flows";
import { db } from "../../oracle/db";
import { waitLivePill } from "../../oracle/ui";
import { lit, queryJson } from "../../lib/psql";
import {
  clearUploadLedger,
  removeSeededVideo,
  seedMatchVideo,
  UPLOAD_DAILY_CAP,
  uploadBudgetUsed,
  VIDEO_BUCKET,
  type SeededVideo,
} from "../../lib/video-seed";
import { EnvError, ExpectationTimeout } from "../../lib/util";
import { MatchDetailPages, watchLabelFor } from "../../sim/match-detail";

/**
 * E17 (V-epic jits-5tj9.10): a finished match with one recording per athlete
 * is reachable from every mobile history surface, both recordings are
 * labelled by angle, and Demo Red's recording actually plays.
 *
 * The simulator is Demo Blue, so Blue's video reads "Your recording" and
 * Red's reads "Demo Red's recording". Videos are seeded through the
 * publishable key as each uploader (lib/video-seed.ts), then removed again.
 */
const scenario: Scenario = {
  id: "E17",
  tier: "extended",
  title: "Match video history: every history row opens match detail, both angles labelled, a recording plays",
  async run(ctx) {
    await prepare(ctx);
    const red = await ctx.bot("red");
    await red.goLive();
    const stakes = await stakesFor(red);
    const h = await blueChallengesRed(ctx, red);
    const side = await ctx.matchSide(red, h.matchId);
    await blueOnWeight(ctx);
    await readyToLive(ctx, side);
    await blueEnds(ctx, side);
    await blueRecordsSubmission(ctx, side, ctx.ids.blue, "armbar", "90");
    await bothConfirm(ctx, side);
    await checkDecisiveDb(ctx, {
      handshake: h,
      winner: ctx.ids.blue,
      loser: ctx.ids.red,
      winnerDelta: stakes.challenger_win,
      loserDelta: stakes.opponent_loss,
      code: "armbar",
      finish: 90,
      confirmations: 2,
    });
    await exitToArena(ctx);

    const seeds: SeededVideo[] = [];
    try {
      await runHistory(ctx, h.matchId, seeds);
    } finally {
      const problems: string[] = [];
      for (const s of seeds) problems.push(...(await removeSeededVideo(s).catch((e) => [String(e)])));
      // The upload ledger survives the row delete and caps uploads per 24h.
      problems.push(...(await clearUploadLedger(seeds.map((s) => s.videoId))));
      ctx.trace.note("harness", "video_seed_cleanup", { removed: seeds.map((s) => s.storagePath), problems });
      if (seeds.length > 0) ctx.eq("harness:seeded-videos-removed", [], problems);
    }
  },
};
export default scenario;

async function runHistory(ctx: ScenarioCtx, matchId: string, seeds: SeededVideo[]): Promise<void> {
  const redName = ctx.cfg.names.red;
  const pages = new MatchDetailPages(ctx.idb, ctx.ui);

  await ctx.step("seed Blue's and Red's recordings", async () => {
    const used = await uploadBudgetUsed([ctx.ids.blue, ctx.ids.red]);
    ctx.trace.note("harness", "video_upload_budget_used_24h", used);
    const spent = Object.entries(used).filter(([, n]) => n >= UPLOAD_DAILY_CAP);
    if (spent.length > 0) {
      throw new EnvError(
        `upload cap already spent (${UPLOAD_DAILY_CAP}/24h in public.video_upload_events) for ${spent
          .map(([id]) => (id === ctx.ids.blue ? "Demo Blue" : "Demo Red"))
          .join(", ")}: clear stale local ledger rows or wait for the window to roll`,
      );
    }
    seeds.push(await seedMatchVideo(ctx.cfg, ctx.password, "blue", matchId, ctx.ids.blue));
    seeds.push(await seedMatchVideo(ctx.cfg, ctx.password, "red", matchId, ctx.ids.red));
    ctx.trace.note("harness", "video_seeded", seeds.map(({ who, videoId, storagePath }) => ({ who, videoId, storagePath })));
  });
  const [blueVid, redVid] = seeds;

  const rows = await queryJson<{ uploaded_by: string; status: string }>(
    `select uploaded_by, status from public.match_videos where match_id = ${lit(matchId)} order by uploaded_by`,
  );
  ctx.eq(
    "db:video-rows",
    [ctx.ids.blue, ctx.ids.red].sort().map((id) => ({ uploaded_by: id, status: "ready" })),
    rows,
  );
  const objects = await queryJson<{ name: string }>(
    `select name from storage.objects where bucket_id = ${lit(VIDEO_BUCKET)}
     and name in (${seeds.map((s) => lit(s.storagePath)).join(", ")}) order by name`,
  );
  ctx.eq("db:video-objects", seeds.map((s) => s.storagePath).sort(), objects.map((o) => o.name));

  const ids = [blueVid.videoId, redVid.videoId];
  const expectedDetail = {
    opponent: redName,
    watch: { [blueVid.videoId]: watchLabelFor(null), [redVid.videoId]: watchLabelFor(redName) },
  };

  /** Open the detail from one entry point and check it is THIS match (both seeded Watch buttons). */
  const entry = (oracle: string, name: string, open: () => Promise<void>) =>
    ctx.step(name, () =>
      ctx.expect(oracle, expectedDetail, async () => {
        await open();
        return pages.readDetail(ids);
      }),
    );

  // 1. Home, "Me" scope.
  await entry("ui:detail-from-home", "detail from Home (Me scope)", () => pages.openFromHome(redName));
  await pages.backToTabRoot();

  // 2. Profile Recent Matches.
  await entry("ui:detail-from-profile", "detail from Profile recent matches", () => pages.openFromProfile(redName));
  await pages.backToTabRoot();

  // 3. Profile > View Detailed Stats > full history.
  await entry("ui:detail-from-stats", "detail from Stats history", () => pages.openFromStats(redName));
  await pages.backToTabRoot();

  // 4. Athlete head-to-head, reached on its own (Stats -> detail -> opponent row -> athlete page).
  await entry("ui:detail-from-athlete", "detail from Demo Red's head-to-head", () => pages.openFromAthlete(redName));
  await pages.backToTabRoot();

  // 5. Profile > Past Match Videos (pull-to-refresh first), then the player.
  const fromVideos = await entry("ui:detail-from-past-videos", "detail from Past Match Videos", () =>
    pages.openFromPastVideos(matchId),
  );

  if (fromVideos) {
    const view = await pages.readDetail(ids);
    ctx.eq(
      "ui:video-cards-labelled",
      [watchLabelFor(null), watchLabelFor(redName)],
      [view.watch[blueVid.videoId], view.watch[redVid.videoId]],
    );
    // A missed tap is recorded by ctx.step (ui:<step>) and by ui:player-loaded below; keep going to clean up.
    await ctx
      .step(`Blue taps ${watchLabelFor(redName)}`, () => pages.tapWatch(redVid.videoId, watchLabelFor(redName)))
      .catch((e) => {
        if (!(e instanceof ExpectationTimeout)) throw e;
      });
    const state = await pages.waitPlayerState("loaded", 20_000);
    ctx.eq("ui:player-loaded", "loaded", state);
    ctx.eq("ui:no-error-panel", [], await pages.playerErrorPanels());
  } else {
    ctx.skip("ui:player-loaded", "the detail screen from Past Match Videos did not load, so Watch was not reachable");
    ctx.skip("ui:no-error-panel", "the detail screen from Past Match Videos did not load, so Watch was not reachable");
  }

  await ctx.step("Blue backs out to the Arena", async () => {
    await pages.backToTabRoot();
    await ctx.ui.openArena();
  });
  // Browsing history is a plain pushed screen: it must not change live state.
  await ctx.expect("db:blue-still-live-after-history", true, () => db.waitLooking(ctx.ids.blue, true, T.db));
  ctx.eq("ui:live-pill-after-history", true, await waitLivePill(ctx.ui, true, 10_000));
}
