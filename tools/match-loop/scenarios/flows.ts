/**
 * Building blocks shared by scenarios. Each wraps one user-visible beat in a
 * ctx.step (so it gets a screenshot and a timing) and records oracles.
 */
import { getEloStakes } from "@jits/shared/api/queries";
import type { EloStakes } from "@jits/shared/types/composites";
import type { MobileOpponent } from "../bot/opponent";
import type { MatchSide, ReadyOutcome } from "../bot/match-side";
import { db, type ChallengeDb, type MatchDb, type ParticipantDb } from "../oracle/db";
import { parseDelta, ToastWatch, waitLivePill } from "../oracle/ui";
import { resetFixtures, type ResetOptions } from "../fixtures/reset";
import { proveAppOnLocalStack } from "../bot/app-on-local";
import { APP_TIMING } from "../bot/protocol";
import { ExpectationTimeout, HarnessError, pollUntil } from "../lib/util";
import { matches, summarise } from "../sim/idb";
import { GO_BACK } from "../sim/screens";
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
 * a waiting plate, an alert, pushed screens. Relaunch as a last resort,
 * including when no case could bring back the tab bar (E18 to E20 on
 * 2026-10-20 each failed in setup on the match detail E17 had stranded).
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
    if (await ui.dropPendingInvite(els)) {
      // A pending invite a killed T17 left on the device (every cold launch
      // opens the claim screen until it is dropped); Not now drops it. Never
      // seen on a clean device: the case is a no-op for the flag-OFF tiers.
      ctx.trace.note("harness", "pending_invite_dropped", null);
      continue;
    }
    if (els.some((e) => matches(e, GO_BACK)) && !els.some((e) => e.AXLabel === "Arena" && e.type === "Button")) {
      // Pushed screens (match detail, Stats, an athlete page, the player):
      // pop them all. A back control the match detail hero scrolled away is
      // scrolled back into reach first; one that cannot be is relaunched.
      try {
        await ui.backToTabRoot();
      } catch (e) {
        if (!(e instanceof ExpectationTimeout)) throw e;
        await relaunch(ctx, "stuck_pushed_screen_relaunch", { what: e.what, lastSeen: e.lastSeen });
      }
      continue;
    }
    if (els.some((e) => e.type === "Button" && e.AXLabel === "Arena")) return;
    await simctl.launch();
    await idb.waitFor({ label: "Home", type: "Button" }, 30_000).catch(() => undefined);
  }
  const last = await idb.describe();
  if (!last.some((e) => e.type === "Button" && e.AXLabel === "Arena")) {
    // The last resort: a screen none of the cases above could leave.
    await relaunch(ctx, "normalise_last_resort_relaunch", summarise(last));
  }
  await idb.waitFor({ label: "Arena", type: "Button" }, 10_000);
}

/** Terminate and relaunch the app, noting why in the trace (setup only, never to pass an oracle). */
export async function relaunch(ctx: ScenarioCtx, why: string, evidence: unknown): Promise<void> {
  ctx.trace.note("harness", why, evidence);
  await ctx.simctl.terminate();
  await ctx.simctl.launch();
  await ctx.idb.waitFor({ label: "Home", type: "Button" }, 30_000);
}

/** The rating every fixture athlete starts a scenario at (`resetFixtures`). */
export const FIXTURE_ELO = 1000;

/** Why a stakes oracle was skipped. */
export const STAKES_UNAVAILABLE =
  "calculate_elo_stakes returned nothing (Rating V9 made it a stub that returns NULL; stakes leave the app in both modes, decision O1)";

/**
 * The pre-match stakes preview (challenger's perspective), or null. Stakes
 * are INFORMATIONAL only: Rating V9 (jr_be 20261013100200) turned
 * `calculate_elo_stakes` into a stub that returns NULL, and decision O1
 * removes stakes and every Elo hint from the app in both modes. So nothing
 * waits or gates on them: an oracle compares a stake only when this
 * returned one (`stakeOracle`); the rating a match actually moved is read
 * from the database instead (`checkRatingMoved`, `checkSummary`).
 */
