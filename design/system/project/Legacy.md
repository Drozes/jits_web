# Legacy (retiring, WP4)

The pre-redesign shadcn layer is retired from the mobile app by bead jits-3eeg.5 (WP4), after WP3 landed the unified Button. It was never part of this system: its colors were not kit tokens and were not contrast-gated. `__tests__/components/legacy-shadcn-guard.test.ts` fails if a deleted primitive, a legacy color class or the legacy CSS-variable plumbing comes back.

## Legacy colors

Removed. The legacy keys are gone from `apps/mobile/lib/tokens.ts`, the legacy `cssVarColors` and `lightVars` entries from `tailwind.config.js`, and the legacy variables from `lib/theme/theme-provider.tsx` `buildVars`, so a legacy class (`bg-background`, `text-foreground`, `text-muted-foreground`, `bg-primary`, `bg-destructive`, `border-input` and friends) no longer resolves to a color. One exception, until WP2 merges: `components/ui/switch.tsx` still reads three legacy keys from `useThemedTokens()` (`background`, `primary`, `muted`; no class or CSS variable carries them), and they leave `ColorTokens` when WP2 moves the Switch onto ELO tokens. The table records what each retired key mapped to, for reading old code and the web shadcn layer.

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
| `brandOrange` | `bg-brand-orange` | `hsl(25, 95%, 53%)` (#F97415) | same | `heat-orange` (`heatOrange` / `bg-heat-orange`, the same value, added by WP7) |
| `deepRed` | `bg-deep-red` | `hsl(355, 67%, 47%)` (#C82835) | same | `signal-red` |

**Naming trap.** On mobile `text-primary` was the LEGACY brand red (`--primary`), while web's `--text-primary` is the ink. ELO ink on mobile is `text-ink`. Never write `text-primary`. The same collision exists in web Tailwind, where the shadcn layer still lives.

## Legacy components

| Component | Path | Fate |
|---|---|---|
| `Card` family | `components/ui/card.tsx` | Deleted (WP4); use `Plate` |
| `Input` | `components/ui/input.tsx` | Deleted (WP4; it had no callers). The raw `TextInput`s fold into one ELO form field (WP3/WP5 follow-up) |
| `Label` | `components/ui/label.tsx` | Deleted (WP4) |
| `Separator` | `components/ui/separator.tsx` | Deleted (WP4); a 1px `hairline` view |
| `Avatar` | `components/ui/avatar.tsx` | Deleted (WP4); round, contradicted the square `Avatar32` |
| `Select` | `components/ui/select.tsx` | Deleted (WP4); use `SearchSelect` |
| `Tabs` | `components/ui/tabs.tsx` | Deleted (WP4); use `Chip` rows |
| `OnlineIndicator` | `components/online-indicator.tsx` | Deleted (WP4) |
| `Button` | `components/ui/button.tsx` | Deleted (WP4); every caller is on the unified `Button` (`components/ui/elo-system/button.tsx`, WP3), the update banner last |
| `Badge` | `components/ui/badge.tsx` | Kept, restyled (WP4): the `MetaTag` look (`radius-tag`, 1px border, 10px mono caps) with tones `default` (`hairline-strong`, `ink`), `secondary` (`plate` fill, `ink-2`), `destructive` (`negative`), `success` (`gain-green`, kept for win badges) and `outline` (exactly `MetaTag`). One caller (admin members) |
| `Dialog` | `components/ui/dialog.tsx` | Kept: brand titles since WP1 (Compare Stats) |
| `Sheet` | `components/ui/sheet.tsx` | Kept: the one sheet shell, and home of `useSheetChrome()` / `SheetBackdrop` (WP1) |
| `Switch` | `components/ui/switch.tsx` | Kept: the one app switch (also the face-off "Record from my phone" toggle since WP4, R3 MF-9); neutral track in WP2 |
| `OfflineBanner` | `components/offline-banner.tsx` | Restyled (WP4): `panel` bar, `hairline-strong` bottom edge, mono caps `ink` copy, Reanimated slide on `duration.fast`, still under Reduce Motion |
| Update banner and modal | `components/updates/*` | Restyled (WP4): the banner is a `panel` card with a `hairline-strong` border, `ink` text and a `secondary` RESTART `Button`; the critical modal sits on `void` with `ink` / `ink-2` text and the primary `Button` |

The system-font weight classes (`font-semibold`, `font-medium`, `text-xs` without a brand family) lived in these atoms; React Native cannot synthesize weights from the custom fonts, so they rendered in the system font (R3 TY-5). They left with the deleted files and the restyles.

## Retired brand assets

- The old "E with ascending bars and a gold peak" mark, `apps/web/public/logo.svg` (red `#bf1212` rounded-square ground), is retired. The E·R lettermark replaced it on 2026-06-08.
- The `#bf1212` splash background is retired; the splash is `void` (`#0D0F14`, `app.json:42,97`).
- The app-icon explorations in `design/icon-options/batch1..batch10` are history, not assets.
- The old screen files (`apps/web/public/design/native-screen-inventory.html`, `wireframe.html`) are stale and are not a source.
