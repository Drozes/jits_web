/**
 * The bot's half of the 8-step match wizard.
 *
 * Emulates `apps/mobile/components/match-flow/steps/*` and
 * `apps/mobile/lib/match-flow/*`:
 *   weight  local only
 *   ready   ready_signal; when both ready, race start_match, broadcast
 *           timer_started, loser falls back to get_match_details
 *   live    pause/resume RPC + broadcast; End = broadcast match_ended (no RPC)
 *   end     local 800ms, then result
 *   result  record_match_result + result_submitted; or receive it
 *   confirm confirm_match_result + result_confirmed; dispute = RPC only;
 *           plus the dead `matches` postgres_changes listener the app mounts
 *   summary terminal
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
import { getMatchDetails } from "@jits/shared/api/queries";
import {
  createSessionMatchChannel,
  SESSION_MATCH_EVENTS as E,
  sessionMatchTopic,
  type BroadcastResult,
  type SessionMatchChannel,
} from "./protocol";
import { Bus } from "./bus";
import { makeClient, type Client } from "./opponent";
import type { Trace } from "./trace";
import type { Config } from "../config";
import { EnvError, ExpectationTimeout, jitter, pace } from "../lib/util";

export type BotStep = "weight" | "ready" | "live" | "end" | "result" | "confirm" | "summary";
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

const HANDLER_EVENT: Record<string, string> = {
  onTimerStarted: E.TIMER_STARTED,
  onTimerPaused: E.TIMER_PAUSED,
  onTimerResumed: E.TIMER_RESUMED,
  onMatchEnded: E.MATCH_ENDED,
  onReadySignal: E.READY_SIGNAL,
  onResultSubmitted: E.RESULT_SUBMITTED,
  onResultConfirmed: E.RESULT_CONFIRMED,
  onMatchCancelled: E.MATCH_CANCELLED,
};

/** `onMatchDisputed` -> `match_disputed`, for events added after this file. */
function handlerToEvent(prop: string): string {
  return (
    HANDLER_EVENT[prop] ??
    prop
      .replace(/^on/, "")
      .replace(/([a-z])([A-Z])/g, "$1_$2")
      .toLowerCase()
  );
}

export type ReadyOutcome =
  | { kind: "started"; startedAt: string; via: "self" | "broadcast" | "fallback" }
  | { kind: "cancelled" };

export class MatchSide {
  readonly received = new Bus<Received>();
  readonly spy = new Bus<SpyEvent>();
  /** Status values seen by the app-equivalent `matches` postgres_changes listener. */
  readonly matchRowUpdates = new Bus<{ status: string }>();
  step: BotStep | null = null;
  private handle: SessionMatchChannel | null = null;
  private stepMark = 0;
  private spyClient: Client | null = null;
  private spyChannel: RealtimeChannel | null = null;
  private completionChannel: RealtimeChannel | null = null;
  private readonly pendingSends: Promise<void>[] = [];

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

