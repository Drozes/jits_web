# ELO RATED Design System

The ELO RATED design system spans both apps in the monorepo: [apps/web/](apps/web/) (Next.js 16 + Tailwind) and [apps/mobile/](apps/mobile/) (Expo SDK 54 + NativeWind v4 + hand-written native primitives). Tokens, color rules, typography, and interaction patterns are unified across platforms; primitive implementations differ. The mobile app mirrors the same tokens and primitives via NativeWind so the two platforms render the same surface, hierarchy, and type scale.

**Canonical token source:** [apps/web/app/design-system/tokens.css](apps/web/app/design-system/tokens.css). Treat this file as the source of truth; mobile tokens in [apps/mobile/lib/tokens.ts](apps/mobile/lib/tokens.ts) are the RN mirror.

## Brand Identity

- **App name:** ELO RATED.
- **Bundle ID:** `com.elorated.mobile` (iOS + Android).
- **URL scheme:** `elorated://`.
- **Domain:** `elorated.com`.
- **Category:** mobile-first PWA + native iOS/Android app for BJJ competitor matchmaking and ELO rating.
- **Feel:** premium sports tech (think Strava, Whoop, MotoGP timing screens). Focused, competitive, modern, data-forward.
- **Dark mode is the default** for gym environments. Light mode is fully supported on both platforms via the same semantic tokens.
- **Brand assets:** [apps/web/public/logo.svg](apps/web/public/logo.svg) (geometric E mark with rising-bar accent). Mobile icons are rendered from the same mark at 1024x1024 in [apps/mobile/assets/](apps/mobile/assets/). Splash background is `#bf1212`.
- **Reference docs:** the original brand style guide and HTML component sketches live in `outside_assets/Jits Arena SharePoint/Brand/` (off-repo design source).

## Color System

The palette is built on two intentions:

1. **Visual hierarchy is built from layered background surfaces, never from drop shadows.** Each tier is a flat color shift. This is enforced: there are no `box-shadow` tokens.
2. **Brand color (Signal Red) is reserved for CTAs and brand moments only.** It never decorates data.

### Layered surfaces

Dark mode (Void family, the default):

| Token | Hex | Purpose |
|---|---|---|
| `--bg-primary` (Void) | `#0D0F14` | Page background |
| `--bg-secondary` (Panel) | `#13151B` | Sticky chrome (header, nav), section dividers |
| `--bg-elevated` (Plate) | `#1A1D24` | Cards, plates, the primary content surface |
| `--bg-elevated-hover` (Plate Bright) | `#242832` | Hover/pressed state on a Plate |

Light mode (Paddock family, surfaces darken as they elevate):

| Token | Hex | Purpose |
|---|---|---|
| `--bg-primary` (Paddock) | `#F2F4F7` | Page background |
| `--bg-secondary` (Paddock Panel) | `#E8EBF0` | Sticky chrome |
| `--bg-elevated` (Paddock Plate) | `#DEE2E9` | Cards, plates |
| `--bg-elevated-hover` (Paddock Plate Bright) | `#D2D7E0` | Hover/pressed |

### Accent and state

| Token | Hex | Purpose | Do | Don't |
|---|---|---|---|---|
| `--accent-cta` (Signal Red) | `#E63946` | Primary buttons, brand wordmark, single highlight per surface | One CTA per screen | Use on data values, decorative chrome |
| `--accent-cta-hover` | `#F0556B` dark, `#C42939` light | Hover/pressed CTA | | |
| `--state-positive` (Gain Green) | `#22C55E` dark, `#15803D` light | Wins, positive ELO delta, "live" rail | Rating increases, win pills | Generic "success" feedback |
| `--state-negative` | `#E63946` | Losses, negative ELO delta, destructive actions | Loss pills, delete confirm | Anything brand-decorative |
| `--state-neutral` (Data Gray) | `#6B7280` | Draws, neutral pressure score, metadata | Draw pills, pressure label | Active states |

### Text

| Token | Hex (dark) | Hex (light) | Purpose |
|---|---|---|---|
| `--text-primary` (Terminal White) | `#E8EDF2` | `#0D0F14` | Default body, all data values |
| `--text-secondary` | `#9CA3AF` | `#4B5563` | Subtitles, secondary copy |
| `--text-tertiary` | `#6B7280` | `#6B7280` | Metadata, helper text, inactive nav |
| `--text-on-accent` | `#E8EDF2` | `#E8EDF2` | Text on Signal Red CTAs |

### Hairlines

