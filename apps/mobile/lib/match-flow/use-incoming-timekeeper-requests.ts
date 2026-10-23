/**
 * The asked person's side of timekeeper mode, app-wide (spec 4.2 Pick and
 * Seat, 9.1; ARCHITECTURE 2.4): the realtime listener for requests sent to
 * the signed-in athlete, mounted ONCE by `<ArenaBootstrap />`. Whether a
 * timekeep sheet (`/match/<id>/timekeep`) is open lives in
 * `timekeep-sheet-store.ts`, which the notification handlers read too.
 *
 * Modal precedence (spec 9.1, review product M3):
 *  - while the sheet is open, the Arena owner holds the incoming-challenge
 *    prompt (`useIsTimekeepSheetOpen`, the same gate it applies while a match
 *    screen is mounted) and shows it once the sheet closes;
 *  - while the challenge prompt (or a blocked start's sheet, the Go Live
 *    location sheet or the drift prompt) is up, or a match screen is
 *    mounted, or a root route outside `(app)` is on top (the legal
 *    documents, an invite link: a push from there would stack a second
 *    `(app)`), or the app is in the background, a new request waits here
 *    (`held`) and its sheet opens after that ends, if the request is still
 *    open then (re-read with `get_timekeeper_request`). The TK-N1 push
 *    still arrives as a banner meanwhile; while the prompt (or a blocked
 *    start's sheet) is up a tap on it waits too (the notification handlers
 *    hold it, `useTimekeepTapHold`) and opens the sheet after.
 *
 * Missed rows: an INSERT that lands while the app is suspended or the
 * channel is down is never delivered, so on every (re)subscribe and on the
 * return to the foreground the newest pending request sent to the athlete
 * is read (`getIncomingTimekeeperRequest`) and queued like a row. A live
 * athlete's phone is held awake (no foreground ever comes), so while live a
 * lost channel keeps rebuilding, and going live restarts one that gave up
 * (as the incoming-challenge channel does).
 *
 * A request opens its sheet at most once: one already shown (from a push or
 * from here) never opens again, so closing the sheet without an answer
 * leaves the request to lapse rather than bouncing back up. A realtime row
 * only opens the sheet or tells an open sheet that its request is no longer
 * pending (the sheet then reads what to do: TK-T6, or the match for an
 * accept made on another device); it never answers anything (M-R8).
 */
import * as React from "react";
import { AppState } from "react-native";
import { router } from "expo-router";
import { supabase } from "@/lib/supabase/client";
import { superviseChannel, type SupervisedChannel } from "@/lib/supabase/supervise-channel";
import { getIncomingTimekeeperRequest, getTimekeeperRequest } from "@jits/shared/api/timekeeper";
import { getServerClockOffsetMs } from "@/lib/arena/incoming-challenges";
import {
  __resetTimekeepSheetStoreForTests,
  isTimekeepSheetOpen,
  markTimekeepRequestShown,
  subscribeTimekeepSheets,
  wasTimekeepRequestShown,
} from "./timekeep-sheet-store";

/** `/match/<id>/timekeep`, with the request when it is known (a push knows only the match, jr_be 024 section 8). */
export function timekeepHref(matchId: string, requestId?: string | null): string {
  const base = `/match/${matchId}/timekeep`;
  return requestId ? `${base}?request=${encodeURIComponent(requestId)}` : base;
}

// ---------------------------------------------------------------------------
// Request rows sent to this athlete
// ---------------------------------------------------------------------------

export interface IncomingRequestRow {
  id: string;
  matchId: string;
  status: string;
  expiresAt: string;
}

const rowListeners = new Set<(row: IncomingRequestRow) => void>();

/** Every request row change the listener receives (the open sheet closes when its request is over). */
export function subscribeIncomingTimekeeperRequests(cb: (row: IncomingRequestRow) => void): () => void {
  rowListeners.add(cb);
  return () => {
    rowListeners.delete(cb);
  };
}

function parseRow(raw: unknown): IncomingRequestRow | null {
  const r = (raw ?? {}) as Record<string, unknown>;
  const ok = (v: unknown): v is string => typeof v === "string" && v.length > 0;
  if (!ok(r.id) || !ok(r.match_id) || !ok(r.status)) return null;
  return { id: r.id, matchId: r.match_id, status: r.status, expiresAt: ok(r.expires_at) ? r.expires_at : "" };
}

/** Past `expires_at` on the server's clock (the offset the Arena learned), so a skewed phone clock drops nothing early. */
const lapsed = (row: IncomingRequestRow) => Date.parse(row.expiresAt) <= Date.now() - getServerClockOffsetMs();

/** Per-mount suffix: `supabase.channel(topic)` hands back a live duplicate. */
let channelSeq = 0;
/** The listener could not start (best effort; said once per process). */
let warnedUnavailable = false;

interface Params {
  athleteId: string;
  /**
   * A challenge prompt, a blocked start's sheet, the Go Live location sheet,
   * the drift prompt or a match screen is up, or `(app)` is not on top of the
   * root Stack: a new request waits.
   */
  held: boolean;
  /** The athlete is live in the Arena (held awake): a lost channel keeps rebuilding. */
  live: boolean;
}

