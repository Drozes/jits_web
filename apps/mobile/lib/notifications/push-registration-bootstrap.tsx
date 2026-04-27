/**
 * Side-effect-only component that registers push notifications and wires
 * notification handlers (foreground display + tap deep-linking).
 *
 * Mounts inside the existing `<AuthProvider>` in `app/_layout.tsx`. Renders
 * null. Re-runs registration whenever the active athlete id changes.
 */
import * as React from "react";
import { useAuth } from "@/lib/auth/hooks";
import { supabase } from "@/lib/supabase/client";
import { registerForPushNotifications } from "./register-push";
import { setupNotificationHandlers } from "./handlers";

export function PushRegistrationBootstrap() {
  const { athlete } = useAuth();
  const athleteId = athlete?.id ?? null;

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
      if (!result.ok && result.reason !== "permission_denied") {
        console.warn("[push] registration failed", result.reason, result.message);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [athleteId]);

  return null;
}
