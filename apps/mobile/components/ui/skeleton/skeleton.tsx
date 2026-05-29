import * as React from "react";
import { View, type ViewProps } from "react-native";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
  Easing,
  type SharedValue,
} from "react-native-reanimated";
import { cva } from "class-variance-authority";
import { cn } from "@/lib/cn";

// Mirrors live-pill.tsx PULSE_DURATION_MS exactly: the ONLY sanctioned loop
// frequency in the app. Half-period (700ms) drives the opacity breath so a
// full 1.0 -> 0.55 -> 1.0 cycle takes 1400ms, identical to the LIVE pulse.
const PULSE_HALF_DURATION_MS = 700;
const PULSE_MIN_OPACITY = 0.55;

const SkeletonContext = React.createContext<{ opacity: SharedValue<number> } | null>(null);

/**
 * Owns the single shared reanimated value for an entire skeleton tree so the
 * whole skeleton breathes in unison: one opacity-only loop (1.0 -> 0.55 -> 1.0)
 * reusing the blessed LIVE-pulse cadence (1400ms full period). NO shimmer, NO
 * transform, NO color motion — the brand-legal liveness cue, not a gradient
 * sweep (see motionDecision in the spec). Breath is ON by default; pass
 * `pulse={false}` for a fully static tree.
 */
export function SkeletonProvider({
  pulse = true,
  children,
}: {
  pulse?: boolean;
  children?: React.ReactNode;
}) {
  const opacity = useSharedValue(1);

  React.useEffect(() => {
    if (pulse) {
      opacity.value = withRepeat(
        withTiming(PULSE_MIN_OPACITY, {
          duration: PULSE_HALF_DURATION_MS,
          easing: Easing.inOut(Easing.ease),
        }),
        -1,
        true,
      );
    } else {
      opacity.value = 1;
    }
  }, [pulse, opacity]);

  return (
    <SkeletonContext.Provider value={{ opacity }}>
      <View accessibilityLabel="Loading" accessibilityState={{ busy: true }}>
        {children}
      </View>
    </SkeletonContext.Provider>
  );
}

const RADIUS_CLASS = { xs: "rounded-xs", md: "rounded-md", full: "rounded-full" } as const;

const blockVariants = cva("bg-surface-3");

/** One neutral placeholder rect. Consumes the provider opacity; opaque static when no provider. */
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
  const animatedStyle = useAnimatedStyle(() => ({ opacity: ctx?.opacity?.value ?? 1 }));
  return (
    <Animated.View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      className={cn(blockVariants(), RADIUS_CLASS[radius], className)}
      style={[{ width, height }, animatedStyle, style]}
      {...rest}
    />
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
