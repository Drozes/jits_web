/**
 * Side-effect-only component that registers push notifications and wires
 * notification handlers (foreground display + tap deep-linking).
 *
 * Mounts inside the existing `<AuthProvider>` in `app/_layout.tsx`. Renders
 * null. Re-runs registration whenever the active athlete id changes (pending
 * athletes are skipped).
 */
import * as React from "react";
import { ATHLETE_STATUS } from "@jits/shared/constants";
import { useAuth } from "@/lib/auth/hooks";
import { supabase } from "@/lib/supabase/client";
import { registerForPushNotifications } from "./register-push";
import { setupNotificationHandlers } from "./handlers";

export function PushRegistrationBootstrap() {
  const { athlete } = useAuth();
  // Only an ACTIVE athlete: a pending one is still on the TOS / profile steps,
  // and the iOS permission prompt there (before they have seen the app) is a
  // one-shot we would waste (jits-r75.1). Activation flips status, so this
  // runs as soon as setup completes.
  const athleteId =
    athlete?.status === ATHLETE_STATUS.ACTIVE ? athlete.id : null;

  // Configure foreground display + tap handler exactly once.
  React.useEffect(() => {
    setupNotificationHandlers();
  }, []);

  React.useEffect(() => {
    if (!athleteId) return;
    let cancelled = false;

    (async () => {
      const result = await registerForPushNotifications(supabase, athleteId);
      if (cancelled) return;
      if (!result.ok && result.reason !== "permission_denied" && result.reason !== "not_a_device") {
        console.warn("[push] registration failed", result.reason, result.message);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [athleteId]);

  return null;
}
