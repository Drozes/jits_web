import * as React from "react";
import { Pressable, Text, View, type AccessibilityActionEvent } from "react-native";
import Animated, { cancelAnimation, useAnimatedStyle, useSharedValue, withTiming } from "react-native-reanimated";
import { Square } from "lucide-react-native";
import { HOLD_TO_END_MS } from "@/lib/match-flow/live-view-state";
import { duration, easing } from "@/lib/motion";
import { BROADCAST, BROADCAST_LANDSCAPE, BROADCAST_RADIUS, BROADCAST_SIZE } from "./broadcast-tokens";

/** The fill retracts to empty on an early release (`duration.fast`, brand ease-out). */
export const RETRACT_MS = duration.fast;

const A11Y_ACTIONS = [
  { name: "activate", label: "End match" },
  { name: "longpress", label: "End match" },
];

interface HoldToEndButtonProps {
  /** No press and no accessibility action (RPC in flight, ended, auto-end pending). */
  disabled: boolean;
  /** Show "ENDING" (end in flight or done, or auto-end pending). */
  ending: boolean;
  /** Called once, when the hold completes or a screen reader action fires. */
  onEnd: () => void;
  /** Reports the finger going down / up so the strip can say "RELEASE TO CANCEL". */
  onHoldChange?: (holding: boolean) => void;
  /** The landscape rail's 112 x 180 tile: fill grows bottom to top, two-line label. */
  tile?: boolean;
}

/**
 * The one red CTA. Ending takes a deliberate 1.2 s hold so a bumped phone or
 * a stray tap never ends a match; releasing early cancels. Completion comes
 * from our own timer started on press in, never from the fill animation,
 * which is only a readout. Pressable's long press is only a redundant
 * trigger: RN cancels its timer once the finger drifts 10 px, while the
 * press itself stays active, so a rolling thumb would fill the bar and never
 * end. Screen reader users get "End match" actions instead.
 *
 * Hold-to-end fill (Motion Rule registry, Reactive): a Reanimated shared
 * value scales a full-size fill from its leading edge (`scaleX` from the
 * left; `scaleY` from the bottom on the landscape tile) and the 2px rule
 * under the label, on the UI thread. No layout property animates. It tracks
 * the touch, so it is unchanged under Reduce Motion.
 */
