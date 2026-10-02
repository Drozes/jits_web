import * as React from "react";
import { StyleSheet, Text, View, useWindowDimensions } from "react-native";
import { StatusBar } from "expo-status-bar";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Animated, { Easing, useAnimatedStyle, useSharedValue, withTiming } from "react-native-reanimated";
import { duration, easing, moment, useReduceMotion } from "@/lib/motion";
// The match-flow name for the one haptics vocabulary (same object as
// `haptics` in @/lib/motion), so the match-flow suites' mocks intercept it.
import { matchHaptics } from "@/lib/match-flow/use-haptics";
import { ON_MEDIA } from "@/lib/theme/palette";
import { FIGHT_RADIUS } from "../fight/fight-tokens";
import { Mono } from "../fight/fight-ui";
import { FaceoffChip, type FaceoffAthlete } from "../faceoff/faceoff-top";

/** 3, 2, 1: the countdown runs this long from the server's `started_at`. */
export const COUNTDOWN_MS = 3_000;
const EASE = easing.brandOut;
/** Countdown slam: each numeral (and GO) drops in from this scale... */
export const SLAM_FROM_SCALE = 1.6;
/** ...and lands in about this long, with a small ease-out back overshoot. */
export const SLAM_MS = 140;
const SLAM_EASE = Easing.out(Easing.back(1.7));

/** The numeral showing `msLeft` before GO: 3, 2 or 1 (0 once it is GO). */
/** The fraction of the countdown still to run at `goAt`, 0 to 1. */
function fractionLeft(goAt: number): number {
  return Math.max(0, Math.min(1, (goAt - Date.now()) / COUNTDOWN_MS));
}

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
 * Countdown slam (Motion Rule registry): each numeral drops in from 1.6x
 * and lands, a Signal Red bar drains across the bottom to GO, and each
 * numeral fires one `countdownTick` (GO's `countdownGo` is fired by
 * `LiveStage`). Reduce Motion crossfades the numerals (no slam); the bar
 * still drains and the haptics are kept. Over the camera it is dark in both app themes (ON_MEDIA).
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

  // The Signal Red bar drains from full to empty over the whole countdown,
  // on the UI thread (scaleX from the left edge). It runs to GO exactly, so
  // it never changes when the match starts. It drains linearly under Reduce
  // Motion too: a progress fill tells the athlete the time left and is not
  // vestibular motion. The first frame is the true fraction left, so a
  // re-entry mid-countdown never paints a full bar first.
  const remaining = useSharedValue(fractionLeft(goAt));
  React.useEffect(() => {
    const left = Math.max(0, goAt - Date.now());
    remaining.value = fractionLeft(goAt);
    remaining.value = withTiming(0, { duration: left, easing: easing.linear });
  }, [goAt, remaining]);
  const barStyle = useAnimatedStyle(() => ({ transform: [{ scaleX: remaining.value }] }));

  // Countdown slam: each NEW numeral drops in from 1.6x and lands, with one
  // `countdownTick`. Keyed on the numeral, so a re-render with the same
  // numeral neither replays the slam nor buzzes again. Reduce Motion: the
  // numerals crossfade (the outgoing one fades out over the incoming one),
  // haptics kept.
  // The first numeral's first frame is already the start of its slam, so it
  // never paints once at rest before jumping to 1.6x.
  const slamFirst = !reduceMotion && numeral > 0;
  const scale = useSharedValue(slamFirst ? SLAM_FROM_SCALE : 1);
  const opacity = useSharedValue(slamFirst ? 0 : 1);
  const outOpacity = useSharedValue(0);
  const lastRef = React.useRef<number | null>(null);
  // Reduce Motion only: the numeral being replaced, held in state for the
  // whole crossfade (cleared after `duration.fast`), so a parent re-render
  // mid-fade cannot cut it short.
  const [outgoing, setOutgoing] = React.useState<number | null>(null);
  const outgoingTimer = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  React.useEffect(
    () => () => {
      if (outgoingTimer.current) clearTimeout(outgoingTimer.current);
    },
    [],
  );
  React.useEffect(() => {
    if (numeral === 0 || lastRef.current === numeral) return;
    const previous = lastRef.current;
    lastRef.current = numeral;
    void matchHaptics.countdownTick();
    if (reduceMotion) {
      scale.value = 1;
      if (previous !== null) {
        opacity.value = 0;
        outOpacity.value = 1;
        opacity.value = withTiming(1, { duration: duration.fast, easing: EASE });
        outOpacity.value = withTiming(0, { duration: duration.fast, easing: EASE });
        setOutgoing(previous);
        if (outgoingTimer.current) clearTimeout(outgoingTimer.current);
        outgoingTimer.current = setTimeout(() => {
          outgoingTimer.current = null;
          setOutgoing(null);
        }, duration.fast);
      } else {
        opacity.value = 1;
        outOpacity.value = 0;
      }
      return;
    }
    outOpacity.value = 0;
    scale.value = SLAM_FROM_SCALE;
    opacity.value = 0;
    scale.value = withTiming(1, { duration: SLAM_MS, easing: SLAM_EASE });
    opacity.value = withTiming(1, { duration: duration.instant, easing: EASE });
  }, [numeral, reduceMotion, scale, opacity, outOpacity]);

  const numeralStyle = useAnimatedStyle(() => ({ opacity: opacity.value, transform: [{ scale: scale.value }] }));
  const outgoingStyle = useAnimatedStyle(() => ({ opacity: outOpacity.value }));
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
      </View>
      <View
        accessible
        accessibilityRole="timer"
        accessibilityLabel={numeral > 0 ? `Match starts in ${numeral}` : "Go"}
        style={{ flex: 1, alignItems: "center", justifyContent: "center" }}
      >
        {reduceMotion && outgoing !== null ? (
          <Animated.View testID="countdown-numeral-out" pointerEvents="none" style={[StyleSheet.absoluteFill, { alignItems: "center", justifyContent: "center" }, outgoingStyle]}>
            <Text testID="countdown-numeral-outgoing" className="font-display" style={{ fontSize: size, lineHeight: size, color: ON_MEDIA.white }}>
              {outgoing > 0 ? String(outgoing) : ""}
            </Text>
          </Animated.View>
        ) : null}
        <Animated.View testID="countdown-numeral-slam" style={numeralStyle}>
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
          <Animated.View testID="countdown-progress" style={[{ width: "100%", height: 3, backgroundColor: ON_MEDIA.cta, transformOrigin: "left" }, barStyle]} />
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

/**
 * "GRAPPLE", the red GO, held briefly over the live screen at GO. It slams
 * in like the numerals (from 1.6x, landing in about 140 ms), then fades. The
 * `countdownGo` haptic is fired by `LiveStage` at GO, not here, so a remount
 * of this flash never buzzes. Reduce Motion: shown still, then removed.
 */
export function GoFlash() {
  const reduceMotion = useReduceMotion();
  const opacity = useSharedValue(1);
  const scale = useSharedValue(reduceMotion ? 1 : SLAM_FROM_SCALE);
  React.useEffect(() => {
    if (reduceMotion) return;
    scale.value = withTiming(1, { duration: SLAM_MS, easing: SLAM_EASE });
    opacity.value = withTiming(0, { duration: moment.goFade, easing: easing.inQuad });
  }, [reduceMotion, opacity, scale]);
  const style = useAnimatedStyle(() => ({ opacity: opacity.value, transform: [{ scale: scale.value }] }));
  return (
    <View pointerEvents="none" style={[StyleSheet.absoluteFill, { alignItems: "center", justifyContent: "center" }]}>
      <Animated.View testID="countdown-go-slam" style={style}>
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
