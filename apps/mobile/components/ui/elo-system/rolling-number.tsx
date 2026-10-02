import * as React from "react";
import { Text, View, useWindowDimensions, type LayoutChangeEvent, type StyleProp, type TextStyle } from "react-native";
import Animated, {
  cancelAnimation,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withTiming,
  type SharedValue,
} from "react-native-reanimated";
import { easing, useReduceMotion } from "@/lib/motion";

export { usePlayOnce, __resetPlayedMomentsForTests } from "./play-once";

/**
 * The odometer ELO roll (Motion Rule registry: "Odometer ELO roll", a
 * Moment). It replaces the old JS-thread count-up tick in both EloTile and
 * the verdict. 600ms sits between `duration.base` (480) and the
 * `duration.slow` (720) ceiling; there is no dedicated token.
 */
export const ROLL_MS = 600;
/**
 * The roll lands from the animation's completion callback; this JS timer
 * after the roll's end is only the fallback if that callback never comes.
 */
export const ROLL_LAND_FALLBACK_MS = 100;
/** A large change starts the roll at most this far from the final value. */
export const ROLL_MAX_SPAN = 30;
/** Dynamic Type scale the rolling digits follow, at most. */
export const ROLL_MAX_FONT_SCALE = 2;

/** Number of cells in a digit strip: 0..9 and a trailing 0 for the wrap. */
const CELLS = 11;

/**
 * Position of digit column `k` (0 = ones) on its 0..10 strip for the
 * continuous value `v`. A real odometer: the ones column moves with `v`,
 * and a higher column only moves while every column below it is passing
 * from 9 to 0 (the carry), so digits that do not change stay put.
 */
export function odometerPosition(v: number, k: number): number {
  "worklet";
  const p = Math.pow(10, k);
  const base = Math.floor(v / p);
  const rem = v - base * p;
  const carry = Math.min(1, Math.max(0, rem - (p - 1)));
  return (base % 10) + carry;
}

/**
 * Opacity of digit column `k` at `v`: a leading column is blank while the
 * number is shorter than it (v below 10^k - 1), fades in as it carries from
 * 0 to 1, and is fully shown from 10^k. The ones column always shows.
 */
export function columnOpacity(v: number, k: number): number {
  "worklet";
  if (k === 0) return 1;
  return Math.min(1, Math.max(0, v - (Math.pow(10, k) - 1)));
}

/** Where the roll starts: `from`, but never more than ROLL_MAX_SPAN away. */
export function rollStart(from: number, to: number): number {
  if (Math.abs(to - from) <= ROLL_MAX_SPAN) return from;
  return from < to ? to - ROLL_MAX_SPAN : to + ROLL_MAX_SPAN;
}

function rollable(from: number | null, to: number): from is number {
  return (
    from != null &&
    Number.isInteger(from) &&
    Number.isInteger(to) &&
    from >= 0 &&
    to >= 0 &&
    from !== to
  );
}

export interface RollingNumberProps {
  /** The value before the change; null (or equal to `to`) means no roll. */
  from: number | null;
  /** The final value. Always what accessibility reads. */
  to: number;
  /** This mount plays the moment (see `usePlayOnce`). */
  play: boolean;
  /** Wait this long before rolling (e.g. after "the tap"). */
  delayMs?: number;
  /**
   * Called once when the roll lands (after `delayMs`, plus the roll when it
   * animates). Also called under Reduce Motion, so haptics keep their
   * timing. Never called without `play`, nor after unmount.
   */
  onLanded?: () => void;
  /** Text style of the number; give it `fontSize` and `lineHeight`. */
  style: StyleProp<TextStyle> & { fontSize: number; lineHeight: number };
  className?: string;
  /** Spoken label, defaults to the final value. Never intermediate digits. */
  accessibilityLabel?: string;
  testID?: string;
  /**
   * Scale the rolling digits down to the width they are given (the static
   * end state then uses `adjustsFontSizeToFit` from `staticTextProps`).
   */
  fit?: boolean;
  /** Extra props for the static (landed) Text, e.g. numberOfLines. */
  staticTextProps?: Partial<React.ComponentProps<typeof Text>>;
}

/**
 * A number that rolls like an odometer from `from` to `to`, once: each
 * digit is an overflow-hidden column whose 0..9 strip slides on the UI
 * thread (brand ease-out), and only the digits that change move. Handles a
 * change of digit count (leading columns fade in or out in the worklet) and
 * a fall (it rolls the other way); a large change rolls only the last
 * ROLL_MAX_SPAN. When it lands it becomes a plain Text with the final value.
 * Under Reduce Motion, or without `play`, it is that Text from the first
 * frame. The digits follow Dynamic Type themselves (clamped at 2x) so they
 * match the landed Text.
 */
