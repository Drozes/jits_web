/**
 * A live-switch write failure is NEVER red (spec 3: write failure uses ink-3,
 * red is only "someone wants you" and the single CTA), so these toasts use the
 * neutral `info` rail, not `error` (Signal Red). Every live-flag failure toast
 * in the app (here, the header popover, `useArenaLive`'s toggle and restores)
 * says it the same way. The one go-live path without a toast is the header
 * chip's own GO LIVE tap: its failure shows in place, as the chip's
 * `○ OFFLINE · RETRY` state (AC-H11), right where the athlete tapped.
 *
 * The Arena's go-live taps (the control bar's LIVE segment, a Mat Board row,
 * the Closest Match card, the deep-link offer strip) all go through here, so
 * none of them swallows a failure. The control bar's OFFLINE segment uses
 * `goOfflineWithFeedback`, the same way, and so does the header popover.
 * The guarded, non-reversing `arenaActions.goLive()` resolves:
 *  - `true`: live;
 *  - `false`, or a rejection: the flag write failed, so say so, as the
 *    toggle does;
 *  - `"ignored"`: the switch was locked or busy and nothing was attempted,
 *    so stay silent.
 */
import {
  LOCATION_FIX_FAILED_GO_LIVE_CTA_COPY,
  LOCATION_OFF_GO_LIVE_CTA_COPY,
  SERVER_ENDED_LIVE_CTA_COPY,
} from "@jits/shared/utils";
import { toast } from "@/components/ui/toast";
import { arenaActions } from "./arena-store";
import { ANNOUNCE_OFFLINE, announce } from "./go-live-announce";
import { GO_OFFLINE_FAILED_MESSAGE } from "./constants";

export const GO_LIVE_FAILED_MESSAGE = "Couldn't take you live. Try again.";

export function goLiveWithFeedback(): Promise<void> {
  return arenaActions.goLive().then(
    (r) => {
      if (r === false) toast.info(GO_LIVE_FAILED_MESSAGE);
    },
    () => {
      toast.info(GO_LIVE_FAILED_MESSAGE);
    },
  );
}

/**
 * One copy for every go-offline failure (the toggle, the control bar, the
 * header popover): the app is offline and `useArenaLive` retries the flag
 * clear by itself, so the toast says so instead of asking for a retry.
 */
export { GO_OFFLINE_FAILED_MESSAGE };

/**
 * The guarded, non-reversing, MANUAL `arenaActions.goOffline()` (it drops a
 * challenge tucked into the chip without declining it, decision Q3), with
 * the same reporting as `goLiveWithFeedback`.
 */
export function goOfflineWithFeedback(): Promise<void> {
  return arenaActions.goOffline().then(
    (r) => {
      // The app is offline either way (a failed clear retries by itself).
      if (r !== "ignored") announce(ANNOUNCE_OFFLINE);
      if (r === false) toast.info(GO_OFFLINE_FAILED_MESSAGE);
    },
    () => {
      toast.info(GO_OFFLINE_FAILED_MESSAGE);
    },
  );
}

/** How long the tap-to-go-live CTA stays up (longer than a plain toast: it is an action). */
export const LOCATION_OFF_CTA_VISIBLE_MS = 8_000;

/**
 * An automatic restore whose write failed after recovery, with a valid tag
 * (UX 019, 3i step 3): no tap action.
 */
export const RESTORE_FAILED_MESSAGE = "You're offline. Go live again in the Arena.";

/**
 * A non-blocking toast whose tap runs the full Go Live flow (explain, the
 * system prompt, the reading, the live write). It never opens the system
 * dialog by itself: only the athlete's tap does. One go-live toast at a
 * time: a new one replaces the one up (UX 019, edge case 4).
 */
function showGoLiveCta(text: string): void {
  toast.hide();
  toast.info({
    text1: text,
    visibilityTime: LOCATION_OFF_CTA_VISIBLE_MS,
    onPress: () => {
      toast.hide();
      void goLiveWithFeedback();
    },
  });
}

/**
 * An automatic restore found no valid location tag and location permission
 * gone (live location fixes 1b). Never shown while a valid tag exists.
 */
export function showLocationOffGoLiveCta(): void {
  showGoLiveCta(LOCATION_OFF_GO_LIVE_CTA_COPY);
}

/** An automatic restore with no valid tag whose silent fresh fix failed (UX 019, C3). */
export function showLocationFixFailedGoLiveCta(): void {
  showGoLiveCta(LOCATION_FIX_FAILED_GO_LIVE_CTA_COPY);
}

/** The server ended the live session while the app was open (UX 019, C6). */
export function showServerEndedLiveCta(): void {
  showGoLiveCta(SERVER_ENDED_LIVE_CTA_COPY);
}

/** A restore write that failed after recovery (valid tag): plain, no action. */
export function showRestoreFailedToast(): void {
  toast.hide();
  toast.info(RESTORE_FAILED_MESSAGE);
}
