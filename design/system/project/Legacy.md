# Legacy (retiring, WP4)

The pre-redesign shadcn layer still ships in the mobile app as "compatibility shims" (`__tests__/lib/tokens-contrast.test.ts:15-17`). It is NOT part of this system: its colors are not kit tokens, they are not contrast-gated, and new code must not use them. Bead jits-3eeg.5 (WP4) deletes it after WP3 lands the unified Button.

## Legacy colors

Defined in `apps/mobile/lib/tokens.ts` (light l.69-93, dark l.116-140), mirrored as CSS variables in `tailwind.config.js:119-142` (light) and `lib/theme/theme-provider.tsx:21-44` (dark). Hex is computed from the HSL.

| Key | Tailwind | Light | Dark | Use instead |
|---|---|---|---|---|
| `background` | `bg-background` | `hsl(216, 24%, 96%)` (#F2F4F7) | `hsl(223, 21%, 6%)` (#0C0E13) | `void` |
| `foreground` | `text-foreground` | `hsl(223, 21%, 6%)` | `hsl(210, 28%, 93%)` (#E8EDF2) | `ink` |
| `card`, `popover` | `bg-card` | `hsl(218, 20%, 89%)` (#DDE1E9) | `hsl(222, 16%, 12%)` (#1A1D23) | `plate` |
| `cardForeground`, `popoverForeground` | `text-card-foreground` | `hsl(223, 21%, 6%)` | `hsl(210, 28%, 93%)` | `ink` |
| `primary`, `accent`, `destructive`, `ring` | `bg-primary`, `text-primary` | `hsl(355, 78%, 56%)` (#E63746) | same | `signal-red` (fills), `negative` (text) |
| `primaryForeground`, `accentForeground`, `destructiveForeground` | `text-primary-foreground` | `hsl(210, 28%, 93%)` (#E8EDF2) | same | `on-signal` (white on red is 3.54:1) |
| `secondary` | `bg-secondary` | `hsl(217, 21%, 93%)` (#E9ECF1) | `hsl(225, 17%, 9%)` (#13151B) | `panel` |
| `secondaryForeground` | `text-secondary-foreground` | `hsl(223, 21%, 6%)` | `hsl(210, 28%, 93%)` | `ink` |
| `muted` | `bg-muted` | `hsl(219, 18%, 85%)` (#D2D7E0) | `hsl(223, 16%, 17%)` (#242832) | `plate-bright` |
| `mutedForeground` | `text-muted-foreground` | `hsl(215, 14%, 34%)` (#4B5563) | `hsl(218, 11%, 65%)` (#9CA3B0) | `ink-2` or `ink-3` |
| `success` | `bg-success` | `hsl(142, 72%, 29%)` (#157F3C, pre-AA) | `hsl(142, 71%, 45%)` (#21C45D) | `gain-green`, only for gains and live |
| `successForeground` | `text-success-foreground` | `hsl(0, 0%, 100%)` | same | (none) |
| `border` | `border-border` | `hsl(218, 12%, 83%)` (#CED2D9) | `hsl(222, 13%, 18%)` (#282C34) | `hairline` |
| `input` | `border-input` | `hsl(218, 14%, 79%)` (#C2C7D1) | `hsl(222, 13%, 21%)` (#2F333D) | `hairline-strong` |
| `gold` | `bg-gold` | `hsl(38, 92%, 50%)` (#F59F0A) | same | `attention` |
| `brandOrange` | `bg-brand-orange` | `hsl(25, 95%, 53%)` (#F97415) | same | `heat-orange` (WP7 added `heatOrange` / `bg-heat-orange` with this value and moved the Arena heat onto it; no ELO code reads `brandOrange` now, so WP4 can delete it) |
| `deepRed` | `bg-deep-red` | `hsl(355, 67%, 47%)` (#C82835) | same | `signal-red` |

**Naming trap.** On mobile `text-primary` is the LEGACY brand red (`--primary`), while web's `--text-primary` is the ink. ELO ink on mobile is `text-ink`. Never write `text-primary` for data. The same collision exists in web Tailwind.

## Legacy components

| Component | Path | Real users | Fate |
|---|---|---|---|
| `Card` family | `components/ui/card.tsx` | 0 (also `rounded-lg` on a non-modal) | Delete; use `Plate` |
| `Input` | `components/ui/input.tsx` | 0 (raw `TextInput` is used 13 times) | Re-skin to ELO tokens as the form field input |
| `Label` | `components/ui/label.tsx` | 0 | Delete |
| `Separator` | `components/ui/separator.tsx` | 0 | Delete; a 1px `hairline` view |
| `Avatar` | `components/ui/avatar.tsx` | 0 (round, contradicts the square `Avatar32`) | Delete |
| `Select` | `components/ui/select.tsx` | 0 | Delete; use `SearchSelect` |
| `Tabs` | `components/ui/tabs.tsx` | 0 (the `<Tabs>` hits are expo-router) | Delete; use `Chip` rows |
| `OnlineIndicator` | `components/online-indicator.tsx` | 0 | Delete |
| `Badge` | `components/ui/badge.tsx` | 1 (admin members), `rounded-lg`, system font | Restyle onto `MetaTag` / `OutcomeTag`, keep the `success` variant API |
| `Dialog` | `components/ui/dialog.tsx` | 1 (Compare Stats), system-font title | Brand titles (WP1) |
| `Sheet` | `components/ui/sheet.tsx` | 1 (Share Profile), `tokens.card`, 15px gorhom radius | The one sheet shell (WP1) |
| `Button` | `components/ui/button.tsx` | Admin screens, update banner, critical update modal | Replaced by the unified `Button` (WP3) |
| `Switch` | `components/ui/switch.tsx` | 3 (settings, admin flags), red `primary` track | Neutral track (WP2) |
| `OfflineBanner` | `components/offline-banner.tsx` | Root layout | `panel` + `hairline-strong`, mono caps `ink` (WP4) |
| Update banner and modal | `components/updates/*` | Root layout | ELO surfaces and the unified Button (WP4) |

Weight classes `font-semibold` and `font-medium` appear only in these atoms; React Native cannot synthesize weights from the custom fonts, so they render in the system font.

## Retired brand assets

- The old "E with ascending bars and a gold peak" mark, `apps/web/public/logo.svg` (red `#bf1212` rounded-square ground), is retired. The E·R lettermark replaced it on 2026-06-08.
- The `#bf1212` splash background is retired; the splash is `void` (`#0D0F14`, `app.json:42,97`).
- The app-icon explorations in `design/icon-options/batch1..batch10` are history, not assets.
- The old screen files (`apps/web/public/design/native-screen-inventory.html`, `wireframe.html`) are stale and are not a source.
