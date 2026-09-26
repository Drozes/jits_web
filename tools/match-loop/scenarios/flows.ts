/**
 * Building blocks shared by scenarios. Each wraps one user-visible beat in a
 * ctx.step (so it gets a screenshot and a timing) and records oracles.
 */
import { getEloStakes } from "@jits/shared/api/queries";
import type { EloStakes } from "@jits/shared/types/composites";
import type { MobileOpponent } from "../bot/opponent";
import type { MatchSide, ReadyOutcome } from "../bot/match-side";
import { db } from "../oracle/db";
import { parseDelta, waitLivePill } from "../oracle/ui";
import { resetFixtures, type ResetOptions } from "../fixtures/reset";
import { proveAppOnLocalStack } from "../bot/app-on-local";
import { ExpectationTimeout, HarnessError, pollUntil } from "../lib/util";
import type { ScenarioCtx } from "./context";

export const T = {
  prompt: 20_000,
  step: 25_000,
  handshake: 45_000,
  broadcast: 20_000,
  db: 15_000,
};

// --- setup --------------------------------------------------------------------

export interface PrepareOptions extends ResetOptions {
  blueLive?: boolean;
  tab?: "Arena" | "Home" | "Rankings" | "Profile";
}

/** Reset fixtures and put the app into a known idle state on a tab. */
export async function prepare(ctx: ScenarioCtx, opts: PrepareOptions = {}): Promise<void> {
  const { blueLive = true, tab = "Arena" } = opts;
  await ctx.step("reset fixtures", async () => {
    const out = await resetFixtures(ctx.ids, opts);
    ctx.trace.note("harness", "reset", out);
  });
  await ctx.step("normalise app", () => normaliseApp(ctx));
  await ctx.step("app is on the local stack (app:online)", () =>
    proveAppOnLocalStack(ctx.cfg, ctx.ids, ctx.password),
  );
  await ctx.step(`Blue ${blueLive ? "live" : "offline"} on the Arena`, async () => {
    await ctx.ui.openArena();
    if (blueLive) await ctx.ui.ensureLive();
    else await ctx.ui.ensureOffline();
  });
  if (tab !== "Arena") await ctx.step(`Blue on the ${tab} tab`, () => ctx.ui.tab(tab));
}

/**
 * Leave whatever the last scenario left on screen: a wizard, a stale prompt,
 * a waiting plate, an alert. Relaunch as a last resort.
 */
export async function normaliseApp(ctx: ScenarioCtx): Promise<void> {
  const { idb, ui, simctl } = ctx;
  await idb.dismissSystemAlerts();
  await idb.dismissLogBox();
  for (let attempt = 0; attempt < 3; attempt++) {
    const els = await idb.describe();
    const app = els.find((e) => e.type === "Application");
    if (!app || app.AXLabel !== "ELO RATED") {
      await simctl.launch();
      await idb.waitFor({ label: "Home", type: "Button" }, 30_000).catch(() => undefined);
      continue;
    }
    const exit = els.find((e) => e.AXUniqueId === "summary-exit" || e.AXUniqueId === "wizard-error-exit");
    if (exit) {
      await idb.tap(exit);
      await new Promise((r) => setTimeout(r, 800));
      continue;
    }
    if (await ui.currentStep(els)) {
      // A wizard for a match the reset just cancelled: nothing to tap out of.
      await simctl.terminate();
      await simctl.launch();
      await idb.waitFor({ label: "Home", type: "Button" }, 30_000);
      continue;
    }
    if (await ui.isPromptVisible(els)) {
      // Reset cancelled the challenge; the UPDATE listener should dismiss it.
      try {
        await ui.waitPromptGone(6_000);
      } catch {
        await ui.declinePrompt();
      }
      continue;
    }
    const waiting = els.find((e) => e.type === "StaticText" && /^Waiting for /.test(e.AXLabel ?? ""));
    if (waiting) {
      // A leftover outgoing challenge. Cancel it; if the plate is stuck (an
      // expired challenge cannot be cancelled, H9), relaunch the app.
      const cancel = els.find((e) => e.AXLabel === "Cancel challenge");
      if (cancel) await idb.tap(cancel);
      try {
        await idb.waitGone({ label: waiting.AXLabel ?? "", type: "StaticText" }, 4_000);
      } catch {
        ctx.trace.note("harness", "stuck_waiting_plate_relaunch", waiting.AXLabel);
        await simctl.terminate();
        await simctl.launch();
        await idb.waitFor({ label: "Home", type: "Button" }, 30_000);
      }
      continue;
    }
    if (els.some((e) => e.AXLabel === "Go back" && e.type === "Button") && !els.some((e) => e.AXLabel === "Arena" && e.type === "Button")) {
      await idb.tap(els.find((e) => e.AXLabel === "Go back")!);
      continue;
    }
    if (els.some((e) => e.type === "Button" && e.AXLabel === "Arena")) return;
    await simctl.launch();
    await idb.waitFor({ label: "Home", type: "Button" }, 30_000).catch(() => undefined);
  }
  await idb.waitFor({ label: "Arena", type: "Button" }, 10_000);
}

