import type { Scenario } from "../context";
import { db } from "../../oracle/db";
import { ToastWatch } from "../../oracle/ui";
import { APP_TIMING } from "../../bot/protocol";
import { pace, pollUntil } from "../../lib/util";
import { blueCancelsFromReady, blueOnWeight, checkToasts, prepare, T, toastPositiveControl } from "../flows";

/** How early the app may start relative to the accept, for sampling slack. */
const EARLY_SLACK_MS = 1_000;
/** How long past `ACCEPTED_FALLBACK_MS` the start may land ("within ~15s"). */
const LATE_SLACK_MS = 4_000;

/**
 * An accepter whose start never happened (use-arena-challenge.ts
 * `scheduleAcceptedFallback`): Red accepts Blue's challenge and stops, so the
 * row sits at `accepted`. Blue's app must NOT start on `accepted` right away
 * (the jits-njyd race), but must start the match itself once the row is still
 * `accepted` `ACCEPTED_FALLBACK_MS` later, and Red can then join that match.
 */
const scenario: Scenario = {
  id: "E20",
  tier: "extended",
  title: "Accepted but never started: Blue's app starts the match itself after the fallback and Red joins it",
  async run(ctx) {
    await prepare(ctx);
    const red = await ctx.bot("red");
    await red.goLive();
    await toastPositiveControl(ctx, red);

    await ctx.step("Blue challenges Demo Red", () => ctx.ui.challenge(ctx.cfg.names.red));
    await ctx.step("Blue sees the waiting plate", () => ctx.ui.waitWaitingPlate(ctx.cfg.names.red));
    const row = await ctx.step("Red receives the challenge", () => red.waitForIncoming(T.prompt, ctx.ids.blue));

    const toasts = new ToastWatch(ctx.idb);
    let matchId: string;
    try {
      const acceptedAt = await ctx.step("Red accepts but never starts the match", async () => {
        await red.acceptWithoutStart(row.id);
        return Date.now();
      });
      ctx.eq("db:challenge-accepted", "accepted", (await db.challenge(row.id))?.status);

      // No background idb load while the fallback timing is measured.
      toasts.pause();
      // Mid-way through the fallback window: nothing may have started it yet.
      await pace(5_000);
      const els = await ctx.idb.describe();
      ctx.eq(
        "app:holds-while-accepted",
        { status: "accepted", plate: true, step: null },
        {
          status: (await db.challenge(row.id))?.status,
          plate: els.some((e) => e.AXLabel === `Waiting for ${ctx.cfg.names.red}`),
          step: await ctx.ui.currentStep(els),
        },
      );

      const maxMs = APP_TIMING.ACCEPTED_FALLBACK_MS + LATE_SLACK_MS;
      const startedAfterMs = await ctx.step("Blue's app starts the match itself", () =>
        pollUntil(
          `challenge ${row.id} started by the challenger's fallback`,
          async () => ((await db.challenge(row.id))?.status === "started" ? Date.now() - acceptedAt : undefined),
          { timeoutMs: maxMs + 5_000, intervalMs: 250 },
        ),
      );
      toasts.resume();
      ctx.trace.note("harness", "fallback_start_observed_ms", {
        startedAfterMs,
        appFallbackMs: APP_TIMING.ACCEPTED_FALLBACK_MS,
        pollIntervalMs: 250,
      });
      ctx.oracle(
        "app:fallback-start-timing",
        startedAfterMs >= APP_TIMING.ACCEPTED_FALLBACK_MS - EARLY_SLACK_MS && startedAfterMs <= maxMs,
        { minMs: APP_TIMING.ACCEPTED_FALLBACK_MS - EARLY_SLACK_MS, maxMs },
        startedAfterMs,
      );
      await blueOnWeight(ctx);

      // Red learns it the way an accepter's app would: the realtime UPDATE.
      await ctx.expect("bot:red-sees-started-update", "started", async () => (await red.waitIncomingStatus(row.id, "started", T.db)).status);
      matchId = await ctx.step("Red joins the started match", () => red.joinStarted(row.id));
      const ms = await db.matchesForChallenge(row.id);
      ctx.eq("db:one-match-red-joined", [matchId], ms.map((m) => m.id));
      const parts = await db.participants(matchId);
      ctx.eq("db:match-is-blue-vs-red", [ctx.ids.blue, ctx.ids.red].sort(), parts.map((p) => p.athlete_id).sort());
      await checkToasts(ctx, toasts);
    } finally {
      await toasts.stop();
    }

    const side = await ctx.matchSide(red, matchId);
    await blueCancelsFromReady(ctx, side);
  },
};
export default scenario;