export function RollingNumber({
  from,
  to,
  play,
  delayMs = 0,
  onLanded,
  style,
  className,
  accessibilityLabel,
  testID,
  fit = false,
  staticTextProps,
}: RollingNumberProps) {
  const reduceMotion = useReduceMotion();
  const { fontScale } = useWindowDimensions();
  const label = accessibilityLabel ?? String(to);
  // Decided on mount: a later `to` never starts a new roll.
  const [rolling, setRolling] = React.useState(() => play && !reduceMotion && rollable(from, to));
  const firstTo = React.useRef(to).current;
  const startFrom = React.useRef(rolling && from != null ? rollStart(from, to) : null).current;
  const v = useSharedValue(startFrom ?? to);
  const onLandedRef = React.useRef(onLanded);
  onLandedRef.current = onLanded;
  const landedRef = React.useRef(false);
  const mountedRef = React.useRef(true);
  const timerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  const land = React.useCallback(() => {
    if (!mountedRef.current) return;
    if (timerRef.current != null) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    setRolling(false);
    if (landedRef.current) return;
    landedRef.current = true;
    onLandedRef.current?.();
  }, []);

  React.useEffect(() => {
    mountedRef.current = true;
    if (!play) return;
    if (rolling) {
      v.value = withDelay(
        delayMs,
        withTiming(firstTo, { duration: ROLL_MS, easing: easing.brandOut }, (finished) => {
          if (finished) runOnJS(land)();
        }),
      );
      timerRef.current = setTimeout(land, delayMs + ROLL_MS + ROLL_LAND_FALLBACK_MS);
    } else if (delayMs <= 0) {
      land();
    } else {
      timerRef.current = setTimeout(land, delayMs);
    }
    return () => {
      mountedRef.current = false;
      if (timerRef.current != null) clearTimeout(timerRef.current);
      timerRef.current = null;
      cancelAnimation(v);
    };
    // Mount-only: one moment per mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // A new final value mid-roll jumps to it and lands (once).
  React.useEffect(() => {
    if (to !== firstTo && rolling) {
      cancelAnimation(v);
      v.value = to;
      land();
    }
  }, [to, firstTo, rolling, land, v]);

  if (!rolling || startFrom == null) {
    return (
      <Text testID={testID} accessibilityLabel={label} className={className} style={style} {...staticTextProps}>
        {String(to)}
      </Text>
    );
  }

  // The digits size themselves for Dynamic Type (clamped), with the OS
  // scaling off, so a column's cell height always matches its glyphs.
  const scale = Math.min(Math.max(fontScale || 1, 1), ROLL_MAX_FONT_SCALE);
  const cellHeight = style.lineHeight * scale;
  const digitStyle: StyleProp<TextStyle> = [
    style,
    { fontSize: style.fontSize * scale, lineHeight: cellHeight, height: cellHeight, fontVariant: ["tabular-nums"] },
  ];
  const columns = Math.max(String(startFrom).length, String(firstTo).length);
  const ks = Array.from({ length: columns }, (_, i) => columns - 1 - i);

  const row = (
    <View style={{ flexDirection: "row" }} importantForAccessibility="no-hide-descendants" accessibilityElementsHidden>
      {ks.map((k) => (
        <DigitColumn key={k} k={k} v={v} cellHeight={cellHeight} className={className} style={digitStyle} />
      ))}
    </View>
  );

  return (
    <View testID={testID} accessible accessibilityRole="text" accessibilityLabel={label}>
      {fit ? <FitRow>{row}</FitRow> : row}
    </View>
  );
}

/** Scales its single row down (once per layout) to the width it is given. */
function FitRow({ children }: { children: React.ReactNode }) {
  const [box, setBox] = React.useState(0);
  const [content, setContent] = React.useState(0);
  const scale = box > 0 && content > box ? box / content : 1;
  return (
    <View style={{ alignSelf: "stretch", alignItems: "center" }} onLayout={(e: LayoutChangeEvent) => setBox(e.nativeEvent.layout.width)}>
      <View style={{ flexShrink: 0, transform: [{ scale }] }} onLayout={(e: LayoutChangeEvent) => setContent(e.nativeEvent.layout.width)}>
        {children}
      </View>
    </View>
  );
}

function DigitColumn({
  k,
  v,
  cellHeight,
  className,
  style,
}: {
  k: number;
  v: SharedValue<number>;
  cellHeight: number;
  className?: string;
  style: StyleProp<TextStyle>;
}) {
  const strip = useAnimatedStyle(() => ({
    opacity: columnOpacity(v.value, k),
    transform: [{ translateY: -odometerPosition(v.value, k) * cellHeight }],
  }));
  return (
    <View style={{ height: cellHeight, overflow: "hidden" }}>
      <Animated.View style={strip}>
        {Array.from({ length: CELLS }, (_, i) => (
          <Text key={i} allowFontScaling={false} className={className} style={style}>
            {String(i % 10)}
          </Text>
        ))}
      </Animated.View>
    </View>
  );
}
