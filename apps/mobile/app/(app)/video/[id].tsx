import * as React from "react";
import { ActivityIndicator, Image, StyleSheet, Text, View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { StatusBar } from "expo-status-bar";
import { VideoView } from "expo-video";
import { NO_MATCH_COPY, buildKeyMoments, captionAt, formatClock, isNoMatch, translateAngleTime } from "@jits/shared/utils";
import { getVideoSyncOffsets } from "@jits/shared/api/film-room";
import { supabase } from "@/lib/supabase/client";
import { HarnessMarker } from "@/components/match-detail/harness-marker";
import { useSuppressUploadStrip } from "@/lib/video/upload-strip-visibility";
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
import { ON_MEDIA } from "@/lib/theme/palette";
import { TABULAR, TRACKING, typeStep } from "@/lib/typography";

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
 * expo-video (jits-n2im.19), linked in the field build since the reels, so
 * this screen ships over OTA (no new native module). The poster covers the
 * frame until the current item has drawn one. Each viewing session sends one
 * playback telemetry event (jits-n2im.21).
 *
 * The `video-player-state` marker exposes the phase to the match-loop harness
 * as "Video state: <state>".
 */
export default function MatchVideoScreen() {
  const { id, t, approx } = useLocalSearchParams<{ id: string; t?: string; approx?: string }>();
  const start = t != null && Number.isFinite(Number(t)) ? Number(t) : null;
  // Full-screen video: no app-wide upload strip over it (jits-n2im.2).
  useSuppressUploadStrip({ kind: "all" });
  // Keyed by id: switching angles remounts the player on the other recording.
  return <PlayerBody key={id ?? "none"} id={id} start={start} approximate={approx === "1"} />;
}

/** How long the "not synced" note stays up after an angle switch. */
const APPROX_NOTE_MS = 5000;

function PlayerBody({ id, start, approximate }: { id: string | undefined; start: number | null; approximate: boolean }) {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const playback = useVideoPlayback(id, start);
  const { phase, source, stateLabel, player, retry, positionS, durationS, playing, seek, toggle, telemetry } = playback;
  const details = useMatchDetail(source?.matchId ?? undefined);
  const { analysis } = useVideoAnalysis(id ?? null);
  const [offsets, setOffsets] = React.useState<Record<string, number | null>>({});
  const [showApprox, setShowApprox] = React.useState(approximate);

  React.useEffect(() => {
    if (!showApprox) return;
    const timer = setTimeout(() => setShowApprox(false), APPROX_NOTE_MS);
    return () => clearTimeout(timer);
  }, [showApprox]);

  const duration = durationS || source?.durationSeconds || 0;
  const view = details.state === "ready" ? details.data : null;
  const thisAngle = view?.videos.find((v) => v.id === id);
  const angleMeta = thisAngle ? (thisAngle.is_mine ? "mine" : "opponent") : null;
  const angleCount = view ? view.videos.length : null;
  React.useEffect(() => {
    if (angleMeta) telemetry.setMeta({ angle: angleMeta, angleCount });
  }, [telemetry, angleMeta, angleCount]);
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

  const title = view
    ? `${shortName(view.me.display_name)} vs ${shortName(view.opponent?.display_name)}`
    : "Match film";

  const topBar = (
    <View className="flex-row items-center" style={{ position: "absolute", left: 4, right: 16, top: insets.top + 8, height: 44, gap: 6 }}>
      <FilmBackButton label="Go back" icon="close" fallback="/" color={ON_MEDIA.white} />
      <Text numberOfLines={1} className="flex-1 font-heading uppercase" style={[typeStep("callout"), { letterSpacing: TRACKING.caps, color: ON_MEDIA.white }]}>
        {title}
      </Text>
    </View>
  );

  return (
    // Full-screen video: dark in both app themes. ForceDarkTheme pins the
    // themed pieces drawn over it (VideoStatePanel) to the dark tokens.
    <ForceDarkTheme style={{ backgroundColor: ON_MEDIA.black }}>
      <StatusBar style="light" />
      {phase === "ready" && source ? (
        <>
          {/* The row read and the sign both succeeded, so the recording
              exists: a player error is an expired URL or the network
              (useVideoPlayback re-signs). */}
          <VideoView
            testID="video-player"
            player={player}
            style={StyleSheet.absoluteFill}
            contentFit="contain"
            nativeControls={false}
            allowsPictureInPicture={false}
            onFirstFrameRender={playback.onFirstFrameRender}
          />
          {source.posterUrl && !playback.frameShown ? (
            <Image
              testID="video-poster"
              source={{ uri: source.posterUrl }}
              resizeMode="contain"
              style={StyleSheet.absoluteFill}
              accessibilityIgnoresInvertColors
            />
          ) : null}
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
              <Text className="font-mono-medium" style={[typeStep("micro"), { letterSpacing: TRACKING.caps, color: ON_MEDIA.text2, backgroundColor: ON_MEDIA.badge, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 2 }, TABULAR]}>
                Angles aren't synced; position is approximate
              </Text>
            </View>
          ) : null}
          <View style={{ position: "absolute", left: 16, right: 16, bottom: insets.bottom + 24, gap: 14 }}>
            {noMatch ? (
              <View testID="player-no-match" className="self-start" style={{ paddingVertical: 8, paddingHorizontal: 10, borderRadius: 2, backgroundColor: ON_MEDIA.badge, maxWidth: "100%" }}>
                <Text className="font-body-medium" style={[typeStep("body"), { lineHeight: 16, color: ON_MEDIA.text }]}>
                  {NO_MATCH_COPY.short}
                </Text>
              </View>
            ) : caption ? (
              <MomentCaption t={caption.t} text={caption.text} />
            ) : null}
            <View style={{ gap: 6 }}>
              <SeekBar positionS={positionS} durationS={duration} moments={moments} onSeek={seek} />
              <View className="flex-row justify-between">
                <Text testID="player-time" className="font-mono-bold" style={[typeStep("small"), { color: ON_MEDIA.white }, TABULAR]}>
                  {`${formatClock(positionS)} / ${formatClock(duration)}`}
                </Text>
                {moments.length > 0 ? (
                  <Text className="font-mono-medium" style={[typeStep("micro"), { letterSpacing: TRACKING["caps-l"], color: ON_MEDIA.text2 }, TABULAR]}>
                    {`${moments.length} KEY MOMENT${moments.length === 1 ? "" : "S"}`}
                  </Text>
                ) : null}
              </View>
            </View>
            <Transport playing={playing} speed={playback.rate} onToggle={toggle} onSkip={(d) => seek(positionS + d)} onSpeed={() => playback.setRate(nextSpeed)} />
            <MomentChips moments={moments} currentT={current?.t ?? null} onJump={(tt) => { seek(tt); playback.setPlaying(true); }} />
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
