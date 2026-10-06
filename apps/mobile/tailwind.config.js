/** @type {import('tailwindcss').Config} */
//
// Theme tokens for the mobile app. The strategy:
//
//   1. Each semantic token (surface, ink, cta, etc.) is declared in Tailwind's
//      theme as a `var(--token)` reference. Component class names like
//      `bg-surface` therefore compile to `backgroundColor: var(--bg-primary)`.
//   2. A Tailwind base layer plugin sets the LIGHT theme defaults on `:root`.
//   3. The mobile root layout reads `useColorScheme()` from NativeWind and, when
//      the system is in dark mode, applies a `vars()` style object on a top-level
//      View that overrides each `--token` with its dark value. NativeWind's
//      `vars()` propagates the variables to all descendants.
//
// This means individual screens DO NOT need to add `dark:` modifiers to every
// className. They simply use `bg-surface`, `text-ink`, etc., and the
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
// Web `var(--accent-cta)`         → mobile `bg-cta` / `border-cta` (brand red)
// Web `var(--accent-cta-text)`    → mobile `text-cta` (AA-tuned red, see textColor below)
// Web `var(--accent-cta-hover)`   → mobile `bg-cta-hover`
// Web `var(--state-positive)`     → mobile `bg-positive` / `text-positive` / `border-positive`
// Web `var(--state-negative)`     → mobile `bg-negative` / `text-negative` / `border-negative`
// Web `var(--state-neutral)`      → mobile `text-ink-3` (same hex)
// Web `var(--border-hairline)`    → mobile `border-hairline`
// Web `var(--border-hairline-faint)`  → mobile `border-hairline-faint`
// Web `var(--border-hairline-strong)` → mobile `border-hairline-strong`
// Kit `on-media-scrim` (ON_MEDIA.scrim)  → mobile `bg-on-media-scrim` (modal backdrops)
// (mobile only, no web var yet) `--attention` → `text-attention` / `border-attention`,
//   `--attention-rule` → `border-attention-rule`, `--heat-orange` / `--heat-red`
//   → `bg-heat-orange` / `bg-heat-red`
// Letter-spacing: `var(--ls-mark|caps|caps-l|caps-xl)` → `tracking-mark|caps|caps-l|caps-xl`
// Fonts: var(--font-display|heading|body|mono) → `font-display|heading|body|mono`
// (Bold mono: `font-mono-bold`; Medium mono: `font-mono-medium`)
// ============================================================================

const cssVarColors = {
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
  // Accent + state. `cta` is the BRAND red and is used for fills and rules.
  // `text-cta` is deliberately remapped below to `--accent-cta-text`, because
  // the brand red cannot reach 4.5:1 as text on any surface in either theme.
  cta: "var(--accent-cta)",
  "cta-hover": "var(--accent-cta-hover)",
  positive: "var(--state-positive)",
  negative: "var(--state-negative)",
  // (state-neutral === text-tertiary hex; reuse text-ink-3 in components)
  // Borders
  hairline: "var(--border-hairline)",
  "hairline-faint": "var(--border-hairline-faint)",
  "hairline-strong": "var(--border-hairline-strong)",
  // Fixed in both themes: the one backdrop behind every modal and sheet
  // (`bg-on-media-scrim`). Mirrors `ON_MEDIA.scrim` (`onMediaTokens.scrim`, lib/tokens.ts);
  // __tests__/components/ui/sheet-chrome.test.tsx fails if the two drift.
  "on-media-scrim": "rgba(0,0,0,0.55)",
  // Attention (amber): draws, pressure, pending / processing / paused /
  // disputed. `text-attention` / `border-attention` / `bg-attention`, and
  // `border-attention-rule` for rules. Kit: attention, attention-rule.
  attention: "var(--attention)",
  "attention-rule": "var(--attention-rule)",
  // Arena heat only (tab-icon embers, afterglow edge). Fixed in both themes.
  "heat-orange": "var(--heat-orange)",
  "heat-red": "var(--heat-red)",
  // Semantic alias of ink: the unwatched-reel ring (`border-unseen-ring`,
  // specs/matches-tab). Same value as --text-primary in both themes; never red.
  "unseen-ring": "var(--unseen-ring)",
};

