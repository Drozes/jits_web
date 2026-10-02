import * as React from "react";
import { View, type LayoutChangeEvent, type ViewProps } from "react-native";
import Animated, {
  cancelAnimation,
  makeMutable,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
  Easing,
  type SharedValue,
} from "react-native-reanimated";
import { cva } from "class-variance-authority";
import { cn } from "@/lib/cn";
import { duration, useAppActive, useReduceMotion } from "@/lib/motion";

/**
 * Skeleton shimmer (Motion Rule registry, Ambient tier): ONE module-level
 * clock (0 to 1, `duration.shimmer` 1400ms, linear, repeating) drives a faint
 * highlight band across every skeleton bar in the app, so all bars stay in
 * phase and the whole thing costs one animation. The clock runs only while at
 * least one shimmering `SkeletonProvider` is mounted with the app in the
 * foreground; Reduce Motion leaves plain static bars.
 */
let clock: SharedValue<number> | null = null;
let holders = 0;

function shimmerClock(): SharedValue<number> {
  if (!clock) {
    const m = makeMutable(0) as unknown;
    // The Reanimated jest mock returns the raw number; give tests a holder.
    clock = (typeof m === "object" && m !== null ? m : { value: 0 }) as SharedValue<number>;
  }
  return clock;
}

function acquireShimmer(): () => void {
  holders += 1;
  if (holders === 1) {
    const c = shimmerClock();
    c.value = 0;
    c.value = withRepeat(
      withTiming(1, { duration: duration.shimmer, easing: Easing.linear }),
      -1,
      false,
    );
  }
  return () => {
    holders -= 1;
    if (holders === 0 && clock) {
      cancelAnimation(clock);
      clock.value = 0;
    }
  };
}

/** Tests only: how many providers hold the shimmer clock. */
export function __shimmerHoldersForTests(): number {
  return holders;
}

/**
 * The band's width as a share of the bar, and its opacity. The band is `ink`
 * at a low opacity: one step further in the theme's lift direction than the
 * `plate-bright` bar (lighter in dark, darker in light), since there is no
 * surface tier above the bar.
 */
const BAND_FRACTION = 0.4;
const BAND_OPACITY = 0.08;

const SkeletonContext = React.createContext<{ shimmer: boolean } | null>(null);

/**
 * Wraps a skeleton tree and turns its shimmer on. `pulse` (the prop's name
 * from the old opacity breath, kept for callers) defaults to true; pass
 * `pulse={false}` for a fully static tree. Every provider shares the one
 * module-level clock above.
 */
export function SkeletonProvider({
  pulse: shimmer = true,
  children,
}: {
  pulse?: boolean;
  children?: React.ReactNode;
}) {
  const reduceMotion = useReduceMotion();
  const appActive = useAppActive();
  const running = shimmer && !reduceMotion && appActive;

  React.useEffect(() => {
    if (!running) return undefined;
    return acquireShimmer();
  }, [running]);

  const value = React.useMemo(() => ({ shimmer: shimmer && !reduceMotion }), [shimmer, reduceMotion]);

  return (
    <SkeletonContext.Provider value={value}>
      <View accessibilityLabel="Loading" accessibilityState={{ busy: true }}>
        {children}
      </View>
    </SkeletonContext.Provider>
  );
}

/**
 * The highlight band inside one bar, positioned from the shared clock. Its
 * width is a static share of the bar; only `translateX` animates, so no
 * layout property changes per frame. The bar's width is measured once (and
 * again only if the bar resizes) into a shared value the transform reads.
 */
function ShimmerBand() {
  const width = useSharedValue(0);
  const progress = shimmerClock();
  const onLayout = React.useCallback(
    (e: LayoutChangeEvent) => {
      width.value = e.nativeEvent.layout.width;
    },
    [width],
  );
  const style = useAnimatedStyle(() => {
    const band = width.value * BAND_FRACTION;
    return {
      transform: [{ translateX: -band + progress.value * (width.value + band) }],
    };
  });
  return (
    <View
      pointerEvents="none"
      onLayout={onLayout}
      style={{ position: "absolute", top: 0, right: 0, bottom: 0, left: 0 }}
    >
      <Animated.View
        testID="skeleton-shimmer"
        className="bg-ink"
        style={[
          {
            position: "absolute",
            top: 0,
            bottom: 0,
            left: 0,
            width: `${BAND_FRACTION * 100}%`,
            opacity: BAND_OPACITY,
          },
          style,
        ]}
      />
    </View>
  );
}

