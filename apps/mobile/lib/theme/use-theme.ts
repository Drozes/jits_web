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
import AsyncStorage from "@react-native-async-storage/async-storage";
import { darkTokens, lightTokens, type ColorTokens } from "../tokens";

export type ColorScheme = "light" | "dark";
export type ThemePreference = "light" | "dark" | "system";

const THEME_STORAGE_KEY = "elo-rated-theme-preference";

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

/**
 * Manages the user's theme preference (light/dark/system) with AsyncStorage
 * persistence. Calls NativeWind's `setColorScheme` to apply the choice.
 */
export function useThemePreference() {
  const { colorScheme, setColorScheme } = useColorScheme();
  const resolved: ColorScheme = colorScheme === "dark" ? "dark" : "light";

  const setPreference = async (pref: ThemePreference) => {
    setColorScheme(pref);
    await AsyncStorage.setItem(THEME_STORAGE_KEY, pref);
  };

  return { resolved, setPreference };
}

/**
 * Restores the persisted theme preference on app launch. Call once from the
 * root layout or ThemeProvider.
 */
export function useRestoreThemePreference() {
  const { setColorScheme } = useColorScheme();

  const restore = async () => {
    const stored = await AsyncStorage.getItem(THEME_STORAGE_KEY);
    if (stored === "light" || stored === "dark" || stored === "system") {
      setColorScheme(stored);
    }
  };

  return { restore };
}
