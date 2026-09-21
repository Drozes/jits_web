import * as React from "react";
import { useAuth } from "@/lib/auth/hooks";
import { ensureUploadListeners, resumeMatchVideoUploads } from "./video-upload-manager";

/**
 * Picks up match-video uploads that an earlier app launch could not finish
 * and binds the foreground / reconnect resume triggers.
 *
 * Renders null. Placed inside `<AuthProvider>` in `_layout.tsx` next to the
 * other bootstraps.
 *
 * Gated on a signed-in user because every tus request needs a live access
 * token: resuming before auth settles would spend an attempt on a
 * guaranteed 401. It is keyed on the user id so a different account
 * signing in on the same device re-runs the sweep (the jobs are that
 * account's; a job whose athlete no longer matches simply fails RLS and is
 * abandoned rather than silently retried forever).
 */
export function VideoUploadBootstrap() {
  const { user } = useAuth();
  const userId = user?.id ?? null;

  React.useEffect(() => {
    if (!userId) return;
    const unbind = ensureUploadListeners();
    void resumeMatchVideoUploads();
    // Deliberately NOT unbinding on unmount: the listeners are what let an
    // upload survive the screen, and this component only unmounts when the
    // whole tree does.
    return () => {
      void unbind;
    };
  }, [userId]);

  return null;
}
