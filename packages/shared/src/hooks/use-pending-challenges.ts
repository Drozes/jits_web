import { useEffect, useState, useCallback, useRef } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";

export interface PendingChallenge {
  id: string;
  challengerName: string;
  matchType: string;
  createdAt: string;
  expiresAt: string;
}

interface UsePendingChallengesResult {
  count: number;
  challenges: PendingChallenge[];
  /**
   * Re-read the whole pending list from the server. Realtime does not replay
   * events missed while the socket was down (the app backgrounded), so a
   * long-lived consumer calls this on foreground or when it is looked at.
   */
  refetch: () => Promise<void>;
  /**
   * A full read has been applied for this athlete, so `count` is known rather
   * than the empty starting list. Lets a consumer tell the first load (old
   * challenges appearing) from a challenge arriving later.
   */
  loaded: boolean;
}

/** Raw challenge row shape from realtime payload (no FK joins). */
interface ChallengePayload {
  id: string;
  challenger_id: string;
  opponent_id: string;
  status: string;
  match_type: string;
  created_at: string;
  expires_at: string;
}

/** A malformed timestamp sorts as the epoch, so the comparator never yields NaN. */
function timeOf(iso: string): number {
  return Date.parse(iso) || 0;
}

function byNewestFirst(a: PendingChallenge, b: PendingChallenge): number {
  return timeOf(b.createdAt) - timeOf(a.createdAt);
}

function sameChallenge(a: PendingChallenge, b: PendingChallenge): boolean {
  return (
    a.id === b.id &&
    a.challengerName === b.challengerName &&
    a.matchType === b.matchType &&
    a.createdAt === b.createdAt &&
    a.expiresAt === b.expiresAt
  );
}

function sameList(a: PendingChallenge[], b: PendingChallenge[]): boolean {
  return a.length === b.length && a.every((c, i) => sameChallenge(c, b[i]));
}

/** The list and the athlete it belongs to. */
interface OwnedList {
  owner: string;
  list: PendingChallenge[];
}

const NO_CHALLENGES: PendingChallenge[] = [];

/**
 * Subscribes to realtime challenge changes and maintains a live list
 * of pending received challenges for the current athlete.
 *
 * Uses optimistic state patching: INSERT appends to state (with a
 * lightweight name lookup), UPDATE removes non-pending challenges.
 * Reads the full list on mount and whenever the caller runs `refetch`.
 * Realtime events and full reads can interleave: INSERT is idempotent by id,
 * and an event that lands while a read is in flight starts a newer read so
 * the older one cannot overwrite it. A read never rejects: a failed one keeps
 * the current list, and does not cancel an older read that later succeeds.
 * Every SUBSCRIBED re-reads the list: the first one because the mount read
 * may have run before the channel joined (an INSERT committed in between is
 * never delivered), and a rejoin because events missed during the drop are
 * not replayed. A re-read that finds the same list keeps the same array, so
 * it does not re-render consumers. The list is tagged with the athlete it
 * belongs to: when `athleteId` changes the hook returns an empty list from
 * the very first render, and reads started for the previous athlete are
 * ignored.
 */