export async function stakesFor(
  ctx: ScenarioCtx,
  red: MobileOpponent,
  challengerElo = FIXTURE_ELO,
  opponentElo = FIXTURE_ELO,
  cw = 170,
  ow = 170,
): Promise<EloStakes | null> {
  let s: EloStakes | null = null;
  try {
    s = await getEloStakes(red.client, challengerElo, opponentElo, cw, ow);
  } catch (e) {
    ctx.trace.note("harness", "stakes_error", e instanceof Error ? e.message : String(e));
  }
  if (!s) ctx.trace.note("harness", "stakes_unavailable", STAKES_UNAVAILABLE);
  return s ?? null;
}

/**
 * Compare a stake with what the match really did, only when the stakes RPC
 * returned one; otherwise record the oracle as SKIPPED (never as a pass).
 */
export function stakeOracle(ctx: ScenarioCtx, id: string, expected: unknown, actual: unknown, haveStakes: boolean): void {
  if (haveStakes) ctx.eq(id, expected, actual);
  else ctx.skip(id, STAKES_UNAVAILABLE);
}

/** A participant row's rating change: `elo_delta`, else after minus before. */
export function participantDelta(p: Pick<ParticipantDb, "elo_before" | "elo_after" | "elo_delta"> | null | undefined): number | null {
  if (!p) return null;
  if (p.elo_delta != null) return p.elo_delta;
  return p.elo_before != null && p.elo_after != null ? p.elo_after - p.elo_before : null;
}

/**
 * A rated participant row is consistent: all three of `elo_before`,
 * `elo_after` and `elo_delta` are written, and the delta is after minus
 * before. Deliberately NOT `participantDelta`, whose fallback would make a
 * missing `elo_delta` pass.
 */
export function participantDeltaConsistent(p: Pick<ParticipantDb, "elo_before" | "elo_after" | "elo_delta">): boolean {
  return p.elo_before != null && p.elo_after != null && p.elo_delta != null && p.elo_delta === p.elo_after - p.elo_before;
}

/**
 * A draw between equals (same rating, same weight: every fixture draw) moves
 * both athletes by the same amount, whatever the engine: the Elo Pressure
 * Score cost both the same, Rating V9 moves neither. Two rated rows with one
 * equal, written delta.
 */
export function drawSymmetric(parts: Pick<ParticipantDb, "elo_before" | "elo_after" | "elo_delta">[]): boolean {
  const d = parts.map((p) => p.elo_delta);
  return d.length === 2 && d[0] != null && d[0] === d[1];
}

/**
 * The delta the verdict shows for a rating change: `RatingMoment` renders
 * the chip (`summary-elo-delta`) and speaks "up N" / "down N" in the rating
 * card's label only for a non-zero delta, so a zero or unknown change shows
 * none at all.
 */
export function verdictChipDelta(delta: number | null): number | null {
  return delta == null || delta === 0 ? null : delta;
}

// --- handshake ------------------------------------------------------------------

export interface Handshake {
  challengeId: string;
  matchId: string;
}

/**
 * How Red's accept runs, for the timekeeper scenarios only: `wrap` runs
 * around the bot's accept (a flag window around the match's creation, or a
 * check while Blue's waiting plate is still up) and `step` names it. Every
 * flag-OFF scenario passes none: the accept is exactly as it always was.
 */
export interface AcceptOptions {
  step?: string;
  wrap?: (accept: () => Promise<string>) => Promise<string>;
}

