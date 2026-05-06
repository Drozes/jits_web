/** @type {import('tailwindcss').Config} */
//
// Theme tokens for the mobile app. The strategy:
//
//   1. Each semantic token (background, foreground, primary, etc.) is declared
//      in Tailwind's theme as a `var(--token)` reference. Component class names
//      like `bg-background` therefore compile to `backgroundColor: var(--background)`.
//   2. A Tailwind base layer plugin sets the LIGHT theme defaults on `:root`.
//   3. The mobile root layout reads `useColorScheme()` from NativeWind and, when
//      the system is in dark mode, applies a `vars()` style object on a top-level
//      View that overrides each `--token` with its dark value. NativeWind's
//      `vars()` propagates the variables to all descendants.
//
// This means individual screens DO NOT need to add `dark:` modifiers to every
// className. They simply use `bg-background`, `text-foreground`, etc., and the
// app automatically follows the system theme (or any future user override).
//
// For the small set of RN APIs that cannot consume className (e.g. `Switch.trackColor`,
// `BottomSheet.backgroundStyle`, `TextInput.placeholderTextColor`), call sites
// import `useThemedTokens()` from `lib/theme/use-theme.ts` to get the right
// token map at runtime.

const cssVarColors = {
  background: "var(--background)",
  foreground: "var(--foreground)",
  card: {
    DEFAULT: "var(--card)",
    foreground: "var(--card-foreground)",
  },
  popover: {
    DEFAULT: "var(--popover)",
    foreground: "var(--popover-foreground)",
  },
  primary: {
    DEFAULT: "var(--primary)",
    foreground: "var(--primary-foreground)",
  },
  secondary: {
    DEFAULT: "var(--secondary)",
    foreground: "var(--secondary-foreground)",
  },
  muted: {
    DEFAULT: "var(--muted)",
    foreground: "var(--muted-foreground)",
  },
  accent: {
    DEFAULT: "var(--accent)",
    foreground: "var(--accent-foreground)",
  },
  destructive: {
    DEFAULT: "var(--destructive)",
    foreground: "var(--destructive-foreground)",
  },
  success: {
    DEFAULT: "var(--success)",
    foreground: "var(--success-foreground)",
  },
  border: "var(--border)",
  input: "var(--input)",
  ring: "var(--ring)",
  gold: "var(--gold)",
  "brand-orange": "var(--brand-orange)",
  "deep-red": "var(--deep-red)",
};

// Light theme defaults. Mirrors `lightTokens` in `lib/tokens.ts`.
const lightVars = {
  "--background": "hsl(216, 24%, 96%)",
  "--foreground": "hsl(223, 21%, 6%)",
  "--card": "hsl(218, 20%, 89%)",
  "--card-foreground": "hsl(223, 21%, 6%)",
  "--popover": "hsl(218, 20%, 89%)",
  "--popover-foreground": "hsl(223, 21%, 6%)",
  "--primary": "hsl(355, 78%, 56%)",
  "--primary-foreground": "hsl(210, 28%, 93%)",
  "--secondary": "hsl(217, 21%, 93%)",
  "--secondary-foreground": "hsl(223, 21%, 6%)",
  "--muted": "hsl(219, 18%, 85%)",
  "--muted-foreground": "hsl(215, 14%, 34%)",
  "--accent": "hsl(355, 78%, 56%)",
  "--accent-foreground": "hsl(210, 28%, 93%)",
  "--destructive": "hsl(355, 78%, 56%)",
  "--destructive-foreground": "hsl(210, 28%, 93%)",
  "--success": "hsl(142, 72%, 29%)",
  "--success-foreground": "hsl(0, 0%, 100%)",
  "--border": "hsl(218, 12%, 83%)",
  "--input": "hsl(218, 14%, 79%)",
  "--ring": "hsl(355, 78%, 56%)",
  "--gold": "hsl(38, 92%, 50%)",
  "--brand-orange": "hsl(25, 95%, 53%)",
  "--deep-red": "hsl(355, 67%, 47%)",
};

module.exports = {
  // Dark mode is driven by the root <View style={vars(...)}> in app/_layout.tsx,
  // not by adding a `dark` class. The `darkMode: "media"` setting also keeps
  // NativeWind's `dark:` variant working for the rare component that wants to
  // override per-class.
  darkMode: "media",
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  presets: [require("nativewind/preset")],
  theme: {
    extend: {
      colors: cssVarColors,
      borderRadius: {
        lg: "8px",
        md: "4px",
        sm: "2px",
      },
    },
  },
  plugins: [
    ({ addBase }) =>
      addBase({
        ":root": lightVars,
      }),
  ],
};
