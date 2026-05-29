import { Stack } from "expo-router";
import { useThemedTokens } from "@/lib/theme/use-theme";

export default function AppLayout() {
  const tokens = useThemedTokens();

  return (
    <Stack
      screenOptions={{
        headerShown: false,
        presentation: "card",
        contentStyle: { backgroundColor: tokens.bgPrimary },
        headerStyle: { backgroundColor: tokens.bgSecondary },
        headerTintColor: tokens.textPrimary,
        headerTitleStyle: { color: tokens.textPrimary },
      }}
    >
      <Stack.Screen name="(tabs)" />
      <Stack.Screen name="athlete/[id]" />
      <Stack.Screen name="session/[id]" />
      <Stack.Screen name="settings" />
    </Stack>
  );
}
