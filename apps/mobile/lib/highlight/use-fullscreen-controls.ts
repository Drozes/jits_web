import * as React from "react";
import type { VideoView } from "expo-video";

/** How long to wait for `onFullscreenEnter` after calling `enterFullscreen()`. */
export const FULLSCREEN_ENTER_TIMEOUT_MS = 1_500;

export interface FullscreenControls {
  /** Pass to `VideoView nativeControls`. */
  nativeControls: boolean;
  /** The inline fullscreen button. */
  enterFullscreen: () => void;
  onFullscreenEnter: () => void;
  onFullscreenExit: () => void;
}

/**
 * Native fullscreen WITH native chrome (Done, scrubber) for an inline player
 * that has none.
 *
 * expo-video 3.0.16 maps `nativeControls` straight onto the one
 * AVPlayerViewController's `showsPlaybackControls` (ios/VideoModule.swift),
 * and that same controller is what goes fullscreen. With controls off inline
 * the fullscreen presentation had no Done button and no gesture out: a trap
 * (simulator run, iOS 26.3). So:
 *
 * 1. The button first turns `nativeControls` on and only calls
 *    `enterFullscreen()` once React has committed that prop, a frame later
 *    (requestAnimationFrame after the commit), so the controller presents
 *    with its controls.
 * 2. `onFullscreenEnter` also forces them on, covering any other way into
 *    fullscreen.
 * 3. `onFullscreenExit` (and a failed `enterFullscreen`) turns them off again,
 *    so the inline card stays chrome-free.
 * 4. iOS resolves `enterFullscreen()` before the presentation happens, so a
 *    presentation the system silently refused would leave AVKit chrome on the
 *    inline card: if `onFullscreenEnter` has not arrived
 *    `FULLSCREEN_ENTER_TIMEOUT_MS` after the call, the controls go off again.
 */
export function useFullscreenControls(viewRef: React.RefObject<VideoView | null>): FullscreenControls {
  const [nativeControls, setNativeControls] = React.useState(false);
  const pendingRef = React.useRef(false);
  const mountedRef = React.useRef(true);
  const enterTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const clearEnterTimer = React.useCallback(() => {
    if (enterTimerRef.current) clearTimeout(enterTimerRef.current);
    enterTimerRef.current = null;
  }, []);
  React.useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      if (enterTimerRef.current) clearTimeout(enterTimerRef.current);
    };
  }, []);

  const present = React.useCallback(() => {
    requestAnimationFrame(() => {
      if (!mountedRef.current) return;
      const view = viewRef.current;
      if (!view) {
        setNativeControls(false);
        return;
      }
      clearEnterTimer();
      enterTimerRef.current = setTimeout(() => {
        // No presentation arrived: never leave the chrome on the inline card.
        enterTimerRef.current = null;
        if (mountedRef.current) setNativeControls(false);
      }, FULLSCREEN_ENTER_TIMEOUT_MS);
      void view.enterFullscreen().catch(() => {
        clearEnterTimer();
        if (mountedRef.current) setNativeControls(false);
      });
    });
  }, [clearEnterTimer, viewRef]);

  // Runs after the commit that turned the controls on.
  React.useEffect(() => {
    if (!nativeControls || !pendingRef.current) return;
    pendingRef.current = false;
    present();
  }, [nativeControls, present]);

  const enterFullscreen = React.useCallback(() => {
    if (nativeControls) {
      present(); // already on (e.g. a second tap): nothing to wait for
      return;
    }
    pendingRef.current = true;
    setNativeControls(true);
  }, [nativeControls, present]);

  const onFullscreenEnter = React.useCallback(() => {
    clearEnterTimer();
    setNativeControls(true);
  }, [clearEnterTimer]);
  const onFullscreenExit = React.useCallback(() => {
    clearEnterTimer();
    pendingRef.current = false;
    setNativeControls(false);
  }, [clearEnterTimer]);

  return { nativeControls, enterFullscreen, onFullscreenEnter, onFullscreenExit };
}
