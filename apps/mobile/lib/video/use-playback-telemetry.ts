import * as React from "react";
import { AppState, type AppStateStatus } from "react-native";
import NetInfo from "@react-native-community/netinfo";
import type { VideoPlayer } from "expo-video";
import {
  PlaybackSession,
  reportPlaybackSession,
  type PlaybackEndReason,
  type PlaybackSessionMeta,
  type PlaybackSourceKind,
  type SignOutcome,
  type SwitchMode,
} from "./playback-telemetry";

export interface PlaybackTelemetry {
  setMeta: (partial: Partial<PlaybackSessionMeta>) => void;
  sourceAttached: (kind: PlaybackSourceKind) => void;
  /** How the latest sign ended (match player). */
  signOutcome: (outcome: SignOutcome) => void;
  resigned: () => void;
  playIntent: (want: boolean) => void;
  seekRequested: () => void;
  /** An app-caused load (a resume seek) is coming: not a stall, not a seek. */
  expectWait: () => void;
  /** Wire to VideoView's onFirstFrameRender. */
  firstFrame: () => void;
  /** The athlete switched angle (tap time); the session carries on. */
  switchStarted: (mode?: SwitchMode) => void;
  /** Multi-angle: one smoothed sync error sample (seconds). */
  syncResidual: (errorS: number) => void;
  /** Multi-angle: a standby kept warm by the decoder cap or demoted on a decoder error. */
  decoderCap: (reason: string) => void;
  /** The switched-to angle showed its first frame. */
  switchLanded: () => void;
  error: (message: string | null | undefined) => void;
}

async function readNetwork(session: PlaybackSession): Promise<void> {
  try {
    const state = await NetInfo.fetch();
    const details = state.details as { cellularGeneration?: string | null } | null;
    session.setNetwork(state.type ?? null, details?.cellularGeneration ?? null);
  } catch {
    /* unknown network stays null */
  }
}

/**
 * Feeds one `PlaybackSession` from an expo-video player and sends it as ONE
 * Sentry event when the viewing session ends: on unmount, or when the app
 * goes to the background (the process may never come back). Coming back to
 * the foreground opens a continuation session (`resumed: true`) that reports
 * only if something was watched, stalled or failed in it.
 *
 * The player's own events (status, playing, time, end) are subscribed here;
 * the owner reports what only it knows (source kind, re-signs, play intent,
 * seeks, the view's first frame). Every listener is defensive: a released
 * player or a failing NetInfo never reaches playback.
 */
export function usePlaybackTelemetry(player: VideoPlayer, initialMeta: PlaybackSessionMeta): PlaybackTelemetry {
  const metaRef = React.useRef(initialMeta);
  const sessionRef = React.useRef<PlaybackSession | null>(null);
  const lastKindRef = React.useRef<PlaybackSourceKind | null>(null);
  const wantPlayRef = React.useRef(false);
  // Only the FIRST render opens a session; later ones come from the AppState
  // listener (a render during an "inactive" blip after a background flush
  // must not open a sourceless, non-resumed session).
  const createdRef = React.useRef(false);
  if (!createdRef.current) {
    createdRef.current = true;
    if (AppState.currentState !== "background") sessionRef.current = new PlaybackSession(metaRef.current, Date.now());
  }

  const flush = React.useCallback((reason: PlaybackEndReason) => {
    const session = sessionRef.current;
    sessionRef.current = null;
    if (!session || !session.shouldReport()) return;
    reportPlaybackSession(session.summary(Date.now(), reason));
  }, []);

  React.useEffect(() => {
    // A StrictMode / fast-refresh re-run of this effect follows a flush.
    if (sessionRef.current == null && AppState.currentState !== "background") {
      sessionRef.current = new PlaybackSession(metaRef.current, Date.now(), { sourceKind: lastKindRef.current });
    }
    if (sessionRef.current) void readNetwork(sessionRef.current);
    const appSub = AppState.addEventListener("change", (next: AppStateStatus) => {
      if (next === "background") flush("background");
      else if (next === "active" && sessionRef.current == null) {
        const session = new PlaybackSession(metaRef.current, Date.now(), {
          resumed: true,
          sourceKind: lastKindRef.current,
          wantPlay: wantPlayRef.current,
        });
        sessionRef.current = session;
        void readNetwork(session);
      }
    });
    return () => {
      appSub?.remove?.();
      flush("unmount");
    };
  }, [flush]);

  React.useEffect(() => {
    const subs: Array<{ remove: () => void }> = [];
    try {
      subs.push(
        player.addListener("statusChange", ({ status, error }) => {
          const s = sessionRef.current;
          if (!s) return;
          s.status(status, Date.now());
          if (status === "error") s.error(error?.message);
        }),
        player.addListener("playingChange", ({ isPlaying }) => {
          sessionRef.current?.playing(isPlaying, Date.now());
        }),
        player.addListener("timeUpdate", ({ currentTime }) => {
          sessionRef.current?.position(currentTime);
        }),
        player.addListener("sourceLoad", ({ duration }) => {
          sessionRef.current?.duration(duration);
        }),
        player.addListener("playToEnd", () => {
          sessionRef.current?.ended();
        }),
      );
    } catch {
      /* a released player: nothing to observe */
    }
    return () => {
      for (const sub of subs) {
        try {
          sub.remove();
        } catch {
          /* already released */
        }
      }
    };
  }, [player]);

  return React.useMemo<PlaybackTelemetry>(
    () => ({
      setMeta: (partial) => {
        metaRef.current = { ...metaRef.current, ...partial };
        sessionRef.current?.setMeta(partial);
      },
      sourceAttached: (kind) => {
        lastKindRef.current = kind;
        sessionRef.current?.sourceAttached(kind, Date.now());
      },
      signOutcome: (outcome) => sessionRef.current?.setSignOutcome(outcome),
      resigned: () => sessionRef.current?.resigned(),
      playIntent: (want) => {
        wantPlayRef.current = want;
        sessionRef.current?.playIntent(want, Date.now());
      },
      seekRequested: () => sessionRef.current?.seekRequested(Date.now()),
      expectWait: () => sessionRef.current?.expectWait(Date.now()),
      firstFrame: () => sessionRef.current?.firstFrame(Date.now()),
      switchStarted: (mode) => sessionRef.current?.switchStarted(Date.now(), mode),
      syncResidual: (errorS) => sessionRef.current?.syncResidual(errorS),
      decoderCap: (reason) => sessionRef.current?.decoderCap(reason),
      switchLanded: () => sessionRef.current?.switchLanded(Date.now()),
      error: (message) => sessionRef.current?.error(message),
    }),
    [],
  );
}
