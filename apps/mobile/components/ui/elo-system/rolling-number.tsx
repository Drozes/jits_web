import * as React from "react";
import { Text, View, type LayoutChangeEvent, type StyleProp, type TextStyle } from "react-native";
import Animated, { cancelAnimation, useAnimatedStyle, useSharedValue, withDelay, withTiming, type SharedValue } from "react-native-reanimated";
import { easing, useReduceMotion } from "@/lib/motion";

/**
 * The odometer ELO roll (Motion Rule registry: "Odometer ELO roll", a
 * Moment). It replaces the old JS-thread count-up tick in both EloTile and
 * the verdict. 600ms sits between `duration.base` (480) and the
 * `duration.slow` (720) ceiling; there is no dedicated token.
 */
export const ROLL_MS = 600;

/** Number of cells in a digit strip: 0..9 and a trailing 0 for the wrap. */
const CELLS = 11;

/**
 * Results that already played their moment this app run, keyed by the
 * caller (e.g. `verdict:<matchId>:<after>`). A remount of the same result,
 * or navigating back to it, shows the end state and stays silent.
 */
const played = new Set<string>();

/** Tests only. */
export function __resetPlayedMomentsForTests(): void {
  played.clear();
}

/**
 * Decides once, on mount, whether this mount plays a one-shot moment: only
 * when `eligible` and, with a `key`, only the first time that key is seen.
 * Later prop changes never turn it on (real transitions only).
 */
export function usePlayOnce(key: string | null | undefined, eligible: boolean): boolean {
  const [play] = React.useState(() => eligible && !(key != null && played.has(key)));
  React.useEffect(() => {
    if (play && key != null) played.add(key);
    // Mount-only by design.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return play;
}

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
   * timing. Never called when `play` is false.
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
 * change of digit count (999 to 1003, a leading blank column) and a fall
 * (it rolls the other way). When it lands it becomes a plain Text with the
 * final value. Under Reduce Motion, or without `play`, it is that Text from
 * the first frame.
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
  const label = accessibilityLabel ?? String(to);
  // Decided on mount: a later `to` never starts a new roll.
  const [rolling, setRolling] = React.useState(() => play && !reduceMotion && rollable(from, to));
  const firstTo = React.useRef(to).current;
  const startFrom = React.useRef(from).current;
  const v = useSharedValue(rolling && startFrom != null ? startFrom : to);
  const onLandedRef = React.useRef(onLanded);
  onLandedRef.current = onLanded;
  const landedRef = React.useRef(false);
  const timerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  const land = React.useCallback(() => {
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
    if (!play) return;
    if (rolling) {
      v.value = withDelay(delayMs, withTiming(firstTo, { duration: ROLL_MS, easing: easing.brandOut }));
    }
    const wait = delayMs + (rolling ? ROLL_MS : 0);
    if (wait <= 0) land();
    else timerRef.current = setTimeout(land, wait);
    return () => {
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
      <Text
        testID={testID}
        accessibilityLabel={label}
        className={className}
        style={style}
        {...staticTextProps}
      >
        {String(to)}
      </Text>
    );
  }

  const fromDigits = String(startFrom).length;
  const toDigits = String(firstTo).length;
  const columns = Math.max(fromDigits, toDigits);
  // Columns past the shorter number's length can be a leading zero: blank.
  const leadingFrom = Math.min(fromDigits, toDigits);
  const ks = Array.from({ length: columns }, (_, i) => columns - 1 - i);

  const row = (
    <View style={{ flexDirection: "row" }} importantForAccessibility="no-hide-descendants" accessibilityElementsHidden>
      {ks.map((k) => (
        <DigitColumn
          key={k}
          k={k}
          v={v}
          blankZero={k >= leadingFrom}
          cellHeight={style.lineHeight}
          className={className}
          style={style}
        />
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
      <View
        style={{ flexShrink: 0, transform: [{ scale }] }}
        onLayout={(e: LayoutChangeEvent) => setContent(e.nativeEvent.layout.width)}
      >
        {children}
      </View>
    </View>
  );
}

function DigitColumn({
  k,
  v,
  blankZero,
  cellHeight,
  className,
  style,
}: {
  k: number;
  v: SharedValue<number>;
  blankZero: boolean;
  cellHeight: number;
  className?: string;
  style: StyleProp<TextStyle>;
}) {
  const strip = useAnimatedStyle(() => ({
    transform: [{ translateY: -odometerPosition(v.value, k) * cellHeight }],
  }));
  return (
    <View style={{ height: cellHeight, overflow: "hidden" }}>
      <Animated.View style={strip}>
        {Array.from({ length: CELLS }, (_, i) => {
          const digit = i % 10;
          return (
            <Text
              key={i}
              allowFontScaling={false}
              className={className}
              style={[style, { height: cellHeight, fontVariant: ["tabular-nums"] }]}
            >
              {blankZero && digit === 0 ? " " : String(digit)}
            </Text>
          );
        })}
      </Animated.View>
    </View>
  );
}
