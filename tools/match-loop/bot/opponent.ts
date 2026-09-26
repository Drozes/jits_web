/**
 * MobileOpponent: a headless athlete that speaks the mobile app's Arena
 * protocol through `@jits/shared` and the same realtime topics and events.
 *
 * Mirrors `apps/mobile/lib/arena/use-arena-challenge.ts`,
 * `use-arena-live.ts` and `use-lobby-presence.ts`. When those change, this
 * file must change with them (the protocol oracle will say so).
 */
import { createClient, type RealtimeChannel, type SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@jits/shared/types/database";
import {
  acceptChallenge,
  cancelChallenge,
  createChallenge,
  declineChallenge,
  declineOtherPendingChallenges,
  startMatchFromChallenge,
  toggleMatchPreferences,
} from "@jits/shared/api/mutations";
import { getChallengeStatus } from "@jits/shared/api/queries";
import { APP_ONLINE_TOPIC, APP_TIMING, CHALLENGE_EVENTS, LOBBY_TOPIC, challengeTopic } from "./protocol";
import { Bus } from "./bus";
import type { Trace } from "./trace";
import type { Config } from "../config";
import { EnvError, ExpectationTimeout } from "../lib/util";

export type Client = SupabaseClient<Database>;

export interface Identity {
  id: string;
  email: string;
  displayName: string;
  key: "red" | "green" | "blue";
}

export interface ChallengeRow {
  id: string;
  challenger_id: string;
  opponent_id: string;
  status: string;
  expires_at?: string | null;
  match_type?: string;
}

export type ArenaEvent =
  | { kind: "incoming_insert"; row: ChallengeRow }
  | { kind: "incoming_update"; row: ChallengeRow }
  | { kind: "outgoing_update"; row: ChallengeRow }
  | { kind: "match_started"; challengeId: string; matchId: string }
  | { kind: "declined"; challengeId: string };

export type OutgoingOutcome =
  | { kind: "match_started"; matchId: string; via: "broadcast" | "status_fallback" | "accepted_fallback" }
  | { kind: "declined"; via: "broadcast" | "status" }
  | { kind: "cancelled" }
  | { kind: "expired" };

/** What `acceptLikeApp` did, mirroring the app's `accept()`. */
export type AcceptOutcome =
  /** In a match: the accepted challenge's, or my own outgoing one that had already started. */
  | { kind: "entered"; challengeId: string; matchId: string; via: "accepted" | "joined_own" }
  /** Stopped accepting; my own outgoing challenge will take me in (`waitOutgoingOutcome`). */
  | { kind: "waiting_on_outgoing"; challengeId: string; reason: "own_accepted" | "lost_canonical_row" }
  | { kind: "failed"; code: string; message: string };

/**
 * Statuses in which an outgoing challenge can still turn into a match
 * (`LIVE_CHALLENGE_STATUSES` in use-arena-challenge.ts).
 */
export const LIVE_CHALLENGE_STATUSES: ReadonlySet<string> = new Set(["pending", "accepted", "started"]);

/**
 * The crossing tie-break from the app's `accept()`: when I accept a challenge
 * from the athlete my own outgoing challenge targets, the challenge with the
 * LOWER id is canonical. Its recipient accepts it straight away; the other
 * side withdraws its own (the canonical one) first, pending-guarded.
 */
export function crossingPlan(
  incomingId: string,
  incomingChallengerId: string,
  mine: { challengeId: string; opponentId: string } | null,
): { crossing: boolean; acceptCanonical: boolean } {
  const crossing = !!mine && mine.opponentId === incomingChallengerId;
  return { crossing, acceptCanonical: crossing && !!mine && incomingId < mine.challengeId };
}

/**
 * What the challenger's app does with its outgoing row's status (the
 * challenger UPDATE listener and `recheckOutgoing`): enter only on `started`;
 * on `accepted` arm the `ACCEPTED_FALLBACK_MS` safety net and keep waiting
 * (starting on `accepted` is the jits-njyd race); any non-live status ends
 * the plate.
 */
export function outgoingStatusAction(status: string): "wait" | "arm_fallback" | "enter" | "end" {
  if (status === "started") return "enter";
  if (status === "accepted") return "arm_fallback";
  return LIVE_CHALLENGE_STATUSES.has(status) ? "wait" : "end";
}

/** A challenge insert the database refused, with the mapped and raw codes. */
export class ChallengeRefused extends Error {
  override name = "ChallengeRefused";
  constructor(
    readonly code: string,
    /** Postgres SQLSTATE, e.g. 42501 for an RLS WITH CHECK refusal. */
    readonly pgCode: string | null,
    message: string,
  ) {
    super(`createChallenge refused: ${code} (${pgCode ?? "?"}) ${message}`);
  }
}

/** Build a client exactly as the app configures its realtime socket. */
export function makeClient(cfg: Config): Client {
  return createClient<Database>(cfg.supabaseUrl, cfg.publishableKey, {
    auth: { persistSession: false, autoRefreshToken: true, detectSessionInUrl: false },
    realtime: { heartbeatIntervalMs: 15_000 },
  });
}

export class MobileOpponent {
  readonly client: Client;
  readonly events = new Bus<ArenaEvent>();
  readonly lobby = new Set<string>();
  readonly appOnline = new Set<string>();
  private lobbyChannel: RealtimeChannel | null = null;
  private appChannel: RealtimeChannel | null = null;
  private incomingChannel: RealtimeChannel | null = null;
  private outgoingChannel: RealtimeChannel | null = null;
  private live = false;
  private weight: number | null = null;
  private elo = 1000;
  outgoingId: string | null = null;
  /** Whom my outgoing challenge targets (the crossing check needs it). */
  outgoingOpponentId: string | null = null;
  /** The last post-entry settle (`settleOthersAfterEntry`), for scenarios to await. */
  lastSettle: Promise<void> = Promise.resolve();
  /** Bus position after the last incoming challenge `waitForIncoming` returned. */
  private incomingSeen = 0;

  constructor(
    private readonly cfg: Config,
    readonly me: Identity,
    private readonly trace: Trace,
    private readonly password: string,
  ) {
    this.client = makeClient(cfg);
  }

  private get actor() {
    return `bot:${this.me.key}`;
  }

  async signIn(): Promise<void> {
    const { error } = await this.client.auth.signInWithPassword({
      email: this.me.email,
      password: this.password,
    });
    if (error) throw new EnvError(`bot sign-in failed for ${this.me.email}: ${error.message}`);
    this.trace.note(this.actor, "signed_in", { email: this.me.email });
    await this.refreshSelf();
    this.startObservers();
  }

  async refreshSelf(): Promise<void> {
    const { data } = await this.client
      .from("athletes")
      .select("current_elo, current_weight")
      .eq("id", this.me.id)
      .maybeSingle();
    this.elo = data?.current_elo ?? 1000;
    this.weight = data?.current_weight ?? null;
  }

  /** Presence observers + the incoming/outgoing postgres_changes listener. */
  private startObservers(): void {
    const lobby = this.client.channel(LOBBY_TOPIC, { config: { presence: { key: this.me.id } } });
    lobby.on("presence", { event: "sync" }, () => {
      const ids = Object.keys(lobby.presenceState());
      this.lobby.clear();
      for (const id of ids) this.lobby.add(id);
      this.trace.add({ actor: this.actor, kind: "presence", name: "lobby_sync", topic: LOBBY_TOPIC, payload: ids });
    });
    lobby.subscribe((status) => {
      this.trace.add({ actor: this.actor, kind: "channel_status", name: status, topic: LOBBY_TOPIC });
      if (status === "SUBSCRIBED" && this.live) void this.trackLobby();
    });
    this.lobbyChannel = lobby;

    const app = this.client.channel(APP_ONLINE_TOPIC, { config: { presence: { key: this.me.id } } });
    app.on("presence", { event: "sync" }, () => {
      this.appOnline.clear();
      for (const id of Object.keys(app.presenceState())) this.appOnline.add(id);
    });
    app.subscribe((status) => {
      if (status === "SUBSCRIBED") {
        void app.track({ athlete_id: this.me.id, display_name: this.me.displayName, profile_photo_url: null });
      }
    });
    this.appChannel = app;

    const instance = Math.random().toString(36).slice(2, 10);
    const topic = `arena-incoming:${this.me.id}:${instance}`;
    this.incomingChannel = this.client
      .channel(topic)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "challenges", filter: `opponent_id=eq.${this.me.id}` },
        (p) => {
          const row = p.new as ChallengeRow;
          this.trace.add({ actor: this.actor, kind: "pg_change", name: "challenge_insert", payload: row });
          this.events.push({ kind: "incoming_insert", row });
        },
      )
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "challenges", filter: `opponent_id=eq.${this.me.id}` },
        (p) => {
          const row = p.new as ChallengeRow;
          this.trace.add({ actor: this.actor, kind: "pg_change", name: "incoming_update", payload: row });
          this.events.push({ kind: "incoming_update", row });
        },
      )
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "challenges", filter: `challenger_id=eq.${this.me.id}` },
        (p) => {
          const row = p.new as ChallengeRow;
          this.trace.add({ actor: this.actor, kind: "pg_change", name: "outgoing_update", payload: row });
          this.events.push({ kind: "outgoing_update", row });
        },
      )
      .subscribe((status) => {
        this.trace.add({ actor: this.actor, kind: "channel_status", name: status, topic });
      });
  }

  /** Resolves once the incoming listener has joined (so an INSERT is not missed). */
  async ready(timeoutMs = 10_000): Promise<void> {
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
      const st = this.incomingChannel?.state;
      if (st === "joined" && this.lobbyChannel?.state === "joined") return;
      await new Promise((r) => setTimeout(r, 100));
    }
    throw new EnvError(`bot ${this.me.key} realtime channels did not join within ${timeoutMs}ms`);
  }

  private async trackLobby(): Promise<void> {
    await this.lobbyChannel?.track({
      athlete_id: this.me.id,
      display_name: this.me.displayName,
      current_elo: this.elo,
      looking_for_casual: false,
      looking_for_ranked: true,
    });
  }

  /** Flag first, then presence (use-arena-live.ts step()). */
  async goLive(): Promise<void> {
    const r = await this.trace.rpc(this.actor, "toggleMatchPreferences", { ranked: true }, () =>
      toggleMatchPreferences(this.client, this.me.id, { lookingForCasual: false, lookingForRanked: true }),
    );
    if (!r.ok) throw new EnvError(`bot goLive failed: ${r.error.message}`);
    this.live = true;
    await this.refreshSelf();
    if (this.lobbyChannel?.state === "joined") await this.trackLobby();
  }

  async goOffline(): Promise<void> {
    this.live = false;
    await this.lobbyChannel?.untrack().catch(() => undefined);
    await this.trace.rpc(this.actor, "toggleMatchPreferences", { ranked: false }, () =>
      toggleMatchPreferences(this.client, this.me.id, { lookingForCasual: false, lookingForRanked: false }),
    );
  }

  // --- Challenger side --------------------------------------------------------

  async challenge(opponentId: string): Promise<string> {
    const r = await this.trace.rpc(this.actor, "createChallenge", { opponentId }, () =>
      createChallenge(this.client, {
        opponentId,
        matchType: "ranked",
        challengerWeight: this.weight ?? undefined,
      }),
    );
    if (!r.ok) {
      const raw = (r.error as { raw?: { code?: string } }).raw;
      throw new ChallengeRefused(r.error.code, raw?.code ?? null, r.error.message);
    }
    const id = r.data.id;
    this.outgoingId = id;
    this.outgoingOpponentId = opponentId;
    // The app subscribes to its outgoing challenge channel after the insert.
    const topic = challengeTopic(id);
    this.outgoingChannel = this.client
      .channel(topic)
      .on("broadcast", { event: CHALLENGE_EVENTS.MATCH_STARTED }, ({ payload }) => {
        this.trace.add({ actor: this.actor, kind: "broadcast_recv", name: CHALLENGE_EVENTS.MATCH_STARTED, topic, payload });
        const matchId = (payload as { matchId?: string })?.matchId;
        if (matchId) this.events.push({ kind: "match_started", challengeId: id, matchId });
      })
      .on("broadcast", { event: CHALLENGE_EVENTS.DECLINED }, ({ payload }) => {
        this.trace.add({ actor: this.actor, kind: "broadcast_recv", name: CHALLENGE_EVENTS.DECLINED, topic, payload });
        this.events.push({ kind: "declined", challengeId: id });
      })
      .subscribe((status) => {
        this.trace.add({ actor: this.actor, kind: "channel_status", name: status, topic });
      });
    return id;
  }

  /**
   * What the challenger's app would conclude, mirroring use-arena-challenge.ts:
   *  - the `match_started` / `declined` broadcast on the challenge topic;
   *  - the status UPDATE: `started` joins (idempotent start), a terminal
   *    status ends the plate, and `accepted` only arms the safety net. The app
   *    never starts on `accepted` (jits-njyd): it waits for the accepter's
   *    broadcast or `started`, and only when the row is still `accepted`
   *    `ACCEPTED_FALLBACK_MS` later does it start the match itself.
   * Entering a match also runs the app's post-entry settle (`lastSettle`).
   * `fallbackMs` is the app's constant; only unit tests shorten it.
   */
  async waitOutgoingOutcome(timeoutMs: number, fallbackMs: number = APP_TIMING.ACCEPTED_FALLBACK_MS): Promise<OutgoingOutcome> {
    const id = this.outgoingId;
    if (!id) throw new Error("no outgoing challenge");
    const peer = this.outgoingOpponentId;
    const what = `outcome of outgoing challenge ${id}`;
    const deadline = Date.now() + timeoutMs;
    let acceptedAt: number | null = null;
    const enter = async (via: "status_fallback" | "accepted_fallback"): Promise<OutgoingOutcome> => {
      const started = await this.trace.rpc(this.actor, "startMatchFromChallenge", { challengeId: id, via }, () =>
        startMatchFromChallenge(this.client, id),
      );
      if (!started.ok) throw new Error(`fallback start failed: ${started.error.message}`);
      this.entered(id, started.data.match_id, peer);
      return { kind: "match_started", matchId: started.data.match_id, via };
    };
    const ended = (status: string): OutgoingOutcome => {
      if (status === "declined") return { kind: "declined", via: "status" };
      if (status === "expired") return { kind: "expired" };
      return { kind: "cancelled" };
    };
    for (;;) {
      const now = Date.now();
      const remaining = deadline - now;
      if (remaining <= 0) throw new ExpectationTimeout(what, timeoutMs, this.events.items.slice(-10).map((i) => i.value));
      const fallbackIn = acceptedAt === null ? Infinity : acceptedAt + fallbackMs - now;
      let ev: ArenaEvent;
      try {
        ev = await this.events.waitFor(
          what,
          (e) =>
            ((e.kind === "match_started" || e.kind === "declined") && e.challengeId === id) ||
            (e.kind === "outgoing_update" &&
              e.row.id === id &&
              e.row.status !== "pending" &&
              // Once the safety net is armed, the same `accepted` UPDATE in
              // the backlog must not re-arm it.
              !(e.row.status === "accepted" && acceptedAt !== null)),
          Math.max(1, Math.min(remaining, fallbackIn)),
          0, // filtered by this challenge's id, so any time since sign-in counts
        );
      } catch (e) {
        // The wait was cut short by the safety net, not the overall deadline.
        // (Compared up front: a timer can fire a millisecond before Date.now()
        // says it is due.)
        const netDue = fallbackIn <= remaining;
        if (!(e instanceof ExpectationTimeout) || !netDue) throw e;
        // The safety net fired: re-read the row, as `recheckOutgoing(id, true)`.
        acceptedAt = null;
        const read = await this.trace.rpc(this.actor, "getChallengeStatus", { challengeId: id, why: "accepted_fallback" }, () =>
          getChallengeStatus(this.client, id),
        );
        if (!read.ok || !read.data) continue;
        const st = read.data.status;
        if (st === "accepted" || st === "started") return enter("accepted_fallback");
        if (!LIVE_CHALLENGE_STATUSES.has(st)) return ended(st);
        continue;
      }
      if (ev.kind === "match_started") {
        this.entered(id, ev.matchId, peer);
        return { kind: "match_started", matchId: ev.matchId, via: "broadcast" };
      }
      if (ev.kind === "declined") return { kind: "declined", via: "broadcast" };
      if (ev.kind !== "outgoing_update") throw new Error("unreachable");
      const action = outgoingStatusAction(ev.row.status);
      if (action === "end") return ended(ev.row.status);
      if (action === "enter") return enter("status_fallback");
      if (action === "arm_fallback") {
        acceptedAt = Date.now();
        this.trace.note(this.actor, "accepted_fallback_armed", { challengeId: id, ms: fallbackMs });
      }
    }
  }

  async cancelOutgoing(): Promise<void> {
    const id = this.outgoingId;
    if (!id) return;
    const r = await this.trace.rpc(this.actor, "cancelChallenge", { challengeId: id }, () =>
      cancelChallenge(this.client, id),
    );
    if (!r.ok) throw new Error(`cancelChallenge failed: ${r.error.message}`);
    await this.clearOutgoing();
  }

  async clearOutgoing(): Promise<void> {
    this.outgoingId = null;
    this.outgoingOpponentId = null;
    if (this.outgoingChannel) {
      await this.client.removeChannel(this.outgoingChannel);
      this.outgoingChannel = null;
    }
  }

  // --- Opponent side ----------------------------------------------------------

  /** The next pending challenge INSERT addressed to me. */
  async waitForIncoming(timeoutMs: number, fromId?: string, since = this.incomingSeen): Promise<ChallengeRow> {
    const ev = await this.events.waitFor(
      `incoming challenge${fromId ? ` from ${fromId}` : ""}`,
      (e) => e.kind === "incoming_insert" && e.row.status === "pending" && (!fromId || e.row.challenger_id === fromId),
      timeoutMs,
      since,
    );
    // The next call waits for a NEWER insert than this one.
    this.incomingSeen = this.events.mark();
    return (ev as { row: ChallengeRow }).row;
  }

  /** accept -> start -> broadcast match_started (1 retry) BEFORE navigating. */
  async accept(challengeId: string): Promise<string> {
    const a = await this.trace.rpc(this.actor, "acceptChallenge", { challengeId }, () =>
      acceptChallenge(this.client, { challengeId, opponentWeight: this.weight ?? undefined }),
    );
    if (!a.ok) throw new Error(`acceptChallenge failed: ${a.error.message}`);
    const s = await this.trace.rpc(this.actor, "startMatchFromChallenge", { challengeId }, () =>
      startMatchFromChallenge(this.client, challengeId),
    );
    if (!s.ok) throw new Error(`startMatchFromChallenge failed: ${s.error.code} ${s.error.message}`);
    const matchId = s.data.match_id;
    await this.broadcastOnChallenge(challengeId, CHALLENGE_EVENTS.MATCH_STARTED, { matchId });
    return matchId;
  }

  async decline(challengeId: string): Promise<void> {
    const r = await this.trace.rpc(this.actor, "declineChallenge", { challengeId }, () =>
      declineChallenge(this.client, challengeId),
    );
    if (!r.ok) throw new Error(`declineChallenge failed: ${r.error.message}`);
    await this.broadcastOnChallenge(challengeId, CHALLENGE_EVENTS.DECLINED, {});
  }

  /**
   * The app's `accept()` for the prompt it would show (challenge `challengeId`
   * from `challengerId`), with the crossing tie-break and the handling of my
   * own outgoing challenge (`resolveOwnOutgoing`). `accept` above is the
   * simple path for a bot with nothing of its own out; use this one when the
   * bot may have a challenge out too.
   */
  async acceptLikeApp(challengeId: string, challengerId: string): Promise<AcceptOutcome> {
    const mine =
      this.outgoingId && this.outgoingOpponentId
        ? { challengeId: this.outgoingId, opponentId: this.outgoingOpponentId }
        : null;
    const { crossing, acceptCanonical } = crossingPlan(challengeId, challengerId, mine);
    this.trace.note(this.actor, "accept_plan", { challengeId, mine: mine?.challengeId ?? null, crossing, acceptCanonical });

    if (mine && !acceptCanonical) {
      const own = await this.resolveOwnOutgoing(mine, challengeId, crossing);
      if (own !== "proceed") return own;
    }

    const a = await this.trace.rpc(this.actor, "acceptChallenge", { challengeId }, () =>
      acceptChallenge(this.client, { challengeId, opponentWeight: this.weight ?? undefined }),
    );
    if (!a.ok) return { kind: "failed", code: a.error.code, message: a.error.message };

    const start = () =>
      this.trace.rpc(this.actor, "startMatchFromChallenge", { challengeId }, () =>
        startMatchFromChallenge(this.client, challengeId),
      );
    let started = await start();
    if (!started.ok) started = await start();
    if (!started.ok && started.error.code !== "CHALLENGE_NOT_ACCEPTED") {
      // Accepted but could not start: withdraw so the challenger's plate
      // clears; no row changed means my start probably landed, so ask again.
      const withdrawn = await this.trace.rpc(this.actor, "cancelChallenge", { challengeId, why: "start_failed" }, () =>
        cancelChallenge(this.client, challengeId),
      );
      if (withdrawn.ok && !withdrawn.data.cancelled) started = await start();
    }
    if (!started.ok) {
      // Crossing, and the other side won the canonical row by withdrawing it
      // to accept mine: its broadcast is on the way to my own plate.
      if (acceptCanonical && mine && this.outgoingId === mine.challengeId) {
        return { kind: "waiting_on_outgoing", challengeId: mine.challengeId, reason: "lost_canonical_row" };
      }
      return { kind: "failed", code: started.error.code, message: started.error.message };
    }
    const matchId = started.data.match_id;
    // Before "navigating", always, exactly like the app.
    await this.broadcastOnChallenge(challengeId, CHALLENGE_EVENTS.MATCH_STARTED, { matchId });
    this.entered(challengeId, matchId, challengerId);
    return { kind: "entered", challengeId, matchId, via: "accepted" };
  }

  /** The app's `resolveOwnOutgoing`: my own challenge is out while I accept another. */
  private async resolveOwnOutgoing(
    mine: { challengeId: string; opponentId: string },
    currentId: string,
    crossing: boolean,
  ): Promise<"proceed" | AcceptOutcome> {
    const withdrawn = await this.trace.rpc(
      this.actor,
      "cancelChallenge",
      { challengeId: mine.challengeId, onlyIfPending: true, why: "own_before_accept" },
      () => cancelChallenge(this.client, mine.challengeId, { onlyIfPending: true }),
    );
    if (!withdrawn.ok) return { kind: "failed", code: withdrawn.error.code, message: withdrawn.error.message };
    if (withdrawn.data.cancelled) {
      await this.clearOutgoing();
      return "proceed";
    }
    const read = await this.trace.rpc(this.actor, "getChallengeStatus", { challengeId: mine.challengeId }, () =>
      getChallengeStatus(this.client, mine.challengeId),
    );
    if (!read.ok) return { kind: "failed", code: read.error.code, message: read.error.message };
    const status = read.data?.status ?? null;
    if (status === "started") {
      const s = await this.trace.rpc(this.actor, "startMatchFromChallenge", { challengeId: mine.challengeId }, () =>
        startMatchFromChallenge(this.client, mine.challengeId),
      );
      if (!s.ok) return { kind: "failed", code: s.error.code, message: s.error.message };
      this.entered(mine.challengeId, s.data.match_id, mine.opponentId);
      return { kind: "entered", challengeId: mine.challengeId, matchId: s.data.match_id, via: "joined_own" };
    }
    if (status === "accepted") {
      // The other side is starting mine right now: let go of the prompt and
      // keep waiting on my plate (`waitOutgoingOutcome` arms the safety net).
      if (crossing) {
        await this.trace.rpc(this.actor, "cancelChallenge", { challengeId: currentId, onlyIfPending: true, why: "crossing" }, () =>
          cancelChallenge(this.client, currentId, { onlyIfPending: true }),
        );
      } else {
        const d = await this.trace.rpc(this.actor, "declineChallenge", { challengeId: currentId }, () =>
          declineChallenge(this.client, currentId),
        );
        if (d.ok) await this.broadcastOnChallenge(currentId, CHALLENGE_EVENTS.DECLINED, {});
      }
      return { kind: "waiting_on_outgoing", challengeId: mine.challengeId, reason: "own_accepted" };
    }
    await this.clearOutgoing();
    return "proceed";
  }

  /**
   * An accepter whose start never happened (E20): accept the row and stop,
   * with no start and no broadcast, so the row sits at `accepted`.
   */
  async acceptWithoutStart(challengeId: string): Promise<void> {
    const a = await this.trace.rpc(this.actor, "acceptChallenge", { challengeId, startDeliberatelySkipped: true }, () =>
      acceptChallenge(this.client, { challengeId, opponentWeight: this.weight ?? undefined }),
    );
    if (!a.ok) throw new Error(`acceptChallenge failed: ${a.error.message}`);
  }

  /** The realtime UPDATE of a challenge addressed to me reaching `status`. */
  async waitIncomingStatus(challengeId: string, status: string, timeoutMs: number): Promise<ChallengeRow> {
    const ev = await this.events.waitFor(
      `incoming challenge ${challengeId} -> ${status}`,
      (e) => e.kind === "incoming_update" && e.row.id === challengeId && e.row.status === status,
      timeoutMs,
      0, // filtered by challenge id
    );
    return (ev as { row: ChallengeRow }).row;
  }

  /** Join the match that already exists for `challengeId` (the RPC is idempotent). */
  async joinStarted(challengeId: string): Promise<string> {
    const s = await this.trace.rpc(this.actor, "startMatchFromChallenge", { challengeId, why: "join" }, () =>
      startMatchFromChallenge(this.client, challengeId),
    );
    if (!s.ok) throw new Error(`startMatchFromChallenge failed: ${s.error.code} ${s.error.message}`);
    return s.data.match_id;
  }

  /**
   * The app's `enterMatch` bookkeeping: drop the plate, then (fire and
   * forget, like `settleOthersAfterEntry`) withdraw my own outgoing challenge
   * if it did not become this match, and decline every other fresh pending
   * challenge I received, with the broadcast, except one from `peerId` (the
   * other half of a crossing pair), which is withdrawn quietly.
   */
  private entered(challengeId: string, matchId: string, peerId: string | null): void {
    const stranded = this.outgoingId && this.outgoingId !== challengeId ? this.outgoingId : null;
    this.trace.note(this.actor, "entered_match", { challengeId, matchId, peerId, stranded });
    void this.clearOutgoing();
    const settle = async () => {
      if (stranded) {
        await this.trace.rpc(this.actor, "cancelChallenge", { challengeId: stranded, onlyIfPending: true, why: "stranded" }, () =>
          cancelChallenge(this.client, stranded, { onlyIfPending: true }),
        );
      }
      const opts = { keepChallengeId: challengeId, exceptChallengerId: peerId };
      const r = await this.trace.rpc(this.actor, "declineOtherPendingChallenges", opts, () =>
        declineOtherPendingChallenges(this.client, this.me.id, opts),
      );
      if (!r.ok) return;
      for (const c of r.data.skipped) {
        void this.trace.rpc(this.actor, "cancelChallenge", { challengeId: c.challengeId, onlyIfPending: true, why: "crossing_peer" }, () =>
          cancelChallenge(this.client, c.challengeId, { onlyIfPending: true }),
        );
      }
      await Promise.all(r.data.declined.map((c) => this.broadcastOnChallenge(c.challengeId, CHALLENGE_EVENTS.DECLINED, {})));
    };
    this.lastSettle = settle().catch((e: unknown) => {
      this.trace.note(this.actor, "settle_failed", String(e));
    });
  }

  /** Same shape as the app's `broadcast()`: unjoined channel, REST send, 1 retry. */
  private async broadcastOnChallenge(challengeId: string, event: string, payload: Record<string, unknown>): Promise<boolean> {
    const topic = challengeTopic(challengeId);
    const channel = this.client.channel(topic);
    let status = await channel.send({ type: "broadcast", event, payload });
    if (status !== "ok") status = await channel.send({ type: "broadcast", event, payload });
    await this.client.removeChannel(channel);
    this.trace.add({ actor: this.actor, kind: "broadcast_sent", name: event, topic, payload, result: status, ok: status === "ok" });
    return status === "ok";
  }

  /** Poll `lobby:online` presence for (or against) an athlete id. */
  async waitLobby(athleteId: string, present: boolean, timeoutMs: number): Promise<void> {
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
      if (this.lobby.has(athleteId) === present) return;
      await new Promise((r) => setTimeout(r, 250));
    }
    throw new ExpectationTimeout(`${athleteId} ${present ? "in" : "absent from"} lobby:online`, timeoutMs, [...this.lobby]);
  }

  async close(): Promise<void> {
    try {
      if (this.live) await this.goOffline();
    } catch {
      /* best effort */
    }
    await this.client.removeAllChannels().catch(() => undefined);
    await this.client.auth.stopAutoRefresh().catch(() => undefined);
    this.client.realtime.disconnect();
  }
}