// Light theme defaults. Mirrors `lightTokens` in `lib/tokens.ts`.
const lightVars = {
  // ELO (Paddock family). Must stay byte-identical to `lightTokens` in lib/tokens.ts;
  // __tests__/lib/tokens-contrast.test.ts fails the build if the two drift.
  "--bg-primary": "#F8FAFC",
  "--bg-secondary": "#E8EBF0",
  "--bg-elevated": "#DEE2E9",
  "--bg-elevated-hover": "#D2D7E0",
  "--text-primary": "#0D0F14",
  "--text-secondary": "#4B5563",
  "--text-tertiary": "#575C68",
  "--text-on-accent": "#0D0F14",
  "--accent-cta": "#E63946",
  "--accent-cta-text": "#AC2B34",
  "--accent-cta-hover": "#F0556B",
  "--state-positive": "#116A33",
  "--state-negative": "#AC2B34",
  "--state-neutral": "#575C68",
  "--border-hairline": "rgba(13, 15, 20, 0.22)",
  "--border-hairline-faint": "rgba(13, 15, 20, 0.11)",
  "--border-hairline-strong": "rgba(13, 15, 20, 0.34)",
  // Attention + heat (WP7). Same lockstep rule as the block above.
  "--attention": "#92400E",
  "--attention-rule": "rgba(146,64,14,0.6)",
  "--heat-orange": "hsl(25, 95%, 53%)",
  "--heat-red": "#EC6A74",
  // Semantic alias of --text-primary (unseen reel ring).
  "--unseen-ring": "#0D0F14",
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
      // Text-only override. `bg-cta` and `border-cta` keep the brand red
      // (var(--accent-cta), #E63946), while `text-cta` resolves to the
      // AA-tuned red. This keeps the ~18 existing `text-cta` call sites
      // working unchanged and leaves app.json's push accent untouched.
      textColor: {
        cta: "var(--accent-cta-text)",
      },
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
      // ELO type scale (WP5, jits-3eeg.6). Mirrors lib/typography.ts
      // TYPE_SCALE exactly (typography-drift.test.ts): device px, literal on
      // native (not rem). Text steps first, then the pinned display steps.
      // 10px is the floor. Use `text-body`, never `text-[13px]`.
      fontSize: {
        micro: ["10px", { lineHeight: "13px" }],
        caption: ["11px", { lineHeight: "14px" }],
        small: ["12px", { lineHeight: "16px" }],
        body: ["13px", { lineHeight: "17px" }],
        callout: ["14px", { lineHeight: "18px" }],
        subhead: ["16px", { lineHeight: "21px" }],
        title: ["18px", { lineHeight: "22px" }],
        "title-l": ["20px", { lineHeight: "24px" }],
        "title-xl": ["22px", { lineHeight: "26px" }],
        headline: ["24px", { lineHeight: "29px" }],
        "headline-l": ["26px", { lineHeight: "31px" }],
        "headline-xl": ["28px", { lineHeight: "34px" }],
        "headline-2xl": ["30px", { lineHeight: "36px" }],
        "display-36": ["36px", { lineHeight: "40px" }],
        "display-40": ["40px", { lineHeight: "44px" }],
        "display-44": ["44px", { lineHeight: "48px" }],
        "display-48": ["48px", { lineHeight: "53px" }],
        "display-52": ["52px", { lineHeight: "57px" }],
        "display-60": ["60px", { lineHeight: "66px" }],
        "display-64": ["64px", { lineHeight: "70px" }],
        "display-72": ["72px", { lineHeight: "79px" }],
        "display-80": ["80px", { lineHeight: "88px" }],
        "display-88": ["88px", { lineHeight: "97px" }],
        "display-96": ["96px", { lineHeight: "106px" }],
        "display-116": ["116px", { lineHeight: "128px" }],
        "display-240": ["240px", { lineHeight: "264px" }],
      },
      letterSpacing: {
        // ELO tracking scale (em-based on web). RN/Tailwind expects px values
        // for letterSpacing, so we approximate using the 14px body baseline.
        // Mirrors lib/typography.ts TRACKING (typography-drift.test.ts).
        tight: "-0.28px",     // -0.02em @ 14px
        mark: "-0.07px",      // -0.005em @ 14px, wordmark
        normal: "0px",
        loose: "0.56px",      // 0.04em @ 14px
        caps: "1.12px",       // 0.08em @ 14px, display caps
        "caps-l": "1.68px",   // 0.12em @ 14px, section labels
        "caps-xl": "2.52px",  // 0.18em @ 14px, meta strips
        "caps-xxl": "3.36px", // 0.24em @ 14px, smallest caps
        code: "4px",          // one-time code digits (WP5, R3 ST-4)
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
