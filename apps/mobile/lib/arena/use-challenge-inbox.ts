/**
 * Home's pending-challenge inbox: the challenges that are live right now, in
 * both directions, with the incoming ones answerable on the spot.
 *
 * WHY THIS EXISTS AT ALL. The Arena's prompt
 * (`use-arena-challenge.ts` + `challenge-prompt-sheet.tsx`) raises purely off a
 * `postgres_changes` INSERT and has no backfill query, so a challenge sent
 * while the recipient was anywhere other than the Arena tab was never rendered
 * anywhere: the row sat `pending` for seven days, unreachable, while the
 * challenger burned one of their three slots waiting. That is the failure this
 * closes. The Arena keeps its live prompt; this is the catch-up list.
 *
 * NOT IN THE DASHBOARD CACHE, ON PURPOSE. Home's other data goes through
 * `useCachedResource`, which is right for it: four RPCs that describe a slowly
 * changing world, where a warm stale first paint is a feature. Challenges are
 * the opposite. Every one of them is answered, cancelled or expired within
 * minutes, the list is patched by realtime rather than by refetching, and a
 * warm paint of a challenge that has already been accepted would offer an
 * Accept button that cannot work, which is exactly the outcome this surface is
 * meant to prevent. Folding it into `DashboardData` would also mean every
 * realtime event either refetched all four dashboard reads or reconstructed
 * the whole cached payload to write one field through. So: own read, own
 * subscription, own state, and `refresh()` is wired into Home's pull-to-
 * refresh alongside the dashboard's.
 *
 * EXPIRY IS FILTERED TWICE. `getPendingChallengesForAthlete` already applies
 * `expires_at > now()` server-side, but jr_be's `expire-pending-challenges`
 * pg_cron job runs only every 15 minutes, so a lapsed row reads `pending` for
 * up to a quarter of an hour after it died. The server-side filter catches it
 * at read time; the `clock` below catches one that lapses while the athlete is
 * looking at it. An Accept button that fails on tap is worse than no row.
 */
import * as React from "react";
import { useRouter } from "expo-router";
import { getPendingChallengesForAthlete } from "@jits/shared/api/queries";
import {
  cancelChallenge,
  startMatchFromChallenge,
} from "@jits/shared/api/mutations";
import type { PendingChallenge } from "@jits/shared/types/composites";
import { toast } from "@/components/ui/toast";
import { supabase } from "../supabase/client";
import {
  acceptChallengeAndStart,
  declineChallengeAndNotify,
} from "./challenge-handshake";
import { arenaMatchHref, challengeInboxTopic } from "./constants";

/** Raw realtime payload. Only the fields the handlers actually read. */
interface ChallengeRow {
  id: string;
  challenger_id: string;
  opponent_id: string;
  status: string;
}

/**
 * How long ahead an expiry has to be before we stop arming a timer for it.
 *
 * `challenges.expires_at` defaults to created_at + 7 days, and a multi-day
 * `setTimeout` is both pointless (nobody holds Home open that long) and a
 * documented React Native warning. Ten minutes covers the case that matters,
 * a row lapsing under the athlete's thumb, and the effect re-arms each time
 * the clock ticks, so a list is never left unwatched.
 */
const EXPIRY_TIMER_HORIZON_MS = 10 * 60_000;

export interface UseChallengeInboxResult {
  /** Live challenges where the athlete is the opponent. Answerable. */
  incoming: PendingChallenge[];
  /** Live challenges the athlete sent and is waiting on. Cancellable. */
  outgoing: PendingChallenge[];
  /**
   * Challenges the athlete sent that have since been ACCEPTED, and which they
   * have not yet walked into.
   *
   * These are no longer `pending`, so a refetch cannot return them; they are
   * held separately for exactly that reason. See the note on `ready` in the
   * body for what this does and does not promise.
   */
  ready: PendingChallenge[];
  /** True only on the cold read, before anything is known. */
  isLoading: boolean;
  /** True while a refresh runs over a list already on screen. */
  isRefreshing: boolean;
  /** The read failed. Distinct from "no challenges", which is a fact. */
  loadFailed: boolean;
  /** The challenge currently being acted on; every row locks while set. */
  busyId: string | null;
  accept: (challengeId: string) => Promise<void>;
  decline: (challengeId: string) => Promise<void>;
  cancel: (challengeId: string) => Promise<void>;
  enter: (challengeId: string) => Promise<void>;
  refresh: () => void;
}

