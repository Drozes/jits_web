/**
 * Hooks for reading the current color scheme and the matching token map.
 *
 * Most components don't need this — they just use semantic Tailwind classes
 * (`bg-background`, `text-foreground`, etc.) which are wired through CSS
 * variables in `tailwind.config.js` and overridden in dark mode by the root
 * `ThemeProvider` (`lib/theme/theme-provider.tsx`).
 *
 * Use `useThemedTokens()` only when you need to pass a color into an RN API
 * that doesn't support className (e.g. `Switch.trackColor`,
 * `BottomSheet.backgroundStyle`, `TextInput.placeholderTextColor`,
 * `ActivityIndicator.color`).
 */
import { useColorScheme } from "nativewind";
import { darkTokens, lightTokens, type ColorTokens } from "../tokens";

export type ColorScheme = "light" | "dark";

/**
 * Returns the resolved color scheme. NativeWind's `useColorScheme` may report
 * `undefined` on the very first render (before Appearance has settled); we
 * default to `"light"` in that case so consumers always get a usable map.
 */
export function useResolvedColorScheme(): ColorScheme {
  const { colorScheme } = useColorScheme();
  return colorScheme === "dark" ? "dark" : "light";
}

/** Returns the runtime token map matching the current color scheme. */
export function useThemedTokens(): ColorTokens {
  return useResolvedColorScheme() === "dark" ? darkTokens : lightTokens;
}
