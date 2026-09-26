/**
 * The bot's half of the 8-step match wizard.
 *
 * Emulates `apps/mobile/components/match-flow/steps/*` and
 * `apps/mobile/lib/match-flow/*` (Team A protocol, 55061f5):
 *   weight  mounts a channel; a match_cancelled here exits the match
 *   ready   ready_signal, repeated every READY_REPEAT_MS until the
 *           opponent's arrives; when both ready, race start_match, broadcast
 *           timer_started (awaited, bounded), loser falls back to
 *           get_match_details
 *   live    pause/resume RPC + broadcast; End = broadcast match_ended
 *           (awaited, bounded; no RPC)
 *   end     local 800ms, then result
 *   result  record_match_result + result_submitted (awaited); or receive it
 *   confirm confirm_match_result + result_confirmed; dispute = RPC +
 *           match_disputed (awaited). Leaves confirm ONLY on the opponent's
 *           match_disputed, on both confirmations (1.5s later), or on a DB
 *           snapshot that is `disputed` or has both confirmations. A
 *           `completed` row is NOT a signal: record_match_result sets it at
 *           record time, before anyone confirmed.
 *   summary terminal
 *
 * DB reconciler (use-match-reconciler.ts): the bot re-reads getMatchDetails +
 * getMatchConfirmations on every step change, on every step channel
 * SUBSCRIBED, on a `matches` row UPDATE (`match-row:<id>`, whole match), and
 * on a poll (`pollIntervalFor`: ready/result/confirm 4s, live 10s). What a
 * snapshot means comes from the app's own pure `targetFor`. Snapshots are
 * consumed where the app acts on them in the flows the harness drives: the
 * ready step (in_progress -> live, cancelled -> exit) and the confirm step.
 * Broadcast-specific waits (`waitEvent`, `waitForEnd`, `waitForResult`,
 * `waitDisputeSignal`) stay broadcast-only, because they are the oracles for
 * delivery.
 *
 * FIDELITY
 *   strict  (default) one `session-match:<id>` channel PER STEP, created on
 *           step entry and removed on exit exactly like the app's per-step
 *           `useSessionMatchSync`, on the SAME client, so realtime-js channel
 *           reuse races (H3) and missed-before-mount events (H6/H8) are
 *           reproduced rather than papered over. A step only sees events its
 *           own channel delivered while it was the current step.
 *   lenient one channel for the whole match; every event is seen. Useful to
 *           separate "the protocol is wrong" from "the lifetimes lose events".
 *
 * A separate SPY client (its own socket) watches the topic with `event: '*'`
 * and records every broadcast actually sent, which is the evidence for H3:
 * "the spy saw it, the step channel did not".
 */
import type { RealtimeChannel } from "@supabase/supabase-js";
import {
  cancelSessionMatch,
  confirmMatchResult,
  disputeMatchResult,
  pauseMatch,
  recordMatchResult,
  resumeMatch,
  startMatch,
} from "@jits/shared/api/mutations";
import { getMatchConfirmations, getMatchDetails } from "@jits/shared/api/queries";
import {
  APP_TIMING,
  createSessionMatchChannel,
  MATCH_STEPS,
  pollIntervalFor,
  SESSION_MATCH_EVENTS as E,
  sessionMatchTopic,
  settleWithin,
  targetFor,
  type BroadcastResult,
  type MatchStep,
  type SessionMatchChannel,
} from "./protocol";
import { Bus } from "./bus";
import { makeClient, type Client } from "./opponent";
import type { Trace } from "./trace";
import type { Config } from "../config";
import { EnvError, ExpectationTimeout, jitter, pace } from "../lib/util";

/** `exited` = the app left the wizard (a cancelled match). */
export type BotStep = "weight" | "ready" | "live" | "end" | "result" | "confirm" | "summary" | "exited";
export type Fidelity = "strict" | "lenient";
export type Timing = "human" | "fast";

export interface MatchSideOptions {
  fidelity: Fidelity;
  timing: Timing;
}

export interface Received {
  event: string;
  args: unknown[];
  /** The step whose channel delivered it ("match" in lenient mode). */
  channelStep: string;
}

export interface SpyEvent {
  event: string;
  payload: Record<string, unknown>;
}

/** One DB read by the bot's app-equivalent reconciler. */
export interface Snapshot {
  status: string;
  startedAt: string | null;
  /** Athletes with a positive confirmation row; null = the read failed. */
  confirmed: string[] | null;
  /** What the app's `targetFor` makes of it. */
  target: MatchStep | "exit" | null;
  reason: string;
}