Borders are rendered as `--border-hairline`, `--border-hairline-faint`, and `--border-hairline-strong` (alpha tints of foreground). No 2px borders. Definition lives in [apps/web/app/design-system/tokens.css](apps/web/app/design-system/tokens.css) and is mirrored in [apps/mobile/lib/tokens.ts](apps/mobile/lib/tokens.ts).

## Typography

The system uses four purpose-bound fonts. Each has one job; do not cross-assign.

| Font | CSS var | Tailwind class | Role |
|---|---|---|---|
| Bebas Neue 400 | `--font-display` | `font-display` | Wordmarks, hero numbers, display headings. All-caps, line-height 0.85, tight tracking. |
| DM Sans 400/500/700 | `--font-heading` | `font-heading` | Section headings, UI labels, button text. Uppercase labels use `tracking-caps`+. |
| Inter 400/500 | `--font-body` | `font-body` | Body prose, descriptions, longer copy. |
| JetBrains Mono 400/500/700 | `--font-mono` | `font-mono` | ALL numeric data: ELO, deltas, ranks, weights, timers. Always `tabular-nums`. |

**Web loading:** [apps/web/app/layout.tsx](apps/web/app/layout.tsx) via `next/font/google`, four fonts exposed as CSS variables on `<body>`. **Mobile loading:** [apps/mobile/app/_layout.tsx](apps/mobile/app/_layout.tsx) via `expo-google-fonts/*` and `useFonts`. **Mobile Tailwind mapping:** [apps/mobile/tailwind.config.js](apps/mobile/tailwind.config.js) declares `font-display`, `font-heading`, `font-heading-medium`, `font-heading-regular`, `font-body`, `font-body-medium`, `font-mono`, `font-mono-medium`, `font-mono-bold`.

**Letter-spacing scale:** `tracking-tight`, `tracking-mark` (wordmarks), `tracking-normal`, `tracking-loose`, `tracking-caps`, `tracking-caps-l`, `tracking-caps-xl`, `tracking-caps-xxl` (em-based, used on uppercase labels).

## Radius and Spacing

- **Radius:** `--radius-none` (0), `--radius-xs` (2px), `--radius-sm` (3px), `--radius-md` (4px, default), `--radius-lg` (8px, modals only). Avatars stay circular. There are no soft 12-16px corners anywhere.
- **Spacing:** 8px base unit, 4px micro-step. Tokens `--space-1` through `--space-48`.
- **Z-index ladder:** base 1, elevated 10, sticky 100, overlay 1000, modal 1100, toast 1200, tooltip 1300.

## Motion

- **Durations:** `--duration-instant` 100ms (reactive feedback), `--duration-fast` 240ms, `--duration-base` 480ms (rating tick), `--duration-slow` 720ms.
- **Easing:** `cubic-bezier(0.22, 1, 0.36, 1)` (ease-out, no bounce).
- **Only auto-animated moments:** rating tick (480ms), LIVE pulse (1400ms loop). Everything else is reactive to hover/press.
- **Mobile haptics:** `useHaptics()` in [apps/mobile/lib/match-flow/use-haptics.ts](apps/mobile/lib/match-flow/use-haptics.ts) exposes `matchStart`, `matchEnd`, `resultRecorded`, `error`, `timeWarning` via `expo-haptics`.
- **Wake lock (mobile):** the live match step keeps the screen awake via `expo-keep-awake`.

## ELO Primitive Library

The brand-native primitives live under `elo-system/`. Both platforms expose the same set.

### Web ([apps/web/components/ui/elo-system/](apps/web/components/ui/elo-system/))

| Primitive | Purpose |
|---|---|
| `Plate` | Card surface with optional left-border accent. Variants: `default`, `accent`, `live`, `win`, `loss`. The standard content container. |
| `EloTile` | ELO rating display with before/after progression. Sizes: hero (96px), large (64px), medium (44px), small (36px). Mono numerics. |
| `RankRow` | Ladder entry: rank, avatar, name, ELO, delta. Highlights current user with a band; leader gets a left-border accent. |
| `ParticipantRow` | Roster/lobby entry with status state. |
| `Wordmark` | "ELO RATED" wordmark in Bebas Neue at hero/lg/md/sm sizes. |
| `MetaTag` | Uppercase mono label pill, hairline border, `--radius-xs`. |
| `Chip` | Tappable filter/category pill. |
| `LivePill` | Pulsing green status indicator for live state. |
| `DeltaNumber` | Signed mono number (`+24`, `-12`) with state coloring. |
| `OutcomeTag` | Win/loss/draw badge. |
| `Avatar32` | 32px avatar with mono initials fallback on a Plate surface. |
| `DataRow` | Two-column key/value row with hairline divider. |

### Mobile ([apps/mobile/components/ui/elo-system/](apps/mobile/components/ui/elo-system/))

