# JITS Design System

The JITS design system spans both apps in the monorepo: `apps/web/` (Next.js + Tailwind + shadcn/ui) and `apps/mobile/` (Expo + NativeWind v4 + hand-written native primitives). Tokens, color rules, and interaction patterns are unified across platforms; primitive implementations differ.

## Brand Identity

**App name:** EloRated
**Category:** mobile-first PWA + native iOS/Android app for BJJ (Brazilian Jiu-Jitsu) competitor matchmaking and ELO rating
**Feel:** premium sports tech (think Strava, not ESPN). Focused, competitive, modern.
**Font:** Geist Sans (variable weight) on web; system font on native.
**Dark mode** is the expected default for gym environments, but light mode is fully supported on both platforms.
**Brand assets:** `apps/web/public/logo.svg` (geometric E icon mark with rising-bar accent and gold step). Mobile splash is brand red `#bf1212` with the same logo rendered at 1024x1024 (`apps/mobile/assets/{icon,adaptive-icon,favicon,splash-icon}.png`).

## Color Tokens

### Semantic Usage Rules

| Token | Purpose | Do | Don't |
|-------|---------|-----|-------|
| `primary` (red) | Brand accent: buttons, CTAs, section header icons, nav highlights | Buttons, links, active tab indicators | Data values, stat numbers |
| `success` (green) | Wins, positive outcomes | Win badges, positive ELO change, match won | Generic "good" feedback |
| `destructive` (red) | Losses, negative outcomes, danger actions | Loss badges, negative ELO, delete/decline | Branding (use `primary` instead) |
| `amber-500` | Draws, pressure, warnings | Draw badges, ELO pressure score | Success or error states |
| `foreground` | Default text, stat numbers, ELO values | Data values with `tabular-nums` | N/A |
| `muted-foreground` | Secondary text, timestamps, labels | Metadata, helper text | Primary content |

### Brand Palette

- **Primary red:** `hsl(0 85% 46%)` light / `hsl(0 85% 50%)` dark.
- **Brand gold:** `hsl(38 92% 50%)` for rank #1, premium accents.
- **Brand orange:** `hsl(25 95% 53%)` for gradients paired with primary.
- **Brand deep red:** `hsl(0 84% 50%)` for intense gradient endpoints.
- **Splash red:** `#bf1212` (mobile splash + adaptive icon background).

### Gradients (web)

- `bg-gradient-primary` (135deg, primary to deep-red): hero buttons, feature cards.
- `bg-gradient-hero` (160deg, primary/8% to background): page header backgrounds.
- `bg-gradient-subtle` (180deg, background to muted/50%): section backgrounds.
- `text-gradient-primary` (135deg, primary to orange): display headings.

## Mobile Theming

NativeWind v4 powers Tailwind classes on RN. Theming flow:

- Tokens declared in `apps/mobile/lib/tokens.ts` as two maps (`lightTokens`, `darkTokens`) sharing one `ColorTokens` type.
- `apps/mobile/tailwind.config.js` defines semantic tokens (`background`, `foreground`, `primary`, `success`, `destructive`, etc.) that resolve to `var(--<token>)`. Light values are seeded on `:root` via an `addBase` plugin. `darkMode` is `"media"`.
- `<ThemeProvider>` (`apps/mobile/lib/theme/theme-provider.tsx`) wraps the app and applies `vars()` overrides driven by `useColorScheme()`. NativeWind classes (`bg-background`, `text-foreground`, etc.) automatically follow the system color scheme.
- For RN APIs that don't accept className (e.g. `Switch`, gorhom's `BottomSheet`), components read `useThemedTokens()` to pick the runtime token map.

The result: web and mobile share the same semantic class names (`bg-success`, `text-destructive`, `text-amber-500`, etc.) and the same color values, with platform-correct dark-mode handling.

## Component Library

### Web shadcn/ui primitives (`apps/web/components/ui/`)

Do not customize directly; managed by `npx shadcn@latest add <component>`.

`avatar`, `badge`, `button`, `card`, `checkbox`, `dialog`, `dropdown-menu`, `input`, `label`, `select`, `separator`, `sheet`, `sonner`, `switch`, `tabs`.

**Custom badge variant:** `success` (green background for win badges).

### Mobile native primitives (`apps/mobile/components/ui/`)

Hand-written; API mirrors shadcn where reasonable. NativeWind v4 + class-variance-authority. Edit directly when needed.

