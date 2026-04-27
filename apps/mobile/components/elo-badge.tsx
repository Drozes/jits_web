import * as React from "react";
import { Text, View } from "react-native";
import { TrendingUp, TrendingDown } from "lucide-react-native";
import { cn } from "../lib/cn";

/**
 * Returns a tier-based outline class for an ELO rating, ported from
 * apps/web/lib/utils.ts#getEloTierClass. NativeWind ignores opacity modifiers
 * on outline-* classes, so we map to border-* instead.
 *
 * Tier thresholds (mirrors web):
 *   1400+      → cyan   (Elite)
 *   1200-1399  → yellow (Rising)
 *   1000-1199  → gray   (Standard)
 *   <1000      → amber  (Beginner)
 */
export function getEloTierBorderClass(elo: number): string {
  if (elo >= 1400) return "border-cyan-400";
  if (elo >= 1200) return "border-yellow-400";
  if (elo >= 1000) return "border-gray-400";
  return "border-amber-600";
}

type Variant = "display" | "compact" | "stakes";

interface EloBadgeProps {
  elo: number;
  peak?: number;
  delta?: number;
  variant?: Variant;
  className?: string;
}

const containerVariant: Record<Variant, string> = {
  display: "flex-row items-center gap-1",
  compact: "flex-row items-center gap-1",
  stakes: "flex-row items-center gap-1.5",
};

const numberVariant: Record<Variant, string> = {
  display: "text-2xl font-bold tabular-nums text-foreground",
  compact: "text-sm font-bold tabular-nums text-foreground",
  stakes: "text-base font-bold tabular-nums text-foreground",
};

export function EloBadge({ elo, peak, delta, variant = "display", className }: EloBadgeProps) {
  if (variant === "stakes" && delta != null) {
    return (
      <View className={cn("flex-row items-center gap-3", className)}>
        <View className="flex-row items-center gap-1.5 rounded-md bg-success/10 px-2.5 py-1.5">
          <TrendingUp size={16} className="text-success" />
          <Text className="text-sm font-semibold text-success">+{Math.abs(delta)}</Text>
        </View>
        <View className="flex-row items-center gap-1.5 rounded-md bg-destructive/10 px-2.5 py-1.5">
          <TrendingDown size={16} className="text-destructive" />
          <Text className="text-sm font-semibold text-destructive">-{Math.abs(delta)}</Text>
        </View>
      </View>
    );
  }

  return (
    <View className={cn(containerVariant[variant], className)}>
      <Text className={numberVariant[variant]}>{elo}</Text>
      {variant === "display" && peak != null && peak > elo ? (
        <Text className="text-sm font-normal text-muted-foreground">Peak: {peak}</Text>
      ) : null}
      {variant === "compact" && delta != null && delta !== 0 ? (
        <Text
          className={cn(
            "text-xs font-semibold",
            delta > 0 && "text-success",
            delta < 0 && "text-destructive",
          )}
        >
          {delta > 0 ? "+" : ""}
          {delta}
        </Text>
      ) : null}
    </View>
  );
}
