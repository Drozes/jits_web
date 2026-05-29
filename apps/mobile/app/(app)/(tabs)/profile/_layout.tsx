import { Stack } from "expo-router";
import { useThemedTokens } from "@/lib/theme/use-theme";

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
