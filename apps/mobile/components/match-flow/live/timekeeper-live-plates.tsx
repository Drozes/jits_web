import * as React from "react";
import { AccessibilityInfo, Platform, Text, View } from "react-native";
import { Timer, Video } from "lucide-react-native";
import { TIMEKEEPER_COPY } from "@/lib/match-flow/timekeeper-copy";
import type { LiveTimekeeperSeam } from "@/lib/match-flow/step-seams";
import { clockRunnerName } from "@/lib/match-flow/clock-runner-name";
import { TRACKING, typeStep } from "@/lib/typography";
import { Button } from "@/components/ui/elo-system/button";
import { BROADCAST, BROADCAST_RADIUS, BROADCAST_SIZE, TABULAR } from "./broadcast-tokens";
import { HudTag, HudTagButton } from "./hud-tag";
import { TimekeeperOfflineBanner } from "./timekeeper-offline-banner";

/**
 * The live screen's timekeeper-mode pieces (board P-TK-B7, B9; slice M4),
 * placed by `LiveStep` into the shared `LiveBroadcast` slots: the HUD, the
 * controls' place and the banner above the athlete bar. A two-athlete match
 * renders none of them.
 */

/**
 * The timekeeper's HUD: the TK-L1 kicker and, while the clock runs, Leave
 * (absent `onLeave`: no Leave, as after the end, TK-K14). `onLeave` opens the
 * TK-K16 alert; `leaveDisabled` dims it while another live control is in
 * flight, as the pause and end controls are.
 */
export function TimekeeperHud({ onLeave, leaveDisabled = false }: { onLeave?: () => void; leaveDisabled?: boolean }) {
  const leave = TIMEKEEPER_COPY["TK-K16"].confirm;
  return (
    <>
      <HudTag label={TIMEKEEPER_COPY["TK-L1"]} testID="live-timekeeper-kicker" />
      {onLeave ? (
        <HudTagButton
          testID="live-timekeeper-leave"
          label={leave.toUpperCase()}
          accessibilityLabel={leave}
          onPress={onLeave}
          disabled={leaveDisabled}
        />
      ) : null}
    </>
  );
}

/** TK-L2, in the controls' place on an athlete's phone: who runs the clock. */
export function ClockRunnerStrip({ name }: { name: string }) {
  const text = TIMEKEEPER_COPY["TK-L2"](name);
  return (
    <View
      testID="live-clock-runner"
      accessible
      accessibilityLabel={text}
      style={{
        height: BROADCAST_SIZE.controls,
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "center",
        gap: 10,
        borderRadius: BROADCAST_RADIUS.button,
        borderWidth: 1,
        borderColor: BROADCAST.glassBorder,
        backgroundColor: BROADCAST.slab,
      }}
    >
      <Timer size={18} color={BROADCAST.body72} strokeWidth={2} />
      <Text
        className="font-mono-bold"
        numberOfLines={1}
        style={[typeStep("caption"), { letterSpacing: TRACKING["caps-xl"], color: BROADCAST.body72 }, TABULAR]}
      >
        {text}
      </Text>
    </View>
  );
}

/**
 * TK-L3 and TK-L4 on the timekeeper's phone: the camera failed, the clock and
 * the controls stay (D12). An alert: VoiceOver hears TK-L3 once when it
 * appears (iOS does not speak an alert on its own), as TK-D7 does.
 */
export function CameraStoppedBanner({ onRestart }: { onRestart: () => void }) {
  const restart = TIMEKEEPER_COPY["TK-L4"];
  React.useEffect(() => {
    if (Platform.OS === "ios") AccessibilityInfo.announceForAccessibility(TIMEKEEPER_COPY["TK-L3"]);
  }, []);
  return (
    <View
      testID="live-camera-stopped"
      accessibilityRole="alert"
      style={{
        gap: 10,
        paddingVertical: 12,
        paddingHorizontal: 14,
        borderRadius: BROADCAST_RADIUS.plate,
        borderWidth: 1,
        borderStyle: "dashed",
        borderColor: BROADCAST.amber,
        backgroundColor: BROADCAST.slab,
      }}
    >
      <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
        <Video size={16} color={BROADCAST.amber} strokeWidth={2} />
        <Text
          className="font-mono-bold"
          style={[typeStep("micro"), { flexShrink: 1, letterSpacing: TRACKING["caps-l"], color: BROADCAST.amber }, TABULAR]}
        >
          {TIMEKEEPER_COPY["TK-L3"]}
        </Text>
      </View>
      <Button testID="live-camera-restart" variant="glass" label={restart.toUpperCase()} accessibilityLabel={restart} height={44} onPress={onRestart} />
    </View>
  );
}

