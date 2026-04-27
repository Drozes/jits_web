import * as React from "react";
import { TextInput, type TextInputProps } from "react-native";
import { cn } from "../../lib/cn";

export interface InputProps extends TextInputProps {
  className?: string;
}

export const Input = React.forwardRef<TextInput, InputProps>(
  ({ className, placeholderTextColor, ...props }, ref) => (
    <TextInput
      ref={ref}
      placeholderTextColor={placeholderTextColor ?? "hsl(220, 9%, 46%)"}
      className={cn(
        "h-10 rounded-md border border-input bg-background px-3 text-sm text-foreground",
        className,
      )}
      {...props}
    />
  ),
);
Input.displayName = "Input";