Identical export surface, implemented with NativeWind classes that resolve to the same token values. The shared Tailwind class names used across both platforms:

- Surfaces: `bg-surface`, `bg-surface-2`, `bg-surface-3`, `bg-surface-4`.
- Text: `text-ink`, `text-ink-2`, `text-ink-3`, `text-ink-on-cta`.
- Accent / state: `bg-cta`, `bg-cta-hover`, `text-positive`, `text-negative`.
- Borders: `border-hairline`, `border-hairline-faint`, `border-hairline-strong`.

### Mobile primitives still in [apps/mobile/components/ui/](apps/mobile/components/ui/)

Hand-written shadcn-equivalent atoms remain for form and overlay needs that ELO primitives don't cover: `avatar`, `badge` (with custom `success` variant), `button`, `card`, `dialog`, `input`, `label`, `select`, `separator`, `sheet` (gorhom bottom sheet wrapper), `switch`, `tabs`, `toast` (react-native-toast-message). Use these for inputs and overlays; reach for ELO primitives for content surfaces.

### Web shadcn primitives ([apps/web/components/ui/](apps/web/components/ui/))

Same role: form and overlay atoms only. `avatar`, `badge`, `button`, `card`, `checkbox`, `dialog`, `dropdown-menu`, `input`, `label`, `select`, `separator`, `sheet`, `sonner`, `switch`, `tabs`. Managed by `npx shadcn@latest add <component>`; do not edit directly. The custom `badge` `success` variant is the one exception.

## Domain Components

**Cards / sections (web in [apps/web/components/domain/](apps/web/components/domain/), mobile in topical dirs under [apps/mobile/components/](apps/mobile/components/)):**

- `MatchCard`: match result with opponent, outcome tag, ELO delta, optional match-type label ("Ranked" / "Casual").
- `SessionCard` / `ActiveSessionCard`: scheduled or live session with gym, time, RSVP state.
- `GymCard`: gym name, manager flag, member count, next session.
- `ProfileHeader` / `ProfileQuickStats`: identity strip plus quick-stat row.
- `CompetitorHeader` (mobile, [apps/mobile/components/athlete/competitor-header.tsx](apps/mobile/components/athlete/competitor-header.tsx)): replaces the old `AthleteCard` for profile views. Avatar on Plate, 72px Bebas ELO, win/loss/draw stats in surface-3 columns.
- `HeadToHeadCard`: dual-athlete face-off with Plate variant and tone-colored stat columns.
- `StatOverview`: 2x2 grid of headline stats (ELO, rank, record, streak).
- `CompareStatsModal`: side-by-side athlete comparison. Weight rendered in kg.
- `RecentActivitySection`: filterable activity feed with chip filters.

**Notifications / presence:**

- `NotificationBell` + `NotificationPanel`: badge in header, drawer panel.
- `OnlineIndicator`: green presence dot with surface-3 ring.
- `LobbyActiveIndicator` (web): pulsing dot for active lobby.
- `OfflineBanner` (mobile): top-of-screen offline state.
- `ErrorBoundary` (mobile): root error boundary with retry + sign-out, forwards to Sentry.

**Sheets:**

- `ChallengeSheet`, `ChallengeResponseSheet` (web, hidden flow).
- `ShareProfileSheet`: native share or clipboard fallback.
- `CreateSessionSheet` / `EditGymSheet` (mobile): gym-manager controls via gorhom bottom sheet.

**Match flow (mobile, [apps/mobile/components/match-flow/](apps/mobile/components/match-flow/)):** the wizard plus the 8 step components (`wait`, `weight`, `ready`, `live`, `end`, `result`, `confirm`, `summary`) plus `CameraOverlay` (REC pill in `--state-negative`, hairline-strong viewfinder), `UploadProgressBanner`, and `QueueStatusBanner`. All steps render on surface-3 Plates with ELO primitives.

## Layout Shell

### Web ([apps/web/components/layout/](apps/web/components/layout/))

- `AppHeader`: sticky top bar at 14px height with safe-area inset. Grid: 32px back button, centered DM Sans title, right-side action slot. `--bg-secondary` background, `--border-hairline` bottom.
- `BottomNavBar`: fixed bottom, 4 tabs (Home, Gyms, Rankings, Profile), lucide-react icons at 18px (active) / 17.5px (inactive). Active tab gets a 2px `--accent-cta` top border. Hidden on immersive routes (match, lobby, setup wizard).
- `PageContainer`: max-width md (28rem), padding + safe-area bottom, `--bg-primary` with `bg-gradient-subtle` overlay.
- Bootstraps mounted in [apps/web/app/(app)/layout.tsx](apps/web/app/(app)/layout.tsx): `global-notifications-provider`, `online-presence-bootstrap`, `lobby-presence-bootstrap`, `push-registration-bootstrap`, `deployment-check-bootstrap`.

