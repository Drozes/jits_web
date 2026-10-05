import * as React from "react";
import { useAuth } from "@/lib/auth/hooks";
import { setSentryTag } from "@/lib/error-tracking/sentry";
import { backupExclusionStatus } from "@/modules/backup-exclusion";
import { bindUploadBackgroundNotice } from "./upload-background-notice";
import { bindUploadKeepAwake } from "./upload-keep-awake";
import {
  ensureUploadListeners,
  resumeMatchVideoUploads,
  setUploadOwner,
  stopMatchVideoUploadsForSignOut,
} from "./video-upload-manager";

/**
 * Picks up match-video uploads that an earlier app launch could not finish
 * and binds the foreground / reconnect resume triggers, the app-wide
 * upload keep-awake and the backgrounding notice (jits-n2im.1).
 *
 * Renders null. Placed inside `<AuthProvider>` in `_layout.tsx` next to the
 * other bootstraps.
 *
 * Gated on a signed-in ATHLETE because every tus request needs a live
 * access token, and scoped to that athlete (jits-n2im.6): the manager only
 * ever resumes jobs whose `uploaderAthleteId` is this athlete. A different
 * account signing in on the same phone re-runs the sweep for ITS jobs; the
 * previous athlete's stay on disk and resume when they sign back in.
 * Sign-out stops the runners and clears the owner itself
 * (`stopMatchVideoUploadsForSignOut`, from the auth context), before the
 * session drops.
 */
export function VideoUploadBootstrap() {
  const { athlete } = useAuth();
  const athleteId = athlete?.id ?? null;

  // Reported once per launch, and deliberately NOT gated on auth: it is a
  // fact about the binary, and an error raised before sign-in should carry
  // it too.
  //
  // WHY IT IS REPORTED AT ALL. A parked clip is excluded from iCloud backup
  // by a NATIVE module, and JS ships over the air while native code does
  // not. The `runtimeVersion` policy is `appVersion`, so every installed
  // binary of one `expo.version` accepts the same OTA whether or not it
  // embeds the module. Without this, the installs where the exclusion is
  // silently inert are indistinguishable from the ones where it works:
  // same JS, same version string, no error, and 300-600 MB clips quietly
  // going to iCloud.
  //
  // A Sentry TAG rather than an event: it is a property of every report
  // from this install, so it can be filtered and grouped on. The log line
  // stays for device consoles; whether a release build reports to Sentry at
  // all depends on EXPO_PUBLIC_SENTRY_DSN being set in the EAS environment
  // the build or update was made from (see jits-n2im.7), which the repo
  // cannot show.
  React.useEffect(() => {
    setSentryTag("video.backup_exclusion", backupExclusionStatus);
    console.log(`[video] backup exclusion: ${backupExclusionStatus}`);
  }, []);

  // Process-lifetime bindings: the keep-awake follows live runners and the
  // notice follows backgrounding, whoever is signed in.
  React.useEffect(() => {
    bindUploadKeepAwake();
    bindUploadBackgroundNotice();
  }, []);

  // The athlete this bootstrap last scoped uploads to. A session can end
  // without `signOut()` (a revoked refresh token, auth-js SIGNED_OUT), or a
  // different athlete can replace it directly; either way the previous
  // athlete's runners must stop and their store entries go (m3), exactly
  // as a sign-out does.
  const scopedTo = React.useRef<string | null>(null);

  React.useEffect(() => {
    if (scopedTo.current && scopedTo.current !== athleteId) {
      stopMatchVideoUploadsForSignOut();
    }
    scopedTo.current = athleteId;
    if (!athleteId) return;
    setUploadOwner(athleteId);
    const unbind = ensureUploadListeners();
    void resumeMatchVideoUploads();
    // Deliberately NOT unbinding on unmount: the listeners are what let an
    // upload survive the screen, and this component only unmounts when the
    // whole tree does.
    return () => {
      void unbind;
    };
  }, [athleteId]);

  return null;
}