  /** Open the spy (and, in lenient mode, the whole-match channel). */
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
    if (this.opts.fidelity === "lenient") {
      this.openChannel("match");
      this.openCompletionListener();
    }
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
      onStatus: (status, err) =>
        this.trace.add({ actor: this.actor, kind: "channel_status", name: status, topic, step: label, payload: err?.message }),
    });
  }

  /** Emulates `useMatchCompletion` (postgres_changes on `matches`). */
  private openCompletionListener(): void {
    const topic = `match-complete:${this.matchId}`;
    this.completionChannel = this.client
      .channel(topic)
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "matches", filter: `id=eq.${this.matchId}` },
        ({ new: row }) => {
          const status = String((row as { status?: string }).status);
          this.trace.add({ actor: this.actor, kind: "pg_change", name: "matches_update", topic, payload: { status } });
          this.matchRowUpdates.push({ status });
        },
      )
      .subscribe((status) => this.trace.add({ actor: this.actor, kind: "channel_status", name: status, topic }));
  }

  private closeCompletionListener(): void {
    if (this.completionChannel) {
      void this.client.removeChannel(this.completionChannel);
      this.completionChannel = null;
    }
  }

  /** Step transition: unmount the old step's channel, mount the new one. */
  enter(step: BotStep): void {
    const prev = this.step;
    this.step = step;
    this.stepMark = this.received.mark();
    this.trace.add({ actor: this.actor, kind: "step", name: step, payload: { from: prev } });
    if (this.opts.fidelity === "strict") {
      this.handle?.remove();
      this.handle = null;
      if (prev === "confirm") this.closeCompletionListener();
      // weight / end / summary mount no channel in the app.
      if (step === "ready" || step === "live" || step === "result" || step === "confirm") {
        this.openChannel(step);
      }
      if (step === "confirm") this.openCompletionListener();
    }
  }

  /** Human pacing between UI-equivalent actions. */
  async think(kind: "tap" | "read" = "tap"): Promise<void> {
    if (this.opts.timing === "fast") return pace(jitter(20, 80));
    return pace(kind === "read" ? jitter(1500, 3000) : jitter(1000, 2000));
  }

  /**
   * Send exactly like the app (fire and forget: the caller transitions
   * immediately, so "send then unmount" races are reproduced), and trace
   * realtime-js's real status when it resolves. `close()` awaits the
   * outstanding sends so the protocol oracle sees every status.
   */
  private send(event: string, payload: Record<string, unknown>): void {
    const topic = sessionMatchTopic(this.matchId);
    if (!this.handle) {
      this.trace.add({ actor: this.actor, kind: "note", name: "send_without_channel", topic, payload: { event } });
      return;
    }
    const via = this.handle.isSubscribed() ? "ws" : "http";
    const step = this.step ?? undefined;
    const p = this.handle
      .send(event, payload)
      .catch((e: unknown) => ({ threw: e instanceof Error ? e.message : String(e) }))
      .then((status) => {
        const ok =
          status === "ok" ||
          (typeof status === "object" && status !== null && (status as { success?: boolean }).success === true);
        this.trace.add({ actor: this.actor, kind: "broadcast_sent", name: event, topic, step, payload, result: { via, status }, ok });
      });
    this.pendingSends.push(p);
  }

  /** An event delivered to the CURRENT step's channel since it mounted. */
  waitEvent(event: string, timeoutMs: number, pred: (args: unknown[]) => boolean = () => true): Promise<Received> {
    const channelStep = this.opts.fidelity === "strict" ? this.step : "match";
    return this.received.waitFor(
      `${event} on the ${channelStep} channel`,
      (r) => r.event === event && r.channelStep === channelStep && pred(r.args),
      timeoutMs,
      this.opts.fidelity === "strict" ? this.stepMark : 0,
    );
  }

  // --- weight / ready ---------------------------------------------------------

  async confirmWeights(): Promise<void> {
    this.enter("weight");
    await this.think("read");
    this.enter("ready");
  }

  /**
   * Tap Ready, then behave like ReadyStep until the match is live or
   * cancelled. `tapReady=false` models an athlete who never taps.
   */
  async readyAndStart(timeoutMs: number, tapReady = true): Promise<ReadyOutcome> {
    if (this.step !== "ready") this.enter("ready");
    const mark = this.stepMark;
    const deadline = Date.now() + timeoutMs;
    let myReady = false;
    let opponentReady = false;
    if (tapReady) {
      await this.think();
      myReady = true;
      this.send(E.READY_SIGNAL, { athlete_id: this.meId });
    }
    for (;;) {
      if (myReady && opponentReady) {
        const r = await this.trace.rpc(this.actor, "startMatch", { matchId: this.matchId }, () =>
          startMatch(this.client, this.matchId),
        );
        if (r.ok) {
          const startedAt = r.data.started_at ?? new Date().toISOString();
          this.send(E.TIMER_STARTED, { started_at: startedAt });
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
      const remaining = deadline - Date.now();
      if (remaining <= 0) {
        throw new ExpectationTimeout("the ready handshake to complete (bot side)", timeoutMs, {
          myReady,
          opponentReady,
          spy: this.spy.items.map((i) => i.value.event),
        });
      }
      const ev = await this.received
        .waitFor(
          "ready-step event",
          (r) =>
            r.channelStep === (this.opts.fidelity === "strict" ? "ready" : "match") &&
            ((r.event === E.READY_SIGNAL && (r.args[0] as string) === this.opponentId && !opponentReady) ||
              r.event === E.TIMER_STARTED ||
              r.event === E.MATCH_CANCELLED),
          remaining,
          this.opts.fidelity === "strict" ? mark : 0,
        )
        .catch((e) => {
          if (e instanceof ExpectationTimeout) return null;
          throw e;
        });
      if (!ev) continue;
      if (ev.event === E.MATCH_CANCELLED) return { kind: "cancelled" };
      if (ev.event === E.TIMER_STARTED) {
        this.enter("live");
        return { kind: "started", startedAt: String(ev.args[0]), via: "broadcast" };
      }
      opponentReady = true;
    }
  }

  async cancelReady(): Promise<void> {
    await this.think();
    const r = await this.trace.rpc(this.actor, "cancelSessionMatch", { matchId: this.matchId }, () =>
      cancelSessionMatch(this.client, this.matchId),
    );
    if (!r.ok) throw new Error(`cancelSessionMatch failed: ${r.error.message}`);
    this.send(E.MATCH_CANCELLED, {});
    this.enter("summary");
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

  /** Tap End: broadcast only (no RPC), then end -> result. */
  async endMatch(): Promise<void> {
    await this.think();
    this.send(E.MATCH_ENDED, {});
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
      this.send(E.MATCH_ENDED, {});
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
    this.send(E.RESULT_SUBMITTED, result as unknown as Record<string, unknown>);
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
    if (!r.ok) throw new Error(`confirmMatchResult failed: ${r.error.message}`);
    this.send(E.RESULT_CONFIRMED, { athlete_id: this.meId });
  }

  async dispute(reason: string): Promise<void> {
    await this.think("read");
    const r = await this.trace.rpc(this.actor, "disputeMatchResult", { matchId: this.matchId, reason }, () =>
      disputeMatchResult(this.client, this.matchId, reason),
    );
    if (!r.ok) throw new Error(`disputeMatchResult failed: ${r.error.message}`);
    this.enter("summary");
  }

  async waitOpponentConfirmed(timeoutMs: number): Promise<void> {
    await this.waitEvent(E.RESULT_CONFIRMED, timeoutMs, (a) => a[0] === this.opponentId);
    // ConfirmStep advances 1.5s after both confirmed locally.
    await pace(1500);
    this.enter("summary");
  }

  /**
   * Would the app on this side learn of a dispute? Only through channels the
   * app actually has: the `matches` postgres_changes listener, or a
   * session-match broadcast whose name mentions a dispute.
   */
  async waitDisputeSignal(timeoutMs: number): Promise<string> {
    const deadline = Date.now() + timeoutMs;
    const channelStep = this.opts.fidelity === "strict" ? "confirm" : "match";
    while (Date.now() < deadline) {
      // Whole-match buses (one MatchSide per match): any time counts.
      if (this.matchRowUpdates.find((u) => u.status === "disputed", 0)) return "postgres_changes matches.status=disputed";
      const b = this.received.find(
        (r) => /disput/i.test(r.event) && r.channelStep === channelStep,
        this.opts.fidelity === "strict" ? this.stepMark : 0,
      );
      if (b) return `broadcast ${b.event}`;
      await new Promise((r) => setTimeout(r, 200));
    }
    throw new ExpectationTimeout("a dispute signal on the non-disputing side (H1/H2)", timeoutMs, {
      matchRowUpdates: this.matchRowUpdates.items.map((i) => i.value),
      spy: this.spy.items.map((i) => i.value.event),
    });
  }

  async close(): Promise<void> {
    await Promise.race([Promise.allSettled(this.pendingSends), pace(10_000)]);
    this.handle?.remove();
    this.handle = null;
    this.closeCompletionListener();
    if (this.spyClient) {
      await this.spyClient.removeAllChannels().catch(() => undefined);
      this.spyClient.realtime.disconnect();
      this.spyClient = null;
    }
  }
}
