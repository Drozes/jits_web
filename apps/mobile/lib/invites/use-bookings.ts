/**
 * Open invite bookings for the Booked strip (jr_be spec 016, US5). While the
 * strip is visible and the app is foregrounded, a location reading is sent
 * every 60 s per booking (`booking_open`); when the server starts the match
 * both phones route to the face-off. A closed booking leaves the strip with
 * a toast. Each booking keeps its last presence answer so the strip can say
 * why it has not started (a busy athlete, a coarse reading), and a booking
 * can be cancelled through the existing challenge cancel path (contract
 * 4.19: `accepted` -> `cancelled`).
 *
 * With `match_location_required` OFF (contract-location-flag 5 and 6) no
 * location is read at all: either athlete taps Start match
 * (`start_invite_booking`), and the other one follows the challenge row's
 * realtime `started` into the same match.
 */
import * as React from "react";
import { AppState } from "react-native";
import { getMyBookings, reportMatchPresence, type Booking } from "@jits/shared/api/invites";
import { cancelChallenge } from "@jits/shared/api/mutations";
import { startInviteBooking, subscribeToChallengeStatus } from "@jits/shared/api/location";
import {
  BOOKING_CLOSED_COPY,
  startBookingErrorView,
  type StartBlockedReason,
  type StartBookingErrorView,
} from "@jits/shared/utils";
import { markMatchLocationRequired } from "@/lib/arena/match-location-flag";
import { supabase } from "@/lib/supabase/client";
import { readLocationOnce } from "./location";
import { releasePushDeferral } from "./pending-invite";

/**
 * The last booking closed without a match (cancelled, expired): an invitee
 * whose push prompt waits for a first match has none coming, so it is
 * released now (a no-op for everyone else).
 */
function releaseIfNoneLeft(remaining: Booking[]) {
  if (remaining.length === 0) void releasePushDeferral();
}

const EVERY_MS = 60_000;

/**
 * The device's location for the strip: `ask` (never asked, the system prompt
 * can still be shown), `denied` (only Settings can turn it on), `unavailable`
 * (no fix in time).
 */
export type BookingLocation = "ok" | "ask" | "denied" | "unavailable" | "unknown";

/** What a cancel did: see `cancel`. */
export type CancelBookingResult = "cancelled" | "too_late" | "failed";

/** The last presence answer for one booking. */
export interface BookingPresence {
  blockedReason: StartBlockedReason | null;
  accuracyTooLow: boolean;
  /**
   * The server refused the reading as `implausible_movement` (an implied
   * speed over 50 m/s). Shown once; never retried automatically.
   */
  implausibleMovement?: boolean;
}

/** What a Start match tap did. */
export type StartBookingOutcome = "started" | "closed" | "failed";

