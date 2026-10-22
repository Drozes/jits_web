/**
 * The bot in timekeeper mode (jits_web specs/timekeeper-mode 4.2, TEST-PLAN
 * 4.2). The simulator is never the timekeeper (PM18), so the timekeeper is
 * always one of these bots, and the other athlete of a timekeeper match is a
 * bot too:
 *
 *  - `TimekeeperBot`: the asked person. Listens for its requests like the
 *    app's `use-incoming-timekeeper-requests` (slice M2: postgres_changes on
 *    `match_timekeeper_requests` for the invitee, plus a poll so a missed
 *    event never strands a run), reads the request like the timekeep sheet
 *    (`get_timekeeper_request`), records the AI consent first when it is
 *    missing (TK-T7, TK-T8: accept is refused `consent_required` without it),
 *    then accepts or declines.
 *  - `TimekeeperSide`: the seated timekeeper of one match. Heartbeat every
 *    15 s (R23) from the seat until it stops or leaves; verdicts on each
 *    athlete's weigh-in quoting the RATED weight (PM26, `ratedWeightOf`);
 *    Start once the server lists no Start blocker (`_tk_start_blockers`, the
 *    same list `start_match` refuses with); pause, resume, end of the clock
 *    (`end_match_clock`), the result, the edit and Leave. After each
 *    successful clock or result RPC, and after a live Leave that made the
 *    match a no contest (`match_cancelled`; a Leave before the start sends
 *    nothing, as the face-off's does), it broadcasts on the match topic with
 *    `actor_id`, as the timekeeper's phone does (spec 10, PM1); a broadcast
 *    never changes state in timekeeper mode, it only makes the others re-read.
 *  - `TkAthleteSide`: an athlete (a bot) of a timekeeper match: request a
 *    timekeeper, ready (`mark_match_ready`, which also confirms its check of
 *    the opponent), confirm with the expected edit count (the shared
 *    `confirmMatchResult(client, matchId, expectedEditCount)`, slice M5: a
 *    timekeeper-mode confirm without the count is refused `result_changed`,
 *    jr_be 024 4.5). Where it is comes from the database through the app's
 *    own snapshot and routing (`matchSnapshot`, `targetFor` with timekeeper
 *    roles), never from a broadcast.
 *
 * Every call goes through the typed wrappers in `@jits/shared/api`
 * (`timekeeper` from M1 and M2, `queries`, `mutations`, `moderation`); every
 * call but the 2 s request poll is traced like the rest of the bot (the
 * poll's failures are). The poll reads the asked person's newest pending
 * request like the app's listener does (M2's `getIncomingTimekeeperRequest`):
 * every scenario asks a given bot for one match at a time, and realtime
 * still delivers each insert, so the newest is all the backstop needs.
 */
import type { RealtimeChannel } from "@supabase/supabase-js";
import { getMatchDetails, getMatchDetailsWithConfirmations } from "@jits/shared/api/queries";
import { confirmMatchResult, pauseMatch, recordMatchResult, resumeMatch } from "@jits/shared/api/mutations";
import { getAiProcessingConsent, recordAiProcessingConsent } from "@jits/shared/api/moderation";
import {
  checkAthleteWeightAsTimekeeper,
  editMatchResult,
  endMatchClock,
  getIncomingTimekeeperRequest,
  getMyTimekeepingMatch,
  getTimekeeperMatchState,
  getTimekeeperRequest,
  leaveMatchAsTimekeeper,
  markMatchReady,
  ratedWeightOf,
  requestMatchTimekeeper,
  respondTimekeeperRequest,
  startMatchAsTimekeeper,
  touchMatchTimekeeper,
  type IncomingTimekeeperRequest,
  type TimekeeperMatchState,
  type TimekeeperStartBlocker,
  type TkResult,
} from "@jits/shared/api/timekeeper";
import {
  actorPayload,
  APP_TIMING,
  createSessionMatchChannel,
  matchSnapshot,
  SESSION_MATCH_EVENTS as E,
  sessionMatchTopic,
  settleWithin,
  targetFor,
  TK_TIMING,
  type BroadcastResult,
  type MatchStep,
  type ReconcileRoles,
  type SessionMatchChannel,
} from "./protocol";
import { Bus } from "./bus";
import { makeClient, type Client, type MobileOpponent } from "./opponent";
import type { Trace } from "./trace";
import type { Config } from "../config";
import { EnvError, ExpectationTimeout, pace, pollUntil } from "../lib/util";

