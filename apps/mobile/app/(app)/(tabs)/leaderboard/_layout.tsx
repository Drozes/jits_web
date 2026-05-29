import { Stack } from "expo-router";
import { useThemedTokens } from "@/lib/theme/use-theme";

export default function LeaderboardLayout() {
  const tokens = useThemedTokens();

  return (
    <Stack
      screenOptions={{
        headerShown: false,
        presentation: "card",
        headerStyle: { backgroundColor: tokens.bgSecondary },
        headerTintColor: tokens.textPrimary,
        headerTitleStyle: { color: tokens.textPrimary },
      }}
    />
  );
}
