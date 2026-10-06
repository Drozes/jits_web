import * as React from "react";
import { Text, View, type LayoutChangeEvent } from "react-native";
import Animated, { cancelAnimation, useAnimatedStyle, useSharedValue, withRepeat, withTiming } from "react-native-reanimated";
import type { SwitchState } from "@/lib/match-detail/use-video-playback";
import { duration, easing, useAppActive } from "@/lib/motion";
import { ON_MEDIA } from "@/lib/theme/palette";
import { TABULAR, TRACKING, typeStep } from "@/lib/typography";
import { SWITCHING_ANGLE, SYNCING_ANGLE } from "@/lib/video/video-status-copy";

/** The pill shows only for a switch still pending this long after the tap. */
export const SYNCING_PILL_DELAY_MS = 200;
/** Once shown, the pill stays at least this long (no flash). */
export const SYNCING_PILL_MIN_MS = 400;
/** The sweeping band's share of the pill's width. */
const BAND_FRACTION = 0.4;

export interface SyncingPillProps {
  /** `failed` is optional (contract 4.2 has no field for it): a failure of this seq removes the pill at once. */
  switchState: Pick<SwitchState, "phase" | "seq" | "startedAt" | "approximate" | "restoring"> & Partial<Pick<SwitchState, "failed">>;
  /** From useReduceMotion() at the screen (a prop for testability). */
  reduceMotion: boolean;
  /** Called once per switch (seq) the pill is shown for (the screen counts it in telemetry). */
  onShown?: () => void;
  /**
   * Called with true when the pill mounts and false once it is fully gone
   * (after its fade-out), so the screen can hold the approximate note until
   * then (the note and the pill never overlap).
   */
  onVisibleChange?: (up: boolean) => void;
  testID?: string;
}

/**
 * "SYNCING ANGLE" / "SWITCHING ANGLE" over the player while an angle switch
 * has not landed (jits-xfvd.16, contract 4.2; Motion registry "Syncing
 * pill"). A switch that lands within `SYNCING_PILL_DELAY_MS` never shows it;
 * once up it stays `SYNCING_PILL_MIN_MS` at least and until the switch lands
 * (a superseding switch keeps it up and only changes the label). A restore
 * after a failure is not a switch: the pill goes at once (no minimum, no
 * fade) so the failure tag can take its slot at the moment of failure.
 *
 * Moment + Ambient: it fades in over `instant` and out over `fast`; while up,
 * a 2 px band sweeps its bottom edge (linear, `duration.shimmer`, UI thread,
 * paused in the background). Reduce Motion: it appears and goes in place and
 * the bar is a static full-width line. Hidden from screen readers (the
 * switcher's busy state says it), never touchable, no haptic. Rendered at its
 * intrinsic size; the screen places it.
 */