// --- pure decisions (tests/timekeeper.test.ts) --------------------------------------------

/**
 * The athletes whose weigh-in the timekeeper still owes a Confirm on, in the
 * order given (challenger first): none when the match has no timekeeper
 * weight check (A19, `tk_weight_check_required` false). A verdict of mine
 * that is `confirmed` is done; no row, `recheck` (the athlete re-weighed) or
 * `flagged` (only once the athlete re-weighed, which turns it into `recheck`)
 * is owed. An open `flagged` stays a hold: the bot never withdraws one.
 */
export function timekeeperVerdictsOwed(
  state: Pick<TimekeeperMatchState, "timekeeperChecks"> | null,
  athleteIds: readonly string[],
  required: boolean,
): string[] {
  if (!required) return [];
  return athleteIds.filter((id) => {
    const mine = state?.timekeeperChecks.find((c) => c.subjectId === id)?.status ?? null;
    return mine === null || mine === "recheck";
  });
}

/** Start now, or wait on the first Start blocker (the server's order). */
export function startDecision(state: Pick<TimekeeperMatchState, "startBlockers"> | null): { start: true } | { start: false; blocker: TimekeeperStartBlocker | "no_state" } {
  if (!state) return { start: false, blocker: "no_state" };
  return state.startBlockers.length === 0 ? { start: true } : { start: false, blocker: state.startBlockers[0] };
}

/**
 * The clock reading the timekeeper's phone sends to `end_match_clock`, in
 * whole seconds: time since GO (`started_at` plus the countdown) minus the
 * paused time, the current pause included; never negative. The server clamps
 * it to the match length.
 */
export function clockSeconds(
  m: { started_at: string | null; total_paused_duration: number | null; paused_at: string | null },
  nowMs: number,
): number {
  if (!m.started_at) return 0;
  const go = Date.parse(m.started_at) + APP_TIMING.COUNTDOWN_MS;
  const pausedNow = m.paused_at ? Math.max(0, nowMs - Date.parse(m.paused_at)) : 0;
  const ms = nowMs - go - (m.total_paused_duration ?? 0) * 1000 - pausedNow;
  return Math.max(0, Math.floor(ms / 1000));
}

/** The reconcile roles of an athlete in a timekeeper-mode match (what `targetFor` reads). */
export function tkAthleteRoles(meId: string, opponentId: string, viewer: "challenger" | "opponent"): ReconcileRoles {
  return { me: { athleteId: meId }, athletes: [{ athleteId: meId }, { athleteId: opponentId }], mode: "timekeeper", viewer };
}

/**
 * The athletes who confirmed, read through `get_match_details` (the
 * timekeeper is never a participant, so the `match_confirmations` RLS hides
 * the rows from them; `get_match_details` admits the seated timekeeper).
 * Null on a failed read.
 */
export async function confirmedAthletes(client: Client, matchId: string): Promise<{ confirmedAthleteIds: string[] } | null> {
  const r = await getMatchDetailsWithConfirmations(client, matchId);
  if (!r || !r.confirmations) return null;
  return { confirmedAthleteIds: r.confirmations.map((c) => c.athlete_id) };
}

// --- the asked person --------------------------------------------------------------------

export interface TkRequestRow {
  id: string;
  match_id: string;
  /** On a realtime row only: the typed poll read does not return it (and no scenario reads it from here). */
  requested_by?: string;
  invitee_id: string;
  status: string;
  expires_at: string;
}

