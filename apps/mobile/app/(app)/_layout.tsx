import { Stack } from "expo-router";
import { useThemedTokens } from "@/lib/theme/use-theme";

export default function AppLayout() {
  const tokens = useThemedTokens();

  return (
    <Stack
      screenOptions={{
        headerShown: false,
        presentation: "card",
        headerStyle: { backgroundColor: tokens.background },
        headerTintColor: tokens.foreground,
        headerTitleStyle: { color: tokens.foreground },
      }}
    >
      <Stack.Screen name="(tabs)" />
      <Stack.Screen name="athlete/[id]" />
      <Stack.Screen name="session/[id]" />
      <Stack.Screen name="settings" />
    </Stack>
  );
}
