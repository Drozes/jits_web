import { useCallback, useEffect, useRef, useState } from "react";
import type { RealtimeChannel, SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "../types/database";
import type { DomainError } from "../api/errors";
import { getMatchVideoStatus, type MatchVideoStatus } from "../api/match-video-status";

/** Realtime events arrive in bursts (one per input change); the contract asks for 300 to 500 ms. */
export const MATCH_VIDEO_STATUS_DEBOUNCE_MS = 400;
/**
 * `upload_paused` is computed on read (2 min without a heartbeat) and emits
 * no event, so while any angle is uploading the status is re-read this long
 * after the last read.
 */
export const MATCH_VIDEO_STATUS_UPLOAD_RECHECK_MS = 130_000;
/** After the wait deadline, while the server still says waiting ("Any second now"). */
export const MATCH_VIDEO_STATUS_OVERDUE_POLL_MS = 10_000;
/** ...at most this many times; realtime and foreground cover the rest. */
export const MATCH_VIDEO_STATUS_OVERDUE_POLL_LIMIT = 30;
/** Time-based server transitions (grace, film window) are re-read this long after they pass. */
const EDGE_SLACK_MS = 1_500;
/** Never arm a timer further out than this (setTimeout's own limit is ~24.8 days). */
const MAX_TIMER_MS = 26 * 60 * 60 * 1000;

export interface UseMatchVideoStatusOptions {
  /** Device clock, injectable for tests. */
  now?: () => number;
  /**
   * Platform foreground signal (mobile: AppState "active"). The hook re-reads
   * on each call. Returns an unsubscribe.
   */
  subscribeForeground?: (onForeground: () => void) => () => void;
  debounceMs?: number;
}

export interface MatchVideoStatusResult {
  /** The last good document (kept through a failed re-read). */
  status: MatchVideoStatus | null;
  /** The last read's error, null after a good read. */
  error: DomainError | null;
  /** True until the first read settles. */
  loading: boolean;
  /**
   * Server clock minus device clock in ms, learned from `server_now` on the
   * last read. Server time now = device now + offset (deck M10: a countdown
   * never trusts the device clock alone).
   */
  clockOffsetMs: number;
  /** Re-read now (debounced like a realtime event). */
  refetch: () => void;
}

let channelSeq = 0;

/** Device-time instant of a server timestamp, or null. */
export function serverInstantToDevice(iso: string | null, clockOffsetMs: number): number | null {
  if (!iso) return null;
  const t = Date.parse(iso);
  return Number.isFinite(t) ? t - clockOffsetMs : null;
}

/**
 * When (device ms) the hook should re-read on its own, or null: the wait
 * deadline (then a short poll while the server has not moved), the 15 min
 * no-video grace, the film window, and a recheck while an angle uploads
 * (`upload_paused` is computed on read). Pure, exported for tests.
 */
export function nextStatusWakeAt(
  status: MatchVideoStatus,
  clockOffsetMs: number,
  fetchedAt: number,
  now: number,
  overduePolls: number,
): number | null {
  const candidates: number[] = [];
  const at = (iso: string | null) => serverInstantToDevice(iso, clockOffsetMs);
  if (status.phase === "waiting_for_angle") {
    const deadline = at(status.wait_deadline_at);
    if (deadline != null) {
      if (deadline > now) candidates.push(deadline);
      else if (overduePolls < MATCH_VIDEO_STATUS_OVERDUE_POLL_LIMIT) candidates.push(now + MATCH_VIDEO_STATUS_OVERDUE_POLL_MS);
    }
  }
  if (status.phase === "collecting") {
    for (const edge of [at(status.no_video_grace_until), at(status.film_window_until)]) {
      if (edge != null && edge > now) candidates.push(edge + EDGE_SLACK_MS);
    }
  }
  if (status.angles.some((a) => a.state === "uploading")) {
    candidates.push(fetchedAt + MATCH_VIDEO_STATUS_UPLOAD_RECHECK_MS);
  }
  const future = candidates.filter((c) => c - now <= MAX_TIMER_MS);
  return future.length > 0 ? Math.max(now, Math.min(...future)) : null;
}

/**
 * One match's film status (jits-n2im.25): `get_match_video_status` read on
 * mount, re-read (debounced) on every `match_media_events` INSERT for the
 * match, on every (re)subscribe, on foreground, and when a time-based edge
 * passes (the wait deadline, the grace and film windows, a stale upload).
 * The payload of an event carries no state: the RPC is the only source.
 *
 * Responses are applied latest-request-first, and a response whose
 * `event_seq` is older than the one on screen is dropped (contract 11.2.5:
 * compare it only between RPC responses; a realtime event is never skipped
 * because of its id).
 *
 * Takes the client as a parameter like every shared hook. Pass a null
 * `matchId` to stay idle.
 */
export function useMatchVideoStatus(
  supabase: SupabaseClient<Database>,
  matchId: string | null | undefined,
  options: UseMatchVideoStatusOptions = {},
): MatchVideoStatusResult {
  const { subscribeForeground, debounceMs = MATCH_VIDEO_STATUS_DEBOUNCE_MS } = options;
  const nowRef = useRef(options.now ?? Date.now);
  nowRef.current = options.now ?? Date.now;

  const [status, setStatus] = useState<MatchVideoStatus | null>(null);
  const [error, setError] = useState<DomainError | null>(null);
  const [loading, setLoading] = useState<boolean>(!!matchId);
  const [clockOffsetMs, setClockOffsetMs] = useState(0);
  const [fetchedAt, setFetchedAt] = useState(0);

  const requestSeq = useRef(0);
  const appliedSeq = useRef(0);
  const appliedEventSeq = useRef<number | null>(null);
  const overduePolls = useRef(0);
  const debounceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const liveMatch = useRef<string | null>(null);

  const read = useCallback(async () => {
    const id = liveMatch.current;
    if (!id) return;
    const seq = ++requestSeq.current;
    const result = await getMatchVideoStatus(supabase, id);
    // A newer read already landed, or the match changed underneath.
    if (liveMatch.current !== id || seq < appliedSeq.current) return;
    if (!result.ok) {
      appliedSeq.current = seq;
      setError(result.error);
      setLoading(false);
      return;
    }
    const next = result.data;
    const prevSeq = appliedEventSeq.current;
    if (prevSeq != null && next.event_seq != null && next.event_seq < prevSeq) return;
    appliedSeq.current = seq;
    appliedEventSeq.current = next.event_seq ?? prevSeq;
    const receivedAt = nowRef.current();
    const server = next.server_now ? Date.parse(next.server_now) : NaN;
    setClockOffsetMs(Number.isFinite(server) ? server - receivedAt : 0);
    setFetchedAt(receivedAt);
    if (next.phase !== "waiting_for_angle") overduePolls.current = 0;
    setStatus(next);
    setError(null);
    setLoading(false);
  }, [supabase]);

  const schedule = useCallback(() => {
    if (debounceTimer.current) clearTimeout(debounceTimer.current);
    debounceTimer.current = setTimeout(() => {
      debounceTimer.current = null;
      void read();
    }, debounceMs);
  }, [read, debounceMs]);

  // Mount / match change: reset, read at once, subscribe.
  useEffect(() => {
    liveMatch.current = matchId ?? null;
    appliedEventSeq.current = null;
    appliedSeq.current = requestSeq.current;
    overduePolls.current = 0;
    setStatus(null);
    setError(null);
    setLoading(!!matchId);
    if (!matchId) return;
    void read();

    let disposed = false;
    channelSeq += 1;
    const filter = `match_id=eq.${matchId}`;
    const channel: RealtimeChannel = supabase
      .channel(`match-media:${matchId}:${channelSeq}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "match_media_events", filter }, (payload: { new?: Record<string, unknown> | null }) => {
        const row = payload?.new ?? null;
        if (row && row.match_id != null && row.match_id !== matchId) return;
        if (!disposed) schedule();
      })
      .subscribe((s: string) => {
        // Events while the socket was down are not replayed: re-read on
        // every (re)join, the first one included (it may have missed an
        // event between the first read and the join).
        if (!disposed && s === "SUBSCRIBED") schedule();
      });

    const offForeground = subscribeForeground?.(() => {
      if (!disposed) schedule();
    });

    return () => {
      disposed = true;
      liveMatch.current = null;
      if (debounceTimer.current) clearTimeout(debounceTimer.current);
      debounceTimer.current = null;
      offForeground?.();
      void supabase.removeChannel(channel);
    };
  }, [supabase, matchId, read, schedule, subscribeForeground]);

  // Time-based edges the server computes on read and emits no event for.
  useEffect(() => {
    if (!status) return;
    const now = nowRef.current();
    const wake = nextStatusWakeAt(status, clockOffsetMs, fetchedAt, now, overduePolls.current);
    if (wake == null) return;
    const timer = setTimeout(() => {
      if (status.phase === "waiting_for_angle") {
        const deadline = serverInstantToDevice(status.wait_deadline_at, clockOffsetMs);
        if (deadline != null && deadline <= nowRef.current()) overduePolls.current += 1;
      }
      void read();
    }, Math.max(0, wake - now));
    return () => clearTimeout(timer);
  }, [status, clockOffsetMs, fetchedAt, read]);

  return { status, error, loading, clockOffsetMs, refetch: schedule };
}
