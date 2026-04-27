import * as React from "react";
import { Text, View } from "react-native";
import { cn } from "@/lib/cn";

interface WizardProgressProps {
  currentIdx: number;
  total: number;
  label: string;
}

/** Native port of `apps/web/app/profile/setup/wizard-progress.tsx`. */
export function WizardProgress({ currentIdx, total, label }: WizardProgressProps) {
  return (
    <View className="gap-2">
      <Text className="text-center text-xs text-muted-foreground">
        Step {currentIdx + 1} of {total} - {label}
      </Text>
      <View
        accessibilityRole="progressbar"
        accessibilityValue={{ min: 1, max: total, now: currentIdx + 1 }}
        accessibilityLabel="Profile setup progress"
        className="flex-row justify-center gap-2"
      >
        {Array.from({ length: total }).map((_, i) => (
          <View
            key={i}
            className={cn(
              "h-2.5 w-2.5 rounded-full",
              i === currentIdx ? "bg-primary" : "bg-muted",
            )}
          />
        ))}
      </View>
    </View>
  );
}