export async function stakesFor(red: MobileOpponent, challengerElo = 1000, opponentElo = 1000, cw = 170, ow = 170): Promise<EloStakes> {
  const s = await getEloStakes(red.client, challengerElo, opponentElo, cw, ow);
  if (!s) throw new HarnessError("calculate_elo_stakes returned nothing");
  return s;
}

// --- handshake ------------------------------------------------------------------

export interface Handshake {
  challengeId: string;
  matchId: string;
}

/** Blue taps Challenge on Red, Red's bot accepts. */
export async function blueChallengesRed(ctx: ScenarioCtx, red: MobileOpponent): Promise<Handshake> {
  const since = new Date(Date.now() - 2_000).toISOString();
  await ctx.step("Blue challenges Demo Red", () => ctx.ui.challenge(ctx.cfg.names.red));
  await ctx.step("Blue sees the waiting plate", () => ctx.ui.waitWaitingPlate(ctx.cfg.names.red));
  const row = await ctx.step("Red receives the challenge", () => red.waitForIncoming(T.prompt, ctx.ids.blue));
  const dbRow = await db.latestChallenge(ctx.ids.blue, ctx.ids.red, since);
  ctx.eq("db:challenge-created", { id: row.id, status: "pending", match_type: "ranked" }, dbRow && { id: dbRow.id, status: dbRow.status, match_type: dbRow.match_type });
  const matchId = await ctx.step("Red accepts", async () => {
    await new Promise((r) => setTimeout(r, ctx.opts.timing === "human" ? 1500 : 50));
    return red.accept(row.id);
  });
  return { challengeId: row.id, matchId };
}

/** Red's bot challenges Blue; waits for Blue's app-wide prompt. */
export async function redChallengesBlue(ctx: ScenarioCtx, red: MobileOpponent): Promise<string> {
  const id = await ctx.step("Red challenges Blue", () => red.challenge(ctx.ids.blue));
  await ctx.step("Blue sees the incoming prompt", () => ctx.ui.waitPrompt(T.prompt));
  return id;
}

/** Blue accepts the prompt; Red's side must be told the match exists. */
export async function blueAccepts(ctx: ScenarioCtx, red: MobileOpponent, challengeId: string): Promise<Handshake> {
  await ctx.step("Blue accepts", () => ctx.ui.acceptPrompt());
  const outcome = await ctx.step("Red is told the match started", () => red.waitOutgoingOutcome(T.prompt));
  if (outcome.kind !== "match_started") {
    ctx.eq("bot:challenger-lands-in-match", "match_started", outcome.kind);
    throw new ExpectationTimeout("match_started for the challenger", T.prompt, outcome);
  }
  // The challenger's app takes whichever lands first: the accepted-status
  // UPDATE (recovery path) usually beats the broadcast. Both must agree.
  const ms = await db.matchesForChallenge(challengeId);
  ctx.eq("bot:challenger-lands-in-the-db-match", [outcome.matchId], ms.map((m) => m.id));
  ctx.trace.note("harness", "challenger_path", outcome.via);
  await ctx.expect("bot:match_started-broadcast-received", outcome.matchId, async () => {
    const ev = await red.events.waitFor(
      "match_started broadcast",
      (e) => e.kind === "match_started" && e.challengeId === challengeId,
      8_000,
      0, // filtered by challenge id
    );
    return (ev as { matchId: string }).matchId;
  });
  return { challengeId, matchId: outcome.matchId };
}

// --- in-match live/offline --------------------------------------------------------

const BLUE_IN_LOBBY_BEFORE_MATCH = "presence:blue-in-lobby-before-match";

