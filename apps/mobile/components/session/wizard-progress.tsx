import { Text, View } from "react-native";
import { cn } from "@/lib/cn";

interface WizardProgressProps {
  currentIdx: number;
  total: number;
  label: string;
}

/**
 * Step progress indicator for the session join wizard. ELO design system
 * styling: meta-strip with a "STEP N / T" mono label and a row of hairline
 * bars that fill with the CTA color as the athlete advances.
 *
 * A sibling at `components/profile-setup/wizard-progress.tsx` covers the
 * profile-setup wizard with a similar layout; this one takes the label as
 * a prop so both flows can reuse the same component shape.
 */
export function WizardProgress({ currentIdx, total, label }: WizardProgressProps) {
  return (
    <View className="gap-2">
      <View className="flex-row items-center justify-between">
        <Text className="font-mono-bold text-[10px] text-ink-3 uppercase tracking-caps-xl">
          Step {currentIdx + 1} / {total}
        </Text>
        <Text className="font-mono text-[10px] text-ink-2 uppercase tracking-caps-l">
          {label}
        </Text>
      </View>
      <View
        accessibilityRole="progressbar"
        accessibilityValue={{ min: 1, max: total, now: currentIdx + 1 }}
        accessibilityLabel="Join session progress"
        className="flex-row gap-1"
      >
        {Array.from({ length: total }).map((_, i) => (
          <View
            key={i}
            className={cn(
              "h-[3px] flex-1 rounded-none",
              i <= currentIdx ? "bg-cta" : "bg-surface-4",
            )}
          />
        ))}
      </View>
    </View>
  );
}
