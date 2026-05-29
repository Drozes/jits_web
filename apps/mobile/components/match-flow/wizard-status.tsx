import { ActivityIndicator, Pressable, Text, View } from "react-native";
import { useRouter } from "expo-router";
import { useThemedTokens } from "@/lib/theme/use-theme";

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
 * Error / "not a participant" splash with a Back-to-Lobby escape hatch.
 *
 * ELO design system: hero title in heading caps, muted body, and a
 * Signal Red CTA returning the user to the lobby.
 */
export function WizardError({
  sessionId,
  title,
  message,
}: {
  sessionId: string;
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
      <Pressable
        accessibilityRole="button"
        onPress={() => router.replace(`/(app)/session/${sessionId}/lobby`)}
        className="mt-2 bg-cta items-center justify-center py-3 px-5 rounded-sm active:bg-cta-hover"
      >
        <Text className="font-heading text-[13px] text-ink-on-cta uppercase tracking-caps">
          Back to Lobby
        </Text>
      </Pressable>
    </View>
  );
}