const HANDLER_EVENT: Record<string, string> = {
  onTimerStarted: E.TIMER_STARTED,
  onTimerPaused: E.TIMER_PAUSED,
  onTimerResumed: E.TIMER_RESUMED,
  onMatchEnded: E.MATCH_ENDED,
  onReadySignal: E.READY_SIGNAL,
  onResultSubmitted: E.RESULT_SUBMITTED,
  onResultConfirmed: E.RESULT_CONFIRMED,
  onMatchCancelled: E.MATCH_CANCELLED,
  onMatchDisputed: E.MATCH_DISPUTED,
};

/** `onMatchDisputed` -> `match_disputed`, for events added after this file. */
export function handlerToEvent(prop: string): string {
  return (
    HANDLER_EVENT[prop] ??
    prop
      .replace(/^on/, "")
      .replace(/([a-z])([A-Z])/g, "$1_$2")
      .toLowerCase()
  );
}

/** Steps that mount a `session-match` channel in the app (strict mode). */
const CHANNEL_STEPS: ReadonlySet<BotStep> = new Set(["weight", "ready", "live", "result", "confirm"]);

export type ReadyOutcome =
  | { kind: "started"; startedAt: string; via: "self" | "broadcast" | "fallback" | "reconciler" }
  | { kind: "cancelled" };

export interface ConfirmOutcome {
  kind: "confirmed" | "disputed";
  via: "broadcast" | "reconciler";
}

/**
 * What the ready step does with a DB snapshot (the wizard's reconciler):
 * a cancelled match exits, a started (or later) one goes live. Pending and
 * unknown statuses say nothing.
 */
export function readyFromSnapshot(target: Snapshot["target"]): "cancelled" | "started" | null {
  if (target === "exit") return "cancelled";
  if (target && MATCH_STEPS.indexOf(target) >= MATCH_STEPS.indexOf("live")) return "started";
  return null;
}

export interface ConfirmSignals {
  meId: string;
  opponentId: string;
  /** This side has confirmed (tap + RPC ok). */
  myConfirmed: boolean;
  /** The opponent's result_confirmed arrived on the confirm channel. */
  opponentConfirmed: boolean;
  /** The opponent's match_disputed arrived on the confirm channel. */
  opponentDisputed: boolean;
  /** The newest reconciler snapshot, if any. */
  snapshot: Pick<Snapshot, "status" | "confirmed"> | null;
}

/**
 * When the confirm step ends, mirroring ConfirmStep + useWizardSync:
 *  - the opponent's match_disputed ends it at once;
 *  - a snapshot `targetFor` maps to summary (disputed, or BOTH confirmed)
 *    ends it at once;
 *  - both confirmed (broadcast or DB rows) ends it CONFIRM_ADVANCE_MS later.
 * A `completed` status on its own never ends it. Null = keep waiting.
 */
export function confirmDecision(s: ConfirmSignals): { outcome: ConfirmOutcome; delayMs: number } | null {
  if (s.opponentDisputed) return { outcome: { kind: "disputed", via: "broadcast" }, delayMs: 0 };
  const snap = s.snapshot;
  if (snap && targetFor({ status: snap.status, confirmedAthleteIds: snap.confirmed }, s.meId, s.opponentId) === "summary") {
    return { outcome: { kind: snap.status === "disputed" ? "disputed" : "confirmed", via: "reconciler" }, delayMs: 0 };
  }
  const ids = snap?.confirmed ?? [];
  const mine = s.myConfirmed || ids.includes(s.meId);
  const theirs = s.opponentConfirmed || ids.includes(s.opponentId);
  if (mine && theirs) {
    return {
      outcome: { kind: "confirmed", via: s.opponentConfirmed ? "broadcast" : "reconciler" },
      delayMs: APP_TIMING.CONFIRM_ADVANCE_MS,
    };
  }
  return null;
}

const TICK_MS = 100;

