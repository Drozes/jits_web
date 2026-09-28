import * as React from "react";
import { AccessibilityInfo, Platform, StyleSheet, View, useWindowDimensions } from "react-native";
import { StatusBar } from "expo-status-bar";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import type { UseVideoRecorderReturn } from "@/lib/video/use-video-recorder";
import { deriveLiveView, type StripVariant } from "@/lib/match-flow/live-view-state";
import { formatElapsed } from "@/lib/match-flow/format-elapsed";
import { useRecordingElapsed } from "@/lib/match-flow/use-recording-elapsed";
import { BROADCAST, BROADCAST_SIZE } from "./broadcast-tokens";
import { Scrims } from "./scrims";
import { RecTally } from "./rec-tally";
import { HudTag } from "./hud-tag";
import { StateStrip, stripAnnouncement } from "./state-strip";
import { AthleteBar, type LiveAthlete } from "./athlete-bar";
import { ClockSlab } from "./clock-slab";
import { PauseButton } from "./pause-button";
import { HoldToEndButton } from "./hold-to-end-button";
import { NoVideoPlate } from "./no-video-plate";
import { OpponentEndedPlate } from "./opponent-ended-plate";
import { LiveLandscapeLayout } from "./live-landscape-layout";

export interface LiveBroadcastProps {
  kindLabel: "RANKED" | "CASUAL" | "PRACTICE";
  me: LiveAthlete;
  opponent: LiveAthlete;
  durationSeconds: number;
  /** Remaining time as MM:SS (the timer's `formatted`). */
  formatted: string;
  remaining: number;
  paused: boolean;
  recorder: Pick<UseVideoRecorderReturn, "state" | "error" | "permission" | "requestPermission">;
  /** A pause / resume / end is in flight, or the match has ended. */
  controlsDisabled: boolean;
  /** The end is in flight or done: the End button reads "ENDING". */
  endPending: boolean;
  onPauseResume: () => void;
  /** Called once, when the hold completes or a screen reader action fires. */
  onEnd: () => void;
  /** R-P8, real match only: the opponent ended it; the clock is frozen. */
  opponentEnded?: { name: string; finalFormatted: string; finalRemaining: number } | null;
  /** Extra HUD item right of the tag (the practice EXIT pill). */
  hudExtra?: React.ReactNode;
  /** Practice copy on the no-video plate. */
  practice?: boolean;
  /** This athlete chose not to record from this phone (face-off opt-in). */
  recordingOff?: boolean;
}

/**
 * The live match screen, shared by the real Arena match and practice: the
 * camera frame (drawn underneath by the wizard) with a broadcast-style HUD
 * and lower-third over it. Pure presentation; the steps own the clock, the
 * recorder and the end.
 *
 * A landscape window (the phone was sideways when the match went live and
 * the interface is locked there) gets the Widescreen Sideline arrangement
 * of the same pieces; the derived live state is orientation-independent.
 */
