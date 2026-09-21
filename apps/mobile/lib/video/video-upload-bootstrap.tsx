import * as React from "react";
import { useAuth } from "@/lib/auth/hooks";
import { setSentryTag } from "@/lib/error-tracking/sentry";
import { backupExclusionStatus } from "@/modules/backup-exclusion";
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

  // Reported once per launch, and deliberately NOT gated on auth: it is a
  // fact about the binary, and an error raised before sign-in should carry
  // it too.
  //
  // WHY IT IS REPORTED AT ALL. A parked clip is excluded from iCloud backup
  // by a NATIVE module, and JS ships over the air while native code does
  // not. `expo.version` is 0.2.0 with a `runtimeVersion` policy of
  // `appVersion`, so the TestFlight build that adds the module and every
  // already-installed 0.2.0 binary share a runtime version and accept the
  // same OTA. Without this, the installs where the exclusion is silently
  // inert are indistinguishable from the ones where it works: same JS, same
  // version string, no error, and 300-600 MB clips quietly going to iCloud.
  //
  // A Sentry TAG rather than an event: it is a property of every report
  // from this install, so it can be filtered and grouped on, which is the
  // question being asked ("which population is this?"). The log line is
  // there because the Sentry DSN is not wired for release builds yet (see
  // the pre-launch blockers in CLAUDE.md), so until it is, a device console
  // is the only place this is visible.
  React.useEffect(() => {
    setSentryTag("video.backup_exclusion", backupExclusionStatus);
    console.log(`[video] backup exclusion: ${backupExclusionStatus}`);
  }, []);

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
