import * as React from "react";
import { View, type ViewProps } from "react-native";
import { cn } from "@/lib/cn";
import { Label } from "./label";

interface MetaTagProps extends ViewProps {
  children: React.ReactNode;
  className?: string;
}

export function MetaTag({ children, className, ...rest }: MetaTagProps) {
  return (
    <View
      className={cn(
        "self-start flex-row items-center px-2 py-1 border border-hairline rounded-xs",
        className,
      )}
      {...rest}
    >
      <Label className="text-ink-2">{children}</Label>
    </View>
  );
}