### Mobile

No dedicated `layout/` directory. The root [apps/mobile/app/_layout.tsx](apps/mobile/app/_layout.tsx) mounts: `<ErrorBoundary>` -> `<ThemeProvider>` -> `<AuthProvider>` -> `<OfflineBanner>` -> push-registration + online-presence bootstraps. The tab bar lives in [apps/mobile/app/(app)/(tabs)/_layout.tsx](apps/mobile/app/(app)/(tabs)/_layout.tsx) and uses `lucide-react-native` icons themed via `useThemedTokens()`. Stack screens (`athlete/[id]`, `session/[id]`, `settings`) push on top of the tabs.

## Theming

### Web

CSS variables on `:root` (dark default) with `[data-theme="light"]` override block. All primitives reference variables; no Tailwind color utilities like `bg-red-500`. Definition in [apps/web/app/design-system/tokens.css](apps/web/app/design-system/tokens.css).

### Mobile

NativeWind v4 powers Tailwind classes on RN. Theming flow:

1. Two token maps (`lightTokens`, `darkTokens`) sharing one `ColorTokens` type live in [apps/mobile/lib/tokens.ts](apps/mobile/lib/tokens.ts). Both contain the same key set: Void/Panel/Plate/Plate Bright surfaces, ink tiers, CTA and state colors, hairlines.
2. [apps/mobile/tailwind.config.js](apps/mobile/tailwind.config.js) declares semantic tokens (`bg-surface`, `bg-surface-3`, `text-ink`, `text-positive`, `border-hairline`, etc.) that resolve to `var(--<token>)`. Light values are seeded on `:root` via an `addBase` plugin. `darkMode` is `"media"`.
3. `<ThemeProvider>` ([apps/mobile/lib/theme/theme-provider.tsx](apps/mobile/lib/theme/theme-provider.tsx)) wraps the app and applies `vars()` overrides driven by `useColorScheme()`. The root `View` carries the active token map as inline style.
4. For RN APIs that don't accept `className` (RN `Switch`, gorhom's `BottomSheet`), components call `useThemedTokens()` to read the runtime token map.

Result: web and mobile share the same semantic class names and the same color values, with platform-correct dark-mode handling. No `dark:` modifiers are needed on individual components; the swap happens at the provider.

## Brand Design Rules

These rules are non-negotiable and are enforced by the token system:

1. **No drop shadows.** Hierarchy comes from background-color shifts (Void to Panel to Plate to Plate Bright), not elevation.
2. **Sharp corners.** Default radius is 4px. Modals can stretch to 8px. Avatars stay circular. Nothing else uses soft corners.
3. **One primary CTA per surface.** Signal Red buttons are limited to one per screen.
4. **No decorative color.** Signal Red is for CTAs only. Gain Green is for rating increases and live state only. Amber is reserved for draws and pressure score.
5. **Minimal motion.** Only the rating tick (480ms) and the LIVE pulse (1400ms loop) animate without user input. All other transitions are reactive (100ms hover/focus).
6. **All numeric data is mono with `tabular-nums`.** ELO, deltas, ranks, weights, timers. Never use the body font for numbers.
7. **Mono labels in caps with letter-spacing.** Use `tracking-caps`+ on small uppercase metadata.
8. **Weight is in kilograms.** Display unit is `kg` everywhere (compare-stats, profile, join wizard input label).

## Interaction Patterns

- **Press feedback:** tappable elements scale to 98% and drop to 90% opacity on active.
- **Glass effect:** `.glass` class for elevated overlays (blurred Plate background, web only).
- **Stagger animation:** `.stagger-children` for list entries on initial mount (60ms intervals, web only).
- **Page transitions:** `animate-page-in` (translateY 6px, 300ms ease-out, web only).
- **Sheets are the default modal.** Bottom drawers, not centered dialogs. Web uses shadcn `Sheet`; mobile uses `@gorhom/bottom-sheet` wrapped in [apps/mobile/components/ui/sheet.tsx](apps/mobile/components/ui/sheet.tsx).

## Layout Constraints

- Mobile-first. Max-width content container on web (md, 28rem) keeps tablet/desktop readable.
- Bottom nav is fixed on web; mobile uses the Expo Router tab bar. Content accounts for safe-area insets (`react-native-safe-area-context` on mobile).
- Top header is sticky with hairline divider on both platforms.
- Immersive routes (match wizard, lobby, profile setup) hide the bottom nav and use a full-bleed Plate surface.

