/**
 * Runs a pending invite for a signed-in athlete (jr_be spec 016, plan 10):
 * read location (asks once), claim, and on an `invalid` token fall back to a
 * join invite. Exposes one `step` for `app/(app)/invite/claim.tsx` to render.
 */
import * as React from "react";
import { acceptJoinInvite, claimChallengeInvite, logInviteEvent } from "@jits/shared/api/invites";
import { supabase } from "@/lib/supabase/client";
import { clearPendingInvite, takeBufferedEvents, type PendingInvite } from "./pending-invite";
import { readLocationOnce } from "./location";
import { clearsPendingInvite, stepForClaim, stepForJoin, type ClaimStep } from "./claim-flow";

export type RunnerState = { phase: "idle" | "locating" | "claiming" } | { phase: "done"; step: ClaimStep };

const NETWORK_COPY = "Couldn't reach ELO RATED. Check your connection and try again.";

export function useClaimRunner(pending: PendingInvite | null, athleteStatus: string | null | undefined) {
  const [state, setState] = React.useState<RunnerState>({ phase: "idle" });
  const [locationDenied, setLocationDenied] = React.useState(false);
  const running = React.useRef(false);

  const run = React.useCallback(async () => {
    if (!pending || running.current) return;
    running.current = true;
    try {
      // Flush buffered token_captured events now that we are signed in.
      for (const ev of await takeBufferedEvents()) {
        void logInviteEvent(supabase, "token_captured", {
          token: ev.token,
          detail: { captured_at: ev.captured_at, gateway: ev.gateway },
        });
      }
      setState({ phase: "locating" });
      const loc = await readLocationOnce({ ask: true });
      const denied = loc.status === "denied";
      setLocationDenied(denied);
      if (denied) {
        void logInviteEvent(supabase, "location_denied", { token: pending.token, detail: { context: "claim" } });
      }
      setState({ phase: "claiming" });
      const input = {
        token: pending.token,
        code: pending.code,
        gateway: pending.gateway,
        firstTouchAt: pending.first_touch_at,
      };
      const res = await claimChallengeInvite(supabase, input, loc.status === "ok" ? loc.reading : null);
      if (!res.ok) {
        setState({ phase: "done", step: { type: "message", message: NETWORK_COPY, terminal: false } });
        return;
      }
      let step = stepForClaim(res.data, {
        viaCode: Boolean(pending.code),
        athleteStatus,
        locationOff: loc.status !== "ok",
      });
      if (step.type === "try_join" && pending.token) {
        const joined = await acceptJoinInvite(supabase, pending.token);
        step = joined.ok
          ? stepForJoin(joined.data, athleteStatus)
          : { type: "message", message: NETWORK_COPY, terminal: false };
      }
      if (clearsPendingInvite(step)) await clearPendingInvite();
      setState({ phase: "done", step });
    } finally {
      running.current = false;
    }
  }, [pending, athleteStatus]);

  return { state, run, locationDenied };
}
