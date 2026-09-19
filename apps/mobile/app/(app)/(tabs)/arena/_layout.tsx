import { Stack } from "expo-router";
import { useThemedTokens } from "@/lib/theme/use-theme";

// Anchor the Arena index so a reload deeper in this tab keeps a working back
// button instead of stranding on a dead chevron.
export const unstable_settings = {
  initialRouteName: "index",
};

export default function ArenaLayout() {
  const tokens = useThemedTokens();

  return (
    <Stack
      screenOptions={{
        headerShown: false,
        presentation: "card",
        headerStyle: { backgroundColor: tokens.bgPrimary },
        headerTintColor: tokens.textPrimary,
        headerTitleStyle: { color: tokens.textPrimary },
      }}
    />
  );
}