export function usePendingChallenges(
  supabase: SupabaseClient,
  athleteId: string,
): UsePendingChallengesResult {
  const [owned, setOwned] = useState<OwnedList>({ owner: athleteId, list: NO_CHALLENGES });
  // The athlete whose list has had a full read applied (see `loaded`).
  const [loadedFor, setLoadedFor] = useState<string | null>(null);
  const loadedForRef = useRef<string | null>(null);
  // The latest list, updated synchronously. Every change goes through
  // `updateList`, so this is the source of truth and `owned` mirrors it.
  const ownedRef = useRef(owned);
  // Update the list for `forAthlete`; a list held for another athlete counts
  // as empty, and an unchanged result sets no state at all (no render).
  const updateList = useCallback(
    (forAthlete: string, next: (prev: PendingChallenge[]) => PendingChallenge[]) => {
      const prev = ownedRef.current;
      const base = prev.owner === forAthlete ? prev.list : NO_CHALLENGES;
      const list = next(base);
      if (prev.owner === forAthlete && sameList(list, prev.list)) return;
      ownedRef.current = { owner: forAthlete, list };
      setOwned(ownedRef.current);
    },
    [],
  );
  // Sequence number of the newest full read started.
  const readSeq = useRef(0);
  // Sequence number of the newest full read applied. A read applies only if
  // it is newer than this, so a slow earlier read never overwrites a later
  // one, but a failed newer read does not throw away an older good one.
  const lastAppliedSeq = useRef(0);
  // Ids a realtime INSERT delivered, stamped with `readSeq` when the event
  // arrived: every read with seq <= the stamp started before the INSERT
  // reached us, so its snapshot may predate it. A superseded read keeps such a
  // row; a row whose INSERT predates the read's query and which the read does
  // not list has left pending and is dropped.
  const insertedAt = useRef(new Map<string, number>());
  // Full reads not yet resolved. A realtime event that lands while one is in
  // flight starts a newer read (see `afterRealtimeEvent`).
  const readsInFlight = useRef(0);
  // Ids realtime saw leave pending. An INSERT whose name lookup is still
  // awaiting must not add one of these back.
  const removedIds = useRef(new Set<string>());
  // The athlete the hook currently serves. A read started for a previous
  // athlete (the prop changed without a remount) never applies.
  const currentAthleteId = useRef(athleteId);

  const fetchChallenges = useCallback(async () => {
    const seq = ++readSeq.current;
    const now = new Date().toISOString();

    const query = supabase
      .from("challenges")
      .select(
        "id, created_at, expires_at, match_type, challenger:athletes!fk_challenges_challenger(display_name)",
      )
      .eq("opponent_id", athleteId)
      .eq("status", "pending")
      .gt("expires_at", now)
      .order("created_at", { ascending: false });

    readsInFlight.current++;
    let result: Awaited<typeof query>;
    try {
      result = await query;
    } catch {
      // A rejected read (aborted request, thrown fetch) keeps the current
      // list; callers discard this promise, so it must never reject.
      return;
    } finally {
      readsInFlight.current--;
    }
    const { data } = result;

    if (!data || athleteId !== currentAthleteId.current) return;
    if (seq <= lastAppliedSeq.current) return;
    lastAppliedSeq.current = seq;
    // Once per athlete: a re-read must not cost a render (see `updateList`).
    if (loadedForRef.current !== athleteId) {
      loadedForRef.current = athleteId;
      setLoadedFor(athleteId);
    }
    // A newer read is still pending or failed: this one's query may have run
    // before a realtime INSERT committed, so keep the rows realtime added.
    const superseded = seq !== readSeq.current;
    const rows: PendingChallenge[] = data
      // Leaving pending is terminal, so a row realtime already saw leave
      // never comes back from a read.
      .filter((c) => !removedIds.current.has(c.id))
      .map((c) => {
        const challenger = c.challenger as unknown as
          | { display_name: string }
          | null;
        return {
          id: c.id,
          challengerName: challenger?.display_name ?? "Unknown",
          matchType: c.match_type,
          createdAt: c.created_at,
          expiresAt: c.expires_at,
        };
      });
    // INSERTs this read's query already covers need no stamp any more.
    for (const [id, stamp] of insertedAt.current) {
      if (stamp < seq) insertedAt.current.delete(id);
    }
    updateList(athleteId, (prev) => {
      if (!superseded) return rows;
      const listed = new Set(rows.map((c) => c.id));
      const kept = prev.filter(
        (c) => (insertedAt.current.get(c.id) ?? 0) >= seq && !listed.has(c.id),
      );
      // Keep the query's newest-first order whatever path built the list.
      return [...kept, ...rows].sort(byNewestFirst);
    });
  }, [supabase, athleteId, updateList]);

  /**
   * A full read whose query ran before a realtime event committed, but which
   * resolves after the handler applied it, would overwrite the event (drop a
   * new challenge, or bring back an answered one). So an event that lands
   * while a read is in flight starts a newer read: it supersedes the older
   * one through `readSeq`, and its query runs after the event committed.
   */
  const afterRealtimeEvent = useCallback(() => {
    if (readsInFlight.current > 0) void fetchChallenges();
  }, [fetchChallenges]);

  useEffect(() => {
    // A different athlete: nothing listed for the previous one carries over
    // (the list is tagged with its owner, so it already reads as empty).
    currentAthleteId.current = athleteId;
    removedIds.current = new Set();
    insertedAt.current = new Map();
    // Channel names must be unique across hook INSTANCES, not just across
    // re-runs of one instance's effect: a per-instance counter collides
    // when a remount (Fast Refresh, navigation) creates a second instance
    // whose counter also starts at 1, crashing with "cannot add
    // postgres_changes callbacks after subscribe()".
    const mountId = Math.random().toString(36).slice(2, 10);
    void fetchChallenges();

    const channel = supabase
      .channel(`challenges-${athleteId}:${mountId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "challenges",
          filter: `opponent_id=eq.${athleteId}`,
        },
        async (payload) => {
          const row = payload.new as ChallengePayload;
          if (row.status !== "pending" || new Date(row.expires_at) <= new Date()) return;
          // Stamp before `afterRealtimeEvent` starts a read that covers it.
          const stamp = readSeq.current;
          afterRealtimeEvent();

          // Lightweight lookup for challenger name (no full refetch)
          const { data: challenger } = await supabase
            .from("athletes")
            .select("display_name")
            .eq("id", row.challenger_id)
            .single();

          const newChallenge: PendingChallenge = {
            id: row.id,
            challengerName: challenger?.display_name ?? "Unknown",
            matchType: row.match_type,
            createdAt: row.created_at,
            expiresAt: row.expires_at,
          };

          // An UPDATE may have taken it out of pending during the lookup.
          if (removedIds.current.has(row.id) || athleteId !== currentAthleteId.current) return;
          // A read that applied during the lookup and started after the
          // event arrived already covers it (and lists it if still pending).
          if (lastAppliedSeq.current > stamp) {
            // Nothing to add: that read is authoritative for this row.
            return;
          }
          insertedAt.current.set(row.id, stamp);
          // A full read may already list it (it resolved during the lookup).
          // Sort so the list stays newest first even when this lookup
          // resolved after a read listed a newer row.
          updateList(athleteId, (prev) =>
            prev.some((c) => c.id === newChallenge.id)
              ? prev
              : [newChallenge, ...prev].sort(byNewestFirst),
          );
        },
      )
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "challenges",
          filter: `opponent_id=eq.${athleteId}`,
        },
        (payload) => {
          const row = payload.new as ChallengePayload;
          // Remove challenge if it's no longer pending
          if (row.status !== "pending") {
            removedIds.current.add(row.id);
            insertedAt.current.delete(row.id);
            updateList(athleteId, (prev) => prev.filter((c) => c.id !== row.id));
            afterRealtimeEvent();
          }
        },
      )
      // Realtime only delivers events committed after the channel joined,
      // and does not replay events missed while it was down (supabase-js
      // rejoins on its own after a drop, for example wifi to cellular). Any
      // read started before a SUBSCRIBED (the mount read, a foreground
      // re-sync) may miss an INSERT committed before the join, so every
      // SUBSCRIBED re-reads; the sequence guard makes the extra read safe and
      // an unchanged result does not re-render.
      .subscribe((status: string) => {
        if (status === "SUBSCRIBED") void fetchChallenges();
      });

    return () => {
      supabase.removeChannel(channel);
    };
  }, [supabase, athleteId, fetchChallenges, afterRealtimeEvent, updateList]);

  const challenges = owned.owner === athleteId ? owned.list : NO_CHALLENGES;
  return {
    count: challenges.length,
    challenges,
    refetch: fetchChallenges,
    loaded: loadedFor === athleteId,
  };
}