export class MatchSide {
  readonly received = new Bus<Received>();
  readonly spy = new Bus<SpyEvent>();
  /** Every reconciler read, oldest first. */
  readonly snapshots = new Bus<Snapshot>();
  /** Status values seen by the app-equivalent `matches` postgres_changes listener. */
  readonly matchRowUpdates = new Bus<{ status: string }>();
  step: BotStep | null = null;
  private handle: SessionMatchChannel | null = null;
  private stepMark = 0;
  /** `received` / `snapshots` marks taken when each step was (last) entered. */
  private readonly stepMarks = new Map<BotStep, { received: number; snapshots: number }>();
  private spyClient: Client | null = null;
  private spyChannel: RealtimeChannel | null = null;
  private rowChannel: RealtimeChannel | null = null;
  private pollTimer: ReturnType<typeof setInterval> | null = null;
  private reconcileInFlight = false;
  private reconcileAgain = false;
  private closed = false;
  private myConfirmed = false;
  private readonly pendingSends: Promise<unknown>[] = [];

  constructor(
    private readonly cfg: Config,
    private readonly client: Client,
    private readonly trace: Trace,
    readonly matchId: string,
    readonly meId: string,
    readonly opponentId: string,
    readonly opts: MatchSideOptions,
    private readonly actorName = "bot",
  ) {}

  private get actor() {
    return this.actorName;
  }

  private get strict() {
    return this.opts.fidelity === "strict";
  }

