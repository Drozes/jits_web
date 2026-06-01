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
//
// ============================================================================
// ELO design system mapping (web semantic ⇄ mobile Tailwind utility)
// ============================================================================
// Web `var(--bg-primary)`         → mobile `bg-surface`
// Web `var(--bg-secondary)`       → mobile `bg-surface-2`
// Web `var(--bg-elevated)`        → mobile `bg-surface-3`
// Web `var(--bg-elevated-hover)`  → mobile `bg-surface-4`
// Web `var(--text-primary)`       → mobile `text-ink`
// Web `var(--text-secondary)`     → mobile `text-ink-2`
// Web `var(--text-tertiary)`      → mobile `text-ink-3`
// Web `var(--text-on-accent)`     → mobile `text-ink-on-cta`
// Web `var(--accent-cta)`         → mobile `bg-cta` / `text-cta` / `border-cta`
// Web `var(--accent-cta-hover)`   → mobile `bg-cta-hover`
// Web `var(--state-positive)`     → mobile `bg-positive` / `text-positive` / `border-positive`
// Web `var(--state-negative)`     → mobile `bg-negative` / `text-negative` / `border-negative`
// Web `var(--state-neutral)`      → mobile `text-ink-3` (same hex)
// Web `var(--border-hairline)`    → mobile `border-hairline`
// Web `var(--border-hairline-faint)`  → mobile `border-hairline-faint`
// Web `var(--border-hairline-strong)` → mobile `border-hairline-strong`
// Letter-spacing: `var(--ls-mark|caps|caps-l|caps-xl)` → `tracking-mark|caps|caps-l|caps-xl`
// Fonts: var(--font-display|heading|body|mono) → `font-display|heading|body|mono`
// (Bold mono: `font-mono-bold`; Medium mono: `font-mono-medium`)
// ============================================================================

const cssVarColors = {
  // ---- Legacy shadcn-style tokens (kept for backwards compatibility) -------
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

  // ---- ELO design system (numbered surface/ink scale, semantic accents) ---
  // Surfaces — darker base → lighter elevated in dark mode, opposite in light.
  surface: "var(--bg-primary)",
  "surface-2": "var(--bg-secondary)",
  "surface-3": "var(--bg-elevated)",
  "surface-4": "var(--bg-elevated-hover)",
  // Text
  ink: "var(--text-primary)",
  "ink-2": "var(--text-secondary)",
  "ink-3": "var(--text-tertiary)",
  "ink-on-cta": "var(--text-on-accent)",
  // Accent + state
  cta: "var(--accent-cta)",
  "cta-hover": "var(--accent-cta-hover)",
  positive: "var(--state-positive)",
  negative: "var(--state-negative)",
  // (state-neutral === text-tertiary hex; reuse text-ink-3 in components)
  // Borders
  hairline: "var(--border-hairline)",
  "hairline-faint": "var(--border-hairline-faint)",
  "hairline-strong": "var(--border-hairline-strong)",
};

// Light theme defaults. Mirrors `lightTokens` in `lib/tokens.ts`.
const lightVars = {
  // Legacy
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
  // ELO (Paddock family)
  "--bg-primary": "#F2F4F7",
  "--bg-secondary": "#E8EBF0",
  "--bg-elevated": "#DEE2E9",
  "--bg-elevated-hover": "#D2D7E0",
  "--text-primary": "#0D0F14",
  "--text-secondary": "#4B5563",
  "--text-tertiary": "#6B7280",
  "--text-on-accent": "#E8EDF2",
  "--accent-cta": "#E63946",
  "--accent-cta-hover": "#C42939",
  "--state-positive": "#15803D",
  "--state-negative": "#E63946",
  "--state-neutral": "#6B7280",
  "--border-hairline": "rgba(13, 15, 20, 0.14)",
  "--border-hairline-faint": "rgba(13, 15, 20, 0.07)",
  "--border-hairline-strong": "rgba(13, 15, 20, 0.25)",
};

module.exports = {
  // Dark mode is driven by the root <View style={vars(...)}> in app/_layout.tsx
  // (via useResolvedColorScheme), not by adding a `dark` class. `darkMode: "class"`
  // is required so NativeWind's setColorScheme() works for the in-app Light/Dark/
  // System toggle and for ThemeProvider's restore() — under "media" those throw.
  // The app uses no `dark:` variants, so the class itself drives nothing visual.
  darkMode: "class",
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  presets: [require("nativewind/preset")],
  theme: {
    extend: {
      colors: cssVarColors,
      borderRadius: {
        // ELO radius scale: sharp corners. lg (8px) is reserved for modals only.
        none: "0",
        xs: "2px",   // input chrome, tight buttons
        sm: "3px",   // CTAs, tags (legacy shadcn uses sm=2; we override to ELO spec)
        md: "4px",   // plates, cards, rating tiles — the default
        lg: "8px",   // modals only
      },
      fontFamily: {
        // RN custom fonts can't synthesize weights — each weight is a separate family.
        display: ["BebasNeue_400Regular"],
        heading: ["DMSans_700Bold"],
        "heading-medium": ["DMSans_500Medium"],
        "heading-regular": ["DMSans_400Regular"],
        body: ["Inter_400Regular"],
        "body-medium": ["Inter_500Medium"],
        mono: ["JetBrainsMono_400Regular"],
        "mono-medium": ["JetBrainsMono_500Medium"],
        "mono-bold": ["JetBrainsMono_700Bold"],
      },
      letterSpacing: {
        // ELO tracking scale (em-based). RN/Tailwind expects px values for
        // letterSpacing, so we approximate using the 14px body baseline.
        tight: "-0.28px",     // -0.02em @ 14px
        mark: "-0.07px",      // -0.005em @ 14px — wordmark
        normal: "0px",
        loose: "0.56px",      // 0.04em @ 14px
        caps: "1.12px",       // 0.08em @ 14px — display caps
        "caps-l": "1.68px",   // 0.12em @ 14px — section labels
        "caps-xl": "2.52px",  // 0.18em @ 14px — meta strips
        "caps-xxl": "3.36px", // 0.24em @ 14px — smallest caps
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
