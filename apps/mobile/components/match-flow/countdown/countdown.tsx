import * as React from "react";
import { StyleSheet, Text, View, useWindowDimensions } from "react-native";
import { StatusBar } from "expo-status-bar";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Animated, { Easing, useAnimatedStyle, useSharedValue, withTiming } from "react-native-reanimated";
import { matchHaptics } from "@/lib/match-flow/use-haptics";
import { useReduceMotion } from "@/lib/match-flow/use-reduce-motion";
import { ON_MEDIA } from "@/lib/theme/palette";
import { FIGHT_EASING, FIGHT_RADIUS } from "../fight/fight-tokens";
import { KindTag, Mono } from "../fight/fight-ui";
import { FaceoffChip, type FaceoffAthlete } from "../faceoff/faceoff-top";

/** 3, 2, 1: the countdown runs this long from the server's `started_at`. */
export const COUNTDOWN_MS = 3_000;
const EASE = Easing.bezier(...FIGHT_EASING);

/** The numeral showing `msLeft` before GO: 3, 2 or 1 (0 once it is GO). */
export function countdownNumeral(msLeft: number): number {
  if (msLeft <= 0) return 0;
  return Math.min(3, Math.ceil(msLeft / 1000));
}

interface CountdownProps {
  /** Epoch ms of GO on this device. */
  goAt: number;
  recording: boolean;
  me: FaceoffAthlete;
  opponent: FaceoffAthlete;
  /** The match's rated weights (from the challenge), lbs. */
  myWeight: number | null;
  opponentWeight: number | null;
}

/** Numeral size: 240 in portrait, scaled to the window height when short. */
export function numeralSize(windowHeight: number): number {
  return Math.max(96, Math.min(240, Math.round(windowHeight * 0.55)));
}

/**
 * The 3-2-1 before the clock, full screen over the camera preview (the
 * wizard's camera is already full screen underneath on the live step). Both
 * phones time it from the server's `started_at`, so they reach GO together;
 * the recorder (when opted in) arms at GO, when the live step mounts.
 * One heavy haptic per numeral. Reduce Motion shows the numerals without
 * the scale-in. Over the camera it is dark in both app themes (ON_MEDIA).
 */
