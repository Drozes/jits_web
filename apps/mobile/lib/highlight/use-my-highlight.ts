import * as React from "react";
import { AppState, type AppStateStatus } from "react-native";
import { supabase } from "@/lib/supabase/client";
import { useHighlightProgress } from "@jits/shared/hooks/use-highlight-progress";
import {
  signHighlightPlayback,
  type HighlightProgress,
} from "@jits/shared/api/highlights";

export interface HighlightSource {
  url: string;
  posterUrl: string | null;
  version: number;
  durationS: number;
  /** Bumped on every sign so the player remounts even on an identical URL. */
  generation: number;
}

export interface UseMyHighlightResult {
  progress: HighlightProgress | null;
  /** Signed live render; kept while a new version is being made. */
  source: HighlightSource | null;
  /** The live render could not be signed or played after one re-sign. */
  playbackFailed: boolean;
  onPlayerError: () => void;
  refresh: () => void;
}

/**
 * The athlete's own reel for one match video: `useHighlightProgress` (the
 * shared realtime + polling hook) plus signing of the LIVE render.
 *
 * Signing is keyed on the live version + key, NOT on the progress object, so
 * a refetch while regenerating keeps the same URL and the player keeps
 * playing. A new version signs once; a player error re-signs once per
 * version (the usual cause is the 1 h URL expiring), then gives up. Sign
 * results are dropped when the key moved on or the card unmounted
 * (`cancelled`). Foregrounding the app refreshes progress, since the shared
 * hook is platform-agnostic.
 */
export function useMyHighlight(matchVideoId: string | null): UseMyHighlightResult {
  const { data, refresh } = useHighlightProgress(supabase, matchVideoId);
  const playback = data?.playback ?? null;
  const key = playback ? `${playback.version}:${playback.storagePath}` : null;
  const playbackRef = React.useRef(playback);
  // Declared before the sign effect, so it runs first in the same commit.
  React.useEffect(() => {
    playbackRef.current = playback;
  });

  const [source, setSource] = React.useState<HighlightSource | null>(null);
  const [playbackFailed, setPlaybackFailed] = React.useState(false);
  const [signTick, setSignTick] = React.useState(0);
  const resignedForRef = React.useRef<string | null>(null);

  React.useEffect(() => {
    const current = playbackRef.current;
    if (!key || !current) {
      setSource(null);
      return;
    }
    let cancelled = false;
    (async () => {
      const result = await signHighlightPlayback(supabase, current);
      if (cancelled) return;
      if (result.ok) {
        setSource({ ...result.data, generation: signTick });
        setPlaybackFailed(false);
      } else {
        setPlaybackFailed(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [key, signTick]);

  const onPlayerError = React.useCallback(() => {
    if (!key) return;
    if (resignedForRef.current === key) {
      setPlaybackFailed(true);
      return;
    }
    resignedForRef.current = key;
    setSignTick((n) => n + 1);
  }, [key]);

  React.useEffect(() => {
    // Only a real return from background; iOS "inactive" (notification
    // shade, app switcher) is not a reason to re-read.
    let wasBackground = false;
    const sub = AppState.addEventListener("change", (next: AppStateStatus) => {
      if (next === "background") wasBackground = true;
      else if (next === "active" && wasBackground) {
        wasBackground = false;
        refresh();
      }
    });
    return () => sub.remove();
  }, [refresh]);

  return { progress: data, source, playbackFailed, onPlayerError, refresh };
}
