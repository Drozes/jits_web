import * as React from "react";
import { View, Text } from "react-native";
import { cn } from "@/lib/cn";
import { useAmber } from "@/components/match-detail/use-amber";
import { haptics } from "@/lib/motion";
import { TYPE_SCALE, numeralTracking, type DisplayStep } from "@/lib/typography";
import { RollingNumber, usePlayOnce } from "./rolling-number";

type EloTileSize = "hero" | "large" | "medium" | "small";

/** Border tone for the after tile: gain, loss or draw. Never Signal Red CTA. */
export type EloTileTone = "positive" | "negative" | "amber";

const SIZE_STEP: Record<EloTileSize, DisplayStep> = {
  hero: "display-96",
  large: "display-64",
  medium: "display-44",
  small: "display-36",
};

/** The tile number size in px, from its display step. */
const SIZE_PX: Record<EloTileSize, number> = {
  hero: TYPE_SCALE[SIZE_STEP.hero].fontSize,
  large: TYPE_SCALE[SIZE_STEP.large].fontSize,
  medium: TYPE_SCALE[SIZE_STEP.medium].fontSize,
  small: TYPE_SCALE[SIZE_STEP.small].fontSize,
};

interface EloTileProps {
  /** Mono caps label above the number. Optional: Home's hero tile has none. */
  label?: string;
  value?: number | string;
  size?: EloTileSize;
  accent?: boolean;
  /** Render the 3px Signal Red bottom accent bar (canonical hero ELO tile). */
  accentBar?: boolean;
  before?: string | number;
  after?: string | number;
  /** Before/after mode only: border tone of the after tile (overrides accent). */
  tone?: EloTileTone;
  /**
   * Single-value mode only: a mono meta line under the number, such as
   * Home's record "14W · 6L · 1D".
   */
  meta?: string;
  /** Accessibility label for the meta line (read instead of its glyphs). */
  metaLabel?: string;
  /**
   * Single-value mode only: hold the meta line's height while `meta` is not
   * known yet (Home's record waits on the summary), so the tile does not grow
   * when it lands. The placeholder is blank and hidden from accessibility.
   */
  reserveMeta?: boolean;
  /**
   * Before/after mode only: identifies the result, so the roll and its
   * haptic play once per result (persisted across remounts and restarts).
   * Without it the tile is static and silent.
   */
  playKey?: string;
  className?: string;
}

interface SingleTileProps {
  label?: string;
  value: string | number;
  size: EloTileSize;
  accent?: boolean;
  accentBar?: boolean;
  /** Before/after pair: share the row equally and shrink the number to fit. */
  compact?: boolean;
  borderClass?: string;
  /** Accessibility label for the number (the final value while it rolls). */
  valueLabel?: string;
  /** Replaces the number Text (the after tile's odometer roll). */
  valueNode?: React.ReactNode;
  valueTestID?: string;
  meta?: string;
  metaLabel?: string;
  reserveMeta?: boolean;
}

/** The tile number's text style at a size (no margin: see SingleTile). */
function numberStyle(size: EloTileSize) {
  const px = SIZE_PX[size];
  return {
    fontSize: px,
    // RN crops/centers the glyph tightly when lineHeight == fontSize; give
    // ~10% breathing room so the hero number isn't vertically clipped.
    lineHeight: px * 1.1,
    letterSpacing: numeralTracking(px),
    fontVariant: ["tabular-nums" as const],
  };
}

/** The meta line's box: 18 line height plus 4 above and 4 below. */
const META_STYLE = {
  lineHeight: 18,
  marginTop: 4,
  marginBottom: 4,
  fontVariant: ["tabular-nums" as const],
};

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
  valueNode,
  meta,
  metaLabel,
  reserveMeta,
}: SingleTileProps) {
  const hasLabel = !!label;
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
      {hasLabel ? (
        <Text
          className="font-mono-bold tabular-nums text-micro text-ink-3 uppercase tracking-caps-xl"
          numberOfLines={compact ? 1 : undefined}
        >
          {label}
        </Text>
      ) : null}
      {valueNode ? (
        <View style={{ alignSelf: "stretch", alignItems: "center", marginTop: hasLabel ? 8 : 0 }}>{valueNode}</View>
      ) : (
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
            letterSpacing: numeralTracking(SIZE_PX[size]),
            marginTop: hasLabel ? 8 : 0,
            fontVariant: ["tabular-nums"],
          }}
        >
          {value}
        </Text>
      )}
      {meta ? (
        <Text
          testID="elo-tile-meta"
          accessibilityLabel={metaLabel}
          // P-Home draws the record in #9CA3AF, which is ink-2 (textSecondary).
          className="font-mono-bold tabular-nums text-callout text-ink-2 uppercase tracking-caps"
          style={META_STYLE}
        >
          {meta}
        </Text>
      ) : reserveMeta ? (
        <View
          testID="elo-tile-meta-placeholder"
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
          style={{
            height: META_STYLE.lineHeight,
            marginTop: META_STYLE.marginTop,
            marginBottom: META_STYLE.marginBottom,
          }}
        />
      ) : null}
      {accentBar ? (
        <View className="absolute left-0 right-0 bottom-0 h-[3px] bg-cta" />
      ) : null}
    </View>
  );
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
  playKey,
  className,
}: Required<Pick<EloTileProps, "size" | "before" | "after">> &
  Pick<EloTileProps, "label" | "accent" | "tone" | "playKey" | "className">) {
  const start = typeof before === "number" ? before : Number(before);
  const end = typeof after === "number" ? after : Number(after);
  const numeric = Number.isFinite(start) && Number.isFinite(end) && before !== "" && after !== "";
  // Only with a playKey: a tile that cannot tell one result from another
  // never animates (it could replay on every mount).
  const play = usePlayOnce(playKey, playKey != null && numeric && start !== end);
  // Only a gain buzzes (Motion Rule): nothing on a loss or a draw tile.
  const gain = numeric && end > start && tone !== "amber";
  const afterProps: SingleTileProps = {
    label,
    value: after,
    size,
    compact: true,
    accent,
    borderClass: tone && tone !== "amber" ? TONE_BORDER[tone] : undefined,
    valueLabel: String(after),
    valueTestID: "elo-tile-after-value",
    valueNode: numeric ? (
      <RollingNumber
        from={start}
        to={end}
        play={play}
        onLanded={gain ? () => void haptics.ratingGain() : undefined}
        testID="elo-tile-after-value"
        accessibilityLabel={String(after)}
        className="font-mono-bold text-ink"
        style={numberStyle(size)}
        fit
        staticTextProps={{ numberOfLines: 1, adjustsFontSizeToFit: true, minimumFontScale: 0.6 }}
      />
    ) : undefined,
  };
  return (
    <View className={cn("flex-row items-center gap-3 self-stretch", className)}>
      <SingleTile label={label} value={before} size={size} compact />
      <Text className="font-mono tabular-nums text-ink-3 text-headline-xl">→</Text>
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
  meta,
  metaLabel,
  reserveMeta,
  playKey,
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
        playKey={playKey}
        className={className}
      />
    );
  }
  return (
    <View className={className}>
      <SingleTile
        label={label}
        value={value ?? ""}
        size={size}
        accent={accent}
        accentBar={accentBar}
        meta={meta}
        metaLabel={metaLabel}
        reserveMeta={reserveMeta}
      />
    </View>
  );
}
