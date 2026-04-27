import * as React from "react";
import { ActivityIndicator, Text, View } from "react-native";
import { useRouter } from "expo-router";
import { Button } from "@/components/ui/button";
import { useThemedTokens } from "@/lib/theme/use-theme";

/**
 * Centered spinner used while the wizard is loading match details.
 */
export function WizardLoading() {
  const tokens = useThemedTokens();
  return (
    <View className="flex-1 items-center justify-center bg-background">
      <ActivityIndicator color={tokens.primary} />
    </View>
  );
}

/**
 * Error / "not a participant" splash with a Back-to-Lobby escape hatch.
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
    <View className="flex-1 items-center justify-center bg-background px-6">
      <Text className="text-base font-semibold text-foreground">{title}</Text>
      {message ? (
        <Text className="mt-2 text-center text-sm text-muted-foreground">{message}</Text>
      ) : null}
      <Button className="mt-4" onPress={() => router.replace(`/(app)/session/${sessionId}/lobby`)}>
        Back to Lobby
      </Button>
    </View>
  );
}