/** The poll's typed read as the row realtime delivers (pure, for tests): pending, to me. */
export function pendingRequestRow(req: IncomingTimekeeperRequest, inviteeId: string): TkRequestRow {
  return { id: req.requestId, match_id: req.matchId, invitee_id: inviteeId, status: "pending", expires_at: req.expiresAt };
}

type RequestEvent = { kind: "insert" | "update"; row: TkRequestRow; via: "realtime" | "poll" };

const REQUEST_POLL_MS = 2_000;

export class TimekeeperBot {
  readonly events = new Bus<RequestEvent>();
  private channel: RealtimeChannel | null = null;
  private poll: ReturnType<typeof setInterval> | null = null;
  /** Requests already pushed as an insert (realtime or poll), so the poll never repeats one. */
  private seen = new Set<string>();
  /** Requests `waitForRequest` already handed out, so a later wait never returns one again. */
  private returned = new Set<string>();
  private consented = false;
  private readonly sides: TimekeeperSide[] = [];

  constructor(
    private readonly cfg: Config,
    readonly bot: MobileOpponent,
    private readonly trace: Trace,
  ) {}

  get me() {
    return this.bot.me;
  }

  get client(): Client {
    return this.bot.client;
  }

  private get actor() {
    return `tk:${this.me.key}`;
  }

