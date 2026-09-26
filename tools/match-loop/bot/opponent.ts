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
  startMatchFromChallenge,
  toggleMatchPreferences,
} from "@jits/shared/api/mutations";
import { APP_ONLINE_TOPIC, CHALLENGE_EVENTS, LOBBY_TOPIC, challengeTopic } from "./protocol";
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
  | { kind: "match_started"; matchId: string; via: "broadcast" | "status_fallback" }
  | { kind: "declined"; via: "broadcast" | "status" }
  | { kind: "cancelled" }
  | { kind: "expired" };

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
   * What the challenger's app would conclude: the broadcast, or the
   * status-UPDATE fallback (accepted/started -> idempotent start).
   */
  async waitOutgoingOutcome(timeoutMs: number): Promise<OutgoingOutcome> {
    const id = this.outgoingId;
    if (!id) throw new Error("no outgoing challenge");
    const ev = await this.events.waitFor(
      `outcome of outgoing challenge ${id}`,
      (e) =>
        ((e.kind === "match_started" || e.kind === "declined") && e.challengeId === id) ||
        (e.kind === "outgoing_update" && e.row.id === id && e.row.status !== "pending"),
      timeoutMs,
      0, // filtered by this challenge's id, so any time since sign-in counts
    );
    if (ev.kind === "match_started") return { kind: "match_started", matchId: ev.matchId, via: "broadcast" };
    if (ev.kind === "declined") return { kind: "declined", via: "broadcast" };
    if (ev.kind !== "outgoing_update") throw new Error("unreachable");
    const st = ev.row.status;
    if (st === "declined") return { kind: "declined", via: "status" };
    if (st === "cancelled") return { kind: "cancelled" };
    if (st === "expired") return { kind: "expired" };
    // accepted / started: recovery path, idempotent start.
    const started = await this.trace.rpc(this.actor, "startMatchFromChallenge", { challengeId: id }, () =>
      startMatchFromChallenge(this.client, id),
    );
    if (!started.ok) throw new Error(`fallback start failed: ${started.error.message}`);
    return { kind: "match_started", matchId: started.data.match_id, via: "status_fallback" };
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