export interface TimekeeperLiveBannersProps {
  /** The timekeeper's short name while athletes see them offline (TK-D7); else null. */
  offlineName: string | null;
  /** The TK-D9 countdown's instant, when it shows (paused, or the timekeeper offline); else null. */
  timeoutAt: string | null;
  /** Draws the TK-D9 chip (M3's `faceoff/timeout-chip.tsx`, read-only); absent, no countdown is drawn. */
  renderTimeoutChip?: (timeoutAt: string) => React.ReactNode;
  /** The timekeeper's camera failed: TK-L3 with its restart (TK-L4); else null. */
  onRestartCamera: (() => void) | null;
}

export interface TimekeeperLiveSlotsInput {
  /** Timekeeper mode with a seated timekeeper (`stepSeams`); absent in a two-athlete match. */
  timekeeper: LiveTimekeeperSeam | undefined;
  /** This phone runs the clock (the live controls are its own). */
  runsClock: boolean;
  /** The clock is paused on this phone. */
  paused: boolean;
  /** The clock ended on this phone (the end is in flight, done, or waits on the re-read): no Leave (TK-K14). */
  ended: boolean;
  /** A live control (pause, resume, end, leave) is in flight: Leave is dimmed. */
  busy: boolean;
  /** This phone runs the clock and its camera failed mid-match (TK-L3). */
  cameraFailed: boolean;
  onLeave: () => void;
  onRestartCamera: () => void;
  renderTimeoutChip?: (timeoutAt: string) => React.ReactNode;
}

/**
 * What the live screen's shared slots show in timekeeper mode, from the live
 * seam alone (no mode or role read here, M-R3): on the phone that runs the
 * clock, the TK-L1 kicker and Leave in the HUD (until the clock ends) and the
 * camera banner, which replaces the shipped centred no-video plate
 * (`hideNoVideoPlate`; board P-TK-B7 frame 2b keeps only the NO VIDEO tally);
 * on a phone that watches it, TK-L2 in the controls' place and TK-D7 while
 * the timekeeper is offline; TK-D9 counting down while paused or offline.
 * Empty for a two-athlete match.
 */
export function timekeeperLiveSlots(p: TimekeeperLiveSlotsInput): {
  hudExtra?: React.ReactNode;
  controlsStrip?: React.ReactNode;
  banner?: React.ReactNode;
  hideNoVideoPlate?: boolean;
} {
  const tk = p.timekeeper;
  if (!tk) return {};
  const name = clockRunnerName(tk.name);
  const showTimeout = tk.timeoutAt != null && (p.paused || tk.offline);
  const leave = tk.canLeave && !p.ended ? p.onLeave : undefined;
  return {
    hudExtra: p.runsClock ? <TimekeeperHud onLeave={leave} leaveDisabled={p.busy} /> : undefined,
    controlsStrip: p.runsClock ? undefined : <ClockRunnerStrip name={name} />,
    banner: (
      <TimekeeperLiveBanners
        offlineName={tk.offline ? name : null}
        timeoutAt={showTimeout ? tk.timeoutAt : null}
        renderTimeoutChip={p.renderTimeoutChip}
        onRestartCamera={p.cameraFailed ? p.onRestartCamera : null}
      />
    ),
    hideNoVideoPlate: p.cameraFailed,
  };
}

/** The banner slot above the athlete bar: TK-D7 (with TK-D9), else TK-D9 alone, and TK-L3. Null when empty. */
export function TimekeeperLiveBanners({ offlineName, timeoutAt, renderTimeoutChip, onRestartCamera }: TimekeeperLiveBannersProps) {
  const chip = timeoutAt && renderTimeoutChip ? renderTimeoutChip(timeoutAt) : null;
  const offline = offlineName != null ? <TimekeeperOfflineBanner name={offlineName} chip={chip} /> : null;
  const loneChip = offline || !chip ? null : <View style={{ alignSelf: "flex-end" }}>{chip}</View>;
  const camera = onRestartCamera ? <CameraStoppedBanner onRestart={onRestartCamera} /> : null;
  if (!offline && !loneChip && !camera) return null;
  return (
    <View testID="live-timekeeper-banners" style={{ gap: 12 }}>
      {offline}
      {loneChip}
      {camera}
    </View>
  );
}