export function LiveBroadcast(props: LiveBroadcastProps) {
  const {
    kindLabel,
    me,
    opponent,
    durationSeconds,
    formatted,
    remaining,
    paused,
    recorder,
    controlsDisabled,
    endPending,
    onPauseResume,
    onEnd,
    opponentEnded,
    hudExtra,
    practice = false,
    recordingOff = false,
  } = props;
  const insets = useSafeAreaInsets();
  const window = useWindowDimensions();
  const landscape = window.width > window.height;
  const [holding, setHolding] = React.useState(false);
  const recordingSeconds = useRecordingElapsed(recorder.state);
  // Set on render (not in an effect) so the frame after a recording ends
  // already reads "stopped", never "camera starting".
  const hasRecordedRef = React.useRef(false);
  if (recorder.state === "recording") hasRecordedRef.current = true;
  const view = deriveLiveView({
    remaining,
    paused,
    holding,
    recorderState: recorder.state,
    permission: recorder.permission,
    opponentEnded: !!opponentEnded,
    hasRecorded: hasRecordedRef.current,
    recordingOff,
  });

  // One announcement per strip change on iOS; Android reads the strip's
  // polite live region, so announcing there too would speak it twice.
  // Segment steps inside final 10 are not changes.
  const lastStripRef = React.useRef<StripVariant | null>(null);
  React.useEffect(() => {
    if (view.strip === lastStripRef.current) return;
    lastStripRef.current = view.strip;
    if (view.strip && Platform.OS === "ios") {
      AccessibilityInfo.announceForAccessibility(stripAnnouncement(view.strip));
    }
  }, [view.strip]);

  const durationFormatted = formatElapsed(durationSeconds);

  // R-P8: VoiceOver does not speak role "alert" on its own, so announce the
  // opponent's end once on iOS. Android announces the alert plate itself.
  const opponentEndedName = opponentEnded?.name ?? null;
  const opponentEndedFinal = opponentEnded?.finalFormatted ?? null;
  React.useEffect(() => {
    if (opponentEndedName == null || opponentEndedFinal == null || Platform.OS !== "ios") return;
    AccessibilityInfo.announceForAccessibility(
      `${opponentEndedName} ended the match. Final clock ${opponentEndedFinal}`,
    );
  }, [opponentEndedName, opponentEndedFinal]);
  const holdDisabled = controlsDisabled || endPending || view.autoEndPending;

  const tally = <RecTally variant={view.tally} recordingSeconds={recordingSeconds} />;
  const tags = (
    <>
      <HudTag label={kindLabel} testID="live-kind-tag" />
      {hudExtra}
    </>
  );
  const renderNoVideo = (regionWidth?: number) =>
    view.unavailable ? (
      <NoVideoPlate
        variant={view.unavailable}
        practice={practice}
        onAllowCamera={() => void recorder.requestPermission()}
        regionWidth={regionWidth}
      />
    ) : null;
  const endedPlate = opponentEnded ? (
    <OpponentEndedPlate
      name={opponentEnded.name}
      finalFormatted={opponentEnded.finalFormatted}
      durationFormatted={durationFormatted}
      headlineLines={landscape ? 2 : undefined}
    />
  ) : null;
  const plates = (
    <View>
      {view.strip ? <StateStrip key={view.strip} variant={view.strip} remaining={remaining} /> : null}
      <AthleteBar me={me} opponent={opponent} flatTop={!!view.strip} />
      <ClockSlab
        label={view.slab}
        formatted={opponentEnded ? opponentEnded.finalFormatted : formatted}
        seconds={opponentEnded ? opponentEnded.finalRemaining : remaining}
        durationFormatted={durationFormatted}
        landscape={landscape}
      />
    </View>
  );
  const controls = opponentEnded ? null : (
    <>
      <PauseButton paused={paused} disabled={controlsDisabled || endPending} onPress={onPauseResume} tile={landscape} />
      <HoldToEndButton
        disabled={holdDisabled}
        ending={endPending || view.autoEndPending}
        onEnd={onEnd}
        onHoldChange={setHolding}
        tile={landscape}
      />
    </>
  );

  return (
    <View testID="live-broadcast" pointerEvents="box-none" style={StyleSheet.absoluteFill}>
      <StatusBar style="light" />
      {view.camera === "unavailable" ? (
        <View testID="live-ground" pointerEvents="none" style={[StyleSheet.absoluteFill, { backgroundColor: BROADCAST.ground }]} />
      ) : (
        <Scrims landscape={landscape} />
      )}
      {view.camera === "starting-dim" || view.camera === "saving-dim" ? (
        <View
          testID={`live-dim-${view.camera}`}
          pointerEvents="none"
          style={[
            StyleSheet.absoluteFill,
            { backgroundColor: view.camera === "starting-dim" ? BROADCAST.startingDim : BROADCAST.savingDim },
          ]}
        />
      ) : null}
      {landscape ? (
        <LiveLandscapeLayout
          hud={
            <>
              {tally}
              {tags}
            </>
          }
          lowerThird={
            <>
              {endedPlate}
              {plates}
            </>
          }
          rail={controls}
          renderNoVideo={renderNoVideo}
        />
      ) : (
        <View
          pointerEvents="box-none"
          style={[
            StyleSheet.absoluteFill,
            {
              paddingTop: insets.top + 12,
              paddingBottom: Math.max(insets.bottom, 16) + 8,
              paddingHorizontal: 16,
            },
          ]}
        >
          <View
            pointerEvents="box-none"
            style={{ height: BROADCAST_SIZE.tally, flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}
          >
            {tally}
            <View pointerEvents="box-none" style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
              {tags}
            </View>
          </View>
          <View pointerEvents="box-none" style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
            {renderNoVideo()}
          </View>
          <View
            pointerEvents="box-none"
            style={{ width: "100%", maxWidth: BROADCAST_SIZE.maxWidth, alignSelf: "center", gap: 12 }}
          >
            {endedPlate}
            {plates}
            {controls ? (
              <View style={{ height: BROADCAST_SIZE.controls, flexDirection: "row", gap: 12 }}>{controls}</View>
            ) : null}
          </View>
        </View>
      )}
    </View>
  );
}
