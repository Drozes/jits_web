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
import { LOCATION_OFF_GO_LIVE_CTA_COPY } from "@jits/shared/utils";
import { toast } from "@/components/ui/toast";
import { arenaActions } from "./arena-store";
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
 * A live restore or refresh the athlete did not tap found location
 * permission gone (live location fixes 1b, 1d): a non-blocking toast whose
 * tap runs the full Go Live flow (explain, the system prompt, the reading,
 * the live write). It never opens the system dialog by itself: only the
 * athlete's tap does. The header chip's GO LIVE stays the way back after
 * the toast has gone.
 */
export function showLocationOffGoLiveCta(): void {
  toast.info({
    text1: LOCATION_OFF_GO_LIVE_CTA_COPY,
    visibilityTime: LOCATION_OFF_CTA_VISIBLE_MS,
    onPress: () => {
      toast.hide();
      void goLiveWithFeedback();
    },
  });
}