/**
 * Before the challenge: Red's lobby observer must see live Blue in
 * `lobby:online`. Without it "Blue left the lobby" passes vacuously when Blue
 * was never there (jits-fa9x: the server closed Blue's lobby channel on a
 * presence rate limit and the app never rejoined).
 */
export async function checkBlueInLobbyBeforeMatch(ctx: ScenarioCtx, red: MobileOpponent): Promise<void> {
  await ctx.expect(BLUE_IN_LOBBY_BEFORE_MATCH, true, async () => {
    await red.waitLobby(ctx.ids.blue, true, T.db);
    return true;
  });
}

/**
 * Blue must be offline for the whole match: flag, pill and presence. Requires
 * `checkBlueInLobbyBeforeMatch` earlier in the scenario, so the presence
 * oracle here is never vacuous.
 */
export async function checkOfflineInMatch(ctx: ScenarioCtx, red: MobileOpponent): Promise<void> {
  if (!ctx.oracles.some((o) => o.id === BLUE_IN_LOBBY_BEFORE_MATCH)) {
    throw new HarnessError(`checkOfflineInMatch needs ${BLUE_IN_LOBBY_BEFORE_MATCH} recorded before the match starts`);
  }
  await ctx.expect("db:blue-offline-in-match", true, () => db.waitLooking(ctx.ids.blue, false, T.db));
  ctx.eq("ui:no-live-pill-in-match", false, await waitLivePill(ctx.ui, false, 8_000));
  await ctx.expect("presence:blue-left-lobby-in-match", true, async () => {
    await red.waitLobby(ctx.ids.blue, false, T.db);
    return true;
  });
}

/** After leaving the match, Blue is live again. */
export async function checkLiveAfterExit(ctx: ScenarioCtx, red: MobileOpponent): Promise<void> {
  await ctx.expect("db:blue-live-after-match", true, () => db.waitLooking(ctx.ids.blue, true, T.db));
  ctx.eq("ui:live-pill-after-match", true, await waitLivePill(ctx.ui, true, 10_000));
  await ctx.expect("presence:blue-back-in-lobby", true, async () => {
    await red.waitLobby(ctx.ids.blue, true, T.db);
    return true;
  });
}

// --- wizard -----------------------------------------------------------------------

export async function blueOnWeight(ctx: ScenarioCtx): Promise<void> {
  await ctx.step("Blue lands on the weight step", () => ctx.ui.waitStep("weight", T.step));
}

/** Both confirm weights and ready up; returns the bot's view of the start. */
export async function readyToLive(ctx: ScenarioCtx, side: MatchSide): Promise<ReadyOutcome> {
  const botRun = side.confirmWeights().then(() => side.readyAndStart(T.handshake));
  await ctx.step("Blue confirms weights", async () => {
    await ctx.ui.confirmWeights();
    await ctx.ui.waitStep("ready", T.step);
  });
  await ctx.step("Blue taps Ready", () => ctx.ui.tapReady());
  const [outcome] = await Promise.all([
    ctx.step("bot completes the ready handshake", () => botRun),
    ctx.step("Blue reaches the live step", () => ctx.ui.waitStep("live", T.handshake)),
  ]);
  const m = await db.match(side.matchId);
  ctx.eq("db:match-in-progress", { status: "in_progress", started: true }, { status: m?.status, started: !!m?.started_at });
  return outcome;
}

/** Blue taps End; the bot must receive match_ended in its live step. */
export async function blueEnds(ctx: ScenarioCtx, side: MatchSide): Promise<void> {
  await ctx.step("Blue ends the match", () => ctx.ui.endMatch());
  await Promise.all([
    ctx.step("bot receives match_ended", () => side.waitForEnd(T.broadcast)),
    ctx.step("Blue reaches the result step", () => ctx.ui.waitStep("result", T.step)),
  ]);
}

export async function blueRecordsSubmission(ctx: ScenarioCtx, side: MatchSide, winnerId: string, code = "armbar", finish = "90"): Promise<void> {
  const botWait = side.waitForResult(T.handshake);
  await ctx.step("Blue records a submission", () => ctx.ui.recordSubmission(winnerId, code, finish));
  await Promise.all([
    ctx.step("Blue reaches the confirm step", () => ctx.ui.waitStep("confirm", T.step)),
    ctx.step("bot receives result_submitted", () => botWait),
  ]);
}