/** Blue taps Challenge on Red, Red's bot accepts. */
export async function blueChallengesRed(ctx: ScenarioCtx, red: MobileOpponent, opts: AcceptOptions = {}): Promise<Handshake> {
  const { step = "Red accepts", wrap = (accept: () => Promise<string>) => accept() } = opts;
  const since = new Date(Date.now() - 2_000).toISOString();
  await ctx.step("Blue challenges Demo Red", () => ctx.ui.challenge(ctx.cfg.names.red));
  await ctx.step("Blue sees the waiting plate", () => ctx.ui.waitWaitingPlate(ctx.cfg.names.red));
  const row = await ctx.step("Red receives the challenge", () => red.waitForIncoming(T.prompt, ctx.ids.blue));
  const dbRow = await db.latestChallenge(ctx.ids.blue, ctx.ids.red, since);
  ctx.eq("db:challenge-created", { id: row.id, status: "pending", match_type: "ranked" }, dbRow && { id: dbRow.id, status: dbRow.status, match_type: dbRow.match_type });
  const matchId = await ctx.step(step, async () => {
    await new Promise((r) => setTimeout(r, ctx.opts.timing === "human" ? 1500 : 50));
    return wrap(() => red.accept(row.id));
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
  // The challenger's app takes whichever lands first: the broadcast, or the
  // `started` UPDATE (recovery path; it never starts on `accepted`, see
  // `waitOutgoingOutcome`). Both must agree.
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

// --- Arena concurrency (E18-E20) ----------------------------------------------------

/**
 * Whether this run has proven that idb can see a BrandToast at all (the
 * positive control). Module state, so it lives exactly as long as one
 * `npm run match-loop` process: a control passed in one run never vouches
 * for another.
 */
let toastControl: "unproven" | "passed" | "failed" = "unproven";

/**
 * The positive control for the no-toast oracles: Blue challenges Red, Red
 * declines, and Blue's app must show the info toast "Demo Red declined."
 * (`endOutgoing` in use-arena-challenge.ts). Runs once per run, in the first
 * scenario that needs it; the no-toast oracles are hard only once it passed.
 */
export async function toastPositiveControl(ctx: ScenarioCtx, red: MobileOpponent): Promise<void> {
  if (toastControl !== "unproven") return;
  const expected = `${ctx.cfg.names.red} declined.`;
  toastControl = "failed";
  await ctx.step("toast control: Blue challenges Demo Red", () => ctx.ui.challenge(ctx.cfg.names.red));
  const row = await ctx.step("toast control: Red receives it", () => red.waitForIncoming(T.prompt, ctx.ids.blue));
  const watch = new ToastWatch(ctx.idb);
  try {
    await ctx.step("toast control: Red declines", () => red.decline(row.id));
    const seen = await pollUntil(
      `a toast-info "${expected}"`,
      () => watch.toasts().find((t) => t.type === "info" && (t.label ?? "").toLowerCase().includes(expected.toLowerCase())),
      { timeoutMs: 8_000, intervalMs: 200, lastSeen: () => watch.toasts() },
    ).catch(() => null);
    const ok = ctx.oracle("ui:toast-visible", !!seen, { type: "info", label: expected }, seen ?? { seen: watch.toasts() });
    if (ok) toastControl = "passed";
    // Let it go away, so it cannot leak into the next toast watch.
    await pollUntil("the control toast to clear", () => (watch.current.length === 0 ? true : undefined), {
      timeoutMs: 8_000,
      intervalMs: 200,
    }).catch(() => undefined);
  } finally {
    await watch.stop();
  }
  ctx.eq("db:toast-control-declined", "declined", (await db.challenge(row.id))?.status);
}

/**
 * Stop a toast watch and record the toast oracles: no error toast ever, and
 * (unless `infoAllowed`) no info toast either, e.g. a "declined." or
 * "expired." that a quiet crossing withdrawal must never produce. Hard only
 * when the positive control passed in this run; otherwise informational
 * (ok, with what was seen as the actual value), since a watch that cannot
 * see toasts would pass them vacuously.
 */
export async function checkToasts(ctx: ScenarioCtx, watch: ToastWatch, infoAllowed = false): Promise<void> {
  const { toasts, samples } = await watch.stop();
  const ids = ["ui:no-error-toast", ...(infoAllowed ? [] : ["ui:no-info-toast"])];
  const mode = toastOracleMode(toastControl, samples);
  const actual = (id: string) => toasts.filter((t) => t.type === (id === "ui:no-error-toast" ? "error" : "info"));
  for (const id of ids) {
    if (mode === "skip") ctx.skip(id, "the toast watch read no screen snapshot");
    else if (mode === "hard") ctx.eq(id, [], actual(id), `${samples} screen samples`);
    else ctx.oracle(id, true, "informational", actual(id), `toast control ${toastControl} in this run; ${samples} screen samples`);
  }
}

/**
 * How the no-toast oracles are recorded: skipped when nothing was sampled,
 * hard only once the positive control passed in this run, else informational.
 */
export function toastOracleMode(control: "unproven" | "passed" | "failed", samples: number): "skip" | "hard" | "informational" {
  if (samples === 0) return "skip";
  return control === "passed" ? "hard" : "informational";
}

/**
 * Re-count after the challenger's `ACCEPTED_FALLBACK_MS` safety net could
 * have fired (accept + 14 s): a late fallback start must not have created a
 * second match.
 */
export async function checkStillOneMatch(ctx: ScenarioCtx, challengeIds: string[], matchId: string, acceptedAt: number): Promise<void> {
  const wait = acceptedAt + APP_TIMING.ACCEPTED_FALLBACK_MS + 2_000 - Date.now();
  if (wait > 0) await new Promise((r) => setTimeout(r, wait));
  const ms = await matchesFor(challengeIds);
  ctx.eq("db:still-one-match-after-fallback-window", [matchId], ms.map((m) => m.id), `${Date.now() - acceptedAt}ms after the accept`);
}

/**
 * End a match both sides are in without playing it: the bot sits on the
 * weight step, Blue confirms weights and cancels from the ready step. The
 * spy seeing Blue's match_cancelled on THIS match's topic proves Blue's app
 * is in the same match id as the bot.
 */
export async function blueCancelsFromReady(ctx: ScenarioCtx, side: MatchSide): Promise<void> {
  side.enter("weight");
  await blueConfirmsWeights(ctx, side.matchId);
  await ctx.step("Blue cancels the match", () => ctx.ui.cancelMatch());
  await ctx.expect("protocol:blue-in-the-same-match", true, async () => {
    await side.spy.waitFor("Blue's match_cancelled on the bot's match topic", (e) => e.event === "match_cancelled", 10_000, 0);
    return true;
  });
  await ctx.expect("bot:learns-cancel", "cancelled", async () => (await side.readyAndStart(20_000)).kind);
  const m = await db.waitMatchStatus(side.matchId, ["cancelled"], T.db).catch(() => db.match(side.matchId));
  ctx.eq("db:match-cancelled", "cancelled", m?.status);
}

/** The challenge row once it has left `pending` (or the timeout). */
export function settledChallenge(id: string, timeoutMs = T.db): Promise<ChallengeDb> {
  return pollUntil(
    `challenge ${id} to leave pending`,
    async () => {
      const c = await db.challenge(id);
      return c && c.status !== "pending" ? c : undefined;
    },
    { timeoutMs, intervalMs: 300 },
  );
}

/** Whether the incoming prompt shows at any point in the next `ms`. */
export async function promptShownWithin(ctx: ScenarioCtx, ms: number): Promise<boolean> {
  const until = Date.now() + ms;
  while (Date.now() < until) {
    if (await ctx.ui.isPromptVisible()) return true;
    await new Promise((r) => setTimeout(r, 400));
  }
  return false;
}

/** Every match created for any of `challengeIds`. */
export async function matchesFor(challengeIds: string[]): Promise<MatchDb[]> {
  const all = await Promise.all(challengeIds.map((id) => db.matchesForChallenge(id)));
  return all.flat();
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

/**
 * Blue's weigh-in, through to the ready step: Confirm my weight, then Blue's
 * own check of Red's weigh-in on the face-off check plate (jr_be-ahn.4,
 * "Confirm"), which the app waits for before it moves to ready (jits-c3vd).
 * Every Arena match is challenge-backed, so the plate must be there.
 *
 * Strict: one press of the plate's Confirm (a second means the app dropped
 * the first), and the database must hold Blue's check of the opponent as
 * `confirmed` (`match_weight_checks`, checker Blue, subject the opponent).
 */
export async function blueConfirmsWeights(ctx: ScenarioCtx, matchId: string): Promise<void> {
  const weighIn = await ctx.step("Blue confirms weights", async () => {
    const r = await ctx.ui.confirmWeights(T.step);
    await ctx.ui.waitStep("ready", T.step);
    return r;
  });
  ctx.eq("ui:weight-check-plate-answered", true, weighIn.weightCheck, "Blue confirmed the opponent's weigh-in on the face-off check plate");
  ctx.eq("ui:weight-check-one-press", 1, weighIn.confirmPresses, "presses of #weight-check-confirm; a second press means the first was dropped");
  await checkBlueWeightCheckConfirmed(ctx, matchId);
}

/**
 * `db:weight-checks-confirmed`: Blue's own weight check on this match (Blue
 * the checker, the other participant the subject) is `confirmed`, the row
 * the app's Confirm writes (`check_opponent_weight`) and the one it waits
 * for before ready.
 */
export async function checkBlueWeightCheckConfirmed(ctx: ScenarioCtx, matchId: string): Promise<void> {
  const opponents = (await db.participants(matchId))
    .map((p) => p.athlete_id)
    .filter((id) => id !== ctx.ids.blue)
    .sort();
  const expected = opponents.map((subject_id) => ({ subject_id, status: "confirmed" }));
  const read = () => db.weightChecksBy(matchId, ctx.ids.blue).then((rows) => rows.map((r) => ({ subject_id: r.subject_id, status: r.status })));
  const actual = await pollUntil(
    "Blue's weight check to read confirmed",
    async () => {
      const rows = await read();
      return JSON.stringify(rows) === JSON.stringify(expected) ? rows : undefined;
    },
    { timeoutMs: 5_000, intervalMs: 300 },
  ).catch(read);
  ctx.eq("db:weight-checks-confirmed", expected, actual, "match_weight_checks rows with checker = Blue");
}

/**
 * Both confirm weights and ready up; returns the bot's view of the start.
 * `onReadyStep` runs while Blue is on the ready step, before Blue taps
 * Ready (T14 rotates the simulator there); flag-OFF scenarios pass none.
 */
export async function readyToLive(ctx: ScenarioCtx, side: MatchSide, opts: { onReadyStep?: () => Promise<void> } = {}): Promise<ReadyOutcome> {
  const botRun = side.confirmWeights().then(() => side.readyAndStart(T.handshake));
  botRun.catch(() => undefined); // awaited below; never an unhandled rejection
  await blueConfirmsWeights(ctx, side.matchId);
  await opts.onReadyStep?.();
  await ctx.step("Blue taps Ready", () => ctx.ui.tapReady());
  const [outcome] = await Promise.all([
    ctx.step("bot completes the ready handshake", () => botRun),
    ctx.step("Blue reaches the live step", async () => {
      await ctx.ui.waitStep("live", T.handshake);
      // The step reads "live" during the 3-2-1 already; the live screen
      // (End, Pause and its channel) mounts at GO.
      await ctx.ui.waitLiveScreen(T.step);
    }),
  ]);
  const m = await db.match(side.matchId);
  ctx.eq("db:match-in-progress", { status: "in_progress", started: true }, { status: m?.status, started: !!m?.started_at });
  return outcome;
}

/**
 * Blue holds End; the bot must receive match_ended in its live step. Strict:
 * one hold (`ui:end-one-hold`), a second means the app ignored the first.
 */
export async function blueEnds(ctx: ScenarioCtx, side: MatchSide): Promise<void> {
  const end = await ctx.step("Blue ends the match", () => ctx.ui.endMatch());
  ctx.eq("ui:end-one-hold", 1, end.holds, "holds of #live-end; a second hold means the first did not end the match");
  await Promise.all([
    ctx.step("bot receives match_ended", () => side.waitForEnd(T.broadcast)),
    ctx.step("Blue reaches the result step", () => ctx.ui.waitStep("result", T.step)),
  ]);
}

/**
 * Where the recorder lands after recording. With jr_be B2 the server
 * confirms the recorder's side with the result, so the app skips confirm
 * and goes to the verdict ("summary"); an older backend still sends it to
 * confirm. Either is accepted here; the step reached is traced.
 */
async function blueAfterRecording(ctx: ScenarioCtx): Promise<void> {
  const step = await ctx.ui.waitStepIn(["summary", "confirm"], T.step);
  ctx.trace.note("harness", "blue_after_record", step);
}

export async function blueRecordsSubmission(ctx: ScenarioCtx, side: MatchSide, winnerId: string, code = "armbar", finish = "90"): Promise<void> {
  const botWait = side.waitForResult(T.handshake);
  await ctx.step("Blue records a submission", () => ctx.ui.recordSubmission(winnerId, code, finish));
  await Promise.all([
    ctx.step("Blue reaches the verdict (auto-confirmed) or confirm", () => blueAfterRecording(ctx)),
    ctx.step("bot receives result_submitted", () => botWait),
  ]);
}

export async function blueRecordsDraw(ctx: ScenarioCtx, side: MatchSide): Promise<void> {
  const botWait = side.waitForResult(T.handshake);
  await ctx.step("Blue records a draw", () => ctx.ui.recordDraw());
  await Promise.all([
    ctx.step("Blue reaches the verdict (auto-confirmed) or confirm", () => blueAfterRecording(ctx)),
    ctx.step("bot receives result_submitted", () => botWait),
  ]);
}

/**
 * Red (the bot) records a draw, so Blue is the athlete who confirms: the
 * recorder is auto-confirmed (B2) and never sees the confirm step. For the
 * scenarios that are about Blue's confirm step (E7, E8).
 */
export async function botRecordsDraw(ctx: ScenarioCtx, side: MatchSide): Promise<void> {
  const rec = await ctx.step("Red records a draw", () => side.record({ result: "draw" }));
  ctx.eq("bot:record-ok", { ok: true }, rec);
  await ctx.step("Blue is moved to the confirm step", () => ctx.ui.waitStep("confirm", T.step));
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
  // A recorder the server auto-confirmed (B2) is already on the verdict and
  // has nothing to tap; it still broadcast result_confirmed (checked below).
  const blueStep = await ctx.ui.currentStep();
  const blueAutoConfirmed = blueStep === "summary";
  if (blueAutoConfirmed) ctx.trace.note("harness", "blue_auto_confirmed", true);
  else await ctx.step("Blue confirms", () => ctx.ui.confirmResult());
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
  // An auto-confirmed recorder sends result_confirmed right behind
  // result_submitted, often before the opponent's confirm channel has joined
  // (the app's confirm step then takes it from the DB), so it is only
  // informational there.
  if (channelCheck === "hard" && !blueAutoConfirmed) ctx.eq("bot:confirm-channel-received-blue-result_confirmed", true, received);
  else if (blueAutoConfirmed) ctx.oracle("bot:confirm-channel-received-blue-result_confirmed", true, "informational", received, "Blue was auto-confirmed at record (B2)");
  else ctx.oracle("bot:confirm-channel-received-blue-result_confirmed", true, "informational", received, `bot finished confirm via ${outcome.via}`);
}

/** What the verdict's rating change is checked against. */
export interface SummaryDelta {
  /** The match on screen: Blue's own participant row is what the verdict shows. */
  matchId: string;
  /** Blue's delta in the stakes preview, or null when the stakes RPC returned none. */
  stake: number | null;
}

/**
 * The verdict: the headline, the exit and (with `delta`) the rating chip.
 * The chip is checked against Blue's own `match_participants` row, the
 * row the verdict reads (`MatchAthleteView.eloDelta`), so it holds whatever
 * the rating engine computed; the stakes preview is compared only when the
 * stakes RPC returned one.
 */
export async function checkSummary(ctx: ScenarioCtx, verdict: string, delta: SummaryDelta | null): Promise<void> {
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
    const mine = (await db.participants(delta.matchId)).find((p) => p.athlete_id === ctx.ids.blue);
    const dbDelta = participantDelta(mine);
    const want = verdictChipDelta(dbDelta);
    // The delta shows once the verdict's refresh lands; give it a moment.
    // With none due, one read after the verdict settled is the check.
    const d =
      want === null
        ? parseDelta((await ctx.ui.readSummary()).eloDelta)
        : await pollUntil(
            "summary elo delta",
            async () => {
              const v = parseDelta((await ctx.ui.readSummary()).eloDelta);
              return v === want ? v : undefined;
            },
            { timeoutMs: 8_000 },
          ).catch(async () => parseDelta((await ctx.ui.readSummary()).eloDelta));
    ctx.eq("ui:summary-elo-delta", want, d, `Blue's match_participants elo_delta is ${dbDelta}`);
    stakeOracle(ctx, "stakes:blue-delta-matches-preview", delta.stake, dbDelta, delta.stake !== null);
  }
  ctx.eq("ui:summary-exit-visible", true, s.hasExit);
}

/**
 * Back to Arena from the verdict. Strict: one tap (`ui:back-to-arena-one-tap`);
 * `exitSummary` taps a second time only when a dev-build LogBox could have
 * taken the first, and the oracle accepts that second tap only then. An
 * excused second tap still passes, but it is noted for review (trace note
 * `logbox_retap`, the oracle's note): a gate run reviews every
 * `logBoxRetap: true` (LOOP.md, the flag-OFF guard).
 */
export async function exitToArena(ctx: ScenarioCtx): Promise<void> {
  const exit = await ctx.step("Blue taps Back to Arena", async () => {
    const r = await ctx.ui.exitSummary();
    await ctx.idb.waitAny([{ label: "Go live", type: "Button" }, { label: "Go offline", type: "Button" }], T.step);
    return r;
  });
  if (exit.logBoxRetap) ctx.trace.note("harness", "logbox_retap", exit);
  ctx.oracle(
    "ui:back-to-arena-one-tap",
    exit.taps === 1 || (exit.taps === 2 && exit.logBoxRetap),
    { taps: 1, secondTapOnlyAfterLogBox: true },
    exit,
    exit.logBoxRetap ? `REVIEW: second tap excused by a LogBox (${exit.logBoxExcuse}); check this run before calling a gate green` : undefined,
  );
}

// --- DB oracles ---------------------------------------------------------------------

export interface DecisiveExpectation {
  handshake: Handshake;
  winner: string;
  loser: string;
  /** The stakes preview's deltas, or null when the stakes RPC returned none. */
  winnerDelta: number | null;
  loserDelta: number | null;
  code: string;
  finish: number;
  confirmations: number;
}

/**
 * The rating change landed everywhere the app reads it: each participant
 * row is internally consistent (`elo_delta` written and equal to `elo_after`
 * minus `elo_before`; the verdict shows `elo_delta`, so a row where they
 * disagree would show a delta the rating never moved by), one `elo_history`
 * row per athlete that agrees with its participant row, and `current_elo`
 * equal to `elo_after`. Engine independent (Elo or Rating V9).
 */
export async function checkRatingApplied(ctx: ScenarioCtx, matchId: string, parts: ParticipantDb[]): Promise<void> {
  const byAthlete = <T extends { athlete_id: string }>(rows: T[]) => [...rows].sort((a, b) => a.athlete_id.localeCompare(b.athlete_id));
  ctx.eq(
    "db:participant-delta-consistent",
    byAthlete(parts).map((p) => ({ athlete_id: p.athlete_id, consistent: true })),
    byAthlete(parts).map((p) => ({ athlete_id: p.athlete_id, consistent: participantDeltaConsistent(p) })),
    JSON.stringify(byAthlete(parts).map((p) => [p.elo_before, p.elo_after, p.elo_delta])),
  );
  const hist = await db.eloHistory(matchId);
  ctx.eq("db:elo-history-rows", 2, hist.length);
  ctx.eq(
    "db:elo-history-matches-participants",
    byAthlete(parts).map((p) => ({ athlete_id: p.athlete_id, before: p.elo_before, after: p.elo_after, delta: participantDelta(p) })),
    byAthlete(hist).map((h) => ({ athlete_id: h.athlete_id, before: h.rating_before, after: h.rating_after, delta: h.delta })),
  );
  const athletes = await Promise.all(byAthlete(parts).map((p) => db.athlete(p.athlete_id)));
  ctx.eq("db:current-elo-updated", byAthlete(parts).map((p) => p.elo_after), athletes.map((a) => a?.current_elo ?? null));
}

/**
 * A decisive result moved the ratings the right way: the winner gained and
 * the loser lost (both engines guarantee it: Elo by construction, Rating V9
 * by its WIN_FLOOR / LOSS_FLOOR of 1), the stakes preview matched when it
 * exists, and the change was applied (`checkRatingApplied`).
 */
export async function checkRatingMoved(
  ctx: ScenarioCtx,
  x: { matchId: string; winner: string; loser: string; winnerDelta: number | null; loserDelta: number | null },
): Promise<ParticipantDb[]> {
  const parts = await db.participants(x.matchId);
  const wd = participantDelta(parts.find((p) => p.athlete_id === x.winner));
  const ld = participantDelta(parts.find((p) => p.athlete_id === x.loser));
  ctx.eq("db:rating-moved-by-outcome", { winnerGained: true, loserLost: true }, { winnerGained: wd != null && wd > 0, loserLost: ld != null && ld < 0 }, `winner ${wd}, loser ${ld}`);
  stakeOracle(
    ctx,
    "stakes:deltas-match-preview",
    [x.winnerDelta, x.loserDelta],
    [wd, ld],
    x.winnerDelta !== null && x.loserDelta !== null,
  );
  await checkRatingApplied(ctx, x.matchId, parts);
  return parts;
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
  const parts = await checkRatingMoved(ctx, { matchId, winner: x.winner, loser: x.loser, winnerDelta: x.winnerDelta, loserDelta: x.loserDelta });
  const w = parts.find((p) => p.athlete_id === x.winner);
  const l = parts.find((p) => p.athlete_id === x.loser);
  ctx.eq(
    "db:participants",
    [
      { outcome: "win", elo_before: FIXTURE_ELO, gap: 0 },
      { outcome: "loss", elo_before: FIXTURE_ELO, gap: 0 },
    ],
    [
      { outcome: w?.outcome, elo_before: w?.elo_before, gap: w?.weight_division_gap },
      { outcome: l?.outcome, elo_before: l?.elo_before, gap: l?.weight_division_gap },
    ],
  );
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

/**
 * A recorded draw. Both athletes are rated (two history rows, current_elo
 * applied); the size and sign of the change are the engine's business
 * (the Elo Pressure Score always cost both, Rating V9 scores a draw between
 * equals as no change), so they are compared only with the stakes preview,
 * when there is one. What every engine owes a draw between equals is
 * symmetry: both athletes move by the same amount (`db:draw-symmetric`).
 */
export async function checkDrawDb(ctx: ScenarioCtx, h: Handshake, stakeDelta: number | null): Promise<void> {
  const m = await db.match(h.matchId);
  ctx.eq("db:match-completed-draw", { status: "completed", result: "draw" }, { status: m?.status, result: m?.result });
  const parts = await db.participants(h.matchId);
  ctx.eq(
    "db:draw-participants",
    [
      { outcome: "draw", elo_before: FIXTURE_ELO },
      { outcome: "draw", elo_before: FIXTURE_ELO },
    ],
    parts.map((p) => ({ outcome: p.outcome, elo_before: p.elo_before })),
  );
  ctx.oracle(
    "db:draw-symmetric",
    drawSymmetric(parts),
    "both athletes' elo_delta written and equal (a draw between equals)",
    parts.map((p) => ({ athlete_id: p.athlete_id, elo_delta: p.elo_delta })),
  );
  stakeOracle(ctx, "stakes:draw-deltas-match-preview", [stakeDelta, stakeDelta], parts.map(participantDelta), stakeDelta !== null);
  await checkRatingApplied(ctx, h.matchId, parts);
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
  ctx.eq("db:elo-unchanged", [FIXTURE_ELO, FIXTURE_ELO], [b?.current_elo, r?.current_elo]);
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
