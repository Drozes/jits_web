"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import type { RealtimeChannel } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/client";
import {
  acceptChallenge,
  cancelChallenge,
  cancelStaleOutgoingChallenges,
  createChallenge,
  declineChallenge,
  declineOtherPendingChallenges,
  startMatchFromChallenge,
} from "@jits/shared/api/mutations";
import { getPendingChallengesForAthlete } from "@jits/shared/api/queries";
import { isFreshChallenge } from "@/lib/arena/challenge-freshness";
import {
  ARENA_WAIT_REFRESH_MS,
  captureAndReport,
  hintOf,
  isProximityHint,
  locationPermission,
  proximityBlockFor,
  proximityMissingOf,
  type LocationFailure,
  type ProximityBlock,
} from "@/lib/location/match-location";

/**
 * Why an accepted Arena challenge could not start yet (flag on): the
 * accepter's own reading failed (`denied` / `accuracy` / `implausible`), or
 * the server's proximity gate refused: `self_location` / `peer_location`
 * (HINT `proximity_required` with DETAIL naming one side) or `proximity`
 * (both sides, or `proximity_failed`). The challenge stays accepted, so the
 * prompt stays up with Retry (no second accept) and Cancel.
 */
export type StartBlock = LocationFailure | ProximityBlock;

export interface IncomingChallenge {
  challengeId: string;
  challengerId: string;
  challengerName: string;
  /** Set once accepted but not started; absent on a fresh prompt. */
  startBlocked?: StartBlock;
}

export interface OutgoingChallenge {
  challengeId: string;
  opponentId: string;
  opponentName: string;
}

/** Shown when the challenge was cancelled or expired under the accepter. */
export const CHALLENGE_GONE_MESSAGE = "That challenge is no longer available.";

/** Shown when the pending cap still refuses after stale ones were withdrawn. */
export const CHALLENGE_CAP_MESSAGE =
  "You have 3 challenges out. Unanswered challenges clear automatically after 10 minutes, so try again shortly.";

/** Shown when the insert was refused because the opponent is not in the Arena. */
export const opponentLeftMessage = (name: string) => `${name} just left the Arena.`;

/** Shown when a refused insert cannot be explained. */
export const CHALLENGE_SEND_FAILED_MESSAGE = "Couldn't send that challenge. Try again.";

/** Broadcast channel shared by both parties to a single Arena challenge. */
const channelName = (challengeId: string) => `arena-challenge:${challengeId}`;

type ChallengeEvent = "match_started" | "declined" | "cancelled";

/**
 * Tell the other side something happened. Sends on `existing` when this client
 * already holds the challenge's channel (supabase-js hands back the same
 * channel for the same topic, so creating and removing one would tear down our
 * own listener); otherwise opens a throwaway channel and removes it after.
 */
async function broadcast(
  existing: RealtimeChannel | null,
  challengeId: string,
  event: ChallengeEvent,
  payload: Record<string, unknown> = {},
): Promise<void> {
  if (existing) {
    await existing.send({ type: "broadcast", event, payload });
    return;
  }
  const supabase = createClient();
  const channel = supabase.channel(channelName(challengeId));
  await channel.send({ type: "broadcast", event, payload });
  await supabase.removeChannel(channel);
}

/**
 * After entering a match, decline every other fresh pending challenge I
 * received and tell each challenger (UPDATE + broadcast), so nobody is left
 * waiting on someone who is now busy (mobile parity, `settleOthersAfterEntry`).
 * A challenge from the person I am now matched with is the other half of a
 * crossing pair: withdrawn quietly, so they are not told "declined" on the way
 * into the same match. Best effort and fire-and-forget.
 */
async function settleIncomingAfterEntry(
  athleteId: string,
  enteredChallengeId: string,
  peerId: string | null,
): Promise<void> {
  const supabase = createClient();
  const result = await declineOtherPendingChallenges(supabase, athleteId, {
    keepChallengeId: enteredChallengeId,
    exceptChallengerId: peerId,
  });
  if (!result.ok) return;
  for (const c of result.data.skipped) {
    void cancelChallenge(supabase, c.challengeId, { onlyIfPending: true });
  }
  await Promise.all(
    result.data.declined.map((c) => broadcast(null, c.challengeId, "declined")),
  );
}

