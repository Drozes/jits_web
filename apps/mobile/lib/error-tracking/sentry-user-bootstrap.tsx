/**
 * Side-effect-only component that keeps Sentry's user context in sync with the
 * signed-in athlete, so error and feedback reports are attributed (id/email/
 * name) and the feedback form prefills name/email.
 *
 * Mounts inside the existing `<AuthProvider>` in `app/_layout.tsx`, alongside
 * the other bootstraps. Renders null. No-ops until Sentry is initialized.
 */
import * as React from "react";
import { useAuth } from "@/lib/auth/hooks";
import { clearSentryUser, setSentryUser } from "./sentry";

export function SentryUserBootstrap() {
  const { user, athlete } = useAuth();
  const userId = user?.id ?? null;
  const email = user?.email ?? undefined;
  const displayName = athlete?.display_name ?? undefined;

  React.useEffect(() => {
    if (!userId) {
      clearSentryUser();
      return;
    }
    setSentryUser({ id: userId, email, username: displayName });
  }, [userId, email, displayName]);

  return null;
}
