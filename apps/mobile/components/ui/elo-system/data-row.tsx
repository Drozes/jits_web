import * as React from "react";
import { View, Text } from "react-native";
import { cn } from "@/lib/cn";

interface DataRowProps {
  label: string;
  value: string | React.ReactNode;
  valueMono?: boolean;
  className?: string;
}

export function DataRow({ label, value, valueMono = true, className }: DataRowProps) {
  const isString = typeof value === "string";
  return (
    <View
      className={cn(
        "flex-row items-center justify-between gap-3",
        className,
      )}
    >
      <Text className="font-mono tabular-nums text-micro text-ink-3 uppercase tracking-caps-l">
        {label}
      </Text>
      {isString ? (
        <Text
          className={cn(
            "text-small text-ink text-right",
            valueMono
              ? "font-mono-medium tabular-nums uppercase tracking-caps-l"
              : "font-body",
          )}
        >
          {value}
        </Text>
      ) : (
        <View>{value}</View>
      )}
    </View>
  );
}
