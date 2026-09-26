import * as React from "react";
import { AccessibilityInfo, View, Text } from "react-native";
import * as Haptics from "expo-haptics";
import { cn } from "@/lib/cn";
import { useAmber } from "@/components/match-detail/use-amber";

type EloTileSize = "hero" | "large" | "medium" | "small";

/** Border tone for the after tile: gain, loss or draw. Never Signal Red CTA. */
export type EloTileTone = "positive" | "negative" | "amber";

const SIZE_PX: Record<EloTileSize, number> = {
  hero: 96,
  large: 64,
  medium: 44,
  small: 36,
};

/** The sanctioned brand rating tick. */
export const RATING_TICK_MS = 480;

interface EloTileProps {
  label: string;
  value?: number | string;
  size?: EloTileSize;
  accent?: boolean;
  /** Render the 3px Signal Red bottom accent bar (canonical hero ELO tile). */
  accentBar?: boolean;
  before?: string | number;
  after?: string | number;
  /** Before/after mode only: border tone of the after tile (overrides accent). */
  tone?: EloTileTone;
  className?: string;
}

interface SingleTileProps {
  label: string;
  value: string | number;
  size: EloTileSize;
  accent?: boolean;
  accentBar?: boolean;
  /** Before/after pair: share the row equally and shrink the number to fit. */
  compact?: boolean;
  borderClass?: string;
  /** Accessibility label for the number (the final value while it ticks). */
  valueLabel?: string;
  valueTestID?: string;
}

function SingleTile({
  label,
  value,
  size,
  accent,
  accentBar,
  compact,
  borderClass,
  valueLabel,
  valueTestID,
}: SingleTileProps) {
  return (
    <View
      className={cn(
        "bg-surface-3 border rounded-md py-4 items-center",
        // A pair of 4-digit ratings at 64px overflowed a phone-width row
        // (jits-v6ri): in the pair each tile takes half the row instead.
        compact ? "flex-1 px-3" : "px-5 min-w-[120px]",
        accentBar && "overflow-hidden",
        borderClass ?? (accent ? "border-cta" : "border-hairline"),
      )}
    >
      <Text
        className="font-mono-bold text-[10px] text-ink-3 uppercase tracking-caps-xl"
        numberOfLines={compact ? 1 : undefined}
      >
        {label}
      </Text>
      <Text
        testID={valueTestID}
        accessibilityLabel={valueLabel}
        className="font-mono-bold text-ink"
        numberOfLines={compact ? 1 : undefined}
        adjustsFontSizeToFit={compact || undefined}
        minimumFontScale={compact ? 0.6 : undefined}
        style={{
          fontSize: SIZE_PX[size],
          // RN crops/centers the glyph tightly when lineHeight == fontSize; give
          // ~10% breathing room so the hero number isn't vertically clipped.
          lineHeight: SIZE_PX[size] * 1.1,
          letterSpacing: -SIZE_PX[size] * 0.04,
          marginTop: 8,
          fontVariant: ["tabular-nums"],
        }}
      >
        {value}
      </Text>
      {accentBar ? (
        <View className="absolute left-0 right-0 bottom-0 h-[3px] bg-cta" />
      ) : null}
    </View>
  );
}

function easeOutCubic(t: number): number {
  return 1 - Math.pow(1 - t, 3);
}

/**
 * The 480ms rating tick: counts from `from` to `to` once per mount, in
 * integer steps with an ease-out curve, then fires one light haptic. With
 * reduce motion on it jumps straight to `to` (the haptic still lands, it is
 * not motion). A non-numeric pair, or a later prop change, never animates:
 * a change mid-tick jumps to the new value and lands (one haptic, never two),
 * and a change after landing just jumps.
 */
export function useRatingTick(from: string | number, to: string | number): string | number {
  const start = typeof from === "number" ? from : Number(from);
  const end = typeof to === "number" ? to : Number(to);
  const numeric = Number.isFinite(start) && Number.isFinite(end) && from !== "" && to !== "";
  const [shown, setShown] = React.useState<string | number>(numeric ? start : to);
  // Set only when the tick lands, so an effect torn down mid-tick (a dev
  // StrictMode double run) replays it rather than skipping it.
  const landedRef = React.useRef(false);
  // Set once frames are actually running (after the async reduce-motion
  // read), so only a real mid-tick change takes the jump-and-land path.
  const tickingRef = React.useRef(false);

  React.useEffect(() => {
    if (!numeric || landedRef.current) {
      setShown(to);
      return;
    }
    let cancelled = false;
    let frame: ReturnType<typeof requestAnimationFrame> | null = null;
    const land = () => {
      if (cancelled) return;
      landedRef.current = true;
      tickingRef.current = false;
      setShown(end);
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => undefined);
    };
    if (tickingRef.current) {
      // The pair changed mid-tick: never restart from `start`.
      land();
      return;
    }
    AccessibilityInfo.isReduceMotionEnabled()
      .catch(() => false)
      .then((reduce) => {
        if (cancelled) return;
        if (reduce || start === end) {
          land();
          return;
        }
        const t0 = Date.now();
        tickingRef.current = true;
        const step = () => {
          if (cancelled) return;
          const t = Math.min(1, (Date.now() - t0) / RATING_TICK_MS);
          if (t >= 1) {
            land();
            return;
          }
          setShown(Math.round(start + (end - start) * easeOutCubic(t)));
          frame = requestAnimationFrame(step);
        };
        frame = requestAnimationFrame(step);
      });
    return () => {
      cancelled = true;
      if (frame != null) cancelAnimationFrame(frame);
    };
    // Keyed on the values: a changed pair after the tick jumps, never replays.
  }, [numeric, start, end, to]);

  return shown;
}

/** Amber lives behind a hook, so only a draw tile mounts it. */
function AmberAfterTile(props: SingleTileProps) {
  const amber = useAmber();
  return <SingleTile {...props} borderClass={amber.border} />;
}

const TONE_BORDER: Record<Exclude<EloTileTone, "amber">, string> = {
  positive: "border-positive",
  negative: "border-negative",
};

function BeforeAfter({
  label,
  size,
  accent,
  before,
  after,
  tone,
  className,
}: Required<Pick<EloTileProps, "label" | "size" | "before" | "after">> &
  Pick<EloTileProps, "accent" | "tone" | "className">) {
  const shown = useRatingTick(before, after);
  const afterProps: SingleTileProps = {
    label,
    value: shown,
    size,
    compact: true,
    accent,
    borderClass: tone && tone !== "amber" ? TONE_BORDER[tone] : undefined,
    valueLabel: String(after),
    valueTestID: "elo-tile-after-value",
  };
  return (
    <View className={cn("flex-row items-center gap-3 self-stretch", className)}>
      <SingleTile label={label} value={before} size={size} compact />
      <Text className="font-mono text-ink-3 text-[28px]">→</Text>
      {tone === "amber" ? <AmberAfterTile {...afterProps} /> : <SingleTile {...afterProps} />}
    </View>
  );
}

export function EloTile({
  label,
  value,
  size = "large",
  accent,
  accentBar,
  before,
  after,
  tone,
  className,
}: EloTileProps) {
  if (before !== undefined && after !== undefined) {
    return (
      <BeforeAfter
        label={label}
        size={size}
        accent={accent}
        before={before}
        after={after}
        tone={tone}
        className={className}
      />
    );
  }
  return (
    <View className={className}>
      <SingleTile label={label} value={value ?? ""} size={size} accent={accent} accentBar={accentBar} />
    </View>
  );
}