export async function blueRecordsDraw(ctx: ScenarioCtx, side: MatchSide): Promise<void> {
  const botWait = side.waitForResult(T.handshake);
  await ctx.step("Blue records a draw", () => ctx.ui.recordDraw());
  await Promise.all([
    ctx.step("Blue reaches the confirm step", () => ctx.ui.waitStep("confirm", T.step)),
    ctx.step("bot receives result_submitted", () => botWait),
  ]);
}

/**
 * Both confirm; Blue must reach the summary and the bot's confirm step must
 * finish as the app's would (Blue's result_confirmed, or the DB showing both
 * confirmations; never a bare `completed` row).
 */
export async function bothConfirm(
  ctx: ScenarioCtx,
  side: MatchSide,
  /** "informational" where a relaunch or outage may legitimately lose the
   * broadcast (E7); everywhere else the confirm channel must receive it. */
  channelCheck: "hard" | "informational" = "hard",
): Promise<void> {
  const botRun = (async () => {
    await side.confirm();
    return side.waitConfirmDone(T.handshake);
  })();
  botRun.catch(() => undefined); // awaited below; never an unhandled rejection
  await ctx.step("Blue confirms", () => ctx.ui.confirmResult());
  const [outcome] = await Promise.all([
    ctx.step("bot sees Blue's confirmation", () => botRun),
    ctx.step("Blue reaches the summary", () => ctx.ui.waitStep("summary", T.handshake)),
  ]);
  ctx.eq("bot:confirm-step-outcome", "confirmed", outcome.kind);
  ctx.trace.note("harness", "bot_confirm_via", outcome.via);
  // The DB reconciler can finish the bot's confirm step on its own, so check
  // separately that Blue's app actually broadcast its confirmation.
  await ctx.expect("protocol:blue-sent-result_confirmed", true, async () => {
    await side.spy.waitFor(
      "Blue's result_confirmed",
      (e) => e.event === "result_confirmed" && e.payload.athlete_id === ctx.ids.blue,
      8_000,
      0, // one MatchSide per match
    );
    return true;
  });
  const received = side.confirmReceivedOnChannel();
  if (channelCheck === "hard") ctx.eq("bot:confirm-channel-received-blue-result_confirmed", true, received);
  else ctx.oracle("bot:confirm-channel-received-blue-result_confirmed", true, "informational", received, `bot finished confirm via ${outcome.via}`);
}

export async function checkSummary(ctx: ScenarioCtx, verdict: string, delta: number | null): Promise<void> {
  const s = await pollUntil(
    "summary verdict",
    async () => {
      const v = await ctx.ui.readSummary();
      return v.verdict ? v : undefined;
    },
    { timeoutMs: 8_000 },
  ).catch(() => ctx.ui.readSummary());
  ctx.eq("ui:summary-verdict", verdict, s.verdict?.toUpperCase() ?? null);
  if (delta !== null) {
    // The delta renders once the refresh lands; give it a moment.
    const d = await pollUntil("summary elo delta", async () => parseDelta((await ctx.ui.readSummary()).eloDelta) ?? undefined, { timeoutMs: 8_000 }).catch(() => null);
    ctx.eq("ui:summary-elo-delta", delta, d);
  }
  ctx.eq("ui:summary-exit-visible", true, s.hasExit);
}

export async function exitToArena(ctx: ScenarioCtx): Promise<void> {
  await ctx.step("Blue taps Back to Arena", async () => {
    await ctx.ui.exitSummary();
    await ctx.idb.waitAny([{ label: "Go live", type: "Button" }, { label: "Go offline", type: "Button" }], T.step);
  });
}

// --- DB oracles ---------------------------------------------------------------------

export interface DecisiveExpectation {
  handshake: Handshake;
  winner: string;
  loser: string;
  winnerDelta: number;
  loserDelta: number;
  code: string;
  finish: number;
  confirmations: number;
}

