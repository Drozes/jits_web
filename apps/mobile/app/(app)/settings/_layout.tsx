import { Stack } from "expo-router";
import { useThemedTokens } from "@/lib/theme/use-theme";

/**
 * Settings stack. Each screen renders its own AppHeader (the ELO 56pt header
 * primitive), so the native header stays hidden. The contentStyle tints the
 * stack background with the ELO `bg-primary` surface so push/pop transitions
 * never flash a contrasting surface.
 */
export default function SettingsLayout() {
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
