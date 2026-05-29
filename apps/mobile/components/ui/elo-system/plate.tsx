import * as React from "react";
import { View, type ViewProps } from "react-native";
import { cn } from "@/lib/cn";

export type PlateVariant = "default" | "accent" | "live" | "win" | "loss";

interface PlateProps extends ViewProps {
  variant?: PlateVariant;
  children?: React.ReactNode;
  className?: string;
}

const ACCENT_BORDER_CLASS: Record<PlateVariant, string> = {
  default: "border-l-hairline",
  accent: "border-l-cta",
  live: "border-l-positive",
  win: "border-l-positive",
  loss: "border-l-negative",
};

const ACCENT_BORDER_WIDTH: Record<PlateVariant, string> = {
  default: "border-l",
  accent: "border-l-[3px]",
  live: "border-l-[3px]",
  win: "border-l-[3px]",
  loss: "border-l-[3px]",
};

export function Plate({
  variant = "default",
  className,
  children,
  ...rest
}: PlateProps) {
  return (
    <View
      className={cn(
        "bg-surface-3 border border-hairline rounded-md p-4",
        ACCENT_BORDER_WIDTH[variant],
        ACCENT_BORDER_CLASS[variant],
        className,
      )}
      {...rest}
    >
      {children}
    </View>
  );
}