export function useChallengeInbox(
  athleteId: string | undefined,
  athleteWeight: number | null | undefined,
): UseChallengeInboxResult {
  const router = useRouter();

  const [incoming, setIncoming] = React.useState<PendingChallenge[]>([]);
  const [outgoing, setOutgoing] = React.useState<PendingChallenge[]>([]);
  const [ready, setReady] = React.useState<PendingChallenge[]>([]);
  const [isLoading, setIsLoading] = React.useState(true);
  const [isRefreshing, setIsRefreshing] = React.useState(false);
  const [loadFailed, setLoadFailed] = React.useState(false);
  const [busyId, setBusyId] = React.useState<string | null>(null);
  /** Re-filter trigger for expiry; NOT a render clock, see the timer effect. */
  const [clock, setClock] = React.useState(() => Date.now());

  const weightRef = React.useRef(athleteWeight ?? null);
  weightRef.current = athleteWeight ?? null;
  // Read by the realtime handler that promotes an accepted outgoing challenge:
  // it needs the row it already has (names and all), and the handler closes
  // over a stale `outgoing` otherwise.
  const outgoingRef = React.useRef<PendingChallenge[]>(outgoing);
  outgoingRef.current = outgoing;

  // Synchronous double-tap guard. `busyId` is still null for the whole await
  // window, so only a ref closes it.
  const busyRef = React.useRef(false);
  const aliveRef = React.useRef(true);
  /**
   * Monotonic read counter. A realtime-triggered reload can overtake a slower
   * one already in flight; without this the older response would land last and
   * re-add a challenge that has just been answered.
   */
  const seqRef = React.useRef(0);

  React.useEffect(() => {
    aliveRef.current = true;
    return () => {
      aliveRef.current = false;
    };
  }, []);

  const load = React.useCallback(
    async (mode: "cold" | "refresh") => {
      if (!athleteId) return;
      const seq = ++seqRef.current;
      if (mode === "refresh") setIsRefreshing(true);

      const result = await getPendingChallengesForAthlete(supabase, athleteId);
      if (!aliveRef.current || seq !== seqRef.current) return;

      if (result.ok) {
        setIncoming(result.data.incoming);
        setOutgoing(result.data.outgoing);
        setLoadFailed(false);
      } else {
        // Keep whatever is on screen. An empty list and a failed read look
        // identical downstream, and claiming "no challenges" on a dropped
        // request is the same lie this surface was built to stop telling.
        setLoadFailed(true);
      }
      setIsLoading(false);
      setIsRefreshing(false);
    },
    [athleteId],
  );

  // --- Cold read + realtime ------------------------------------------------
  React.useEffect(() => {
    if (!athleteId) {
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    setIncoming([]);
    setOutgoing([]);
    setReady([]);
    void load("cold");

    // Per-instance suffix, see `challengeInboxTopic`. Without it an
    // overlapping remount is handed the previous, already-subscribed channel
    // and `.on("postgres_changes", ...)` throws on it.
    const instanceId = Math.random().toString(36).slice(2, 10);
    const channel = supabase
      .channel(challengeInboxTopic(athleteId, instanceId))
      // A new challenge, either direction. Re-read rather than patching from
      // the payload: the row carries ids, not display names, and the query
      // already owns the expiry filter and the ordering. Inserts are rare
      // (three outstanding per challenger, cap enforced in RLS), so the round
      // trip is cheaper than a second, divergent copy of that logic.
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "challenges",
          filter: `opponent_id=eq.${athleteId}`,
        },
        () => void load("refresh"),
      )
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "challenges",
          filter: `challenger_id=eq.${athleteId}`,
        },
        () => void load("refresh"),
      )
      // Answered, cancelled, or swept to `expired`: either way it is no longer
      // an inbox row, and it goes on its own rather than failing under a thumb.
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "challenges",
          filter: `opponent_id=eq.${athleteId}`,
        },
        (payload) => {
          const row = payload.new as ChallengeRow;
          if (row.status === "pending") return;
          setIncoming((prev) => prev.filter((c) => c.challengeId !== row.id));
        },
      )
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "challenges",
          filter: `challenger_id=eq.${athleteId}`,
        },
        (payload) => {
          const row = payload.new as ChallengeRow;
          if (row.status === "pending") return;

          const mine = outgoingRef.current.find((c) => c.challengeId === row.id);
          if (mine && (row.status === "accepted" || row.status === "started")) {
            // The opponent said yes. The Arena would yank both parties into
            // the match here, and it is right to: that athlete is standing in
            // a lobby waiting for this. On Home they are not; they may have
            // sent this minutes ago and moved on, so they get a row to tap
            // rather than an unrequested navigation off the tab they are on.
            setReady((prev) =>
              prev.some((c) => c.challengeId === row.id) ? prev : [mine, ...prev],
            );
          }
          setOutgoing((prev) => prev.filter((c) => c.challengeId !== row.id));
        },
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [athleteId, load]);

  // --- Expiry: drop a row the moment it lapses on screen --------------------
  React.useEffect(() => {
    const soonest = [...incoming, ...outgoing]
      .map((c) => new Date(c.expiresAt).getTime())
      .filter((t) => t > clock)
      .sort((a, b) => a - b)[0];
    if (soonest === undefined) return;

    const delay = soonest - Date.now();
    if (delay > EXPIRY_TIMER_HORIZON_MS) return;

    // +250ms so the tick lands strictly after the boundary rather than on it.
    const timer = setTimeout(() => setClock(Date.now()), Math.max(delay, 0) + 250);
    return () => clearTimeout(timer);
  }, [incoming, outgoing, clock]);

  const liveIncoming = React.useMemo(
    () => incoming.filter((c) => new Date(c.expiresAt).getTime() > clock),
    [incoming, clock],
  );
  const liveOutgoing = React.useMemo(
    () => outgoing.filter((c) => new Date(c.expiresAt).getTime() > clock),
    [outgoing, clock],
  );

  /** One action at a time across the whole section; a ref, state is async. */
  const run = React.useCallback(
    async (challengeId: string, fn: () => Promise<void>) => {
      if (busyRef.current) return;
      busyRef.current = true;
      setBusyId(challengeId);
      try {
        await fn();
      } finally {
        busyRef.current = false;
        if (aliveRef.current) setBusyId(null);
      }
    },
    [],
  );

  const accept = React.useCallback(
    (challengeId: string) =>
      run(challengeId, async () => {
        // accept -> start -> BROADCAST -> navigate. The broadcast is what tells
        // the challenger the match exists; without it they sit on the Arena's
        // waiting plate while this athlete is already in the wizard. Shared
        // with the Arena in `challenge-handshake.ts` so there is one ordering,
        // not two.
        const result = await acceptChallengeAndStart(
          challengeId,
          weightRef.current,
        );

        if (!result.ok) {
          toast.error(result.message);
          // Do NOT assume the row is dead. A refused write and a challenge
          // that expired a moment ago produce the same message here, and only
          // the server knows which; re-reading is what tells the truth instead
          // of guessing.
          void load("refresh");
          return;
        }

        setIncoming((prev) => prev.filter((c) => c.challengeId !== challengeId));
        router.push(arenaMatchHref(result.matchId));
      }),
    [run, router, load],
  );

  const decline = React.useCallback(
    (challengeId: string) =>
      run(challengeId, async () => {
        const told = await declineChallengeAndNotify(challengeId);
        if (!told) {
          // Keep the row: the challenge is still pending server-side and the
          // challenger is still waiting, so dropping it here lies to both.
          toast.error("Couldn't decline that challenge. Try again.");
          return;
        }
        setIncoming((prev) => prev.filter((c) => c.challengeId !== challengeId));
      }),
    [run],
  );

  const cancel = React.useCallback(
    (challengeId: string) =>
      run(challengeId, async () => {
        const result = await cancelChallenge(supabase, challengeId);
        if (!result.ok) {
          toast.error("Couldn't cancel that challenge. Try again.");
          return;
        }
        setOutgoing((prev) => prev.filter((c) => c.challengeId !== challengeId));
      }),
    [run],
  );

  const enter = React.useCallback(
    (challengeId: string) =>
      run(challengeId, async () => {
        // Idempotent for either party, so asking again is safe even if the
        // opponent already created the match.
        const started = await startMatchFromChallenge(supabase, challengeId);
        setReady((prev) => prev.filter((c) => c.challengeId !== challengeId));
        if (!started.ok) {
          toast.error(
            started.error.code === "CHALLENGE_NOT_ACCEPTED"
              ? "That challenge is no longer available."
              : started.error.message || "Couldn't open the match.",
          );
          return;
        }
        router.push(arenaMatchHref(started.data.match_id));
      }),
    [run, router],
  );

  const refresh = React.useCallback(() => void load("refresh"), [load]);

  return {
    incoming: liveIncoming,
    outgoing: liveOutgoing,
    ready,
    isLoading,
    isRefreshing,
    loadFailed,
    busyId,
    accept,
    decline,
    cancel,
    enter,
    refresh,
  };
}