export function SyncingPill({ switchState, reduceMotion, onShown, onVisibleChange, testID = "syncing-pill" }: SyncingPillProps) {
  const { phase, seq, startedAt, approximate, restoring, failed } = switchState;
  // This switch failed: with a restore, or without one (no angle to return to).
  const failedNow = restoring || failed?.seq === seq;
  const eligible = phase === "pending" && !restoring;
  const [visible, setVisible] = React.useState(false);
  const [rendered, setRendered] = React.useState(false);
  const shownAtRef = React.useRef(0);
  const countedSeqRef = React.useRef<number | null>(null);
  const onShownRef = React.useRef(onShown);
  onShownRef.current = onShown;
  // The label of the switch it was last shown for: a fade-out after the
  // landing keeps the words it had.
  const labelRef = React.useRef(SYNCING_ANGLE);
  if (eligible) labelRef.current = approximate ? SWITCHING_ANGLE : SYNCING_ANGLE;

  const count = React.useCallback((forSeq: number) => {
    if (countedSeqRef.current === forSeq) return;
    countedSeqRef.current = forSeq;
    onShownRef.current?.();
  }, []);

  // Show: SYNCING_PILL_DELAY_MS after the tap, if the switch is still pending.
  React.useEffect(() => {
    if (!eligible) return undefined;
    if (visible) {
      count(seq);
      return undefined;
    }
    const wait = Math.max(0, (startedAt ?? Date.now()) + SYNCING_PILL_DELAY_MS - Date.now());
    const timer = setTimeout(() => {
      shownAtRef.current = Date.now();
      setVisible(true);
      setRendered(true);
      count(seq);
    }, wait);
    return () => clearTimeout(timer);
  }, [eligible, visible, seq, startedAt, count]);

  // Hide: once the switch is no longer pending, after the minimum time up.
  React.useEffect(() => {
    if (eligible || !visible) return undefined;
    const left = Math.max(0, shownAtRef.current + SYNCING_PILL_MIN_MS - Date.now());
    const timer = setTimeout(() => setVisible(false), left);
    return () => clearTimeout(timer);
  }, [eligible, visible]);

  const opacity = useSharedValue(0);
  React.useEffect(() => {
    if (visible) {
      opacity.value = reduceMotion ? 1 : withTiming(1, { duration: duration.instant, easing: easing.brandOut });
      return undefined;
    }
    if (!rendered) return undefined;
    if (reduceMotion) {
      opacity.value = 0;
      setRendered(false);
      return undefined;
    }
    opacity.value = withTiming(0, { duration: duration.fast, easing: easing.brandOut });
    const timer = setTimeout(() => setRendered(false), duration.fast);
    return () => clearTimeout(timer);
  }, [visible, rendered, reduceMotion, opacity]);
  const fadeStyle = useAnimatedStyle(() => ({ opacity: opacity.value }));

  // A failed switch (the restore starts): gone at once, the failure tag
  // takes the slot from the moment of failure (P-AS-05).
  React.useEffect(() => {
    if (!failedNow || !rendered) return;
    opacity.value = 0;
    setVisible(false);
    setRendered(false);
  }, [failedNow, rendered, opacity]);

  const onVisibleChangeRef = React.useRef(onVisibleChange);
  onVisibleChangeRef.current = onVisibleChange;
  const reportedRef = React.useRef(false);
  React.useEffect(() => {
    if (reportedRef.current === rendered) return;
    reportedRef.current = rendered;
    onVisibleChangeRef.current?.(rendered);
  }, [rendered]);

  if (!rendered) return null;
  return (
    <Animated.View
      testID={testID}
      pointerEvents="none"
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={[
        {
          height: 28,
          paddingHorizontal: 10,
          justifyContent: "center",
          borderRadius: 2,
          borderWidth: 1,
          borderColor: ON_MEDIA.strong,
          backgroundColor: ON_MEDIA.badge,
          overflow: "hidden",
        },
        fadeStyle,
      ]}
    >
      <Text
        testID={`${testID}-label`}
        className="font-mono-bold uppercase"
        style={[typeStep("micro"), { letterSpacing: TRACKING["caps-l"], color: ON_MEDIA.text }, TABULAR]}
      >
        {labelRef.current}
      </Text>
      <SyncBar running={visible && !reduceMotion} still={reduceMotion} testID={`${testID}-bar`} />
    </Animated.View>
  );
}

/**
 * The 2 px indeterminate bar on the pill's bottom edge: a band of `text2`
 * crossing an `ON_MEDIA.track` line. Only `translateX` animates; the loop
 * runs while the pill is up and the app is in the foreground.
 */
function SyncBar({ running, still, testID }: { running: boolean; still: boolean; testID: string }) {
  const appActive = useAppActive();
  const width = useSharedValue(0);
  const progress = useSharedValue(0);
  const sweeping = running && appActive;

  React.useEffect(() => {
    if (!sweeping) return undefined;
    progress.value = 0;
    progress.value = withRepeat(withTiming(1, { duration: duration.shimmer, easing: easing.linear }), -1, false);
    return () => cancelAnimation(progress);
  }, [sweeping, progress]);

  const onLayout = React.useCallback(
    (e: LayoutChangeEvent) => {
      width.value = e.nativeEvent.layout.width;
    },
    [width],
  );
  const bandStyle = useAnimatedStyle(() => {
    const band = width.value * BAND_FRACTION;
    return { width: band, transform: [{ translateX: -band + progress.value * (width.value + band) }] };
  });

  return (
    <View
      testID={testID}
      onLayout={onLayout}
      style={{ position: "absolute", left: 0, right: 0, bottom: 0, height: 2, backgroundColor: ON_MEDIA.track }}
    >
      {still ? (
        <View testID={`${testID}-static`} style={{ position: "absolute", left: 0, right: 0, top: 0, bottom: 0, backgroundColor: ON_MEDIA.text2 }} />
      ) : (
        <Animated.View testID={`${testID}-band`} style={[{ position: "absolute", left: 0, top: 0, bottom: 0, backgroundColor: ON_MEDIA.text2 }, bandStyle]} />
      )}
    </View>
  );
}
