import { Stack } from "expo-router";
import { useThemedTokens } from "@/lib/theme/use-theme";

/**
 * Stack layout for the session route group. Each screen owns its own header
 * (via the ELO design system `AppHeader`) so we hide the native one and let
 * screens render edge-to-edge below the status bar.
 */
export default function SessionLayout() {
  const tokens = useThemedTokens();

  return (
    <Stack
      screenOptions={{
        headerShown: false,
        presentation: "card",
        contentStyle: { backgroundColor: tokens.bgPrimary },
      }}
    />
  );
}
