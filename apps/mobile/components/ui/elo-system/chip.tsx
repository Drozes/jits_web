import * as React from "react";
import { Pressable, Text, type PressableProps } from "react-native";
import { cn } from "@/lib/cn";
import { selectionSurface } from "./selection";

interface ChipProps extends Omit<PressableProps, "children"> {
  active?: boolean;
  /** Dynamic Type cap for the label, where the chip sits in a fixed-height bar. */
  maxFontSizeMultiplier?: number;
  children?: React.ReactNode;
  className?: string;
}

/**
 * Filter and segment pill. Selected = `plate-bright` fill, `hairline-strong`
 * edge, `ink` label (the one selected-state treatment, `./selection`); never
 * a red border or red square (WP2, R3 ST-2). The label's step from `ink-2`
 * to `ink` stands in for the check glyph on this compact control (DESIGN.md
 * Open decision 14).
 */
export function Chip({ active = false, className, children, maxFontSizeMultiplier, ...rest }: ChipProps) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected: active }}
      hitSlop={{ top: 10, bottom: 10, left: 4, right: 4 }}
      className={cn(
        "flex-row items-center self-start px-3 py-2 border rounded-xs active:opacity-70",
        selectionSurface(active),
        className,
      )}
      {...rest}
    >
      <Text
        maxFontSizeMultiplier={maxFontSizeMultiplier}
        className={cn(
          "font-heading text-micro uppercase tracking-caps",
          active ? "text-ink" : "text-ink-2",
        )}
      >
        {children}
      </Text>
    </Pressable>
  );
}
