import * as React from "react";
import { AccessibilityInfo, ActivityIndicator, Image, StyleSheet, Text, View } from "react-native";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { StatusBar } from "expo-status-bar";
import { NO_MATCH_COPY, buildKeyMoments, captionAt, formatClock, isNoMatch } from "@jits/shared/utils";
import { HarnessMarker } from "@/components/match-detail/harness-marker";
import { VideoStatePanel } from "@/components/match-detail/video-state-panel";
import { ForceDarkTheme } from "@/lib/theme/force-dark-theme";
import { FilmScrim } from "@/components/film-room/film-scrim";
import { FilmBackButton } from "@/components/film-room/film-back-button";
import { angleText } from "@/components/film-room/angle-switcher";
import { SeekBar } from "@/components/film-room/seek-bar";
import { MomentCaption, MomentChips, Transport, nextSpeed } from "@/components/film-room/player-controls";
import { useMatchDetail } from "@/lib/match-detail/use-match-detail";
import { useVideoAnalysis } from "@/lib/film-room/use-video-analysis";
import { shortName } from "@/lib/film-room/format";
import { useReduceMotion } from "@/lib/motion";
import { ON_MEDIA } from "@/lib/theme/palette";
import { TABULAR, TRACKING, typeStep } from "@/lib/typography";
import { useMultiAnglePlayback } from "@/lib/video/multi-angle/use-multi-angle-playback";
import { readDeviceInfo, type DeviceInfo } from "@/lib/video/multi-angle/device-tier";
import { clearestAngleFor, readMomentAngles } from "@/lib/video/multi-angle/moment-angles";
import { switchAnnouncement } from "@/lib/video/multi-angle/copy";
import type { AngleVideo } from "@/lib/video/multi-angle/trust";
import type { PlaybackAngle } from "@/lib/video/playback-telemetry";
import { AngleStack } from "./angle-stack";
import { AngleBar } from "./angle-bar";
import { AnglesSheet } from "./angles-sheet";
import { FrameStep } from "./frame-step";

const CURRENT_HOLD_S = 10;

function telemetryAngle(v: { is_mine: boolean; recording_type?: string | null }): PlaybackAngle {
  if (v.recording_type === "timekeeper") return "timekeeper";
  return v.is_mine ? "mine" : "opponent";
}

/** Deck row order: yours, the other competitor, the timekeeper. */
function rowOrder(v: AngleVideo): number {
  if (v.is_mine) return 0;
  return v.recording_type === "timekeeper" ? 2 : 1;
}

/**
 * The multi-angle match player (dev flag `isMultiAnglePlayerEnabled`):
 * stacked angle players with an opacity-swap switch, the angle control in
 * the thumb zone plus horizontal swipe, frame step while paused, the Angles
 * sheet, and moment chips that open on the clearest angle when the planner
 * provides per-moment clarity. The timeline (seek bar, moments, clock) is
 * the Best angle's clock, so it holds still across a switch.
 */
