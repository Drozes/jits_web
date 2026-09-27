import * as React from "react";
import { StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Animated, { Easing, useAnimatedStyle, useSharedValue, withTiming } from "react-native-reanimated";
import { matchHaptics } from "@/lib/match-flow/use-haptics";
import { useReduceMotion } from "@/lib/match-flow/use-reduce-motion";
import { FIGHT, FIGHT_EASING, FIGHT_RADIUS } from "../fight/fight-tokens";
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
  matchType: "ranked" | "casual";
  recording: boolean;
  me: FaceoffAthlete & { current_weight: number | null };
  opponent: FaceoffAthlete & { current_weight: number | null };
}

/**
 * The 3-2-1 before the clock, full screen over the camera preview (the
 * wizard's camera is already full screen underneath on the live step). Both
 * phones time it from the server's `started_at`, so they reach GO together;
 * the recorder (when opted in) arms at GO, when the live step mounts.
 * One heavy haptic per numeral. Reduce Motion shows the numerals without
 * the scale-in.
 */
export function Countdown({ goAt, matchType, recording, me, opponent }: CountdownProps) {
  const insets = useSafeAreaInsets();
  const reduceMotion = useReduceMotion();
  const [now, setNow] = React.useState(() => Date.now());
  const msLeft = Math.max(0, goAt - now);
  const numeral = countdownNumeral(msLeft);

  React.useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 100);
    return () => clearInterval(id);
  }, []);

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
  const progress = 1 - msLeft / COUNTDOWN_MS;

  return (
    <View testID="match-countdown" style={StyleSheet.absoluteFill}>
      <View pointerEvents="none" style={[StyleSheet.absoluteFill, { backgroundColor: FIGHT.scrim }]} />
      <View style={{ position: "absolute", left: 16, right: 16, top: insets.top + 12, height: 28, flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
        <View
          style={{ height: 28, paddingHorizontal: 10, flexDirection: "row", alignItems: "center", gap: 7, borderWidth: 1, borderColor: recording ? FIGHT.cta : FIGHT.strong, borderRadius: FIGHT_RADIUS.tag, backgroundColor: FIGHT.glass }}
        >
          <View style={{ width: 8, height: 8, borderRadius: 4, borderWidth: 1.5, borderColor: recording ? FIGHT.red : FIGHT.text3 }} />
          <Mono bold spacing={1.68} color={recording ? FIGHT.red : FIGHT.text2}>
            {recording ? "REC ARMS AT GO" : "NOT RECORDING"}
          </Mono>
        </View>
        <KindTag kind={matchType} onScrim />
      </View>
      <View
        accessible
        accessibilityRole="timer"
        accessibilityLabel={numeral > 0 ? `Match starts in ${numeral}` : "Go"}
        style={{ flex: 1, alignItems: "center", justifyContent: "center" }}
      >
        <Animated.View style={numeralStyle}>
          <Text testID="countdown-numeral" className="font-display" style={{ fontSize: 240, lineHeight: 240, color: FIGHT.white }}>
            {numeral > 0 ? String(numeral) : ""}
          </Text>
        </Animated.View>
      </View>
      <View style={{ position: "absolute", left: 48, right: 48, bottom: insets.bottom + 132, alignItems: "center", gap: 12 }}>
        <View style={{ width: "100%", height: 3, backgroundColor: "rgba(255,255,255,0.18)" }}>
          <View style={{ height: 3, width: `${Math.round(Math.max(0, Math.min(1, progress)) * 100)}%`, backgroundColor: FIGHT.cta }} />
        </View>
        <Mono color={FIGHT.text2}>SYNCED TO SERVER CLOCK {"·"} BOTH PHONES</Mono>
      </View>
      <View style={{ position: "absolute", left: 16, right: 16, bottom: Math.max(insets.bottom, 16) + 26 }}>
        <FaceoffChip me={me} opponent={opponent} myWeight={me.current_weight} opponentWeight={opponent.current_weight} height={56} />
      </View>
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
          style={{ fontSize: 116, letterSpacing: 2, color: FIGHT.red }}
        >
          GRAPPLE
        </Text>
      </Animated.View>
    </View>
  );
}
