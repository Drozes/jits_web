import * as React from "react";
import { Text, type TextProps } from "react-native";
import { cn } from "../../lib/cn";

export interface LabelProps extends TextProps {
  className?: string;
}

export const Label = React.forwardRef<Text, LabelProps>(
  ({ className, ...props }, ref) => (
    <Text
      ref={ref}
      className={cn("text-sm font-medium text-foreground", className)}
      {...props}
    />
  ),
);
Label.displayName = "Label";
