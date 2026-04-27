import * as React from "react";
import { View, type ViewProps } from "react-native";
import { cn } from "../../lib/cn";

export interface SeparatorProps extends ViewProps {
  orientation?: "horizontal" | "vertical";
  className?: string;
}

export const Separator = React.forwardRef<View, SeparatorProps>(
  ({ orientation = "horizontal", className, ...props }, ref) => (
    <View
      ref={ref}
      className={cn(
        "bg-border",
        orientation === "horizontal" ? "h-px w-full" : "h-full w-px",
        className,
      )}
      {...props}
    />
  ),
);
Separator.displayName = "Separator";
