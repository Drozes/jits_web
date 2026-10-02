import { ActivityIndicator, Text, View } from "react-native";
import { useRouter } from "expo-router";
import { exitMatchTo } from "@/lib/match-flow/exit-to";
import { useThemedTokens } from "@/lib/theme/use-theme";
import { Button } from "@/components/ui/elo-system/button";

/**
 * Centered spinner used while the wizard is loading match details.
 *
 * ELO design system: surface-tinted page with caps mono status copy.
 */
export function WizardLoading() {
  const tokens = useThemedTokens();
  return (
    <View className="flex-1 items-center justify-center bg-surface gap-3">
      <ActivityIndicator color={tokens.textSecondary} />
      <Text className="font-mono text-[10px] text-ink-3 uppercase tracking-caps-l">
        Loading match...
      </Text>
    </View>
  );
}

/**
 * Error / "not a participant" splash with a caller-supplied escape hatch.
 *
 * ELO design system: hero title in heading caps, muted body, and a
 * Signal Red CTA returning the user to wherever the match came from.
 */
export function WizardError({
  exitHref,
  exitLabel,
  title,
  message,
}: {
  /** Where the escape-hatch cta goes (the Arena, on mobile). */
  exitHref: string;
  /** Copy on the escape-hatch cta. */
  exitLabel: string;
  title: string;
  message?: string;
}) {
  const router = useRouter();
  return (
    <View className="flex-1 items-center justify-center bg-surface px-6 gap-3">
      <Text className="font-heading text-[14px] text-ink uppercase tracking-caps text-center">
        {title}
      </Text>
      {message ? (
        <Text className="text-center font-body text-[13px] text-ink-2">{message}</Text>
      ) : null}
      <Button
        testID="wizard-error-exit"
        label={exitLabel}
        height={44}
        className="mt-2"
        onPress={() => exitMatchTo(router, exitHref)}
      />
    </View>
  );
}