  /** Open the spy, the whole-match row listener and (lenient) the match channel. */
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
      .subscribe((status) => {
        this.trace.add({ actor: "spy", kind: "channel_status", name: status, topic });
      });
    const t0 = Date.now();
    while (this.spyChannel.state !== "joined" && Date.now() - t0 < 10_000) {
      await new Promise((r) => setTimeout(r, 100));
    }
    if (this.spyChannel.state !== "joined") {
      // Without the spy the protocol oracle and H3 evidence are blind.
      throw new EnvError(`spy channel on ${topic} did not join within 10s (state ${this.spyChannel.state})`);
    }
    // The app mounts the row listener for the whole wizard (reconciler (e)).
    this.openRowListener();
    if (!this.strict) this.openChannel("match");
  }

  private openChannel(label: string): void {
    const topic = sessionMatchTopic(this.matchId);
    const handlers = new Proxy(
      {},
      {
        get: (_t, prop) => {
          if (typeof prop !== "string" || !prop.startsWith("on")) return undefined;
          return (...args: unknown[]) => {
            const event = handlerToEvent(prop);
            this.trace.add({ actor: this.actor, kind: "broadcast_recv", name: event, topic, step: label, payload: args });
            this.received.push({ event, args, channelStep: label });
          };
        },
      },
    );
    this.handle = createSessionMatchChannel(this.client, this.matchId, () => handlers, {
      onStatus: (status, err) => {
        this.trace.add({ actor: this.actor, kind: "channel_status", name: status, topic, step: label, payload: err?.message });
        // Reconciler (b): a (re)join is exactly when broadcasts may have been missed.
        if (status === "SUBSCRIBED") this.reconcile(`subscribed:${label}`);
      },
    });
  }

  /**
   * Emulates use-match-reconciler's `match-row:<id>` listener: a row UPDATE
   * only TRIGGERS a re-read; it never moves a step by itself.
   */
  private openRowListener(): void {
    const topic = `match-row:${this.matchId}`;
    this.rowChannel = this.client
      .channel(topic)
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "matches", filter: `id=eq.${this.matchId}` },
        ({ new: row }) => {
          const status = String((row as { status?: string }).status);
          this.trace.add({ actor: this.actor, kind: "pg_change", name: "matches_update", topic, payload: { status } });
          this.matchRowUpdates.push({ status });
          this.reconcile("row_update");
        },
      )
      .subscribe((status) => this.trace.add({ actor: this.actor, kind: "channel_status", name: status, topic }));
  }

  /**
   * One DB read, like `reconcileNow`: at most one in flight, a trigger that
   * lands meanwhile schedules exactly one trailing read. Never mutates.
   */
  reconcile(reason: string): void {
    if (this.closed) return;
    if (this.reconcileInFlight) {
      this.reconcileAgain = true;
      return;
    }
    this.reconcileInFlight = true;
    void (async () => {
      try {
        const [match, ids] = await Promise.all([
          getMatchDetails(this.client, this.matchId),
          getMatchConfirmations(this.client, this.matchId),
        ]);
        if (this.closed || !match) return;
        const confirmed = ids ?? null;
        const snap: Snapshot = {
          status: match.status,
          startedAt: match.started_at ?? null,
          confirmed,
          target: targetFor({ status: match.status, confirmedAthleteIds: confirmed }, this.meId, this.opponentId),
          reason,
        };
        this.trace.add({ actor: this.actor, kind: "reconcile", name: reason, step: this.step ?? undefined, payload: snap });
        this.snapshots.push(snap);
      } catch (e) {
        this.trace.note(this.actor, "reconcile_failed", e instanceof Error ? e.message : String(e));
      } finally {
        this.reconcileInFlight = false;
        if (this.reconcileAgain && !this.closed) {
          this.reconcileAgain = false;
          this.reconcile("trailing");
        }
      }
    })();
  }

  /** Step transition: unmount the old step's channel, mount the new one. */
  enter(step: BotStep): void {
    const prev = this.step;
    this.step = step;
    this.stepMark = this.received.mark();
    this.stepMarks.set(step, { received: this.stepMark, snapshots: this.snapshots.mark() });
    this.trace.add({ actor: this.actor, kind: "step", name: step, payload: { from: prev } });
    if (this.strict || step === "exited") {
      this.handle?.remove();
      this.handle = null;
      if (this.strict && CHANNEL_STEPS.has(step)) this.openChannel(step);
    }
    if (this.pollTimer) clearInterval(this.pollTimer);
    this.pollTimer = null;
    if (step === "exited") return;
    // Reconciler (d) every step change, and (c) the poll on waiting steps.
    this.reconcile(`step:${step}`);
    const every = pollIntervalFor(step);
    if (every != null) {
      this.pollTimer = setInterval(() => this.reconcile("poll"), every);
      this.pollTimer.unref?.();
    }
  }

  /** Human pacing between UI-equivalent actions. */
  async think(kind: "tap" | "read" = "tap"): Promise<void> {
    if (this.opts.timing === "fast") return pace(jitter(20, 80));
    return pace(kind === "read" ? jitter(1500, 3000) : jitter(1000, 2000));
  }

  /**
   * Send like the app and trace realtime-js's real status when it resolves.
   * Returns the settle promise (never rejects) so the callers the app awaits
   * (timer_started, match_cancelled, match_ended, result_submitted,
   * match_disputed) can wait on it with `settleWithin(.., SEND_GRACE_MS)`
   * before leaving the step, exactly as the app does since jits-mzfu;
   * everything else stays fire and forget.
   *
   * The channel uses broadcast `ack: true`, so a websocket "ok" means the
   * server received it (the httpSend `{ success }` only means the REST
   * endpoint accepted it). Whether the other side RECEIVED it is what the spy
   * socket and the receiving side's oracles establish. `close()` awaits the
   * outstanding sends so the protocol oracle sees every status.
   */
  private send(event: string, payload: Record<string, unknown>): Promise<unknown> {
    const topic = sessionMatchTopic(this.matchId);
    if (!this.handle) {
      this.trace.add({ actor: this.actor, kind: "note", name: "send_without_channel", topic, payload: { event } });
      return Promise.resolve(undefined);
    }
    const via = this.handle.isSubscribed() ? "ws" : "http";
    const step = this.step ?? undefined;
    // Synchronously, on the channel mounted NOW: a step change right after a
    // fire-and-forget send must race the send exactly as in the app.
    let raw: Promise<unknown>;
    try {
      raw = Promise.resolve(this.handle.send(event, payload));
    } catch (e) {
      raw = Promise.reject(e);
    }
    const p = raw
      .catch((e: unknown) => ({ threw: e instanceof Error ? e.message : String(e) }))
      .then((status) => {
        const ok =
          status === "ok" ||
          (typeof status === "object" && status !== null && (status as { success?: boolean }).success === true);
        this.trace.add({ actor: this.actor, kind: "broadcast_sent", name: event, topic, step, payload, result: { via, status }, ok });
        return status;
      });
    this.pendingSends.push(p);
    return p;
  }

  /** Send, then give it SEND_GRACE_MS to leave before the step unmounts. */
  private async sendAwaited(event: string, payload: Record<string, unknown>): Promise<void> {
    await settleWithin(this.send(event, payload), APP_TIMING.SEND_GRACE_MS);
  }

  private channelLabel(step: BotStep): string {
    return this.strict ? step : "match";
  }

  private receivedMark(step: BotStep): number {
    return this.strict ? (this.stepMarks.get(step)?.received ?? this.received.mark()) : 0;
  }

  /** An event delivered to `step`'s channel while that step was mounted. */
  private seenOn(step: BotStep, event: string, pred: (args: unknown[]) => boolean = () => true): Received | undefined {
    const label = this.channelLabel(step);
    return this.received.find((r) => r.event === event && r.channelStep === label && pred(r.args), this.receivedMark(step));
  }

  /** The newest snapshot read since `step` was entered. */
  private latestSnapshot(step: BotStep): Snapshot | null {
    const since = this.stepMarks.get(step)?.snapshots ?? this.snapshots.mark();
    const items = this.snapshots.items.filter((i) => i.seq >= since);
    return items.length ? items[items.length - 1].value : null;
  }

  /** An event delivered to the CURRENT step's channel since it mounted. */
  waitEvent(event: string, timeoutMs: number, pred: (args: unknown[]) => boolean = () => true): Promise<Received> {
    const channelStep = this.strict ? this.step : "match";
    return this.received.waitFor(
      `${event} on the ${channelStep} channel`,
      (r) => r.event === event && r.channelStep === channelStep && pred(r.args),
      timeoutMs,
      this.strict ? this.stepMark : 0,
    );
  }

  // --- weight / ready ---------------------------------------------------------

  /** The weight step's channel delivered match_cancelled (jits-bh2v). */
  cancelledOnWeight(): boolean {
    return this.stepMarks.has("weight") && !!this.seenOn("weight", E.MATCH_CANCELLED);
  }

  async confirmWeights(): Promise<void> {
    this.enter("weight");
    await this.think("read");
    // The app's weight step leaves the match on the opponent's cancel.
    if (this.cancelledOnWeight()) {
      this.enter("exited");
      return;
    }
    this.enter("ready");
  }

  /**
   * Tap Ready, then behave like ReadyStep (plus the wizard's reconciler)
   * until the match is live or cancelled. `tapReady=false` models an athlete
   * who never taps.
   */
  async readyAndStart(timeoutMs: number, tapReady = true): Promise<ReadyOutcome> {
    if (this.step === "exited" || (this.step === "weight" && this.cancelledOnWeight())) {
      this.trace.note(this.actor, "ready_outcome", { kind: "cancelled", via: "weight_channel" });
      if (this.step !== "exited") this.enter("exited");
      return { kind: "cancelled" };
    }
    if (this.step !== "ready") this.enter("ready");
    const deadline = Date.now() + timeoutMs;
    let myReady = false;
    let opponentReady = false;
    let lastReadySent = 0;
    const sendReady = () => {
      lastReadySent = Date.now();
      this.send(E.READY_SIGNAL, { athlete_id: this.meId });
    };
    if (tapReady) {
      await this.think();
      myReady = true;
      sendReady();
    }
    for (;;) {
      if (myReady && opponentReady) {
        const r = await this.trace.rpc(this.actor, "startMatch", { matchId: this.matchId }, () =>
          startMatch(this.client, this.matchId),
        );
        if (r.ok) {
          const startedAt = r.data.started_at ?? new Date().toISOString();
          await this.sendAwaited(E.TIMER_STARTED, { started_at: startedAt });
          this.enter("live");
          return { kind: "started", startedAt, via: "self" };
        }
        const m = await this.trace.rpc(this.actor, "getMatchDetails", { matchId: this.matchId }, () =>
          getMatchDetails(this.client, this.matchId),
        );
        if (m?.status === "in_progress" && m.started_at) {
          this.enter("live");
          return { kind: "started", startedAt: m.started_at, via: "fallback" };
        }
        throw new Error(`startMatch failed and match is ${m?.status}: ${r.error.message}`);
      }
      if (this.seenOn("ready", E.MATCH_CANCELLED)) {
        this.enter("exited");
        return { kind: "cancelled" };
      }
      const started = this.seenOn("ready", E.TIMER_STARTED);
      if (started) {
        this.enter("live");
        return { kind: "started", startedAt: String(started.args[0]), via: "broadcast" };
      }
      // Repeated ready_signals are harmless: once is enough.
      if (!opponentReady && this.seenOn("ready", E.READY_SIGNAL, (a) => a[0] === this.opponentId)) {
        opponentReady = true;
        continue;
      }
      const snap = this.latestSnapshot("ready");
      const fromDb = snap ? readyFromSnapshot(snap.target) : null;
      if (fromDb === "cancelled") {
        this.trace.note(this.actor, "ready_outcome", { kind: "cancelled", via: "reconciler" });
        this.enter("exited");
        return { kind: "cancelled" };
      }
      if (fromDb === "started") {
        const startedAt = snap!.startedAt ?? new Date().toISOString();
        this.enter("live");
        return { kind: "started", startedAt, via: "reconciler" };
      }
      // ReadyStep repeats ready_signal until the opponent's arrives, because
      // a ready sent before the opponent's channel joined is simply gone.
      if (myReady && !opponentReady && Date.now() - lastReadySent >= APP_TIMING.READY_REPEAT_MS) sendReady();
      if (Date.now() >= deadline) {
        throw new ExpectationTimeout("the ready handshake to complete (bot side)", timeoutMs, {
          myReady,
          opponentReady,
          spy: this.spy.items.map((i) => i.value.event),
          snapshot: snap,
        });
      }
      await pace(TICK_MS);
    }
  }

  async cancelReady(): Promise<void> {
    await this.think();
    const r = await this.trace.rpc(this.actor, "cancelSessionMatch", { matchId: this.matchId }, () =>
      cancelSessionMatch(this.client, this.matchId),
    );
    if (!r.ok) throw new Error(`cancelSessionMatch failed: ${r.error.message}`);
    await this.sendAwaited(E.MATCH_CANCELLED, {});
    this.enter("exited");
  }

  // --- live -------------------------------------------------------------------

  async pause(): Promise<string> {
    await this.think();
    const r = await this.trace.rpc(this.actor, "pauseMatch", { matchId: this.matchId }, () => pauseMatch(this.client, this.matchId));
    if (!r.ok) throw new Error(`pauseMatch failed: ${r.error.message}`);
    this.send(E.TIMER_PAUSED, { paused_at: r.data.paused_at });
    return r.data.paused_at;
  }

  async resume(): Promise<number> {
    await this.think();
    const r = await this.trace.rpc(this.actor, "resumeMatch", { matchId: this.matchId }, () => resumeMatch(this.client, this.matchId));
    if (!r.ok) throw new Error(`resumeMatch failed: ${r.error.message}`);
    this.send(E.TIMER_RESUMED, { total_paused_duration: r.data.total_paused_duration });
    return r.data.total_paused_duration;
  }

  /** Tap End: broadcast only (no RPC, awaited like useLiveControls), then end -> result. */
  async endMatch(): Promise<void> {
    await this.think();
    await this.sendAwaited(E.MATCH_ENDED, {});
    await this.passEndStep();
  }

  /** The opponent ends: receive match_ended in the live step. */
  async waitForEnd(timeoutMs: number): Promise<void> {
    await this.waitEvent(E.MATCH_ENDED, timeoutMs);
    await this.passEndStep();
  }

  /**
   * LiveStep's auto-end: when the timer hits zero, wait AUTO_END_DELAY_MS
   * (1000) and end unless an end already arrived. Mirrors live-step.tsx.
   */
  async waitForEndOrAutoEnd(startedAt: string, durationSeconds: number, pausedSeconds = 0): Promise<"received" | "auto"> {
    const endAt = Date.parse(startedAt) + (durationSeconds + pausedSeconds) * 1000 + 1000;
    const wait = Math.max(0, endAt - Date.now());
    try {
      await this.waitEvent(E.MATCH_ENDED, wait);
      await this.passEndStep();
      return "received";
    } catch (e) {
      if (!(e instanceof ExpectationTimeout)) throw e;
      await this.sendAwaited(E.MATCH_ENDED, {});
      await this.passEndStep();
      return "auto";
    }
  }

  private async passEndStep(): Promise<void> {
    this.enter("end");
    await pace(800); // EndStep's own delay, part of the protocol timing
    this.enter("result");
  }

  // --- result / confirm -----------------------------------------------------

  async record(result: BroadcastResult): Promise<{ ok: boolean; error?: string }> {
    await this.think("read");
    const r = await this.trace.rpc(this.actor, "recordMatchResult", { matchId: this.matchId, ...result }, () =>
      recordMatchResult(this.client, {
        matchId: this.matchId,
        result: result.result,
        winnerId: result.winnerId,
        submissionTypeCode: result.submissionCode,
        finishTimeSeconds: result.finishTimeSeconds,
      }),
    );
    if (!r.ok) return { ok: false, error: r.error.message };
    await this.sendAwaited(E.RESULT_SUBMITTED, result as unknown as Record<string, unknown>);
    this.enter("confirm");
    return { ok: true };
  }

  async waitForResult(timeoutMs: number): Promise<BroadcastResult> {
    const ev = await this.waitEvent(E.RESULT_SUBMITTED, timeoutMs);
    this.enter("confirm");
    return ev.args[0] as BroadcastResult;
  }

  async confirm(): Promise<void> {
    await this.think("read");
    const r = await this.trace.rpc(this.actor, "confirmMatchResult", { matchId: this.matchId }, () =>
      confirmMatchResult(this.client, this.matchId),
    );
    if (!r.ok) {
      // ConfirmStep re-reads the match: most often the opponent disputed.
      this.reconcile("confirm_failed");
      throw new Error(`confirmMatchResult failed: ${r.error.message}`);
    }
    this.myConfirmed = true;
    // Not awaited in the app: the confirm step stays mounted afterwards.
    this.send(E.RESULT_CONFIRMED, { athlete_id: this.meId });
  }

  /** Dispute from the confirm step: RPC, tell the opponent (awaited), summary. */
  async dispute(reason: string): Promise<void> {
    await this.think("read");
    const r = await this.trace.rpc(this.actor, "disputeMatchResult", { matchId: this.matchId, reason }, () =>
      disputeMatchResult(this.client, this.matchId, reason),
    );
    if (!r.ok) throw new Error(`disputeMatchResult failed: ${r.error.message}`);
    await this.sendAwaited(E.MATCH_DISPUTED, { athlete_id: this.meId });
    this.enter("summary");
  }

  /**
   * Wait on the confirm step until the app would leave it (`confirmDecision`),
   * then enter the summary. Never leaves on a `completed` row alone.
   */
  async waitConfirmDone(timeoutMs: number): Promise<ConfirmOutcome> {
    if (this.step !== "confirm") throw new Error(`waitConfirmDone on step ${this.step}`);
    const deadline = Date.now() + timeoutMs;
    for (;;) {
      const signals: ConfirmSignals = {
        meId: this.meId,
        opponentId: this.opponentId,
        myConfirmed: this.myConfirmed,
        opponentConfirmed: !!this.seenOn("confirm", E.RESULT_CONFIRMED, (a) => a[0] === this.opponentId),
        opponentDisputed: !!this.seenOn("confirm", E.MATCH_DISPUTED, (a) => a[0] === this.opponentId),
        snapshot: this.latestSnapshot("confirm"),
      };
      const d = confirmDecision(signals);
      if (d) {
        this.trace.note(this.actor, "confirm_outcome", d.outcome);
        if (d.delayMs) await pace(d.delayMs);
        this.enter("summary");
        return d.outcome;
      }
      if (Date.now() >= deadline) {
        throw new ExpectationTimeout("the confirm step to finish (bot side)", timeoutMs, {
          ...signals,
          spy: this.spy.items.map((i) => i.value.event),
        });
      }
      await pace(TICK_MS);
    }
  }

  /**
   * Did the opponent's match_disputed broadcast reach this side's confirm
   * channel? Broadcast only: the DB reconciler is a backstop, not the signal
   * this oracle is about. Resolves with the event and its payload athlete.
   */
  async waitDisputeSignal(timeoutMs: number): Promise<{ event: string; athlete_id: string }> {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      const b = this.stepMarks.has("confirm") ? this.seenOn("confirm", E.MATCH_DISPUTED) : undefined;
      if (b) return { event: b.event, athlete_id: String(b.args[0]) };
      await pace(200);
    }
    throw new ExpectationTimeout("match_disputed on the non-disputing side's confirm channel", timeoutMs, {
      matchRowUpdates: this.matchRowUpdates.items.map((i) => i.value),
      snapshots: this.snapshots.items.slice(-3).map((i) => i.value),
      spy: this.spy.items.map((i) => i.value.event),
    });
  }

  async close(): Promise<void> {
    this.closed = true;
    if (this.pollTimer) clearInterval(this.pollTimer);
    this.pollTimer = null;
    await Promise.race([Promise.allSettled(this.pendingSends), pace(10_000)]);
    this.handle?.remove();
    this.handle = null;
    if (this.rowChannel) {
      void this.client.removeChannel(this.rowChannel);
      this.rowChannel = null;
    }
    if (this.spyClient) {
      await this.spyClient.removeAllChannels().catch(() => undefined);
      this.spyClient.realtime.disconnect();
      this.spyClient = null;
    }
  }
}
