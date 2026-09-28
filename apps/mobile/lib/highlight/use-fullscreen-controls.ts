import * as React from "react";
import type { VideoView } from "expo-video";

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
 */
export function useFullscreenControls(viewRef: React.RefObject<VideoView | null>): FullscreenControls {
  const [nativeControls, setNativeControls] = React.useState(false);
  const pendingRef = React.useRef(false);
  const mountedRef = React.useRef(true);
  React.useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
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
      void view.enterFullscreen().catch(() => {
        if (mountedRef.current) setNativeControls(false);
      });
    });
  }, [viewRef]);

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

  const onFullscreenEnter = React.useCallback(() => setNativeControls(true), []);
  const onFullscreenExit = React.useCallback(() => {
    pendingRef.current = false;
    setNativeControls(false);
  }, []);

  return { nativeControls, enterFullscreen, onFullscreenEnter, onFullscreenExit };
}