/**
 * Listen for timekeeper requests sent to `athleteId` and open each new one's
 * sheet, now or once nothing holds it. Best effort: without the channel the
 * TK-N1 push is the way in.
 */
export function useIncomingTimekeeperRequests({ athleteId, held, live }: Params): void {
  const heldRef = React.useRef(held);
  heldRef.current = held;
  const liveRef = React.useRef(live);
  liveRef.current = live;
  const queued = React.useRef<IncomingRequestRow | null>(null);
  const verifying = React.useRef(false);
  const catchingUp = React.useRef(false);
  const alive = React.useRef(true);
  const supervisor = React.useRef<SupervisedChannel | null>(null);

  const tryOpen = React.useCallback((verify: boolean) => {
    const q = queued.current;
    if (!q || !alive.current) return;
    if (wasTimekeepRequestShown(q.id) || lapsed(q)) {
      queued.current = null;
      return;
    }
    if (heldRef.current || isTimekeepSheetOpen() || AppState.currentState !== "active") return;
    const open = () => {
      queued.current = null;
      markTimekeepRequestShown(q.id);
      try {
        router.push(timekeepHref(q.matchId, q.id) as never);
      } catch (err) {
        console.warn("[timekeeper] could not open the timekeep sheet", err);
      }
    };
    if (!verify) {
      open();
      return;
    }
    // Held a while: open only a request that is still open now.
    if (verifying.current) return;
    verifying.current = true;
    getTimekeeperRequest(supabase, q.id)
      .then((res) => {
        if (queued.current?.id !== q.id) return;
        if (res.ok && res.data.status !== "pending") queued.current = null;
        else if (res.ok && !heldRef.current && !isTimekeepSheetOpen() && !wasTimekeepRequestShown(q.id)) open();
        // A failed read keeps it queued for the next trigger.
      })
      .catch(() => undefined)
      .finally(() => {
        verifying.current = false;
      });
  }, []);

  /** Queue the newest pending request sent to me that no row delivered (a missed INSERT). */
  const catchUp = React.useCallback(() => {
    if (catchingUp.current || queued.current || !alive.current) return;
    catchingUp.current = true;
    getIncomingTimekeeperRequest(supabase, athleteId)
      .then((res) => {
        if (!alive.current || !res.ok || !res.data || queued.current) return;
        const row: IncomingRequestRow = {
          id: res.data.requestId,
          matchId: res.data.matchId,
          status: "pending",
          expiresAt: res.data.expiresAt,
        };
        if (wasTimekeepRequestShown(row.id) || lapsed(row)) return;
        queued.current = row;
        tryOpen(false);
      })
      .catch(() => undefined)
      .finally(() => {
        catchingUp.current = false;
      });
  }, [athleteId, tryOpen]);

  React.useEffect(() => {
    alive.current = true;
    let stop: SupervisedChannel | null = null;
    try {
      stop = superviseChannel(
        "timekeeper requests",
        () =>
          supabase.channel(`timekeeper-requests:${athleteId}:${++channelSeq}`).on(
            "postgres_changes",
            { event: "*", schema: "public", table: "match_timekeeper_requests", filter: `invitee_id=eq.${athleteId}` },
            (payload: { eventType?: string; new?: unknown }) => {
              const row = parseRow(payload.new);
              if (!row) return;
              for (const l of [...rowListeners]) l(row);
              if (payload.eventType === "INSERT" && row.status === "pending") {
                queued.current = row;
                tryOpen(false);
              } else if (queued.current?.id === row.id && row.status !== "pending") {
                queued.current = null;
              }
            },
          ),
        // Every (re)subscribe: a row may have been missed while it was down.
        () => catchUp(),
        // A live athlete is held awake, so no foreground would resume it.
        { keepRetrying: () => liveRef.current },
      );
    } catch (err) {
      if (!warnedUnavailable) console.warn("[timekeeper] request listener unavailable", err);
      warnedUnavailable = true;
    }
    supervisor.current = stop;
    return () => {
      alive.current = false;
      queued.current = null;
      if (supervisor.current === stop) supervisor.current = null;
      stop?.();
    };
  }, [athleteId, tryOpen, catchUp]);

  // Going live restarts a channel that gave up while offline.
  React.useEffect(() => {
    if (live) supervisor.current?.resume();
  }, [live]);

  // Released: the prompt closed, the match ended, the sheet closed, the app came back.
  React.useEffect(() => {
    if (!held) tryOpen(true);
  }, [held, tryOpen]);
  React.useEffect(
    () =>
      subscribeTimekeepSheets(() => {
        if (!isTimekeepSheetOpen()) tryOpen(true);
      }),
    [tryOpen],
  );
  React.useEffect(() => {
    const sub = AppState.addEventListener("change", (next) => {
      if (next !== "active") return;
      tryOpen(true);
      catchUp();
    });
    return () => sub?.remove();
  }, [tryOpen, catchUp]);
}

/** Test-only: forget every row listener, and the sheet store. */
export function __resetIncomingTimekeeperRequestsForTests(): void {
  rowListeners.clear();
  __resetTimekeepSheetStoreForTests();
}
