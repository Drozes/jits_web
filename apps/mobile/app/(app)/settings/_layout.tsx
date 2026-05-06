import { Stack } from "expo-router";
import { useThemedTokens } from "@/lib/theme/use-theme";

export default function SettingsLayout() {
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
    />
  );
}
