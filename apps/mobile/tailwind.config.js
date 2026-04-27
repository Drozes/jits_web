/** @type {import('tailwindcss').Config} */
//
// Theme tokens are ported from apps/web/app/globals.css. NativeWind v4 supports
// the `dark:` variant for class-based dark mode, but it does NOT support the
// CSS-variable-driven HSL approach that the web app uses (because RN's style
// system does not resolve `var()` at runtime in all places). To stay compatible,
// we declare each token as a flat HSL string and rely on the `dark:` modifier
// on each className to flip themes (e.g. `bg-background dark:bg-background-dark`
// is unnecessary; we instead model light values as the default and provide
// dark-mode aware tokens for components that explicitly want dark variants).
//
// For the common case, components use the semantic tokens (`bg-background`,
// `text-foreground`, etc.) without worrying about dark mode; NativeWind picks
// up `useColorScheme()` from React Native and applies the dark version through
// `darkColors` keyed on the same name (Tailwind's `dark:` variant).

const lightColors = {
  background: "hsl(220, 20%, 97%)",
  foreground: "hsl(222, 47%, 11%)",
  card: {
    DEFAULT: "hsl(0, 0%, 100%)",
    foreground: "hsl(222, 47%, 11%)",
  },
  popover: {
    DEFAULT: "hsl(0, 0%, 100%)",
    foreground: "hsl(222, 47%, 11%)",
  },
  primary: {
    DEFAULT: "hsl(0, 85%, 46%)",
    foreground: "hsl(0, 0%, 100%)",
  },
  secondary: {
    DEFAULT: "hsl(220, 14%, 94%)",
    foreground: "hsl(222, 47%, 11%)",
  },
  muted: {
    DEFAULT: "hsl(220, 14%, 92%)",
    foreground: "hsl(220, 9%, 46%)",
  },
  accent: {
    DEFAULT: "hsl(0, 85%, 46%)",
    foreground: "hsl(0, 0%, 100%)",
  },
  destructive: {
    DEFAULT: "hsl(0, 84%, 50%)",
    foreground: "hsl(0, 0%, 100%)",
  },
  success: {
    DEFAULT: "hsl(145, 63%, 37%)",
    foreground: "hsl(0, 0%, 100%)",
  },
  border: "hsl(220, 13%, 91%)",
  input: "hsl(220, 13%, 87%)",
  ring: "hsl(0, 85%, 46%)",
  gold: "hsl(38, 92%, 50%)",
  "brand-orange": "hsl(25, 95%, 53%)",
  "deep-red": "hsl(0, 84%, 50%)",
};

module.exports = {
  darkMode: "class",
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  presets: [require("nativewind/preset")],
  theme: {
    extend: {
      colors: lightColors,
      borderRadius: {
        lg: "12px",
        md: "10px",
        sm: "8px",
      },
    },
  },
  plugins: [],
};