export function MultiAnglePlayerBody({ id, start, device }: { id: string | undefined; start: number | null; device?: DeviceInfo }) {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const reduceMotion = useReduceMotion();
  const deviceInfo = React.useMemo(() => device ?? readDeviceInfo(), [device]);
  const [matchKey, setMatchKey] = React.useState<string | undefined>(undefined);
  const details = useMatchDetail(matchKey);
  const view = details.state === "ready" ? details.data : null;
  const videos = React.useMemo(
    () => (view ? [...(view.videos as AngleVideo[])].sort((a, b) => rowOrder(a) - rowOrder(b)) : null),
    [view],
  );
  const nameOf = React.useCallback(
    (vid: string) => {
      const v = videos?.find((x) => x.id === vid);
      return v ? angleText(v, view?.opponent?.display_name) : "";
    },
    [videos, view?.opponent?.display_name],
  );

  const playback = useMultiAnglePlayback({
    entryId: id,
    startS: start,
    videos,
    device: deviceInfo,
    reduceMotion,
    onSwitchLanded: (vid, approximate) => {
      try {
        AccessibilityInfo.announceForAccessibility?.(switchAnnouncement(nameOf(vid), approximate));
      } catch {
        /* no accessibility module */
      }
    },
  });
  const { phase, positionS, durationS, playing, telemetry } = playback;
  React.useEffect(() => {
    if (playback.matchId) setMatchKey(playback.matchId);
  }, [playback.matchId]);


  const entry = videos?.find((v) => v.id === id);
  const angleMeta = entry ? telemetryAngle(entry) : null;
  const angleCount = videos ? videos.length : null;
  React.useEffect(() => {
    if (angleMeta) telemetry.setMeta({ angle: angleMeta, angleCount });
  }, [telemetry, angleMeta, angleCount]);

  // Moments are on the Best angle's clock (the timeline).
  const { analysis } = useVideoAnalysis(playback.referenceId ?? null);
  const noMatch = isNoMatch(analysis);
  const moments = React.useMemo(
    () => (analysis && !noMatch ? buildKeyMoments(analysis, view?.match ?? null, durationS || null) : []),
    [analysis, noMatch, view?.match, durationS],
  );
  const momentAngles = React.useMemo(() => readMomentAngles(analysis, view?.match), [analysis, view?.match]);
  const caption = captionAt(moments, analysis?.positions, positionS);
  const current = [...moments].reverse().find((m) => m.t <= positionS + 0.25 && positionS - m.t < CURRENT_HOLD_S);

  const switchableIds = playback.angles.filter((a) => a.switchable).map((a) => a.id);
  const switchable = (videos ?? []).filter((v) => switchableIds.includes(v.id) || v.id === playback.visibleId);
  const visibleTrust = playback.angles.find((a) => a.id === playback.visibleId)?.trust ?? "reference";
  const approximateIds = playback.angles.filter((a) => a.trust === "clock").map((a) => a.id);
  const [sheetOpen, setSheetOpen] = React.useState(false);

  const swipe = (dir: 1 | -1) => {
    const order = switchable.map((v) => v.id);
    const i = order.indexOf(playback.visibleId ?? "");
    if (order.length < 2 || i < 0) return;
    playback.switchTo(order[(i + dir + order.length) % order.length]);
  };

  const onJump = (t: number) => {
    // Seek first: the switch then targets the moment, not where we were.
    playback.seek(t);
    playback.setPlaying(true);
    const clearest = clearestAngleFor(t, momentAngles, switchableIds);
    if (clearest && clearest !== playback.visibleId) playback.switchTo(clearest);
  };

  const title = view ? `${shortName(view.me.display_name)} vs ${shortName(view.opponent?.display_name)}` : "Match film";
  const topBar = (
    <View className="flex-row items-center" style={{ position: "absolute", left: 4, right: 16, top: insets.top + 8, height: 44, gap: 6, zIndex: 10 }}>
      <FilmBackButton label="Go back" icon="close" fallback="/" color={ON_MEDIA.white} />
      <Text numberOfLines={1} className="flex-1 font-heading uppercase" style={[typeStep("callout"), { letterSpacing: TRACKING.caps, color: ON_MEDIA.white }]}>
        {title}
      </Text>
    </View>
  );

  return (
    <ForceDarkTheme style={{ backgroundColor: ON_MEDIA.black }}>
      <StatusBar style="light" />
      {phase === "ready" ? (
        <>
          <AngleStack
            slots={playback.slots}
            heldFrame={playback.heldFrame}
            dipped={playback.dipped}
            reduceMotion={reduceMotion}
            canSwipe={switchable.length >= 2}
            onSwipe={swipe}
          />
          {playback.posterUrl && !playback.frameShown ? (
            <Image testID="video-poster" source={{ uri: playback.posterUrl }} resizeMode="contain" style={[StyleSheet.absoluteFill, { zIndex: 5 }]} accessibilityIgnoresInvertColors />
          ) : null}
          <FilmScrim stops={[[0, 0.75], [1, 0]]} style={{ left: 0, right: 0, top: 0, height: insets.top + 150, zIndex: 6 }} />
          <FilmScrim stops={[[0, 0], [1, 0.9]]} style={{ left: 0, right: 0, bottom: 0, height: "55%", zIndex: 6 }} />
          {topBar}
          <View style={{ position: "absolute", left: 16, right: 16, bottom: insets.bottom + 24, gap: 14, zIndex: 10 }}>
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
              <SeekBar positionS={positionS} durationS={durationS} moments={moments} onSeek={playback.seek} />
              <View className="flex-row justify-between">
                <Text testID="player-time" className="font-mono-bold" style={[typeStep("small"), { color: ON_MEDIA.white }, TABULAR]}>
                  {`${formatClock(positionS)} / ${formatClock(durationS)}`}
                </Text>
                {moments.length > 0 ? (
                  <Text className="font-mono-medium" style={[typeStep("micro"), { letterSpacing: TRACKING["caps-l"], color: ON_MEDIA.text2 }, TABULAR]}>
                    {`${moments.length} KEY MOMENT${moments.length === 1 ? "" : "S"}`}
                  </Text>
                ) : null}
              </View>
            </View>
            {!playing ? <FrameStep positionS={positionS} onStep={playback.stepFrame} /> : null}
            <Transport playing={playing} speed={playback.rate} onToggle={playback.toggle} onSkip={(d) => playback.seek(positionS + d)} onSpeed={() => playback.setRate(nextSpeed)} />
            {videos && playback.visibleId ? (
              <AngleBar
                switchable={switchable}
                activeId={playback.visibleId}
                opponentName={view?.opponent?.display_name}
                totalAngles={videos.length}
                approximate={visibleTrust === "clock" && videos.length > 1}
                switchingLabel={playback.switchingTo ? nameOf(playback.switchingTo) : null}
                onSelect={(other) => playback.switchTo(other)}
                onOpenSheet={() => setSheetOpen(true)}
              />
            ) : null}
            <MomentChips moments={moments} currentT={current?.t ?? null} onJump={onJump} />
          </View>
          {videos && playback.visibleId ? (
            <AnglesSheet
              open={sheetOpen}
              onClose={() => setSheetOpen(false)}
              videos={videos}
              activeId={playback.visibleId}
              switchableIds={switchableIds}
              approximateIds={approximateIds}
              opponentName={view?.opponent?.display_name}
              onSelect={(other) => playback.switchTo(other)}
            />
          ) : null}
        </>
      ) : phase === "loading" ? (
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator color={ON_MEDIA.text2} />
          {topBar}
        </View>
      ) : (
        <View style={{ flex: 1 }}>
          <VideoStatePanel kind={phase} onRetry={playback.retry} onBack={() => (router.canGoBack() ? router.back() : router.replace("/"))} />
          {topBar}
        </View>
      )}
      <HarnessMarker testID="video-player-state" label={`Video state: ${playback.stateLabel}`} />
    </ForceDarkTheme>
  );
}
