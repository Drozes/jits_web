import * as React from "react";
import { View, Text, type ViewProps } from "react-native";
import { cn } from "@/lib/cn";

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
      <Text className="font-mono text-[10px] text-ink-2 uppercase tracking-caps-l">
        {children}
      </Text>
    </View>
  );
}