const RADIUS_CLASS = { xs: "rounded-xs", md: "rounded-md", full: "rounded-full" } as const;

/**
 * Bars are `plate-bright` (`bg-surface-4`), one tier above the `plate`
 * (`bg-surface-3`) of the plates and rows that host them (`SkeletonPlate`,
 * `SkeletonRankRow`, `SkeletonParticipantRow`), so they read at rest and
 * under Reduce Motion, not only while the band crosses them (kit K2,
 * jits-3eeg.7).
 */
const blockVariants = cva("bg-surface-4");

/** One neutral placeholder rect. Shimmers inside a shimmering provider; static otherwise. */
export function SkeletonBlock({
  width,
  height,
  radius = "md",
  className,
  style,
  ...rest
}: {
  width?: number | `${number}%`;
  height?: number;
  radius?: "xs" | "md" | "full";
  className?: string;
} & Omit<ViewProps, "style"> & { style?: ViewProps["style"] }) {
  const ctx = React.useContext(SkeletonContext);
  return (
    <View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      className={cn(blockVariants(), RADIUS_CLASS[radius], "overflow-hidden", className)}
      style={[{ width, height }, style]}
      {...rest}
    >
      {ctx?.shimmer ? <ShimmerBand /> : null}
    </View>
  );
}

/** Stacked SkeletonBlocks with a narrowed last line. */
export function SkeletonText({
  lines = 1,
  lastLineWidth = "60%",
  lineHeight = 12,
  gap = 6,
  className,
}: {
  lines?: number;
  lastLineWidth?: `${number}%`;
  lineHeight?: number;
  gap?: number;
  className?: string;
}) {
  return (
    <View className={className} style={{ gap }}>
      {Array.from({ length: lines }).map((_, i) => (
        <SkeletonBlock
          key={i}
          height={lineHeight}
          width={lines > 1 && i === lines - 1 ? lastLineWidth : "100%"}
          radius="xs"
        />
      ))}
    </View>
  );
}

/** Square-cornered placeholder for an avatar slot — app avatars are sharp (rounded-md / rounded-xs), never circular. */
export function SkeletonAvatar({
  size = 32,
  radius = "md",
  className,
}: {
  size?: number;
  radius?: "xs" | "md";
  className?: string;
}) {
  return <SkeletonBlock width={size} height={size} radius={radius} className={className} />;
}

const PLATE_ACCENT: Record<"default" | "accent" | "live", string> = {
  default: "border-l border-l-hairline",
  accent: "border-l-[3px] border-l-cta",
  live: "border-l-[3px] border-l-positive",
};

/** Container mirroring elo-system/plate.tsx 1:1. */
export function SkeletonPlate({
  variant = "default",
  className,
  children,
  ...rest
}: {
  variant?: "default" | "accent" | "live";
  className?: string;
  children?: React.ReactNode;
} & ViewProps) {
  return (
    <View
      className={cn(
        "bg-surface-3 border border-hairline rounded-md p-4",
        PLATE_ACCENT[variant],
        className,
      )}
      {...rest}
    >
      {children}
    </View>
  );
}

/** Mirrors rank-row.tsx geometry (rank-row renders no avatar). */
export function SkeletonRankRow() {
  return (
    <View className="flex-row items-center gap-3 bg-surface-3 px-4 py-3 border-l-[3px] border-l-transparent">
      <SkeletonBlock width={36} height={16} radius="xs" />
      <View className="flex-1 min-w-0" style={{ gap: 4 }}>
        <SkeletonBlock width="55%" height={15} radius="xs" />
        <SkeletonBlock width="35%" height={11} radius="xs" />
      </View>
      <View className="items-end" style={{ gap: 4 }}>
        <SkeletonBlock width={64} height={24} radius="xs" />
        <SkeletonBlock width={40} height={18} radius="xs" />
      </View>
    </View>
  );
}

/** Mirrors participant-row.tsx geometry. */
export function SkeletonParticipantRow() {
  return (
    <View className="flex-row items-center gap-3 bg-surface-3 border border-hairline-faint rounded-xs px-4 py-3">
      <View className="flex-1 min-w-0" style={{ gap: 4 }}>
        <SkeletonBlock width="60%" height={12} radius="xs" />
        <SkeletonBlock width="40%" height={12} radius="xs" />
      </View>
      <SkeletonBlock width={44} height={18} radius="xs" />
    </View>
  );
}