13 primitives: `avatar`, `badge` (with custom `success` variant), `button`, `card`, `dialog`, `input`, `label`, `select`, `separator`, `sheet` (gorhom bottom sheet), `switch`, `tabs`, `toast` (react-native-toast-message).

### Domain Components

Web: a single flat `apps/web/components/domain/` directory. Mobile: topical directories under `apps/mobile/components/` (`dashboard/`, `profile/`, `gyms/`, `session/`, `match-flow/`, `notifications/`) plus a few widely-used cards at the components root.

**Cards:**
- `MatchCard`: match result with opponent, outcome badge, ELO delta, optional match type label.
- `AthleteCard`: ranked list item with avatar, name, ELO, record.
- `GymCard`: gym name, member count, session availability.
- `SessionCard`: scheduled session with time, gym, RSVP status.
- `ActiveSessionCard`: live/upcoming session with dashed border treatment.
- `ConversationCard` (web only): chat thread preview with unread indicator.
- `ChallengeVersusCard` (web only): head-to-head challenge with dual avatars and status.

**Badges/Indicators:**
- `EloBadge` (CVA: display, compact, stakes): ELO rating with +/- styling.
- `ChallengeBadge` (web): challenge status pill.
- `ExpiryBadge` (web): countdown with clock icon.
- `OnlineIndicator`: green presence dot with ring.
- `LobbyActiveIndicator` (web): pulsing dot for active lobby.

**Stat Displays:**
- `StatOverview`: 2x2 grid of key stats (ELO, Rank, Record, Win Streak).
- `ProfileHeader`: avatar, name, gym, stat summary row.
- `CompareStatsModal`: side-by-side athlete comparison.

**Interactive Sheets:**
- `ChallengeSheet` (web): send a challenge with match type selection and ELO preview.
- `ChallengeResponseSheet` (web): accept/decline with weight input.
- `ShareProfileSheet`: share athlete profile via native share or clipboard.

**Layout/Notifications:**
- `NotificationBell` + `NotificationPanel`: challenge notifications in header.
- `RecentActivitySection`: filterable activity feed with pills.
- `OfflineBanner` (mobile only): top-of-screen offline state.
- `ErrorBoundary` (mobile only): root error boundary with retry + sign-out, forwards to Sentry.

**Match Flow (mobile):** `apps/mobile/components/match-flow/` contains the wizard plus 8 step components plus `CameraOverlay` and `UploadProgressBanner`.

### Layout Shell

**Web (`apps/web/components/layout/`):**
- `AppHeader`: sticky top bar, back button, title, right-side actions.
- `BottomNavBar`: 4 tabs (Home, Gyms, Rankings, Profile).
- `PageContainer`: content wrapper with safe-area padding.
- Bootstrap providers: `global-notifications-provider`, `online-presence-bootstrap`, `lobby-presence-bootstrap`, `push-registration-bootstrap`, `deployment-check-bootstrap`.

**Mobile:** no dedicated `layout/` directory. The root `apps/mobile/app/_layout.tsx` mounts `<ErrorBoundary>` -> `<ThemeProvider>` -> `<AuthProvider>` -> `<OfflineBanner>` -> push-registration + online-presence bootstraps. The tab bar lives in `apps/mobile/app/(app)/_layout.tsx` and uses `lucide-react-native` icons themed via `useThemedTokens()`.

## Interaction Patterns

- **Press feedback:** all tappable elements scale to 98% + 90% opacity on active.
- **Glass effect:** `.glass` class for elevated overlays (blurred card background, web only).
- **Stagger animation:** `.stagger-children` for list entry animations (60ms intervals, web only).
- **Page transitions:** `animate-page-in` (translateY 6px, 300ms ease-out, web only).
- **Haptics (mobile):** `useHaptics()` exposes `matchStart`, `matchEnd`, `resultRecorded`, `error`, `timeWarning` via `expo-haptics`.
- **Wake lock (mobile):** live match step keeps screen awake via `expo-keep-awake`.

## Layout Constraints

- Mobile-first; max-width container for tablet/desktop on web.
- Bottom nav is fixed; content accounts for safe-area insets (`react-native-safe-area-context` on mobile).
- Top header is sticky with backdrop blur on web; mobile uses Expo Router screen options.
- Sheets (bottom drawers) are the primary modal pattern, not centered dialogs. Web uses shadcn `Sheet`; mobile uses `@gorhom/bottom-sheet` wrapped in `apps/mobile/components/ui/sheet.tsx`.