export function Countdown({ goAt, recording, me, opponent, myWeight, opponentWeight }: CountdownProps) {
  const insets = useSafeAreaInsets();
  const window = useWindowDimensions();
  const landscape = window.width > window.height;
  const reduceMotion = useReduceMotion();
  // Re-render only when the numeral changes (a timer to the next second
  // boundary), not on a fast interval; the bar animates on the UI thread.
  const [numeral, setNumeral] = React.useState(() => countdownNumeral(goAt - Date.now()));
  React.useEffect(() => {
    const left = goAt - Date.now();
    const next = countdownNumeral(left);
    if (next !== numeral) {
      setNumeral(next);
      return;
    }
    if (next === 0) return;
    const t = setTimeout(() => setNumeral(countdownNumeral(goAt - Date.now())), Math.max(1, left - (next - 1) * 1000));
    return () => clearTimeout(t);
  }, [goAt, numeral]);

  const progress = useSharedValue(Math.max(0, Math.min(1, 1 - (goAt - Date.now()) / COUNTDOWN_MS)));
  React.useEffect(() => {
    const left = Math.max(0, goAt - Date.now());
    progress.value = withTiming(1, { duration: left, easing: Easing.linear });
  }, [goAt, progress]);
  const barStyle = useAnimatedStyle(() => ({ width: `${Math.round(progress.value * 100)}%` }));

  const scale = useSharedValue(1);
  const opacity = useSharedValue(1);
  const lastRef = React.useRef<number | null>(null);
  React.useEffect(() => {
    if (numeral === 0 || lastRef.current === numeral) return;
    lastRef.current = numeral;
    void matchHaptics.countdownTick?.();
    if (reduceMotion) {
      scale.value = 1;
      opacity.value = 1;
      return;
    }
    scale.value = 1.35;
    opacity.value = 0;
    scale.value = withTiming(1, { duration: 450, easing: EASE });
    opacity.value = withTiming(1, { duration: 300, easing: EASE });
  }, [numeral, reduceMotion, scale, opacity]);

  const numeralStyle = useAnimatedStyle(() => ({ opacity: opacity.value, transform: [{ scale: scale.value }] }));
  const size = numeralSize(window.height);

  return (
    <View testID="match-countdown" style={StyleSheet.absoluteFill}>
      <StatusBar style="light" />
      <View pointerEvents="none" style={[StyleSheet.absoluteFill, { backgroundColor: ON_MEDIA.scrim }]} />
      <View style={{ position: "absolute", left: Math.max(16, insets.left), right: Math.max(16, insets.right), top: insets.top + 12, height: 28, flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
        <View
          style={{ height: 28, paddingHorizontal: 10, flexDirection: "row", alignItems: "center", gap: 7, borderWidth: 1, borderColor: recording ? ON_MEDIA.cta : ON_MEDIA.strong, borderRadius: FIGHT_RADIUS.tag, backgroundColor: ON_MEDIA.tag }}
        >
          <View style={{ width: 8, height: 8, borderRadius: 4, borderWidth: 1.5, borderColor: recording ? ON_MEDIA.red : ON_MEDIA.text3 }} />
          <Mono bold spacing={1.68} color={recording ? ON_MEDIA.red : ON_MEDIA.text2}>
            {recording ? "REC ARMS AT GO" : "NOT RECORDING"}
          </Mono>
        </View>
        <KindTag onScrim />
      </View>
      <View
        accessible
        accessibilityRole="timer"
        accessibilityLabel={numeral > 0 ? `Match starts in ${numeral}` : "Go"}
        style={{ flex: 1, alignItems: "center", justifyContent: "center" }}
      >
        <Animated.View style={numeralStyle}>
          <Text testID="countdown-numeral" className="font-display" style={{ fontSize: size, lineHeight: size, color: ON_MEDIA.white }}>
            {numeral > 0 ? String(numeral) : ""}
          </Text>
        </Animated.View>
      </View>
      <View
        style={{
          position: "absolute",
          left: Math.max(48, insets.left + 16),
          right: Math.max(48, insets.right + 16),
          bottom: landscape ? Math.max(insets.bottom, 16) + 12 : insets.bottom + 132,
          alignItems: "center",
          gap: 12,
        }}
      >
        <View style={{ width: "100%", height: 3, backgroundColor: ON_MEDIA.track }}>
          <Animated.View testID="countdown-progress" style={[{ height: 3, backgroundColor: ON_MEDIA.cta }, barStyle]} />
        </View>
        {/* Landscape has no room under the numeral for the caption or the
            athlete chip; the numeral and the bar carry it there. */}
        {landscape ? null : <Mono color={ON_MEDIA.text2}>SYNCED TO SERVER CLOCK {"·"} BOTH PHONES</Mono>}
      </View>
      {landscape ? null : (
        <View testID="countdown-chip" style={{ position: "absolute", left: 16, right: 16, bottom: Math.max(insets.bottom, 16) + 26 }}>
          <FaceoffChip me={me} opponent={opponent} myWeight={myWeight} opponentWeight={opponentWeight} height={56} onMedia />
        </View>
      )}
    </View>
  );
}

/** "GRAPPLE", held briefly over the live screen at GO. */
export function GoFlash() {
  const reduceMotion = useReduceMotion();
  const opacity = useSharedValue(1);
  const scale = useSharedValue(reduceMotion ? 1 : 0.9);
  React.useEffect(() => {
    if (reduceMotion) return;
    scale.value = withTiming(1, { duration: 300, easing: EASE });
    opacity.value = withTiming(0, { duration: 700, easing: Easing.in(Easing.quad) });
  }, [reduceMotion, opacity, scale]);
  const style = useAnimatedStyle(() => ({ opacity: opacity.value, transform: [{ scale: scale.value }] }));
  return (
    <View pointerEvents="none" style={[StyleSheet.absoluteFill, { alignItems: "center", justifyContent: "center" }]}>
      <Animated.View style={style}>
        <Text
          testID="countdown-go"
          accessibilityLiveRegion="assertive"
          className="font-display"
          style={{ fontSize: 116, letterSpacing: 2, color: ON_MEDIA.red }}
        >
          GRAPPLE
        </Text>
      </Animated.View>
    </View>
  );
}
