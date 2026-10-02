/**
 * The Arena tab icon: lucide `Swords` drawn as two blade halves, so it can
 * carry Arena heat (Motion Rule, DESIGN.md "Motion"; Adding Flare, jits-pddd.2).
 *
 * - Ember rise [10.1], Ambient: while live and nothing is pending, three 2px
 *   embers (two `heatOrange`, one Signal Red) drift up off the blades and
 *   fade on one 2400ms clock (`duration.ember`), one launching every 800ms.
 *   Silent. Reduce Motion: one static ember above the crossing.
 * - Countable embers [09.2], Ambient: while 1 to 3 incoming challenges are
 *   pending, one 2.5px heat-red ember per challenge rises on one shared clock
 *   offset by i/N, never fading below 0.35 so they stay countable, in place
 *   of the red count pill (the bar draws no pill for an
 *   `inIcon` count; above 3 the pill returns and no embers show). They replace
 *   the live embers while showing. Still (not hidden) while the Arena tab is
 *   focused, since the Arena screen shows the challenges itself. Reduce
 *   Motion: N static embers.
 * - Blade clash [04.1 + 11.1], Moment: the halves spread a hair apart and
 *   snap back together (ease-out back) with a small Signal Red spark at the
 *   crossing, when the athlete goes live (false to true, by their own tap,
 *   never a restore on launch, foreground or after a match: `goLive` haptic)
 *   and when the pending count increases after its first load (silent: the
 *   challenge prompt sheet already buzzes `challengeArrived` for every new
 *   challenge). Reduce Motion: no clash and no spark; the go-live haptic is
 *   kept.
 *
 * At rest the two halves are exactly lucide Swords (v1.16.0) at the given size,
 * stroke 2; `__tests__/components/layout/arena-tab-icon.test.tsx` holds the
 * paths to lucide's own node list.
 *
 * Every animation runs on the UI thread from shared values. The only React
 * state is the clash counter, bumped once per clash (it keys the one-shot
 * spark), so the always-mounted tab bar never re-renders per frame. Ambient
 * loops stop while the app is in the background (`useAppActive`).
 *
 * Decorative: hidden from assistive tech. The tab button carries the label
 * and the spoken count / live state.
 */
import * as React from "react";
import { View } from "react-native";
import Animated, {
  cancelAnimation,
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withTiming,
  type SharedValue,
} from "react-native-reanimated";
import Svg, { Line, Polyline } from "react-native-svg";
import { isAthleteGoLiveFlip } from "@/lib/arena/arena-store";
import { duration, easing, haptics, useAppActive, useReduceMotion } from "@/lib/motion";
import { countableEmbers } from "@/lib/navigation/tab-badge";
import { useThemedTokens } from "@/lib/theme/use-theme";
import { darkTokens } from "@/lib/tokens";

// ---------------------------------------------------------------------------
// The glyph
// ---------------------------------------------------------------------------

type SvgNode =
  | ["polyline", { points: string }]
  | ["line", { x1: string; x2: string; y1: string; y2: string }];

/**
 * lucide Swords, split into its two swords. Blade A runs from the top-left tip
 * to the bottom-right hilt; blade B is the top-right tip plus the bottom-left
 * hilt (lucide breaks it where it passes under blade A). Together, in this
 * order, they are lucide's node list exactly.
 */
export const SWORDS_BLADE_A: readonly SvgNode[] = [
  ["polyline", { points: "14.5 17.5 3 6 3 3 6 3 17.5 14.5" }],
  ["line", { x1: "13", x2: "19", y1: "19", y2: "13" }],
  ["line", { x1: "16", x2: "20", y1: "16", y2: "20" }],
  ["line", { x1: "19", x2: "21", y1: "21", y2: "19" }],
];
export const SWORDS_BLADE_B: readonly SvgNode[] = [
  ["polyline", { points: "14.5 6.5 18 3 21 3 21 6 17.5 9.5" }],
  ["line", { x1: "5", x2: "9", y1: "14", y2: "18" }],
  ["line", { x1: "7", x2: "4", y1: "17", y2: "20" }],
  ["line", { x1: "3", x2: "5", y1: "19", y2: "21" }],
];

