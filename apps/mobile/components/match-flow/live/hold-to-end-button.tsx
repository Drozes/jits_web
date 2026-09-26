import * as React from "react";
import {
  Animated,
  Easing,
  Pressable,
  Text,
  View,
  type AccessibilityActionEvent,
} from "react-native";
import { Square } from "lucide-react-native";
import { HOLD_TO_END_MS } from "@/lib/match-flow/live-view-state";
import { BROADCAST, BROADCAST_RADIUS, BROADCAST_SIZE } from "./broadcast-tokens";

const RETRACT_MS = 240;

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
}

/**
 * The one red CTA. Ending takes a deliberate 1.2 s hold so a bumped phone or
 * a stray tap never ends a match; releasing early cancels. Completion comes
 * from `Pressable`'s long press timer, never from the fill animation, which
 * is only a readout. Screen reader users get "End match" actions instead.
 */
export function HoldToEndButton({ disabled, ending, onEnd, onHoldChange }: HoldToEndButtonProps) {
  const progress = React.useRef(new Animated.Value(0)).current;
  const [holding, setHolding] = React.useState(false);
  const [complete, setComplete] = React.useState(false);
  const completeRef = React.useRef(false);
  // Set when the button became disabled under the finger: that hold is dead
  // even if the button is re-enabled before the finger comes up.
  const cancelledRef = React.useRef(false);
  const holdingRef = React.useRef(false);
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

  const retract = React.useCallback(() => {
    progress.stopAnimation();
    Animated.timing(progress, {
      toValue: 0,
      duration: RETRACT_MS,
      easing: Easing.bezier(0.22, 1, 0.36, 1),
      useNativeDriver: false,
    }).start();
  }, [progress]);

  const finish = React.useCallback(() => {
    if (completeRef.current || disabledRef.current) return;
    completeRef.current = true;
    setComplete(true);
    progress.stopAnimation();
    progress.setValue(1);
    setHold(false);
    onEnd();
  }, [onEnd, progress, setHold]);

  const handlePressIn = React.useCallback(() => {
    if (disabledRef.current || completeRef.current) return;
    cancelledRef.current = false;
    setHold(true);
    Animated.timing(progress, {
      toValue: 1,
      duration: HOLD_TO_END_MS,
      easing: Easing.linear,
      useNativeDriver: false,
    }).start();
  }, [progress, setHold]);

  const handlePressOut = React.useCallback(() => {
    if (completeRef.current) return;
    if (holdingRef.current) retract();
    setHold(false);
  }, [retract, setHold]);

  const handleLongPress = React.useCallback(() => {
    if (cancelledRef.current || !holdingRef.current) return;
    finish();
  }, [finish]);

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
    retract();
    setHold(false);
  }, [disabled, retract, setHold]);

  React.useEffect(() => () => progress.stopAnimation(), [progress]);

  const label = complete || ending ? "ENDING" : holding ? "KEEP HOLDING" : "HOLD TO END";
  const dimmed = disabled || complete;
  const fillWidth = progress.interpolate({ inputRange: [0, 1], outputRange: ["0%", "100%"] });

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
      onLongPress={handleLongPress}
      style={{
        flex: 1.4,
        minWidth: 0,
        height: BROADCAST_SIZE.controls,
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
        style={{
          position: "absolute",
          left: 0,
          top: 0,
          bottom: 0,
          width: fillWidth,
          backgroundColor: BROADCAST.ctaHover,
        }}
      />
      <View pointerEvents="none" style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
        <Square size={20} color={BROADCAST.ink} strokeWidth={2} />
        <Text
          className="font-heading"
          numberOfLines={1}
          style={{ fontSize: 14, lineHeight: 16, letterSpacing: 1.12, color: BROADCAST.ink }}
        >
          {label}
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
        <Animated.View style={{ height: 2, width: fillWidth, backgroundColor: BROADCAST.ink }} />
      </View>
    </Pressable>
  );
}
