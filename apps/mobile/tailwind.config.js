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
  "--background": "hsl(220, 20%, 97%)",
  "--foreground": "hsl(222, 47%, 11%)",
  "--card": "hsl(0, 0%, 100%)",
  "--card-foreground": "hsl(222, 47%, 11%)",
  "--popover": "hsl(0, 0%, 100%)",
  "--popover-foreground": "hsl(222, 47%, 11%)",
  "--primary": "hsl(0, 85%, 46%)",
  "--primary-foreground": "hsl(0, 0%, 100%)",
  "--secondary": "hsl(220, 14%, 94%)",
  "--secondary-foreground": "hsl(222, 47%, 11%)",
  "--muted": "hsl(220, 14%, 92%)",
  "--muted-foreground": "hsl(220, 9%, 46%)",
  "--accent": "hsl(0, 85%, 46%)",
  "--accent-foreground": "hsl(0, 0%, 100%)",
  "--destructive": "hsl(0, 84%, 50%)",
  "--destructive-foreground": "hsl(0, 0%, 100%)",
  "--success": "hsl(145, 63%, 37%)",
  "--success-foreground": "hsl(0, 0%, 100%)",
  "--border": "hsl(220, 13%, 91%)",
  "--input": "hsl(220, 13%, 87%)",
  "--ring": "hsl(0, 85%, 46%)",
  "--gold": "hsl(38, 92%, 50%)",
  "--brand-orange": "hsl(25, 95%, 53%)",
  "--deep-red": "hsl(0, 84%, 50%)",
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
        lg: "12px",
        md: "10px",
        sm: "8px",
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