  /** Start listening for my requests (call once, after sign-in). */
  async listen(timeoutMs = 10_000): Promise<void> {
    const topic = `tk-requests:${this.me.id}:${Math.random().toString(36).slice(2, 10)}`;
    const push = (kind: "insert" | "update", row: TkRequestRow, via: "realtime" | "poll") => {
      if (kind === "insert") {
        if (this.seen.has(row.id)) return;
        this.seen.add(row.id);
      }
      this.trace.add({ actor: this.actor, kind: "pg_change", name: `timekeeper_request_${kind}`, topic, payload: { ...row, via } });
      this.events.push({ kind, row, via });
    };
    const filter = `invitee_id=eq.${this.me.id}`;
    this.channel = this.client
      .channel(topic)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "match_timekeeper_requests", filter }, (p) =>
        push("insert", p.new as TkRequestRow, "realtime"),
      )
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "match_timekeeper_requests", filter }, (p) =>
        push("update", p.new as TkRequestRow, "realtime"),
      )
      .subscribe((status) => this.trace.add({ actor: this.actor, kind: "channel_status", name: status, topic }));
    const t0 = Date.now();
    while (this.channel.state !== "joined" && Date.now() - t0 < timeoutMs) await pace(100);
    if (this.channel.state !== "joined") throw new EnvError(`${this.actor} request listener did not join within ${timeoutMs}ms`);
    // Backstop, like a push the app would get: a pending request the
    // listener missed still reaches the bot.
    this.poll = setInterval(() => void this.pollPending(push), REQUEST_POLL_MS);
    this.poll.unref?.();
  }

  /**
   * My newest pending request (RLS admits the invitee, jr_be 024 2.3),
   * through the app listener's own read (M2's `getIncomingTimekeeperRequest`).
   * A failed read is traced and the next poll tries again.
   */
  private async pollPending(push: (kind: "insert", row: TkRequestRow, via: "poll") => void): Promise<void> {
    const r = await getIncomingTimekeeperRequest(this.client, this.me.id);
    if (!r.ok) {
      this.trace.note(this.actor, "request_poll_failed", r.error);
      return;
    }
    if (r.data) push("insert", pendingRequestRow(r.data, this.me.id), "poll");
  }

  /** The next pending request to me (optionally for `matchId`), from realtime or the poll. */
  async waitForRequest(timeoutMs: number, matchId?: string): Promise<TkRequestRow> {
    const ev = await this.events.waitFor(
      `a pending timekeeper request to ${this.me.displayName}${matchId ? ` for ${matchId}` : ""}`,
      (e) => e.kind === "insert" && e.row.status === "pending" && !this.returned.has(e.row.id) && (!matchId || e.row.match_id === matchId),
      timeoutMs,
      0,
    );
    this.returned.add(ev.row.id);
    this.trace.note(this.actor, "request_seen", { requestId: ev.row.id, via: ev.via });
    return ev.row;
  }

  /** The timekeep sheet's consent: record it once when it is missing (TK-T7, TK-T8). */
  async consentIfNeeded(): Promise<void> {
    if (this.consented) return;
    const current = await this.trace.rpc(this.actor, "getAiProcessingConsent", {}, () => getAiProcessingConsent(this.client, this.me.id));
    if (!current.ok) throw new Error(`getAiProcessingConsent failed: ${JSON.stringify(current.error)}`);
    if (!current.data.consentAt) {
      const r = await this.trace.rpc(this.actor, "recordAiProcessingConsent", {}, () => recordAiProcessingConsent(this.client));
      if (!r.ok) throw new Error(`recordAiProcessingConsent failed: ${JSON.stringify(r.error)}`);
    }
    this.consented = true;
  }

  /**
   * Answer a request as the timekeep sheet does: read it (`get_timekeeper_request`),
   * consent first when accepting, then respond.
   */
  async respond(requestId: string, accept: boolean): Promise<TkResult<{ matchId: string }>> {
    await this.trace.rpc(this.actor, "getTimekeeperRequest", { requestId }, () => getTimekeeperRequest(this.client, requestId));
    if (accept) await this.consentIfNeeded();
    return this.trace.rpc(this.actor, "respondTimekeeperRequest", { requestId, accept }, () =>
      respondTimekeeperRequest(this.client, requestId, accept),
    );
  }

  /** Accept and take the seat: the timekeeper side of that match, heartbeat running. */
  async acceptAndSeat(requestId: string, athletes: readonly [string, string]): Promise<TimekeeperSide> {
    const r = await this.respond(requestId, true);
    if (!r.ok) throw new Error(`respondTimekeeperRequest(accept) failed: ${r.error.code} ${r.error.message}`);
    return this.seat(r.data.matchId, athletes);
  }

  /** The timekeeper side of a match I am seated in. */
  async seat(matchId: string, athletes: readonly [string, string]): Promise<TimekeeperSide> {
    const side = new TimekeeperSide(this.cfg, this.client, this.trace, matchId, this.me.id, athletes, this.actor);
    this.sides.push(side);
    await side.start();
    return side;
  }

  /** My in-flight timekeeper-mode match, as Home reads it (A20, A24). */
  myTimekeepingMatch() {
    return this.trace.rpc(this.actor, "getMyTimekeepingMatch", {}, () => getMyTimekeepingMatch(this.client));
  }

  async close(): Promise<void> {
    if (this.poll) clearInterval(this.poll);
    this.poll = null;
    for (const s of this.sides) await s.close().catch(() => undefined);
    if (this.channel) await this.client.removeChannel(this.channel).catch(() => undefined);
    this.channel = null;
  }
}

// --- the seated timekeeper -----------------------------------------------------------------

export class TimekeeperSide {
  /** Every match-topic broadcast seen (any sender), for the protocol oracles. */
  readonly spy = new Bus<{ event: string; payload: Record<string, unknown> }>();
  private handle: SessionMatchChannel | null = null;
  private spyClient: Client | null = null;
  private spyChannel: RealtimeChannel | null = null;
  private beat: ReturnType<typeof setInterval> | null = null;
  private readonly pendingSends: Promise<unknown>[] = [];
  /** Heartbeats sent and failed, for the trace and the offline scenario. */
  readonly beats = { sent: 0, failed: 0 };
  private closed = false;

  constructor(
    private readonly cfg: Config,
    private readonly client: Client,
    private readonly trace: Trace,
    readonly matchId: string,
    readonly meId: string,
    /** The two athletes, challenger first. */
    readonly athletes: readonly [string, string],
    private readonly actor: string,
  ) {}

