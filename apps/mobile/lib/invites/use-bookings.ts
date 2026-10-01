/**
 * Open invite bookings for the Booked strip (jr_be spec 016, US5). While the
 * strip is visible and the app is foregrounded, a location reading is sent
 * every 60 s per booking (`booking_open`); when the server starts the match
 * both phones route to the face-off. A closed booking leaves the strip with
 * a toast. Each booking keeps its last presence answer so the strip can say
 * why it has not started (a busy athlete, a coarse reading), and a booking
 * can be cancelled through the existing challenge cancel path (contract
 * 4.19: `accepted` -> `cancelled`).
 */
import * as React from "react";
import { AppState } from "react-native";
import { getMyBookings, reportMatchPresence, type Booking } from "@jits/shared/api/invites";
import { cancelChallenge } from "@jits/shared/api/mutations";
import { BOOKING_CLOSED_COPY, type StartBlockedReason } from "@jits/shared/utils";
import { supabase } from "@/lib/supabase/client";
import { readLocationOnce } from "./location";

const EVERY_MS = 60_000;

/**
 * The device's location for the strip: `ask` (never asked, the system prompt
 * can still be shown), `denied` (only Settings can turn it on), `unavailable`
 * (no fix in time).
 */
export type BookingLocation = "ok" | "ask" | "denied" | "unavailable" | "unknown";

/** The last presence answer for one booking. */
export interface BookingPresence {
  blockedReason: StartBlockedReason | null;
  accuracyTooLow: boolean;
}

export function useBookings(opts: {
  visible: boolean;
  onStarted: (matchId: string) => void;
  onClosed: (message: string) => void;
}) {
  const [bookings, setBookings] = React.useState<Booking[]>([]);
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
      if (res.data.ok && res.data.started && res.data.match_id) {
        cb.current.onStarted(res.data.match_id);
        return;
      }
      if (!res.data.ok && res.data.code === "booking_closed") {
        setBookings((cur) => cur.filter((x) => x.challenge_id !== b.challenge_id));
        cb.current.onClosed(BOOKING_CLOSED_COPY);
        continue;
      }
      const next: BookingPresence = res.data.ok
        ? { blockedReason: res.data.start_blocked_reason ?? null, accuracyTooLow: false }
        : { blockedReason: null, accuracyTooLow: res.data.code === "accuracy_too_low" };
      setPresence((cur) => ({ ...cur, [b.challenge_id]: next }));
    }
  }, []);

  const hasBookings = bookings.length > 0;
  React.useEffect(() => {
    if (!opts.visible || !hasBookings) return;
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
  }, [opts.visible, hasBookings, tick]);

  /** Cancel a booking (either side). Resolves false when nothing was cancelled. */
  const cancel = React.useCallback(async (challengeId: string): Promise<boolean> => {
    const res = await cancelChallenge(supabase, challengeId);
    if (!res.ok) return false;
    setBookings((cur) => cur.filter((x) => x.challenge_id !== challengeId));
    return true;
  }, []);

  return {
    bookings,
    location,
    presence,
    reload: load,
    retry: () => tick(false),
    askLocation: () => tick(true),
    cancel,
  };
}