## In-App Design Hub

The web app serves a designer-facing design hub at `/design` (live Next.js routes plus a few static HTML references in [apps/web/public/design/](apps/web/public/design/)). All hub routes consume the same canonical tokens.

| Route | Source | Purpose |
|---|---|---|
| `/design` | [apps/web/app/design/page.tsx](apps/web/app/design/page.tsx) | Overview hub linking out to every sub-page. |
| `/design/style-guide` | [apps/web/app/design/style-guide/page.tsx](apps/web/app/design/style-guide/page.tsx) | Live Next.js style guide. Canonical when web and the static HTML disagree. |
| `/design/ui-kit` | [apps/web/app/design/ui-kit/page.tsx](apps/web/app/design/ui-kit/page.tsx) | Live ELO primitive showcase. |
| `/design/wireframe` | [apps/web/app/design/wireframe/page.tsx](apps/web/app/design/wireframe/page.tsx) iframes [apps/web/public/design/wireframe.html](apps/web/public/design/wireframe.html) | 39-screen canonical wireframe (light + dark), synced from `outside_assets/Jits Arena SharePoint/Brand/activation-kit/app-screens/wireframe.html`. |
| `/design/screens` | iframes [apps/web/public/design/screen-inventory.html](apps/web/public/design/screen-inventory.html) | Web-app screen inventory with implementation status. |
| `/design/screens/native` | iframes [apps/web/public/design/native-screen-inventory.html](apps/web/public/design/native-screen-inventory.html) | Mobile screen inventory. |
| `/design/elo-system` | [apps/web/app/design/elo-system/page.tsx](apps/web/app/design/elo-system/page.tsx) | ELO primitive deep dive. |

**Static design assets** in [apps/web/public/design/](apps/web/public/design/):

- [tokens.css](apps/web/public/design/tokens.css), 1:1 copy of canonical [apps/web/app/design-system/tokens.css](apps/web/app/design-system/tokens.css). Static HTML in this folder all `<link>` it so they reference one source of truth.
- [wireframe.html](apps/web/public/design/wireframe.html), synced from the upstream SharePoint brand kit. Sync procedure: `cp` upstream to `apps/web/public/design/wireframe.html`, then rewrite the `<link>` path from `../../design-system/tokens.css` to `./tokens.css`.
- [elo-rated-style-guide.html](apps/web/public/design/elo-rated-style-guide.html), legacy standalone style guide; now links canonical tokens with a bridge layer for its older variable names. The live `/design/style-guide` route is canonical; this static file is reference-only.

**Upstream source of truth (off-repo, gitignored):** `outside_assets/Jits Arena SharePoint/Brand/`. The SharePoint sync syncs the team brand kit to disk; the `apps/web/public/design/` copy is what ships.

## Where to Find Things

| Need | Location |
|---|---|
| Token source of truth | [apps/web/app/design-system/tokens.css](apps/web/app/design-system/tokens.css) |
| Mobile token mirror | [apps/mobile/lib/tokens.ts](apps/mobile/lib/tokens.ts) |
| Mobile Tailwind class wiring | [apps/mobile/tailwind.config.js](apps/mobile/tailwind.config.js) |
| Web ELO primitives | [apps/web/components/ui/elo-system/](apps/web/components/ui/elo-system/) |
| Mobile ELO primitives | [apps/mobile/components/ui/elo-system/](apps/mobile/components/ui/elo-system/) |
| Web shell | [apps/web/components/layout/](apps/web/components/layout/) |
| Mobile shell composition | [apps/mobile/app/_layout.tsx](apps/mobile/app/_layout.tsx) and [apps/mobile/app/(app)/(tabs)/_layout.tsx](apps/mobile/app/(app)/(tabs)/_layout.tsx) |
| In-app design hub | [apps/web/app/design/](apps/web/app/design/) (live routes) + [apps/web/public/design/](apps/web/public/design/) (static HTML) |
| Canonical 39-screen wireframe (in-app) | `/design/wireframe`, served from [apps/web/public/design/wireframe.html](apps/web/public/design/wireframe.html) |
| Canonical wireframe (upstream, gitignored) | `outside_assets/Jits Arena SharePoint/Brand/activation-kit/app-screens/wireframe.html` |
| Font loading (web) | [apps/web/app/layout.tsx](apps/web/app/layout.tsx) |
| Font loading (mobile) | [apps/mobile/app/_layout.tsx](apps/mobile/app/_layout.tsx) |
| Brand assets | [apps/web/public/](apps/web/public/), [apps/mobile/assets/](apps/mobile/assets/) |