function BladeSvg({
  nodes,
  color,
  size,
  testID,
}: {
  nodes: readonly SvgNode[];
  color: string;
  size: number;
  testID: string;
}) {
  // lucide's default attributes: 24 viewBox, no fill, stroke 2, round caps
  // and joins (not absoluteStrokeWidth).
  return (
    <Svg
      testID={testID}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke={color}
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {nodes.map(([tag, attrs], i) =>
        tag === "polyline" ? (
          <Polyline key={i} points={attrs.points} />
        ) : (
          <Line key={i} x1={attrs.x1} x2={attrs.x2} y1={attrs.y1} y2={attrs.y2} />
        ),
      )}
    </Svg>
  );
}

// ---------------------------------------------------------------------------
// Timings (Motion Rule tokens where one exists)
// ---------------------------------------------------------------------------

/** How far each half moves out before the clash, in 24-unit glyph space. */
const CLASH_SPREAD_UNITS = 4;
/** The quick spread before the snap. */
const CLASH_SPREAD_MS = 60;
/** The snap back together (about 220ms with the spread, ease-out back). */
const CLASH_SNAP_MS = 220 - CLASH_SPREAD_MS;
/** The spark lights as the blades meet, then fades. */
const SPARK_DELAY_MS = CLASH_SPREAD_MS + 100;
const SPARK_IN_MS = 80;
const SPARK_OUT_MS = 300;
/**
 * The countable ember's heat color: the `heatRed` token, the same in both
 * themes (Arena heat, not the text-only Signal Red token).
 */
export const HEAT_EMBER_RED = darkTokens.heatRed;
/** The live embers' orange: the `heatOrange` token, the same in both themes. */
const HEAT_ORANGE = darkTokens.heatOrange;
/**
 * Countable embers never fade below this, so 2 or 3 of them can be counted at
 * a glance at any moment of the cycle. Live embers keep the full fade.
 */
const COUNT_EMBER_MIN_OPACITY = 0.35;

// ---------------------------------------------------------------------------
// Embers
// ---------------------------------------------------------------------------

/** One shared ember clock, 0 to 1 every `duration.ember`, while `run`. */
function useEmberClock(run: boolean): SharedValue<number> {
  const clock = useSharedValue(0);
  React.useEffect(() => {
    if (!run) {
      cancelAnimation(clock);
      return;
    }
    clock.value = 0;
    clock.value = withRepeat(
      withTiming(1, { duration: duration.ember, easing: Easing.linear }),
      -1,
      false,
    );
    return () => cancelAnimation(clock);
  }, [run, clock]);
  return clock;
}

interface EmberSpec {
  /** Left edge and top, in points for an 18pt icon (scaled with size). */
  left: number;
  top: number;
  size: number;
  color: string;
  /** Rise and sideways drift over one life, in points for an 18pt icon. */
  fromY: number;
  toY: number;
  driftX: number;
  peakOpacity: number;
  /** The lowest opacity across a life (0 = fades out fully). */
  minOpacity: number;
  /** Shrink to this scale by the end of a life (1 = none). */
  endScale: number;
}

function Ember({
  clock,
  offset,
  spec,
  unit,
  testID,
}: {
  clock: SharedValue<number>;
  offset: number;
  spec: EmberSpec;
  unit: number;
  testID: string;
}) {
  const style = useAnimatedStyle(() => {
    // This ember's phase on the shared clock, 0 to 1.
    const p = (clock.value + 1 - offset) % 1;
    const rise = 1 - (1 - p) * (1 - p); // out-quad
    const fade = p < 0.2 ? p / 0.2 : (1 - p) / 0.8;
    const opacity = spec.minOpacity + (spec.peakOpacity - spec.minOpacity) * fade;
    return {
      opacity,
      transform: [
        { translateX: spec.driftX * unit * rise },
        { translateY: (spec.fromY + (spec.toY - spec.fromY) * rise) * unit },
        { scale: 1 - (1 - spec.endScale) * p },
      ],
    };
  });
  return <Animated.View testID={testID} style={[emberBox(spec, unit), style]} />;
}