  async start(): Promise<void> {
    const topic = sessionMatchTopic(this.matchId);
    this.spyClient = makeClient(this.cfg);
    this.spyChannel = this.spyClient
      .channel(topic)
      .on("broadcast", { event: "*" }, (msg) => {
        const m = msg as { event: string; payload?: Record<string, unknown> };
        this.trace.add({ actor: "spy", kind: "spy", name: m.event, topic, payload: m.payload });
        this.spy.push({ event: m.event, payload: m.payload ?? {} });
      })
      .subscribe((status) => this.trace.add({ actor: "spy", kind: "channel_status", name: status, topic }));
    const t0 = Date.now();
    while (this.spyChannel.state !== "joined" && Date.now() - t0 < 10_000) await pace(100);
    if (this.spyChannel.state !== "joined") throw new EnvError(`spy channel on ${topic} did not join within 10s`);
    // The timekeeper's phone sends on the match topic; one channel for the
    // whole seat (its own channel lifetimes are not under test: the
    // simulator is never the timekeeper).
    this.handle = createSessionMatchChannel(this.client, this.matchId, () => ({}), {
      onStatus: (status) => this.trace.add({ actor: this.actor, kind: "channel_status", name: status, topic, step: "timekeeper" }),
    });
    this.startHeartbeat();
  }

  /** R23: `touch_match_timekeeper` now and every 15 s, while seated. */
  startHeartbeat(): void {
    if (this.beat || this.closed) return;
    const once = () =>
      void touchMatchTimekeeper(this.client, this.matchId).then(
        (r) => {
          if (r.ok) this.beats.sent++;
          else this.beats.failed++;
          this.trace.add({ actor: this.actor, kind: "note", name: "heartbeat", payload: { ok: r.ok, code: r.ok ? null : r.error.code } });
        },
        () => this.beats.failed++,
      );
    once();
    this.beat = setInterval(once, TK_TIMING.HEARTBEAT_MS);
    this.beat.unref?.();
  }

  /** The phone goes dark (T7): no more heartbeats. */
  stopHeartbeat(): void {
    if (this.beat) clearInterval(this.beat);
    this.beat = null;
    this.trace.note(this.actor, "heartbeat_stopped", { sent: this.beats.sent });
  }

  async state(): Promise<TimekeeperMatchState | null> {
    const r = await this.trace.rpc(this.actor, "getTimekeeperMatchState", { matchId: this.matchId }, () =>
      getTimekeeperMatchState(this.client, this.matchId),
    );
    if (!r.ok) throw new Error(`getTimekeeperMatchState failed: ${r.error.code} ${r.error.message}`);
    return r.data;
  }

  /** A verdict on one athlete's weigh-in, quoting the rated weight the server holds (PM26). */
  async verdict(subjectId: string, verdict: "confirm" | "flag" | "withdraw"): Promise<TkResult<TimekeeperMatchState>> {
    const st = await this.state();
    const weightSeen = verdict === "withdraw" ? null : ratedWeightOf(st, subjectId);
    return this.trace.rpc(this.actor, "checkAthleteWeightAsTimekeeper", { matchId: this.matchId, subjectId, verdict, weightSeen }, () =>
      checkAthleteWeightAsTimekeeper(this.client, { matchId: this.matchId, subjectId, verdict, weightSeen }),
    );
  }

  /** Confirm every weigh-in still owed (none without the sub-flag); returns who was confirmed. */
  async confirmWeights(required: boolean): Promise<string[]> {
    const owed = timekeeperVerdictsOwed(await this.state(), this.athletes, required);
    for (const id of owed) {
      const r = await this.verdict(id, "confirm");
      if (!r.ok) throw new Error(`timekeeper confirm of ${id} failed: ${r.error.code} ${r.error.message}`);
    }
    return owed;
  }

