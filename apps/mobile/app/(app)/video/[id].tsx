import * as React from "react";
import { ActivityIndicator, StyleSheet, Text, View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { StatusBar } from "expo-status-bar";
import { Audio, ResizeMode, Video, type AVPlaybackStatus } from "expo-av";
import { NO_MATCH_COPY, buildKeyMoments, captionAt, formatClock, isNoMatch, translateAngleTime } from "@jits/shared/utils";
import { getVideoSyncOffsets } from "@jits/shared/api/film-room";
import { supabase } from "@/lib/supabase/client";
import { HarnessMarker } from "@/components/match-detail/harness-marker";
import { VideoStatePanel } from "@/components/match-detail/video-state-panel";
import { ForceDarkTheme } from "@/lib/theme/force-dark-theme";
import { FilmScrim } from "@/components/film-room/film-scrim";
import { FilmBackButton } from "@/components/film-room/film-back-button";
import { AngleSwitcher } from "@/components/film-room/angle-switcher";
import { SeekBar } from "@/components/film-room/seek-bar";
import { MomentCaption, MomentChips, Transport, nextSpeed } from "@/components/film-room/player-controls";
import { useVideoPlayback } from "@/lib/match-detail/use-video-playback";
import { useMatchDetail } from "@/lib/match-detail/use-match-detail";
import { useVideoAnalysis } from "@/lib/film-room/use-video-analysis";
import { shortName } from "@/lib/film-room/format";
import { ON_MEDIA, TABULAR } from "@/lib/theme/palette";

/** A moment stays "current" (chip lit) this long after its time. */
const CURRENT_HOLD_S = 10;

/**
 * Full-screen playback of one match video with the Film Room controls: seek
 * bar with a marker per key moment, moment chips, a caption for the current
 * moment, ±10 s, speed, and the angle switcher when both athletes recorded.
 * `?t=<seconds>` starts playback there (key moments link in with it).
 *
 * `useVideoPlayback` signs a 1-hour URL (normalized MP4 preferred), re-signs
 * silently once when the player errors and resumes where it was. The player is
 * expo-av's Video because that module is embedded in the field build, so this
 * screen ships over OTA (no new native module).
 *
 * The `video-player-state` marker exposes the phase to the match-loop harness
 * as "Video state: <state>".
 */
export default function MatchVideoScreen() {
  const { id, t, approx } = useLocalSearchParams<{ id: string; t?: string; approx?: string }>();
  const start = t != null && Number.isFinite(Number(t)) ? Number(t) : null;
  // Keyed by id: switching angles remounts the player on the other recording.
  return <PlayerBody key={id ?? "none"} id={id} start={start} approximate={approx === "1"} />;
}

/** How long the "not synced" note stays up after an angle switch. */
const APPROX_NOTE_MS = 5000;

function PlayerBody({ id, start, approximate }: { id: string | undefined; start: number | null; approximate: boolean }) {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { phase, source, stateLabel, videoRef, retry, onPlayerError, onPlayerStatus } = useVideoPlayback(id, start);
  const details = useMatchDetail(source?.matchId ?? undefined);
  const { analysis } = useVideoAnalysis(id ?? null);
  const [positionS, setPositionS] = React.useState(start ?? 0);
  const [durationS, setDurationS] = React.useState(0);
  const [playing, setPlaying] = React.useState(true);
  const [speed, setSpeed] = React.useState(1);
  const [offsets, setOffsets] = React.useState<Record<string, number | null>>({});
  const [showApprox, setShowApprox] = React.useState(approximate);
  // The first loaded status of each source still reports the pre-seek
  // position (the ?t= or resume seek lands after it): do not show it.
  const seenGeneration = React.useRef<number | null>(null);

  React.useEffect(() => {
    if (!showApprox) return;
    const timer = setTimeout(() => setShowApprox(false), APPROX_NOTE_MS);
    return () => clearTimeout(timer);
  }, [showApprox]);

  // iOS routes audio through the ringer switch by default; play through it
  // while this screen is up, then hand the session back.
  React.useEffect(() => {
    void Audio.setAudioModeAsync({ playsInSilentModeIOS: true }).catch(() => undefined);
    return () => {
      void Audio.setAudioModeAsync({ playsInSilentModeIOS: false }).catch(() => undefined);
    };
  }, []);

  const onStatus = React.useCallback(
    (status: AVPlaybackStatus) => {
      onPlayerStatus(status);
      if (!status.isLoaded) return;
      const generation = source?.generation ?? null;
      if (seenGeneration.current !== generation) {
        seenGeneration.current = generation;
        if (status.durationMillis) setDurationS(status.durationMillis / 1000);
        return;
      }
      setPositionS(status.positionMillis / 1000);
      if (status.durationMillis) setDurationS(status.durationMillis / 1000);
      if (status.didJustFinish) setPlaying(false);
    },
    [onPlayerStatus, source?.generation],
  );

  const duration = durationS || source?.durationSeconds || 0;
  const view = details.state === "ready" ? details.data : null;
  const angleIds = view && view.videos.length > 1 ? view.videos.map((v) => v.id).join(",") : "";
  React.useEffect(() => {
    if (!angleIds) return;
    let cancelled = false;
    void getVideoSyncOffsets(supabase, angleIds.split(",")).then((o) => {
      if (!cancelled) setOffsets(o);
    });
    return () => {
      cancelled = true;
    };
  }, [angleIds]);
  // A video with no match in it has no moments to mark (jr_be-0qf).
  const noMatch = isNoMatch(analysis);
  const moments = React.useMemo(
    () => (analysis && !noMatch ? buildKeyMoments(analysis, view?.match ?? null, duration || null) : []),
    [analysis, noMatch, view?.match, duration],
  );
  const caption = captionAt(moments, analysis?.positions, positionS);
  const current = [...moments].reverse().find((m) => m.t <= positionS + 0.25 && positionS - m.t < CURRENT_HOLD_S);

  const seek = (seconds: number) => {
    const clamped = Math.max(0, duration > 0 ? Math.min(duration, seconds) : seconds);
    setPositionS(clamped);
    videoRef.current?.setPositionAsync(clamped * 1000).catch(() => undefined);
  };
  const toggle = () => {
    if (!playing && duration > 0 && positionS >= duration - 0.5) seek(0);
    setPlaying((p) => !p);
  };
  const title = view
    ? `${shortName(view.me.display_name)} vs ${shortName(view.opponent?.display_name)}`
    : "Match film";

  const topBar = (
    <View className="flex-row items-center" style={{ position: "absolute", left: 4, right: 16, top: insets.top + 8, height: 44, gap: 6 }}>
      <FilmBackButton label="Go back" icon="close" fallback="/" color={ON_MEDIA.white} />
      <Text numberOfLines={1} className="flex-1 font-heading uppercase" style={{ fontSize: 14, letterSpacing: 1.12, color: ON_MEDIA.white }}>
        {title}
      </Text>
    </View>
  );

  return (
    // Full-screen video: dark in both app themes. ForceDarkTheme pins the
    // themed pieces drawn over it (VideoStatePanel) to the dark tokens.
    <ForceDarkTheme style={{ backgroundColor: "#000000" }}>
      <StatusBar style="light" />
      {phase === "ready" && source ? (
        <>
          <Video
            key={`${source.generation}:${source.url}`}
            ref={videoRef}
            source={{ uri: source.url }}
            posterSource={source.posterUrl ? { uri: source.posterUrl } : undefined}
            usePoster={!!source.posterUrl}
            style={StyleSheet.absoluteFill}
            resizeMode={ResizeMode.CONTAIN}
            shouldPlay={playing}
            rate={speed}
            shouldCorrectPitch
            progressUpdateIntervalMillis={250}
            onPlaybackStatusUpdate={onStatus}
            // The row read and the sign both succeeded, so the recording
            // exists: an error here is an expired URL or the network.
            onError={onPlayerError}
          />
          <FilmScrim stops={[[0, 0.75], [1, 0]]} style={{ left: 0, right: 0, top: 0, height: insets.top + 150 }} />
          <FilmScrim stops={[[0, 0], [1, 0.9]]} style={{ left: 0, right: 0, bottom: 0, height: "45%" }} />
          {topBar}
          {view && view.videos.length > 1 && id ? (
            <View style={{ position: "absolute", left: 16, right: 16, top: insets.top + 60 }}>
              <AngleSwitcher
                variant="film"
                angles={view.videos}
                activeId={id}
                opponentName={view.opponent?.display_name}
                onSelect={(other) => {
                  if (other === id) return;
                  // Synced only when both recordings carry sync_offset_ms. Nothing
                  // in the backend writes it yet (see translateAngleTime), so in
                  // practice this carries the second and says it is approximate.
                  const moved = translateAngleTime(positionS, offsets[id], offsets[other]);
                  router.setParams({ id: other, t: String(Math.floor(moved.t)), approx: moved.synced ? "0" : "1" });
                }}
              />
            </View>
          ) : null}
          {showApprox ? (
            <View
              testID="player-approx-note"
              accessibilityLiveRegion="polite"
              pointerEvents="none"
              style={{ position: "absolute", left: 16, right: 16, top: insets.top + 110, alignItems: "center" }}
            >
              <Text className="font-mono-medium" style={{ fontSize: 10, letterSpacing: 1.2, color: ON_MEDIA.text2, backgroundColor: ON_MEDIA.badge, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 2 }}>
                Angles aren't synced; position is approximate
              </Text>
            </View>
          ) : null}
          <View style={{ position: "absolute", left: 16, right: 16, bottom: insets.bottom + 24, gap: 14 }}>
            {noMatch ? (
              <View testID="player-no-match" className="self-start" style={{ paddingVertical: 8, paddingHorizontal: 10, borderRadius: 2, backgroundColor: ON_MEDIA.badge, maxWidth: "100%" }}>
                <Text className="font-body-medium" style={{ fontSize: 13, lineHeight: 16, color: ON_MEDIA.text }}>
                  {NO_MATCH_COPY.short}
                </Text>
              </View>
            ) : caption ? (
              <MomentCaption t={caption.t} text={caption.text} />
            ) : null}
            <View style={{ gap: 6 }}>
              <SeekBar positionS={positionS} durationS={duration} moments={moments} onSeek={seek} />
              <View className="flex-row justify-between">
                <Text testID="player-time" className="font-mono-bold" style={[{ fontSize: 12, color: ON_MEDIA.white }, TABULAR]}>
                  {`${formatClock(positionS)} / ${formatClock(duration)}`}
                </Text>
                {moments.length > 0 ? (
                  <Text className="font-mono-medium" style={{ fontSize: 10, letterSpacing: 1.68, color: ON_MEDIA.text2 }}>
                    {`${moments.length} KEY MOMENT${moments.length === 1 ? "" : "S"}`}
                  </Text>
                ) : null}
              </View>
            </View>
            <Transport playing={playing} speed={speed} onToggle={toggle} onSkip={(d) => seek(positionS + d)} onSpeed={() => setSpeed(nextSpeed)} />
            <MomentChips moments={moments} currentT={current?.t ?? null} onJump={(tt) => { seek(tt); setPlaying(true); }} />
          </View>
        </>
      ) : phase === "loading" || phase === "ready" ? (
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator color={ON_MEDIA.text2} />
          {topBar}
        </View>
      ) : (
        <View style={{ flex: 1 }}>
          <VideoStatePanel kind={phase} onRetry={retry} onBack={() => (router.canGoBack() ? router.back() : router.replace("/"))} />
          {topBar}
        </View>
      )}
      <HarnessMarker testID="video-player-state" label={`Video state: ${stateLabel}`} />
    </ForceDarkTheme>
  );
}