function emberBox(spec: EmberSpec, unit: number) {
  const d = spec.size * unit;
  return {
    position: "absolute" as const,
    left: spec.left * unit,
    top: spec.top * unit,
    width: d,
    height: d,
    borderRadius: d / 2,
    backgroundColor: spec.color,
  };
}

/** A still ember at a fixed offset (Reduce Motion, or a stopped loop). */
function StillEmber({
  spec,
  unit,
  x,
  y,
  opacity,
  testID,
}: {
  spec: EmberSpec;
  unit: number;
  x: number;
  y: number;
  opacity: number;
  testID: string;
}) {
  return (
    <View
      testID={testID}
      style={[
        emberBox(spec, unit),
        { opacity, transform: [{ translateX: x * unit }, { translateY: y * unit }] },
      ]}
    />
  );
}

/** [10.1] Three embers off the blades while live (two orange, one red). */
function LiveEmbers({ unit, still, run }: { unit: number; still: boolean; run: boolean }) {
  const tokens = useThemedTokens();
  const clock = useEmberClock(run && !still);
  const orange = HEAT_ORANGE;
  const red = tokens.accentCta;
  const specs = React.useMemo<EmberSpec[]>(() => {
    const base = {
      top: 6,
      size: 2,
      fromY: 0,
      toY: -13,
      driftX: 0,
      peakOpacity: 0.85,
      minOpacity: 0,
      endScale: 0.4,
    };
    return [
      { ...base, left: 8, color: orange },
      { ...base, left: 11, color: red },
      { ...base, left: 5, color: orange },
    ];
  }, [orange, red]);
  if (still) {
    // One ember held just above the crossing (9, 9).
    return (
      <View testID="arena-embers-live-still" pointerEvents="none" style={fill}>
        <StillEmber spec={specs[0]} unit={unit} x={0} y={-5} opacity={0.8} testID="arena-ember-live-0" />
      </View>
    );
  }
  return (
    <View testID="arena-embers-live" pointerEvents="none" style={fill}>
      {specs.map((spec, i) => (
        <Ember
          key={i}
          clock={clock}
          offset={i / specs.length}
          spec={spec}
          unit={unit}
          testID={`arena-ember-live-${i}`}
        />
      ))}
    </View>
  );
}

/** Sideways drift of countable ember i, so a stack of them stays countable. */
const COUNT_DRIFT_X = [1, 5, -5];

/** [09.2] One ember per pending challenge (1 to 3). */
function CountEmbers({
  count,
  unit,
  still,
  run,
}: {
  count: number;
  unit: number;
  still: boolean;
  run: boolean;
}) {
  const clock = useEmberClock(run && !still);
  const specs = React.useMemo<EmberSpec[]>(
    () =>
      Array.from({ length: count }, (_, i) => ({
        left: 9 - 1.25,
        top: 2,
        size: 2.5,
        color: HEAT_EMBER_RED,
        fromY: 4,
        toY: -16,
        driftX: COUNT_DRIFT_X[i] ?? 0,
        peakOpacity: 1,
        minOpacity: COUNT_EMBER_MIN_OPACITY,
        endScale: 1,
      })),
    [count],
  );
  if (still) {
    return (
      <View testID="arena-embers-count-still" pointerEvents="none" style={fill}>
        {specs.map((spec, i) => (
          <StillEmber
            key={i}
            spec={spec}
            unit={unit}
            x={spec.driftX}
            y={-7}
            opacity={1}
            testID={`arena-ember-count-${i}`}
          />
        ))}
      </View>
    );
  }
  return (
    <View testID="arena-embers-count" pointerEvents="none" style={fill}>
      {specs.map((spec, i) => (
        <Ember
          key={i}
          clock={clock}
          offset={i / count}
          spec={spec}
          unit={unit}
          testID={`arena-ember-count-${i}`}
        />
      ))}
    </View>
  );
}