  /**
   * Wait until the server lists no Start blocker, confirming any weigh-in
   * that becomes owed meanwhile (an athlete who weighs in late or
   * re-weighs). Returns every blocker seen on the way, in order, for the
   * scenario's oracles.
   */
  async waitStartable(required: boolean, timeoutMs: number): Promise<TimekeeperStartBlocker[]> {
    const seen: TimekeeperStartBlocker[] = [];
    await pollUntil(
      "no Start blocker (both athletes ready, weights confirmed, recording intent on)",
      async () => {
        await this.confirmWeights(required);
        const d = startDecision(await this.state());
        if (d.start) return true;
        if (d.blocker !== "no_state" && seen[seen.length - 1] !== d.blocker) seen.push(d.blocker);
        return undefined;
      },
      { timeoutMs, intervalMs: 1_000, lastSeen: () => seen },
    );
    return seen;
  }

  private send(event: string, payload: Record<string, unknown>): Promise<unknown> {
    const topic = sessionMatchTopic(this.matchId);
    if (!this.handle) return Promise.resolve(undefined);
    const p = Promise.resolve(this.handle.send(event, payload))
      .catch((e: unknown) => ({ threw: e instanceof Error ? e.message : String(e) }))
      .then((status) => {
        const ok = status === "ok" || (typeof status === "object" && status !== null && (status as { success?: boolean }).success === true);
        this.trace.add({ actor: this.actor, kind: "broadcast_sent", name: event, topic, step: "timekeeper", payload, result: status, ok });
        return status;
      });
    this.pendingSends.push(p);
    return p;
  }

  private async sendAwaited(event: string, payload: Record<string, unknown>): Promise<void> {
    await settleWithin(this.send(event, payload), APP_TIMING.SEND_GRACE_MS);
  }

  /** Start (TK-K6), then `timer_started` with `actor_id`. */
  async startMatch(): Promise<TkResult<{ startedAt: string }>> {
    const r = await this.trace.rpc(this.actor, "startMatchAsTimekeeper", { matchId: this.matchId }, () =>
      startMatchAsTimekeeper(this.client, this.matchId),
    );
    if (r.ok) await this.sendAwaited(E.TIMER_STARTED, { started_at: r.data.startedAt, ...actorPayload(this.meId) });
    return r;
  }

  /** Wait out the 3-2-1 (the live controls exist only from GO). */
  async untilGo(): Promise<void> {
    const m = await getMatchDetails(this.client, this.matchId);
    const started = m?.started_at ? Date.parse(m.started_at) : NaN;
    if (Number.isFinite(started)) {
      const wait = started + APP_TIMING.COUNTDOWN_MS - Date.now();
      if (wait > 0) await pace(wait);
    }
  }

  async pause(): Promise<string> {
    await this.untilGo();
    const r = await this.trace.rpc(this.actor, "pauseMatch", { matchId: this.matchId }, () => pauseMatch(this.client, this.matchId));
    if (!r.ok) throw new Error(`pauseMatch (timekeeper) failed: ${r.error.code} ${r.error.message}`);
    this.send(E.TIMER_PAUSED, { paused_at: r.data.paused_at, ...actorPayload(this.meId) });
    return r.data.paused_at;
  }

  async resume(): Promise<number> {
    const r = await this.trace.rpc(this.actor, "resumeMatch", { matchId: this.matchId }, () => resumeMatch(this.client, this.matchId));
    if (!r.ok) throw new Error(`resumeMatch (timekeeper) failed: ${r.error.code} ${r.error.message}`);
    this.send(E.TIMER_RESUMED, { total_paused_duration: r.data.total_paused_duration, ...actorPayload(this.meId) });
    return r.data.total_paused_duration;
  }