/** Everything that must be true in the DB after a recorded submission. */
export async function checkDecisiveDb(ctx: ScenarioCtx, x: DecisiveExpectation): Promise<void> {
  const { matchId, challengeId } = x.handshake;
  const ch = await db.challenge(challengeId);
  ctx.eq("db:challenge-started", "started", ch?.status);
  const ms = await db.matchesForChallenge(challengeId);
  ctx.eq("db:one-match-per-challenge", 1, ms.length);
  const m = await db.match(matchId);
  ctx.eq("db:match-completed", { status: "completed", result: "submission" }, { status: m?.status, result: m?.result });
  const sub = await db.submission(matchId);
  ctx.eq("db:submission-row", { winner_id: x.winner, loser_id: x.loser, code: x.code, finish_time_seconds: x.finish }, sub);
  const parts = await db.participants(matchId);
  const w = parts.find((p) => p.athlete_id === x.winner);
  const l = parts.find((p) => p.athlete_id === x.loser);
  ctx.eq(
    "db:participants",
    [
      { outcome: "win", elo_before: 1000, elo_after: 1000 + x.winnerDelta, gap: 0 },
      { outcome: "loss", elo_before: 1000, elo_after: 1000 + x.loserDelta, gap: 0 },
    ],
    [
      { outcome: w?.outcome, elo_before: w?.elo_before, elo_after: w?.elo_after, gap: w?.weight_division_gap },
      { outcome: l?.outcome, elo_before: l?.elo_before, elo_after: l?.elo_after, gap: l?.weight_division_gap },
    ],
  );
  const hist = await db.eloHistory(matchId);
  ctx.eq("db:elo-history-rows", 2, hist.length);
  const wa = await db.athlete(x.winner);
  const la = await db.athlete(x.loser);
  ctx.eq("db:current-elo-updated", [1000 + x.winnerDelta, 1000 + x.loserDelta], [wa?.current_elo, la?.current_elo]);
  const conf = await pollUntil(
    `${x.confirmations} confirmations`,
    async () => {
      const c = await db.confirmations(matchId);
      return c.length >= x.confirmations ? c : undefined;
    },
    { timeoutMs: 8_000 },
  ).catch(async () => db.confirmations(matchId));
  ctx.eq("db:confirmations", x.confirmations, conf.length);
}

export async function checkDrawDb(ctx: ScenarioCtx, h: Handshake, delta: number): Promise<void> {
  const m = await db.match(h.matchId);
  ctx.eq("db:match-completed-draw", { status: "completed", result: "draw" }, { status: m?.status, result: m?.result });
  const parts = await db.participants(h.matchId);
  ctx.eq(
    "db:draw-participants",
    [
      { outcome: "draw", elo_after: 1000 + delta },
      { outcome: "draw", elo_after: 1000 + delta },
    ],
    parts.map((p) => ({ outcome: p.outcome, elo_after: p.elo_after })),
  );
  const hist = await db.eloHistory(h.matchId);
  ctx.eq("db:elo-history-rows", 2, hist.length);
  const conf = await pollUntil(
    "2 confirmations",
    async () => {
      const c = await db.confirmations(h.matchId);
      return c.length >= 2 ? c : undefined;
    },
    { timeoutMs: 8_000 },
  ).catch(async () => db.confirmations(h.matchId));
  ctx.eq("db:confirmations", 2, conf.length);
}

/** Abort: cancelled, never started, no ELO movement. */
export async function checkAbortDb(ctx: ScenarioCtx, h: Handshake): Promise<void> {
  const m = await db.waitMatchStatus(h.matchId, ["cancelled"], T.db).catch(() => db.match(h.matchId));
  ctx.eq("db:match-cancelled", { status: "cancelled", started_at: null }, { status: m?.status, started_at: m?.started_at });
  const hist = await db.eloHistory(h.matchId);
  ctx.eq("db:no-elo-history", 0, hist.length);
  const b = await db.athlete(ctx.ids.blue);
  const r = await db.athlete(ctx.ids.red);
  ctx.eq("db:elo-unchanged", [1000, 1000], [b?.current_elo, r?.current_elo]);
}

/** Blue records a draw from the result step, both confirm, back to Arena. */
export async function finishWithDraw(ctx: ScenarioCtx, side: MatchSide): Promise<void> {
  await blueRecordsDraw(ctx, side);
  await bothConfirm(ctx, side);
  await exitToArena(ctx);
}

/** Standard opening: Blue challenges Red, both reach live. */
export async function openToLive(ctx: ScenarioCtx, red: MobileOpponent): Promise<{ h: Handshake; side: MatchSide; started: ReadyOutcome }> {
  const h = await blueChallengesRed(ctx, red);
  const side = await ctx.matchSide(red, h.matchId);
  await blueOnWeight(ctx);
  const started = await readyToLive(ctx, side);
  return { h, side, started };
}
