import { Text, View } from "react-native";
import { cn } from "@/lib/cn";

interface WizardProgressProps {
  currentIdx: number;
  total: number;
  label: string;
}

/**
 * ELO design system step indicator. Mono caps step counter + label,
 * with a track of 2x12 pips coloured cta for completed/current and
 * hairline-strong for upcoming.
 */
export function WizardProgress({ currentIdx, total, label }: WizardProgressProps) {
  return (
    <View className="gap-3">
      <View className="items-center gap-1">
        <Text className="font-mono text-[10px] text-ink-3 uppercase tracking-caps-xl">
          Step {currentIdx + 1} of {total}
        </Text>
        <Text className="font-heading text-[14px] text-ink uppercase tracking-caps-l">
          {label}
        </Text>
      </View>
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
              "h-1 w-12",
              i <= currentIdx ? "bg-cta" : "bg-hairline-strong",
            )}
          />
        ))}
      </View>
    </View>
  );
}
