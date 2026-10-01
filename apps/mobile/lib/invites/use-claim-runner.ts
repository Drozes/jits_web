/**
 * Runs a pending invite for a signed-in athlete (jr_be spec 016, plan 10).
 *
 * A link token's kind is unknown on the device, so a token is first offered
 * to `accept_join_invite` (no location needed): a personal join link never
 * triggers the location prompt. Only when that says `invalid` (so it is a
 * challenge, or garbage) is a location read (asks once) and the challenge
 * claimed. A code is always a challenge and goes straight to the claim.
 * Exposes one `step` for `app/(app)/invite/claim.tsx` to render.
 *
 * `dob_required` (an account from before date of birth was required): the
 * screen collects it and calls `submitDob`, which saves it on the athlete's
 * own row and claims again with the same input.
 */
import * as React from "react";
import { acceptJoinInvite, claimChallengeInvite, logInviteEvent, setMyDateOfBirth } from "@jits/shared/api/invites";
import { DOB_REQUIRED_COPY, DOB_SAVE_FAILED_COPY } from "@jits/shared/utils";
import { supabase } from "@/lib/supabase/client";
import { clearPendingInvite, releasePushDeferral, takeBufferedEvents, type PendingInvite } from "./pending-invite";
import { readLocationOnce } from "./location";
import { notifyFriendsChanged } from "./use-friend-ids";
import { clearsPendingInvite, stepForClaim, stepForJoin, type ClaimStep } from "./claim-flow";

export type RunnerState =
  | { phase: "idle" | "checking" | "locating" | "claiming" | "saving_dob" }
  | { phase: "done"; step: ClaimStep };

const NETWORK_COPY = "Couldn't reach ELO RATED. Check your connection and try again.";

export function useClaimRunner(
  pending: PendingInvite | null,
  athleteStatus: string | null | undefined,
  opts: { newAccount?: boolean; athleteId?: string | null; onDobSaved?: () => void } = {},
) {
  const [state, setState] = React.useState<RunnerState>({ phase: "idle" });
  const [locationDenied, setLocationDenied] = React.useState(false);
  const [dobError, setDobError] = React.useState<string | null>(null);
  const running = React.useRef(false);
  const newAccount = Boolean(opts.newAccount);
  const athleteId = opts.athleteId ?? null;
  const onDobSaved = opts.onDobSaved;

  const finish = React.useCallback(async (step: ClaimStep) => {
    if (clearsPendingInvite(step)) await clearPendingInvite();
    // A join accept, a claim, or a weekly-cap claim can make friends, and
    // friendships have no realtime stream: tell the Arena badges to re-read.
    notifyFriendsChanged();
    // Push waits for a first match only when there is a match to wait for.
    if (step.type !== "go_match" && step.type !== "booked" && step.type !== "setup" && step.type !== "dob") {
      if (step.type !== "message" || step.terminal) void releasePushDeferral();
    }
    setState({ phase: "done", step });
  }, []);

  // Read a location (asks once), then claim the challenge.
  const claimNow = React.useCallback(async () => {
    if (!pending) return;
    setState({ phase: "locating" });
    const loc = await readLocationOnce({ ask: true });
    const denied = loc.status === "denied";
    setLocationDenied(denied);
    if (denied) {
      void logInviteEvent(supabase, "location_denied", {
        token: pending.token,
        detail: { context: "claim" },
      });
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
    await finish(
      stepForClaim(res.data, {
        viaCode: Boolean(pending.code),
        athleteStatus,
        locationOff: loc.status !== "ok",
        joinTried: Boolean(pending.token),
      }),
    );
  }, [pending, athleteStatus, finish]);

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

      if (pending.token) {
        setState({ phase: "checking" });
        const joined = await acceptJoinInvite(supabase, pending.token, {
          gateway: pending.gateway,
          platform: "ios",
        });
        if (!joined.ok) {
          setState({ phase: "done", step: { type: "message", message: NETWORK_COPY, terminal: false } });
          return;
        }
        if (joined.data.ok || joined.data.code !== "invalid") {
          await finish(stepForJoin(joined.data, athleteStatus, { newAccount }));
          return;
        }
        // `invalid` as a join link: a challenge (or nothing), claimed below.
      }

      await claimNow();
    } finally {
      running.current = false;
    }
  }, [pending, athleteStatus, newAccount, finish, claimNow]);

  /** Save the date of birth (dob_required), then claim again. */
  const submitDob = React.useCallback(
    async (dateOfBirth: string) => {
      if (!pending || !athleteId || running.current) return;
      running.current = true;
      try {
        setDobError(null);
        setState({ phase: "saving_dob" });
        const saved = await setMyDateOfBirth(supabase, athleteId, dateOfBirth);
        if (!saved.ok) {
          setDobError(DOB_SAVE_FAILED_COPY);
          setState({ phase: "done", step: { type: "dob", message: DOB_REQUIRED_COPY } });
          return;
        }
        onDobSaved?.();
        await claimNow();
      } finally {
        running.current = false;
      }
    },
    [pending, athleteId, onDobSaved, claimNow],
  );

  return { state, run, locationDenied, submitDob, dobError };
}