export function HoldToEndButton({ disabled, ending, onEnd, onHoldChange, tile = false }: HoldToEndButtonProps) {
  const progress = useSharedValue(0);
  const [holding, setHolding] = React.useState(false);
  const [complete, setComplete] = React.useState(false);
  const completeRef = React.useRef(false);
  // Set when the button became disabled under the finger: that hold is dead
  // even if the button is re-enabled before the finger comes up.
  const cancelledRef = React.useRef(false);
  const holdingRef = React.useRef(false);
  const holdTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const disabledRef = React.useRef(disabled);
  disabledRef.current = disabled;
  const onHoldChangeRef = React.useRef(onHoldChange);
  onHoldChangeRef.current = onHoldChange;

  const setHold = React.useCallback((next: boolean) => {
    if (holdingRef.current === next) return;
    holdingRef.current = next;
    setHolding(next);
    onHoldChangeRef.current?.(next);
  }, []);

  const clearHoldTimer = React.useCallback(() => {
    if (holdTimerRef.current == null) return;
    clearTimeout(holdTimerRef.current);
    holdTimerRef.current = null;
  }, []);

  const retract = React.useCallback(() => {
    cancelAnimation(progress);
    progress.value = withTiming(0, { duration: RETRACT_MS, easing: easing.brandOut });
  }, [progress]);

  const finish = React.useCallback(() => {
    clearHoldTimer();
    if (completeRef.current || disabledRef.current) return;
    completeRef.current = true;
    setComplete(true);
    cancelAnimation(progress);
    progress.value = 1;
    setHold(false);
    onEnd();
  }, [clearHoldTimer, onEnd, progress, setHold]);

  const handleHoldComplete = React.useCallback(() => {
    if (cancelledRef.current || !holdingRef.current) return;
    finish();
  }, [finish]);
  const handleHoldCompleteRef = React.useRef(handleHoldComplete);
  handleHoldCompleteRef.current = handleHoldComplete;

  const handlePressIn = React.useCallback(() => {
    if (disabledRef.current || completeRef.current) return;
    cancelledRef.current = false;
    setHold(true);
    // A readout only: completion comes from the timer below.
    progress.value = withTiming(1, { duration: HOLD_TO_END_MS, easing: easing.linear });
    clearHoldTimer();
    holdTimerRef.current = setTimeout(() => {
      holdTimerRef.current = null;
      handleHoldCompleteRef.current();
    }, HOLD_TO_END_MS);
  }, [clearHoldTimer, progress, setHold]);

  const handlePressOut = React.useCallback(() => {
    clearHoldTimer();
    if (completeRef.current) return;
    if (holdingRef.current) retract();
    setHold(false);
  }, [clearHoldTimer, retract, setHold]);

  const handleAccessibilityAction = React.useCallback(
    (e: AccessibilityActionEvent) => {
      const name = e.nativeEvent.actionName;
      if (name === "activate" || name === "longpress") finish();
    },
    [finish],
  );

  // Disabled under the finger (clock hit 00:00, the opponent ended): cancel
  // the hold without ending.
  React.useEffect(() => {
    if (!disabled || !holdingRef.current || completeRef.current) return;
    cancelledRef.current = true;
    clearHoldTimer();
    retract();
    setHold(false);
  }, [clearHoldTimer, disabled, retract, setHold]);

  React.useEffect(
    () => () => {
      clearHoldTimer();
      cancelAnimation(progress);
    },
    [clearHoldTimer, progress],
  );

  const label = complete || ending ? "ENDING" : holding ? "KEEP HOLDING" : "HOLD TO END";
  const dimmed = disabled || complete;
  // The tile's fill carries the vertical reading; the bottom rule stays horizontal.
  const fillAnimated = useAnimatedStyle(() =>
    tile ? { transform: [{ scaleY: progress.value }] } : { transform: [{ scaleX: progress.value }] },
  );
  const ruleAnimated = useAnimatedStyle(() => ({ transform: [{ scaleX: progress.value }] }));
  const fillStyle = tile
    ? { left: 0, right: 0, bottom: 0, height: "100%" as const, transformOrigin: "bottom" }
    : { left: 0, top: 0, bottom: 0, width: "100%" as const, transformOrigin: "left" };

  return (
    <Pressable
      testID="live-end"
      accessibilityRole="button"
      accessibilityLabel="Hold to end match"
      accessibilityHint="Ends the match"
      accessibilityState={{ disabled: dimmed }}
      accessibilityActions={A11Y_ACTIONS}
      onAccessibilityAction={handleAccessibilityAction}
      disabled={dimmed}
      delayLongPress={HOLD_TO_END_MS}
      onPressIn={handlePressIn}
      onPressOut={handlePressOut}
      onLongPress={handleHoldComplete}
      style={{
        ...(tile
          ? { width: BROADCAST_LANDSCAPE.rail, height: BROADCAST_LANDSCAPE.holdTile }
          : { flex: 1.4, minWidth: 0, height: BROADCAST_SIZE.controls }),
        borderRadius: BROADCAST_RADIUS.button,
        backgroundColor: BROADCAST.cta,
        overflow: "hidden",
        alignItems: "center",
        justifyContent: "center",
        opacity: dimmed ? 0.5 : 1,
        transform: [{ scale: holding ? 0.98 : 1 }],
      }}
    >
      <Animated.View
        testID="live-end-fill"
        pointerEvents="none"
        style={[
          {
            position: "absolute",
            ...fillStyle,
            backgroundColor: BROADCAST.ctaHover,
          },
          fillAnimated,
        ]}
      />
      <View
        pointerEvents="none"
        style={{ flexDirection: tile ? "column" : "row", alignItems: "center", gap: tile ? 12 : 10 }}
      >
        <Square size={20} color={BROADCAST.ink} strokeWidth={2} />
        <Text
          className="font-heading"
          numberOfLines={tile ? 2 : 1}
          style={[
            { fontSize: 14, lineHeight: 16, letterSpacing: 1.12, color: BROADCAST.ink },
            tile ? { lineHeight: 15.4, textAlign: "center" } : null,
          ]}
        >
          {tile ? label.replace(" ", "\n") : label}
        </Text>
      </View>
      <View
        pointerEvents="none"
        style={{
          position: "absolute",
          left: 12,
          right: 12,
          bottom: 10,
          height: 2,
          backgroundColor: BROADCAST.track,
        }}
      >
        <Animated.View
          testID="live-end-rule"
          style={[{ height: 2, width: "100%", backgroundColor: BROADCAST.ink, transformOrigin: "left" }, ruleAnimated]}
        />
      </View>
    </Pressable>
  );
}