export function useBookings(opts: {
  visible: boolean;
  onStarted: (matchId: string) => void;
  onClosed: (message: string) => void;
  /**
   * `match_location_required`. On (the default): location readings start
   * the match. Off: no location, the Start match button starts it. Null:
   * not known yet (cold start), so neither runs.
   */
  locationRequired?: boolean | null;
}) {
  const flagKnown = opts.locationRequired !== null;
  const locationRequired = opts.locationRequired ?? true;
  const [bookings, setBookings] = React.useState<Booking[]>([]);
  const [starting, setStarting] = React.useState<Record<string, boolean>>({});
  const [startErrors, setStartErrors] = React.useState<Record<string, StartBookingErrorView>>({});
  const [location, setLocation] = React.useState<BookingLocation>("unknown");
  const [presence, setPresence] = React.useState<Record<string, BookingPresence>>({});
  const cb = React.useRef(opts);
  cb.current = opts;
  const bookingsRef = React.useRef(bookings);
  bookingsRef.current = bookings;

  const load = React.useCallback(async () => {
    const res = await getMyBookings(supabase);
    if (res.ok) setBookings(res.data);
  }, []);

  React.useEffect(() => {
    if (opts.visible) void load();
  }, [opts.visible, load]);

  /** One reading sent for every booking. `ask`: show the system prompt if it can be. */
  const tick = React.useCallback(async (ask = false) => {
    const list = bookingsRef.current;
    if (list.length === 0 || AppState.currentState === "background") return;
    const loc = await readLocationOnce({ ask });
    if (loc.status === "denied") {
      setLocation(loc.canAskAgain ? "ask" : "denied");
      return;
    }
    if (loc.status === "unavailable") {
      setLocation("unavailable");
      return;
    }
    setLocation("ok");
    for (const b of list) {
      const res = await reportMatchPresence(supabase, loc.reading, "booking_open", { challengeId: b.challenge_id });
      if (!res.ok) continue;
      // Only a flag-off server answers `start_available`: the owner turned
      // the flag off mid-session. The strip switches to Start match.
      if (res.data.ok && res.data.start_blocked_reason === "start_available") {
        markMatchLocationRequired(false);
        return;
      }
      if (res.data.ok && res.data.started && res.data.match_id) {
        cb.current.onStarted(res.data.match_id);
        return;
      }
      // Closed either way: the refusal code, or (flag-on proximity path) an
      // ok reply whose start_blocked_reason says the booking was cancelled.
      if (
        (!res.data.ok && res.data.code === "booking_closed") ||
        (res.data.ok && res.data.start_blocked_reason === "booking_closed")
      ) {
        const remaining = bookingsRef.current.filter((x) => x.challenge_id !== b.challenge_id);
        bookingsRef.current = remaining;
        setBookings(remaining);
        cb.current.onClosed(BOOKING_CLOSED_COPY);
        releaseIfNoneLeft(remaining);
        continue;
      }
      const next: BookingPresence = res.data.ok
        ? { blockedReason: res.data.start_blocked_reason ?? null, accuracyTooLow: false }
        : {
            blockedReason: null,
            accuracyTooLow: res.data.code === "accuracy_too_low",
            ...(res.data.code === "implausible_movement" ? { implausibleMovement: true } : {}),
          };
      setPresence((cur) => ({ ...cur, [b.challenge_id]: next }));
    }
  }, []);

  const hasBookings = bookings.length > 0;
  React.useEffect(() => {
    if (!opts.visible || !hasBookings || !flagKnown || !locationRequired) return;
    let cancelled = false;
    const run = () => {
      if (!cancelled) void tick();
    };
    run();
    const t = setInterval(run, EVERY_MS);
    const sub = AppState.addEventListener("change", (s) => {
      if (s === "active") run();
    });
    return () => {
      cancelled = true;
      clearInterval(t);
      sub.remove();
    };
  }, [opts.visible, hasBookings, tick, locationRequired, flagKnown]);

  // The flag turned on (or a refusal proved it on): the Start errors are moot.
  React.useEffect(() => {
    if (locationRequired) setStartErrors({});
  }, [locationRequired]);

  /** Each booking routes once, whether my tap or the realtime row got there first. */
  const routedRef = React.useRef(new Set<string>());
  const fireStarted = React.useCallback((challengeId: string, matchId: string) => {
    if (routedRef.current.has(challengeId)) return;
    routedRef.current.add(challengeId);
    cb.current.onStarted(matchId);
  }, []);

  const removeBooking = React.useCallback((challengeId: string) => {
    const remaining = bookingsRef.current.filter((x) => x.challenge_id !== challengeId);
    bookingsRef.current = remaining;
    setBookings(remaining);
    releaseIfNoneLeft(remaining);
  }, []);

  /**
   * Start match (flag off). Either athlete may tap it; the server is
   * idempotent, so a started booking just answers with its match id.
   */
  const start = React.useCallback(
    async (challengeId: string): Promise<StartBookingOutcome> => {
      const booking = bookingsRef.current.find((b) => b.challenge_id === challengeId);
      if (!booking) return "failed";
      const ctx = {
        role: booking.role,
        opponentName: booking.opponent.first_name || booking.opponent.display_name,
      };
      setStarting((cur) => ({ ...cur, [challengeId]: true }));
      setStartErrors(({ [challengeId]: _drop, ...rest }) => rest);
      try {
        const res = await startInviteBooking(supabase, challengeId);
        if (!res.ok) {
          console.warn("[invites] start_invite_booking failed:", res.error.hint, res.error.message);
          setStartErrors((cur) => ({ ...cur, [challengeId]: startBookingErrorView(res.error.hint, ctx) }));
          return "failed";
        }
        if (res.data.ok) {
          fireStarted(challengeId, res.data.match_id);
          return "started";
        }
        const view = startBookingErrorView(res.data.code, ctx);
        if (view.closed) {
          removeBooking(challengeId);
          cb.current.onClosed(BOOKING_CLOSED_COPY);
          return "closed";
        }
        // The flag is on after all: the location readings take over.
        if (res.data.code === "location_required") markMatchLocationRequired(true);
        setStartErrors((cur) => ({ ...cur, [challengeId]: view }));
        return "failed";
      } finally {
        setStarting(({ [challengeId]: _done, ...rest }) => rest);
      }
    },
    [removeBooking, fireStarted],
  );

  // Flag off: the other athlete's Start match moves the row to `started`
  // (realtime on challenges), which takes this athlete into the same match;
  // a cancel or expiry closes the booking.
  const bookingIds = bookings.map((b) => b.challenge_id).join(",");
  React.useEffect(() => {
    if (!opts.visible || !flagKnown || locationRequired || !bookingIds) return;
    const unsubs = bookingIds.split(",").map((id) =>
      subscribeToChallengeStatus(supabase, id, (status) => {
        if (status === "started") {
          void startInviteBooking(supabase, id).then((res) => {
            if (res.ok && res.data.ok) fireStarted(id, res.data.match_id);
          });
        } else if (status !== "accepted") {
          removeBooking(id);
          cb.current.onClosed(BOOKING_CLOSED_COPY);
        }
      }),
    );
    return () => {
      for (const u of unsubs) u();
    };
  }, [opts.visible, flagKnown, locationRequired, bookingIds, removeBooking, fireStarted]);

  /**
   * Cancel a booking (either side), only while it is still `accepted`.
   * `too_late`: nothing was cancelled because the server started (or closed)
   * the booking a moment earlier; a started match routes this athlete to the
   * face-off, otherwise the list is reloaded and a reading sent. `failed`:
   * the request failed, or the booking is somehow still open.
   */
  const cancel = React.useCallback(
    async (challengeId: string): Promise<CancelBookingResult> => {
      const res = await cancelChallenge(supabase, challengeId, { onlyIfAccepted: true });
      if (!res.ok) return "failed";
      if (res.data.cancelled) {
        const remaining = bookingsRef.current.filter((x) => x.challenge_id !== challengeId);
        bookingsRef.current = remaining;
        setBookings(remaining);
        releaseIfNoneLeft(remaining);
        return "cancelled";
      }
      const { data: match } = await supabase.from("matches").select("id").eq("challenge_id", challengeId).maybeSingle();
      if (match?.id) {
        setBookings((cur) => cur.filter((x) => x.challenge_id !== challengeId));
        cb.current.onStarted(match.id);
        return "too_late";
      }
      const fresh = await getMyBookings(supabase);
      if (!fresh.ok) return "failed";
      setBookings(fresh.data);
      bookingsRef.current = fresh.data;
      void tick();
      if (fresh.data.some((b) => b.challenge_id === challengeId)) return "failed";
      releaseIfNoneLeft(fresh.data);
      return "too_late";
    },
    [tick],
  );

  return {
    bookings,
    location,
    presence,
    reload: load,
    starting,
    startErrors,
    start,
    retry: () => tick(false),
    askLocation: () => tick(true),
    cancel,
  };
}