// ---------------------------------------------------------------------------
// The clash spark
// ---------------------------------------------------------------------------

/**
 * A one-shot spark at the crossing, mounted once per clash (keyed by the
 * clash number), so it plays on mount and then rests invisible.
 */
function ClashSpark({ size, color, testID }: { size: number; color: string; testID: string }) {
  const opacity = useSharedValue(0);
  const scale = useSharedValue(0.3);
  React.useEffect(() => {
    opacity.value = withSequence(
      withDelay(SPARK_DELAY_MS, withTiming(1, { duration: SPARK_IN_MS })),
      withTiming(0, { duration: SPARK_OUT_MS, easing: easing.brandOut }),
    );
    scale.value = withSequence(
      withDelay(SPARK_DELAY_MS, withTiming(0.8, { duration: SPARK_IN_MS })),
      withTiming(1.25, { duration: SPARK_OUT_MS, easing: easing.brandOut }),
    );
  }, [opacity, scale]);
  const style = useAnimatedStyle(() => ({
    opacity: opacity.value,
    transform: [{ scale: scale.value }],
  }));
  // A 30-unit box centred on the 24-unit glyph's crossing (12, 12).
  const box = (size * 30) / 24;
  const inset = (box - size) / 2;
  return (
    <Animated.View
      testID={testID}
      pointerEvents="none"
      style={[{ position: "absolute", left: -inset, top: -inset, width: box, height: box }, style]}
    >
      <Svg width={box} height={box} viewBox="0 0 30 30" stroke={color} strokeWidth={1.5} strokeLinecap="round">
        <Line x1="15" y1="7" x2="15" y2="10" />
        <Line x1="15" y1="20" x2="15" y2="23" />
        <Line x1="7" y1="15" x2="10" y2="15" />
        <Line x1="20" y1="15" x2="23" y2="15" />
      </Svg>
    </Animated.View>
  );
}

// ---------------------------------------------------------------------------
// The icon
// ---------------------------------------------------------------------------

const fill = { position: "absolute" as const, left: 0, top: 0, right: 0, bottom: 0 };

export interface ArenaTabIconProps {
  color: string;
  size?: number;
  /** The Arena tab is the active tab (countable embers hold still). */
  focused?: boolean;
  /** The athlete is live in the Arena. */
  live: boolean;
  /** Pending incoming challenges, as the tab badge counts them. */
  incomingCount: number;
  /**
   * The count is known (the first full read of the pending list landed).
   * Until then a rising count is loading, not arriving: no clash. Defaults
   * to true.
   */
  incomingKnown?: boolean;
}

