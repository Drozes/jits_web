import * as React from "react";
import { AppState, type AppStateStatus } from "react-native";
import { supabase } from "@/lib/supabase/client";
import { useHighlightProgress } from "@jits/shared/hooks/use-highlight-progress";
import {
  signHighlightPlayback,
  type HighlightProgress,
} from "@jits/shared/api/highlights";

/** Signed URLs live 1 h; re-sign well before that. */
export const HIGHLIGHT_RESIGN_AFTER_MS = 50 * 60_000;

export interface HighlightSource {
  url: string;
  posterUrl: string | null;
  /** Storage key of the poster: a stable, render-unique image cache key. */
  posterPath: string | null;
  version: number;
  durationS: number;
  /** Bumped on every sign so the player remounts even on an identical URL. */
  generation: number;
}

export interface UseMyHighlightResult {
  progress: HighlightProgress | null;
  /** Signed live render; kept while a new version is being made. */
  source: HighlightSource | null;
  /** The live render could not be signed, or played after a fresh re-sign. */
  playbackFailed: boolean;
  onPlayerError: () => void;
  /** Re-read progress only (after a mutation). */
  refresh: () => void;
  /** Re-read progress and re-sign when playback failed or the URL is old. */
  reload: () => void;
}

/**
 * The athlete's own reel for one match video: `useHighlightProgress` (the
 * shared realtime + polling hook) plus signing of the LIVE render.
 *
 * Signing is keyed on the live version + key, NOT on the progress object, so
 * a refetch while regenerating keeps the same URL and the player keeps
 * playing. A signature is renewed before it expires (timer at 50 min, and on
 * `reload` if older). A player error re-signs, unless the URL was already
 * re-signed for that error and is still fresh, in which case playback is
 * reported failed. `reload` (pull-to-refresh via `reloadToken`, return from
 * background) also clears a failure. Sign results are dropped when the key
 * moved on or the card unmounted (`cancelled`).
 */
export function useMyHighlight(matchVideoId: string | null, reloadToken = 0): UseMyHighlightResult {
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
  const signedAtRef = React.useRef(0);
  const resignedForErrorRef = React.useRef(false);

  React.useEffect(() => {
    const current = playbackRef.current;
    if (!key || !current) {
      setSource(null);
      return;
    }
    let cancelled = false;
    let renew: ReturnType<typeof setTimeout> | undefined;
    (async () => {
      const result = await signHighlightPlayback(supabase, current);
      if (cancelled) return;
      if (!result.ok) {
        setPlaybackFailed(true);
        return;
      }
      signedAtRef.current = Date.now();
      setSource({ ...result.data, posterPath: current.posterPath, generation: signTick });
      setPlaybackFailed(false);
      renew = setTimeout(() => setSignTick((n) => n + 1), HIGHLIGHT_RESIGN_AFTER_MS);
    })();
    return () => {
      cancelled = true;
      if (renew) clearTimeout(renew);
    };
  }, [key, signTick]);

  // A new version starts with a clean error budget.
  React.useEffect(() => {
    resignedForErrorRef.current = false;
  }, [key]);

  const resign = React.useCallback(() => setSignTick((n) => n + 1), []);

  const onPlayerError = React.useCallback(() => {
    if (!key) return;
    const fresh = Date.now() - signedAtRef.current < HIGHLIGHT_RESIGN_AFTER_MS;
    if (resignedForErrorRef.current && fresh) {
      setPlaybackFailed(true);
      return;
    }
    resignedForErrorRef.current = true;
    resign();
  }, [key, resign]);

  const failedRef = React.useRef(playbackFailed);
  React.useEffect(() => {
    failedRef.current = playbackFailed;
  }, [playbackFailed]);

  const reload = React.useCallback(() => {
    refresh();
    const stale = Date.now() - signedAtRef.current >= HIGHLIGHT_RESIGN_AFTER_MS;
    if (playbackRef.current && (failedRef.current || stale)) {
      resignedForErrorRef.current = false;
      resign();
    }
  }, [refresh, resign]);

  const firstToken = React.useRef(true);
  React.useEffect(() => {
    if (firstToken.current) {
      firstToken.current = false;
      return;
    }
    reload();
    // Only a new token (a pull-to-refresh) reloads.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reloadToken]);

  React.useEffect(() => {
    // Only a real return from background; iOS "inactive" (notification
    // shade, app switcher) is not a reason to re-read.
    let wasBackground = false;
    const sub = AppState.addEventListener("change", (next: AppStateStatus) => {
      if (next === "background") wasBackground = true;
      else if (next === "active" && wasBackground) {
        wasBackground = false;
        reload();
      }
    });
    return () => sub.remove();
  }, [reload]);

  return { progress: data, source, playbackFailed, onPlayerError, refresh, reload };
}
