/**
 * Open invite bookings for the Booked strip (jr_be spec 016, US5). While the
 * strip is visible and the app is foregrounded, a location reading is sent
 * every 60 s per booking (`booking_open`); when the server starts the match
 * both phones route to the face-off. A closed booking leaves the strip with
 * a toast.
 */
import * as React from "react";
import { AppState } from "react-native";
import { getMyBookings, reportMatchPresence, type Booking } from "@jits/shared/api/invites";
import { BOOKING_CLOSED_COPY } from "@jits/shared/utils";
import { supabase } from "@/lib/supabase/client";
import { readLocationOnce } from "./location";

const EVERY_MS = 60_000;

export function useBookings(opts: {
  visible: boolean;
  onStarted: (matchId: string) => void;
  onClosed: (message: string) => void;
}) {
  const [bookings, setBookings] = React.useState<Booking[]>([]);
  const [locationOff, setLocationOff] = React.useState(false);
  const cb = React.useRef(opts);
  cb.current = opts;

  const load = React.useCallback(async () => {
    const res = await getMyBookings(supabase);
    if (res.ok) setBookings(res.data);
  }, []);

  React.useEffect(() => {
    if (opts.visible) void load();
  }, [opts.visible, load]);

  React.useEffect(() => {
    if (!opts.visible || bookings.length === 0) return;
    let cancelled = false;
    const tick = async () => {
      if (AppState.currentState !== "active") return;
      const loc = await readLocationOnce({ ask: false });
      if (cancelled) return;
      setLocationOff(loc.status === "denied");
      if (loc.status !== "ok") return;
      for (const b of bookings) {
        const res = await reportMatchPresence(supabase, loc.reading, "booking_open", { challengeId: b.challenge_id });
        if (cancelled || !res.ok) continue;
        if (res.data.ok && res.data.started && res.data.match_id) {
          cb.current.onStarted(res.data.match_id);
          return;
        }
        if (!res.data.ok && res.data.code === "booking_closed") {
          setBookings((cur) => cur.filter((x) => x.challenge_id !== b.challenge_id));
          cb.current.onClosed(BOOKING_CLOSED_COPY);
        }
      }
    };
    void tick();
    const t = setInterval(() => void tick(), EVERY_MS);
    const sub = AppState.addEventListener("change", (s) => {
      if (s === "active") void tick();
    });
    return () => {
      cancelled = true;
      clearInterval(t);
      sub.remove();
    };
  }, [opts.visible, bookings]);

  return { bookings, locationOff, reload: load };
}
