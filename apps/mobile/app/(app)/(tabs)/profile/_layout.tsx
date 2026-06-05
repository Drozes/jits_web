import { Stack } from "expo-router";
import { useThemedTokens } from "@/lib/theme/use-theme";

// Anchor the profile index beneath profile/stats so a reload while on the stats
// screen keeps a working back button instead of stranding on a dead chevron.
export const unstable_settings = {
  initialRouteName: "index",
};

export default function ProfileLayout() {
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