/**
 * Instant Arena handshake.
 *
 * Challenge -> live prompt -> accept -> straight into the match wizard, with no
 * inbox round trip. The challenge row still exists (chk_match_origin requires
 * either a challenge_id or a session_id, and Arena matches have no session), it
 * is just never left sitting in a list.
 *
 * Realtime surfaces:
 *  - postgres_changes INSERT on `challenges` filtered to me as opponent, which
 *    raises the incoming prompt, but ONLY while `canReceive` (the athlete is
 *    live and not in a match). There is no column that marks a challenge as
 *    Arena-originated, so live-ness is the gate: a non-live athlete's
 *    challenges are left for the regular challenge flow instead of hijacking
 *    them into the Arena. The profile ChallengeSheet sends through this hook
 *    too (`arenaActions.sendChallenge`), so its challenger gets the same
 *    waiting bar and match entry.
 *  - postgres_changes UPDATE on the same filter, which dismisses a prompt once
 *    its row stops being pending (cancelled, expired, answered elsewhere).
 *  - postgres_changes UPDATE filtered to me as challenger, which resolves my
 *    "Waiting for X" without any broadcast (mirrors mobile): declined,
 *    cancelled or expired clears it; "started" (the match already exists)
 *    enters it via the idempotent start_match_from_challenge. "accepted" is
 *    deliberately ignored: the accepter is creating the match at that moment,
 *    and racing it from this side is how two clients fight over one row. The
 *    match_started broadcast is the normal path; "started" is the fallback.
 *    A "started" row that is NOT on my waiting bar (the tab was reloaded, so
 *    the in-memory bar is gone) is still joined when it is mine and fresh.
 *  - a per-challenge broadcast channel: the accepting side tells the
 *    challenger the match exists, the challenger's cancel tells the recipient.
 *
 * Recovery (mobile parity, `use-pending-challenge-recovery.ts`): on mount, on
 * going live / leaving a match and when the tab comes back, my own newest
 * fresh pending outgoing challenge is put back on the waiting bar, so a reload
 * does not strand the challenger without its bar or its accept listener.
 */