  /** Hold to end: `end_match_clock` with the clock reading, then `match_ended` with `actor_id`. */
  async endClock(): Promise<{ endedAt: string; finalElapsedS: number }> {
    await this.untilGo();
    const m = await getMatchDetails(this.client, this.matchId);
    const elapsed = m ? clockSeconds({ started_at: m.started_at ?? null, total_paused_duration: m.total_paused_duration ?? 0, paused_at: m.paused_at ?? null }, Date.now()) : 0;
    const r = await this.trace.rpc(this.actor, "endMatchClock", { matchId: this.matchId, elapsed }, () => endMatchClock(this.client, this.matchId, elapsed));
    if (!r.ok) throw new Error(`endMatchClock failed: ${r.error.code} ${r.error.message}`);
    await this.sendAwaited(E.MATCH_ENDED, actorPayload(this.meId));
    return r.data;
  }

  /** The timekeeper's result (no claim, no confirmation row), then `result_submitted` with `actor_id`. */
  async record(result: BroadcastResult): Promise<{ ok: boolean; code?: string; error?: string }> {
    const r = await this.trace.rpc(this.actor, "recordMatchResult", { matchId: this.matchId, ...result }, () =>
      recordMatchResult(this.client, {
        matchId: this.matchId,
        result: result.result,
        winnerId: result.winnerId,
        submissionTypeCode: result.submissionCode,
        finishTimeSeconds: result.finishTimeSeconds,
      }),
    );
    if (!r.ok) return { ok: false, code: r.error.code, error: r.error.message };
    await this.sendAwaited(E.RESULT_SUBMITTED, { ...(result as unknown as Record<string, unknown>), ...actorPayload(this.meId) });
    return { ok: true };
  }

  /** Edit the recorded result (A8, A24) from the edit count the server holds now. */
  async edit(result: BroadcastResult, expectedEditCount?: number): Promise<TkResult<{ resultEditCount: number }>> {
    const count = expectedEditCount ?? (await getMatchDetails(this.client, this.matchId))?.result_edit_count ?? 0;
    return this.trace.rpc(this.actor, "editMatchResult", { matchId: this.matchId, ...result, expectedEditCount: count }, () =>
      editMatchResult(this.client, {
        matchId: this.matchId,
        result: result.result,
        winnerId: result.winnerId ?? null,
        submissionTypeCode: result.submissionCode ?? null,
        finishTimeSeconds: result.finishTimeSeconds ?? null,
        expectedEditCount: count,
      }),
    );
  }

  /**
   * Leave. Before the start: back to the picker, silently, as the face-off's
   * Leave does (`use-faceoff-leave.ts`, `doLeaveSeat`). While the clock runs:
   * a no contest, then `match_cancelled` with `actor_id`, as the live step's
   * Leave does (`use-timekeeper-live-leave.ts`: the step channel's cancel
   * names this phone in timekeeper mode), so the athletes' timekeeper-mode
   * cancel observer is driven like a real device drives it.
   */
  async leave(): Promise<TkResult<{ status: "pending" | "cancelled" }>> {
    const r = await this.trace.rpc(this.actor, "leaveMatchAsTimekeeper", { matchId: this.matchId }, () => leaveMatchAsTimekeeper(this.client, this.matchId));
    if (r.ok) this.stopHeartbeat();
    if (r.ok && r.data.status === "cancelled") await this.sendAwaited(E.MATCH_CANCELLED, actorPayload(this.meId));
    return r;
  }

  async close(): Promise<void> {
    this.closed = true;
    this.stopHeartbeat();
    await Promise.race([Promise.allSettled(this.pendingSends), pace(10_000)]);
    this.handle?.remove();
    this.handle = null;
    if (this.spyClient) {
      await this.spyClient.removeAllChannels().catch(() => undefined);
      this.spyClient.realtime.disconnect();
      this.spyClient = null;
    }
  }
}

// --- the other athlete (a bot) ------------------------------------------------------------

export class TkAthleteSide {
  private rowChannel: RealtimeChannel | null = null;
  readonly rowUpdates = new Bus<{ status: string }>();

