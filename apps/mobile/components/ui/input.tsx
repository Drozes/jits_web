import * as React from "react";
import { TextInput, type TextInputProps } from "react-native";
import { cn } from "../../lib/cn";
import { useThemedTokens } from "../../lib/theme/use-theme";

export interface InputProps extends TextInputProps {
  className?: string;
}

export const Input = React.forwardRef<TextInput, InputProps>(
  ({ className, placeholderTextColor, ...props }, ref) => {
    const tokens = useThemedTokens();
    return (
      <TextInput
        ref={ref}
        placeholderTextColor={placeholderTextColor ?? tokens.mutedForeground}
        className={cn(
          "h-10 rounded-md border border-input bg-background px-3 text-sm text-foreground",
          className,
        )}
        {...props}
      />
    );
  },
);
Input.displayName = "Input";
