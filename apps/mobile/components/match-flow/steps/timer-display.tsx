import * as React from "react";
import { Text, View } from "react-native";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/cn";

interface TimerDisplayProps {
  formatted: string;
  remaining: number;
  paused: boolean;
  matchType: "ranked" | "casual";
}

/**
 * Big timer + match-type badge + paused indicator. Mirrors the visual
 * layout of the web fighter-live-step's hero block.
 */
export function TimerDisplay({ formatted, remaining, paused, matchType }: TimerDisplayProps) {
  return (
    <View className="items-center gap-2">
      <Text className="text-xs uppercase tracking-widest text-muted-foreground">
        Match in progress
      </Text>
      <Text
        className={cn(
          "font-mono text-7xl font-bold tracking-tight tabular-nums",
          remaining === 0 ? "text-destructive" : "text-amber-500",
        )}
      >
        {formatted}
      </Text>
      <Badge variant={matchType === "ranked" ? "default" : "secondary"}>
        {matchType === "ranked" ? "Ranked" : "Casual"}
      </Badge>
      {paused ? <Text className="text-sm font-medium text-amber-500">Paused</Text> : null}
    </View>
  );
}