  constructor(
    private readonly client: Client,
    private readonly trace: Trace,
    readonly matchId: string,
    readonly meId: string,
    readonly opponentId: string,
    readonly viewer: "challenger" | "opponent",
    private readonly actor: string,
  ) {}

  /** The whole-match row listener (the app's `match-row:` re-read trigger), for the trace. */
  start(): void {
    const topic = `match-row:${this.matchId}:tk-${Math.random().toString(36).slice(2, 8)}`;
    this.rowChannel = this.client
      .channel(topic)
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "matches", filter: `id=eq.${this.matchId}` }, ({ new: row }) => {
        const status = String((row as { status?: string }).status);
        this.trace.add({ actor: this.actor, kind: "pg_change", name: "matches_update", topic, payload: { status } });
        this.rowUpdates.push({ status });
      })
      .subscribe((status) => this.trace.add({ actor: this.actor, kind: "channel_status", name: status, topic }));
  }

  /** Where the app would put this athlete now (`matchSnapshot` then `targetFor`, timekeeper roles), read from the DB. */
  async target(): Promise<MatchStep | "exit" | null> {
    const m = await getMatchDetails(this.client, this.matchId);
    if (!m) return null;
    const conf = await confirmedAthletes(this.client, this.matchId);
    return targetFor(matchSnapshot(m, conf?.confirmedAthleteIds ?? null), tkAthleteRoles(this.meId, this.opponentId, this.viewer));
  }

  async waitTarget(want: (t: MatchStep | "exit" | null) => boolean, what: string, timeoutMs: number): Promise<MatchStep | "exit" | null> {
    let last: MatchStep | "exit" | null = null;
    return pollUntil(
      `${this.actor} to reach ${what}`,
      async () => {
        last = await this.target();
        return want(last) ? last : undefined;
      },
      { timeoutMs, intervalMs: 700, lastSeen: () => last },
    );
  }

  /** The timekeeper-mode state as this athlete reads it (`get_timekeeper_match_state`). */
  async state(): Promise<TimekeeperMatchState | null> {
    const r = await this.trace.rpc(this.actor, "getTimekeeperMatchState", { matchId: this.matchId }, () =>
      getTimekeeperMatchState(this.client, this.matchId),
    );
    return r.ok ? r.data : null;
  }

  async requestTimekeeper(inviteeId: string): Promise<TkResult<{ requestId: string; expiresAt: string }>> {
    return this.trace.rpc(this.actor, "requestMatchTimekeeper", { matchId: this.matchId, inviteeId }, () =>
      requestMatchTimekeeper(this.client, this.matchId, inviteeId),
    );
  }

  /** TK-F4: ready, confirming my check of the opponent's weigh-in. */
  async markReady(): Promise<TkResult<TimekeeperMatchState>> {
    return this.trace.rpc(this.actor, "markMatchReady", { matchId: this.matchId }, () => markMatchReady(this.client, this.matchId, true));
  }

  /**
   * Confirm the recorded result against the edit count the server holds now
   * (jr_be 024 4.5), through the shared `confirmMatchResult` WITH the count
   * (slice M5's `expectedEditCount`): without it a timekeeper-mode confirm is
   * refused `result_changed`. The flag-OFF bot (`MatchSide.confirm`) calls
   * the same wrapper without a count. Answers `{ ok, code?, message? }` with
   * the wrapper's DomainError code.
   */
  async confirm(): Promise<{ ok: boolean; code?: string; message?: string }> {
    const m = await getMatchDetails(this.client, this.matchId);
    const count = m?.result_edit_count ?? 0;
    const r = await this.trace.rpc(this.actor, "confirmMatchResult", { matchId: this.matchId, expectedEditCount: count }, () =>
      confirmMatchResult(this.client, this.matchId, count),
    );
    return r.ok ? { ok: true } : { ok: false, code: r.error.code, message: r.error.message };
  }

  async close(): Promise<void> {
    if (this.rowChannel) await this.client.removeChannel(this.rowChannel).catch(() => undefined);
    this.rowChannel = null;
  }
}
