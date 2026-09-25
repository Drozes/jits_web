import { Stack } from "expo-router";
import { useThemedTokens } from "@/lib/theme/use-theme";

// Anchor the tab navigator beneath the pushed detail screens (athlete/[id],
// match/[matchId], video/[id], settings). Deep links / reloads into those routes otherwise land with an
// empty stack and a dead back chevron.
export const unstable_settings = {
  initialRouteName: "(tabs)",
};

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
      {/* A match with no session behind it: where an Arena challenge lands
          both parties. Pushes over the tab bar like every other detail
          screen. */}
      <Stack.Screen name="match/[matchId]" />
      <Stack.Screen name="video/[id]" />
      <Stack.Screen name="settings" />
    </Stack>
  );
}