export function ArenaTabIcon({
  color,
  size = 18,
  focused = false,
  live,
  incomingCount,
  incomingKnown = true,
}: ArenaTabIconProps) {
  const tokens = useThemedTokens();
  const reduceMotion = useReduceMotion();
  const appActive = useAppActive();
  const unit = size / 18;

  const pending = Number.isFinite(incomingCount) ? Math.max(0, Math.floor(incomingCount)) : 0;
  const countEmbers = countableEmbers(pending);
  const showLiveEmbers = live && pending === 0;

  // ---- Blade clash (Moment) -------------------------------------------------
  const spread = useSharedValue(0);
  const [clashes, setClashes] = React.useState(0);
  const reduceRef = React.useRef(reduceMotion);
  reduceRef.current = reduceMotion;
  const activeRef = React.useRef(appActive);
  activeRef.current = appActive;

  const playClash = React.useCallback(() => {
    if (reduceRef.current) return;
    const out = (size * CLASH_SPREAD_UNITS) / 24;
    spread.value = withSequence(
      withTiming(out, { duration: CLASH_SPREAD_MS, easing: easing.brandOut }),
      withTiming(0, { duration: CLASH_SNAP_MS, easing: Easing.out(Easing.back(2)) }),
    );
    setClashes((n) => n + 1);
  }, [size, spread]);

  // Real transitions only: both refs start from the FIRST observed value, so
  // mounting live (or with challenges already pending) plays nothing.
  const prevLiveRef = React.useRef(live);
  React.useEffect(() => {
    const was = prevLiveRef.current;
    prevLiveRef.current = live;
    if (was || !live) return;
    // Only the athlete's own go-live while the app is in front: a restore on
    // launch, foreground or after a match is not a moment.
    if (!activeRef.current || !isAthleteGoLiveFlip()) return;
    void haptics.goLive();
    playClash();
  }, [live, playClash]);

  // The pending count seeds from the first LOADED value (null until the
  // count is known, and again after it stops being known, e.g. sign-out), so
  // old challenges appearing on a slow cold start never clash.
  const prevPendingRef = React.useRef<number | null>(incomingKnown ? pending : null);
  React.useEffect(() => {
    if (!incomingKnown) {
      prevPendingRef.current = null;
      return;
    }
    const was = prevPendingRef.current;
    prevPendingRef.current = pending;
    if (was === null || pending <= was) return;
    if (!activeRef.current) return;
    // Silent: the challenge prompt sheet already fires `challengeArrived`.
    playClash();
  }, [pending, incomingKnown, playClash]);

  const bladeA = useAnimatedStyle(() => ({ transform: [{ translateX: -spread.value }] }));
  const bladeB = useAnimatedStyle(() => ({ transform: [{ translateX: spread.value }] }));

  return (
    <View
      testID="arena-tab-icon"
      pointerEvents="none"
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={{ width: size, height: size, overflow: "visible" }}
    >
      <Animated.View style={[fill, bladeA]}>
        <BladeSvg nodes={SWORDS_BLADE_A} color={color} size={size} testID="arena-blade-a" />
      </Animated.View>
      <Animated.View style={[fill, bladeB]}>
        <BladeSvg nodes={SWORDS_BLADE_B} color={color} size={size} testID="arena-blade-b" />
      </Animated.View>
      {clashes > 0 && !reduceMotion ? (
        <ClashSpark
          key={clashes}
          size={size}
          color={tokens.accentCta}
          testID={`arena-tab-clash-${clashes}`}
        />
      ) : null}
      {countEmbers > 0 ? (
        <CountEmbers
          count={countEmbers}
          unit={unit}
          still={reduceMotion || focused}
          run={appActive}
        />
      ) : showLiveEmbers ? (
        <LiveEmbers unit={unit} still={reduceMotion} run={appActive} />
      ) : null}
    </View>
  );
}

// ---------------------------------------------------------------------------
// Wiring for the tab bar
// ---------------------------------------------------------------------------

export interface ArenaTabSignals {
  live: boolean;
  incomingCount: number;
  incomingKnown: boolean;
}

const ArenaTabSignalsContext = React.createContext<ArenaTabSignals>({
  live: false,
  incomingCount: 0,
  incomingKnown: false,
});

/**
 * Supplied by the tabs layout's bar (`(tabs)/_layout.tsx`), which already
 * reads the Arena stores for the badge, so the icon opens no subscription of
 * its own.
 */
export const ArenaTabSignalsProvider = ArenaTabSignalsContext.Provider;

/** The Arena `tabBarIcon`: the icon fed from `ArenaTabSignalsProvider`. */
export function ArenaTabBarIcon({
  color,
  size,
  focused,
}: {
  color: string;
  size: number;
  focused: boolean;
}) {
  const { live, incomingCount, incomingKnown } = React.useContext(ArenaTabSignalsContext);
  return (
    <ArenaTabIcon
      color={color}
      size={size}
      focused={focused}
      live={live}
      incomingCount={incomingCount}
      incomingKnown={incomingKnown}
    />
  );
}