export function useArenaChallenge({
  athleteId,
  athleteWeight,
  canReceive = true,
  inMatch = false,
  locationRequired,
  onLocationRequired,
}: {
  athleteId: string;
  athleteWeight: number | null;
  canReceive?: boolean;
  /** A match screen is mounted: nothing is restored or joined behind it. */
  inMatch?: boolean;
  /**
   * `match_location_required` (resolves the read in flight). When on, the
   * accepter reports an `arena` reading before `start_match_from_challenge`.
   * Omitted: off.
   */
  locationRequired?: () => Promise<boolean>;
  /** A proximity refusal proved the flag on (the read may have said off). */
  onLocationRequired?: () => void;
}) {
  const router = useRouter();
  const [incoming, setIncomingState] = useState<IncomingChallenge | null>(null);
  const [outgoing, setOutgoingState] = useState<OutgoingChallenge | null>(null);
  const [isBusy, setIsBusy] = useState(false);
  const busyRef = useRef(false);
  const outgoingChannelRef = useRef<RealtimeChannel | null>(null);
  const incomingChannelRef = useRef<RealtimeChannel | null>(null);
  const canReceiveRef = useRef(canReceive);
  canReceiveRef.current = canReceive;
  const inMatchRef = useRef(inMatch);
  inMatchRef.current = inMatch;
  const locationRequiredRef = useRef(locationRequired);
  locationRequiredRef.current = locationRequired;
  const onLocationRequiredRef = useRef(onLocationRequired);
  onLocationRequiredRef.current = onLocationRequired;
  const isLocationRequired = useCallback(
    async () => (await locationRequiredRef.current?.()) ?? false,
    [],
  );
  /** Challenges this instance already resolved; never restored again. */
  const settledRef = useRef<Set<string>>(new Set());
  // Mirrors of state for realtime handlers, which must not read stale closures.
  const incomingRef = useRef<IncomingChallenge | null>(null);
  const outgoingRef = useRef<OutgoingChallenge | null>(null);
  /** The challenge being accepted right now; its own UPDATE must not clear it. */
  const acceptingIdRef = useRef<string | null>(null);
  /** Last challenge we navigated for: broadcast and UPDATE can both land. */
  const enteredForRef = useRef<string | null>(null);

  const setIncoming = useCallback((next: IncomingChallenge | null) => {
    incomingRef.current = next;
    setIncomingState(next);
  }, []);
  const setOutgoing = useCallback((next: OutgoingChallenge | null) => {
    outgoingRef.current = next;
    setOutgoingState(next);
  }, []);

  // Going offline or into a match drops an unanswered prompt (the row stays
  // pending for the regular flow; it is not declined on the athlete's behalf).
  useEffect(() => {
    if (!canReceive) setIncoming(null);
  }, [canReceive, setIncoming]);

  /**
   * Withdraw my own outgoing challenges older than the Arena freshness window
   * (jits-celf, mirrors mobile). Nobody answers them live, but each one holds
   * a slot of the 3-pending cap until `expires_at`, 7 days out. The one on my
   * waiting bar is kept. Resolves to how many were withdrawn.
   */
  const sweepStale = useCallback(async (): Promise<number> => {
    if (!athleteId) return 0;
    const swept = await cancelStaleOutgoingChallenges(createClient(), athleteId, {
      keepChallengeId: outgoingRef.current?.challengeId ?? null,
    });
    if (!swept.ok || swept.data.cancelled.length === 0) return 0;
    // The Arena roster marks already-challenged athletes from a server read.
    router.refresh();
    return swept.data.cancelled.length;
  }, [athleteId, router]);

  /**
   * Read my pending challenges once, put my newest fresh outgoing back on the
   * waiting bar if the bar is empty (a reload loses it), then withdraw my
   * stale ones from the same read.
   */
  const recover = useCallback(async (): Promise<void> => {
    if (!athleteId) return;
    const supabase = createClient();
    const read = await getPendingChallengesForAthlete(supabase, athleteId);
    if (!read.ok) {
      await sweepStale();
      return;
    }
    const now = Date.now();
    // Newest first; `expires_at` is already filtered by the read.
    const mine = read.data.outgoing.find(
      (c) => c.challengerId === athleteId && isFreshChallenge(c.createdAt, now),
    );
    if (
      mine &&
      !outgoingRef.current &&
      // A send, accept or cancel in flight decides the bar itself.
      !busyRef.current &&
      !inMatchRef.current &&
      !settledRef.current.has(mine.challengeId) &&
      enteredForRef.current !== mine.challengeId
    ) {
      setOutgoing({
        challengeId: mine.challengeId,
        opponentId: mine.opponentId,
        opponentName: mine.opponentName,
      });
    }
    const swept = await cancelStaleOutgoingChallenges(supabase, athleteId, {
      keepChallengeId: outgoingRef.current?.challengeId ?? null,
      outgoing: read.data.outgoing,
      now,
    });
    // The Arena roster marks already-challenged athletes from a server read.
    if (swept.ok && swept.data.cancelled.length > 0) router.refresh();
  }, [athleteId, router, setOutgoing, sweepStale]);

  // On mount, on going live / leaving a match, and when the tab comes back.
  const sweepRef = useRef(recover);
  sweepRef.current = recover;
  useEffect(() => {
    void sweepRef.current();
  }, [athleteId, canReceive, inMatch]);
  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === "visible") void sweepRef.current();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, []);

  /** Navigate both parties into the shared wizard, once per challenge. */
  const enterMatch = useCallback(
    (challengeId: string, matchId: string, peerId: string | null) => {
      if (enteredForRef.current === challengeId) return;
      enteredForRef.current = challengeId;
      settledRef.current.add(challengeId);
      // Accepting someone else's challenge abandons my own pending one:
      // withdraw it so its opponent is not left with a dead prompt.
      const dropped = outgoingRef.current;
      if (dropped && dropped.challengeId !== challengeId) {
        void (async () => {
          const res = await cancelChallenge(createClient(), dropped.challengeId);
          // Only a row that actually changed was withdrawn; an already-over
          // one has nothing to tell the recipient.
          if (res.ok && res.data.cancelled) {
            await broadcast(null, dropped.challengeId, "cancelled");
          }
        })();
        settledRef.current.add(dropped.challengeId);
      }
      void settleIncomingAfterEntry(athleteId, challengeId, peerId);
      setIncoming(null);
      setOutgoing(null);
      router.push(`/arena/match/${matchId}`);
    },
    [athleteId, router, setIncoming, setOutgoing],
  );

  /** Clear my outgoing challenge if it is still `challengeId`. */
  const resolveOutgoing = useCallback(
    (challengeId: string, declined: boolean) => {
      const mine = outgoingRef.current;
      if (mine?.challengeId !== challengeId) return;
      settledRef.current.add(challengeId);
      setOutgoing(null);
      if (declined) toast.info(`${mine.opponentName} declined.`);
    },
    [setOutgoing],
  );

  // --- Realtime: challenges involving me ------------------------------------
  useEffect(() => {
    if (!athleteId) return;
    const supabase = createClient();
    const channel = supabase
      .channel(`arena-incoming:${athleteId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "challenges",
          filter: `opponent_id=eq.${athleteId}`,
        },
        async (payload) => {
          const row = payload.new as {
            id: string;
            challenger_id: string;
            status: string;
          };
          if (row.status !== "pending" || !canReceiveRef.current) return;
          // The first open prompt keeps the surface rather than being
          // replaced mid-decision.
          if (incomingRef.current) return;

          const { data: challenger } = await supabase
            .from("athletes")
            .select("display_name")
            .eq("id", row.challenger_id)
            .single();
          // Re-checked: offline, or another prompt, may have landed meanwhile.
          if (!canReceiveRef.current || incomingRef.current) return;

          setIncoming({
            challengeId: row.id,
            challengerId: row.challenger_id,
            challengerName: challenger?.display_name ?? "An athlete",
          });
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
        async (payload) => {
          const row = payload.new as { id: string; status: string };
          if (row.status === "pending") return;
          // My own accept flips the row to accepted before the match exists.
          if (acceptingIdRef.current === row.id) return;
          // ...and that echo can land after a blocked start; keep the prompt.
          const shown = incomingRef.current;
          if (row.status === "accepted" && shown?.challengeId === row.id && shown.startBlocked) {
            return;
          }
          // I am the blocked accepter and the challenger's side started it
          // (its fallback, or a later reading passed the gate): join that
          // match rather than drop the prompt and strand them in it alone.
          // start_match_from_challenge is idempotent and returns it.
          if (row.status === "started" && shown?.challengeId === row.id && shown.startBlocked) {
            const started = await startMatchFromChallenge(supabase, row.id);
            if (started.ok) {
              enterMatch(row.id, started.data.match_id, shown.challengerId);
              return;
            }
          }
          if (incomingRef.current?.challengeId === row.id) setIncoming(null);
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
        async (payload) => {
          const row = payload.new as {
            id: string;
            status: string;
            challenger_id?: string;
            opponent_id?: string;
            created_at?: string;
          };
          if (outgoingRef.current?.challengeId !== row.id) {
            // Not on my bar: the bar was lost to a reload. Only a fresh
            // "started" row of mine is still worth joining (the opponent is
            // in the match waiting), and never behind a match on screen.
            if (
              row.status !== "started" ||
              row.challenger_id !== athleteId ||
              !isFreshChallenge(row.created_at) ||
              inMatchRef.current ||
              settledRef.current.has(row.id)
            ) {
              return;
            }
          }
          if (["declined", "cancelled", "expired"].includes(row.status)) {
            resolveOutgoing(row.id, row.status === "declined");
            return;
          }
          // Fallback when the match_started broadcast never arrived. Only
          // "started": on "accepted" the match may not exist yet.
          if (row.status === "started") {
            const started = await startMatchFromChallenge(supabase, row.id);
            if (started.ok) {
              enterMatch(
                row.id,
                started.data.match_id,
                outgoingRef.current?.opponentId ?? row.opponent_id ?? null,
              );
            }
          }
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [athleteId, enterMatch, resolveOutgoing, setIncoming]);

  // --- Incoming: the challenger may withdraw -------------------------------
  const incomingId = incoming?.challengeId;
  useEffect(() => {
    if (!incomingId) return;
    const supabase = createClient();
    const channel = supabase
      .channel(channelName(incomingId))
      .on("broadcast", { event: "cancelled" }, () => {
        if (acceptingIdRef.current === incomingId) return;
        if (incomingRef.current?.challengeId === incomingId) setIncoming(null);
      })
      .subscribe();
    incomingChannelRef.current = channel;
    return () => {
      incomingChannelRef.current = null;
      supabase.removeChannel(channel);
    };
  }, [incomingId, setIncoming]);

  // --- Outgoing: wait for my challenge to be accepted -----------------------
  const outgoingId = outgoing?.challengeId;
  useEffect(() => {
    if (!outgoingId) return;
    const supabase = createClient();
    const channel = supabase
      .channel(channelName(outgoingId))
      .on("broadcast", { event: "match_started" }, ({ payload }) => {
        const matchId = (payload as { matchId?: string })?.matchId;
        if (matchId) {
          enterMatch(outgoingId, matchId, outgoingRef.current?.opponentId ?? null);
        }
      })
      .on("broadcast", { event: "declined" }, () => {
        resolveOutgoing(outgoingId, true);
      })
      .subscribe();

    outgoingChannelRef.current = channel;
    return () => {
      outgoingChannelRef.current = null;
      supabase.removeChannel(channel);
    };
  }, [outgoingId, enterMatch, resolveOutgoing]);

  // --- Outgoing: keep my arena reading fresh while I wait ------------------
  // Flag on (jr_be M1): the proximity gate needs both readings under 2
  // minutes old when the opponent accepts, so the waiting challenger reports
  // an `arena` reading every 60 s with the tab visible and at once when the
  // tab comes back. Only with permission already granted (never a prompt in
  // the background); a failed reading just waits for the next tick.
  const lastArenaReportAt = useRef(0);
  const arenaReporting = useRef(false);
  useEffect(() => {
    if (!outgoingId || inMatch) return;
    let timer: ReturnType<typeof setInterval> | null = null;
    let stopped = false;
    const capture = async () => {
      if (arenaReporting.current) return;
      arenaReporting.current = true;
      try {
        if (!(await isLocationRequired())) return;
        if ((await locationPermission()) !== "granted") return;
        if (stopped || outgoingRef.current?.challengeId !== outgoingId) return;
        lastArenaReportAt.current = Date.now();
        await captureAndReport(createClient(), "arena", outgoingId);
      } finally {
        arenaReporting.current = false;
      }
    };
    const start = (immediate: boolean) => {
      if (timer) return;
      if (immediate || Date.now() - lastArenaReportAt.current >= ARENA_WAIT_REFRESH_MS) {
        void capture();
      }
      timer = setInterval(() => void capture(), ARENA_WAIT_REFRESH_MS);
    };
    const stop = () => {
      if (timer) clearInterval(timer);
      timer = null;
    };
    const onVisibility = () => {
      if (document.visibilityState === "visible") start(true);
      else stop();
    };
    if (document.visibilityState === "visible") start(false);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      stopped = true;
      stop();
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [outgoingId, inMatch, isLocationRequired]);

  /** Guard every mutation against double-taps; a ref, because state is async. */
  const runExclusive = useCallback(async (fn: () => Promise<void>) => {
    if (busyRef.current) return;
    busyRef.current = true;
    setIsBusy(true);
    try {
      await fn();
    } finally {
      busyRef.current = false;
      setIsBusy(false);
    }
  }, []);

  /**
   * Work out what a refused insert means before saying anything (port of
   * mobile's `explainRefusedInsert`). `mapPostgrestError` maps EVERY 42501 on
   * this insert to MAX_PENDING_CHALLENGES, but `challenges_insert` also
   * refuses when the opponent is not `looking_for_ranked`
   * (`opponent_accepts_match_type`): they left the Arena after the roster
   * loaded, or were challenged from their profile while not live. The
   * opponent's row decides; when it cannot be read, the cap is NOT asserted.
   */
  const explainRefusedInsert = useCallback(
    async (
      supabase: ReturnType<typeof createClient>,
      opponentId: string,
      opponentName: string,
    ) => {
      const { data, error } = await supabase
        .from("athletes")
        .select("looking_for_ranked, status")
        .eq("id", opponentId)
        .maybeSingle();
      if (error || !data) {
        toast.error(CHALLENGE_SEND_FAILED_MESSAGE);
        return;
      }
      if (data.looking_for_ranked !== true || data.status !== "active") {
        toast.info(opponentLeftMessage(opponentName));
        return;
      }
      toast.error(CHALLENGE_CAP_MESSAGE);
    },
    [],
  );

  const sendChallenge = useCallback(
    (opponentId: string, opponentName: string) =>
      runExclusive(async () => {
        const supabase = createClient();
        const create = () =>
          createChallenge(supabase, {
            opponentId,
            matchType: "ranked", // ranked-only product
            challengerWeight: athleteWeight ?? undefined,
          });
        let result = await create();
        // The cap may be held by my own stale challenges: withdraw them and
        // try exactly once more (jits-celf).
        if (
          !result.ok &&
          result.error.code === "MAX_PENDING_CHALLENGES" &&
          (await sweepStale()) > 0
        ) {
          result = await create();
        }
        if (!result.ok) {
          if (result.error.code === "MAX_PENDING_CHALLENGES") {
            await explainRefusedInsert(supabase, opponentId, opponentName);
            return;
          }
          toast.error(result.error.message || "Couldn't send that challenge.");
          return;
        }
        // Before the bar goes up, so the waiting refresher does not report
        // again right behind this one.
        lastArenaReportAt.current = Date.now();
        setOutgoing({ challengeId: result.data.id, opponentId, opponentName });
        // Flag on: give the proximity gate a fresh reading of mine for this
        // challenge (a challenger who is not live has no go_live one). Best
        // effort, and only when it cannot raise a browser prompt.
        void (async () => {
          if (!(await isLocationRequired())) return;
          // `unknown` (no Permissions API, Safari) could still prompt.
          if ((await locationPermission()) !== "granted") return;
          await captureAndReport(supabase, "arena", result.data.id);
        })();
      }),
    [
      athleteWeight,
      runExclusive,
      setOutgoing,
      sweepStale,
      explainRefusedInsert,
      isLocationRequired,
    ],
  );

  /** Keep the prompt up, accepted but not started, with the reason. */
  const blockStart = useCallback(
    (current: IncomingChallenge, reason: StartBlock) => {
      if (incomingRef.current?.challengeId !== current.challengeId) return;
      setIncoming({ ...current, startBlocked: reason });
    },
    [setIncoming],
  );

  const accept = useCallback(
    () =>
      runExclusive(async () => {
        const current = incomingRef.current;
        if (!current) return;
        const supabase = createClient();
        acceptingIdRef.current = current.challengeId;
        try {
          // A blocked prompt is already accepted: Retry only re-tries the start.
          if (!current.startBlocked) {
            const accepted = await acceptChallenge(supabase, {
              challengeId: current.challengeId,
              opponentWeight: athleteWeight ?? undefined,
            });
            if (!accepted.ok) {
              toast.error(
                accepted.error.code === "CHALLENGE_NOT_ACCEPTED"
                  ? CHALLENGE_GONE_MESSAGE
                  : accepted.error.message || "Couldn't accept that challenge.",
              );
              setIncoming(null);
              return;
            }
          }

          // Flag on: my fresh reading for this challenge goes in first, so
          // the server's proximity gate has it (contract-location-flag 6).
          // A failed reading does not stop the start: an earlier reading
          // (go_live, a previous arena one) may still be fresh, and only the
          // server knows. It is shown only if the server then says MY side
          // has no reading.
          let readingFailure: LocationFailure | null = null;
          if (await isLocationRequired()) {
            const capture = await captureAndReport(supabase, "arena", current.challengeId);
            if (!capture.ok && capture.failure) readingFailure = capture.failure;
            if (
              !capture.ok &&
              capture.failure === null &&
              capture.report.ok === false &&
              capture.report.code === "booking_closed"
            ) {
              toast.error(CHALLENGE_GONE_MESSAGE);
              setIncoming(null);
              return;
            }
          }

          // acceptChallenge filters on status = 'pending' and a no-row update
          // is not an error, so a withdrawn challenge surfaces here as
          // not_accepted. Any other failure is retried once: the RPC is
          // idempotent and returns the existing match if one was created.
          // A proximity refusal is an answer, not a blip: never retried.
          let started = await startMatchFromChallenge(
            supabase,
            current.challengeId,
          );
          if (
            !started.ok &&
            started.error.code !== "CHALLENGE_NOT_ACCEPTED" &&
            !isProximityHint(hintOf(started.error))
          ) {
            started = await startMatchFromChallenge(supabase, current.challengeId);
          }
          if (!started.ok) {
            if (isProximityHint(hintOf(started.error))) {
              onLocationRequiredRef.current?.();
              // The accepter is always the challenge's opponent. My side
              // missing after my own reading failed: that failure is the fix.
              const missing =
                hintOf(started.error) === "proximity_required"
                  ? proximityMissingOf(started.error)
                  : null;
              const mineMissing = missing === "opponent" || missing === "both";
              blockStart(
                current,
                readingFailure && mineMissing
                  ? readingFailure
                  : proximityBlockFor(started.error, "opponent"),
              );
              return;
            }
            toast.error(
              started.error.code === "CHALLENGE_NOT_ACCEPTED"
                ? CHALLENGE_GONE_MESSAGE
                : started.error.message || "Couldn't start the match.",
            );
            setIncoming(null);
            return;
          }

          // Tell the challenger before navigating, so both land together.
          await broadcast(
            incomingChannelRef.current,
            current.challengeId,
            "match_started",
            { matchId: started.data.match_id },
          );

          enterMatch(current.challengeId, started.data.match_id, current.challengerId);
        } finally {
          acceptingIdRef.current = null;
        }
      }),
    [athleteWeight, runExclusive, enterMatch, setIncoming, isLocationRequired, blockStart],
  );

  const decline = useCallback(
    () =>
      runExclusive(async () => {
        const current = incomingRef.current;
        if (!current) return;
        const supabase = createClient();
        if (current.startBlocked) {
          // Already accepted, so it cannot be declined: withdraw it. The
          // challenger's bar resolves from the row UPDATE (and the broadcast).
          const res = await cancelChallenge(supabase, current.challengeId, {
            onlyIfAccepted: true,
          });
          if (!res.ok) {
            toast.error("Couldn't cancel that challenge. Try again.");
            return;
          }
          if (!res.data.cancelled) {
            // Not accepted any more: most likely the challenger's side
            // started it a moment ago. Join it rather than leave them alone
            // in it (mobile cancelBlockedStart).
            const started = await startMatchFromChallenge(supabase, current.challengeId);
            if (started.ok) {
              enterMatch(current.challengeId, started.data.match_id, current.challengerId);
              return;
            }
          }
          settledRef.current.add(current.challengeId);
          if (res.data.cancelled) {
            await broadcast(incomingChannelRef.current, current.challengeId, "cancelled");
          }
          setIncoming(null);
          return;
        }
        const result = await declineChallenge(supabase, current.challengeId);
        if (!result.ok) {
          // Keep the prompt: it is still pending and the challenger waiting.
          toast.error("Couldn't decline that challenge. Try again.");
          return;
        }
        await broadcast(
          incomingChannelRef.current,
          current.challengeId,
          "declined",
        );
        setIncoming(null);
      }),
    [runExclusive, setIncoming, enterMatch],
  );

  const cancelOutgoing = useCallback(
    () =>
      runExclusive(async () => {
        const current = outgoingRef.current;
        if (!current) return;
        const supabase = createClient();
        const result = await cancelChallenge(supabase, current.challengeId);
        if (!result.ok) {
          // Keep the bar: the challenge is still live server-side.
          toast.error("Couldn't cancel that challenge. Try again.");
          return;
        }
        if (!result.data.cancelled) {
          // No row changed (a 0-row update is not an error): the challenge
          // was already over, or the opponent has just started the match.
          // start_match_from_challenge is idempotent and returns the existing
          // match, so join it rather than leave the opponent in it alone
          // (mirrors mobile). Nothing was withdrawn, so nothing to broadcast.
          const started = await startMatchFromChallenge(
            supabase,
            current.challengeId,
          );
          if (started.ok) {
            enterMatch(current.challengeId, started.data.match_id, current.opponentId);
            return;
          }
          settledRef.current.add(current.challengeId);
          setOutgoing(null);
          return;
        }
        settledRef.current.add(current.challengeId);
        await broadcast(
          outgoingChannelRef.current,
          current.challengeId,
          "cancelled",
        );
        setOutgoing(null);
      }),
    [runExclusive, setOutgoing, enterMatch],
  );

  return {
    incoming,
    outgoing,
    isBusy,
    sendChallenge,
    accept,
    decline,
    cancelOutgoing,
  };
}
