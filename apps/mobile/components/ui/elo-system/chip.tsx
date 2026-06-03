import * as React from "react";
import { Pressable, Text, View, type PressableProps } from "react-native";
import { cn } from "@/lib/cn";

interface ChipProps extends Omit<PressableProps, "children"> {
  active?: boolean;
  children?: React.ReactNode;
  className?: string;
}

export function Chip({ active = false, className, children, ...rest }: ChipProps) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected: active }}
      hitSlop={{ top: 10, bottom: 10, left: 4, right: 4 }}
      className={cn(
        "flex-row items-center self-start px-3 py-2 border rounded-xs bg-surface-3 active:opacity-70",
        active ? "border-cta" : "border-hairline-strong",
        className,
      )}
      {...rest}
    >
      {active && (
        <View
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
          className="bg-cta mr-2"
          style={{ width: 6, height: 6 }}
        />
      )}
      <Text
        className={cn(
          "font-heading text-[10px] uppercase tracking-caps",
          active ? "text-ink" : "text-ink-2",
        )}
      >
        {children}
      </Text>
    </Pressable>
  );
}
