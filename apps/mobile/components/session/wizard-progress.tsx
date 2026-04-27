import { Text, View } from "react-native";
import { cn } from "@/lib/cn";

interface WizardProgressProps {
  currentIdx: number;
  total: number;
  label: string;
}

/**
 * Generic horizontal-dots progress indicator. Mirrors the web join wizard's
 * progress bar (and the mobile profile-setup wizard-progress component).
 *
 * We have a sibling at `apps/mobile/components/profile-setup/wizard-progress.tsx`
 * with the same layout but a fixed accessibility label; this version takes
 * the label as a prop so we can reuse for the session join wizard.
 */
export function WizardProgress({ currentIdx, total, label }: WizardProgressProps) {
  return (
    <View className="gap-2">
      <Text className="text-center text-xs text-muted-foreground">
        Step {currentIdx + 1} of {total} - {label}
      </Text>
      <View
        accessibilityRole="progressbar"
        accessibilityValue={{ min: 1, max: total, now: currentIdx + 1 }}
        accessibilityLabel="Join session progress"
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
