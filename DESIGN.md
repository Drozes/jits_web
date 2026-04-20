# JITS Design System

## Brand Identity

**App name:** EloRated
**Category:** Mobile-first PWA for BJJ (Brazilian Jiu-Jitsu) competitor matchmaking and ELO rating
**Feel:** Premium sports tech (think Strava, not ESPN). Focused, competitive, modern.
**Font:** Geist Sans (variable weight)
**Dark mode** is the expected default for gym environments, but light mode is fully supported.

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

- **Primary red:** `hsl(0 85% 46%)` light / `hsl(0 85% 50%)` dark
- **Brand gold:** `hsl(38 92% 50%)` for rank #1, premium accents
- **Brand orange:** `hsl(25 95% 53%)` for gradients paired with primary
- **Brand deep red:** `hsl(0 84% 50%)` for intense gradient endpoints

### Gradients

- `bg-gradient-primary` (135deg, primary to deep-red): hero buttons, feature cards
- `bg-gradient-hero` (160deg, primary/8% to background): page header backgrounds
- `bg-gradient-subtle` (180deg, background to muted/50%): section backgrounds
- `text-gradient-primary` (135deg, primary to orange): display headings

## Component Library

### Primitives (shadcn/ui, do not customize directly)

avatar, badge, button, card, checkbox, dialog, dropdown-menu, input, label, select, separator, sheet, sonner, switch, tabs

**Custom badge variant:** `success` (green background for win badges).

### Domain Components

**Cards:**
- `MatchCard`: match result with opponent, outcome badge, ELO delta, optional match type label
- `AthleteCard`: ranked list item with avatar, name, ELO, record
- `GymCard`: gym name, member count, session availability
- `SessionCard`: scheduled session with time, gym, RSVP status
- `ActiveSessionCard`: live/upcoming session with dashed border treatment
- `ConversationCard`: chat thread preview with unread indicator
- `ChallengeVersusCard`: head-to-head challenge with dual avatars and status

**Badges/Indicators:**
- `EloBadge` (CVA: display, compact, stakes): ELO rating with +/- styling
- `ChallengeBadge`: challenge status pill
- `ExpiryBadge`: countdown with clock icon
- `OnlineIndicator`: green presence dot with ring
- `LobbyActiveIndicator`: pulsing dot for active lobby

**Stat Displays:**
- `StatOverview`: 2x2 grid of key stats (wins, losses, draws, ELO)
- `ProfileHeader`: avatar, name, gym, stat summary row
- `CompareStatsModal`: side-by-side athlete comparison

**Interactive Sheets:**
- `ChallengeSheet`: send a challenge with match type selection and ELO preview
- `ChallengeResponseSheet`: accept/decline with weight input
- `ShareProfileSheet`: share athlete profile via native share or clipboard

**Layout:**
- `NotificationBell` + `NotificationPanel`: challenge notifications in header
- `RecentActivitySection`: filterable activity feed with pills

### Layout Shell

- `AppHeader`: sticky top bar, back button, title, right-side actions
- `BottomNavBar`: 4 tabs (Home, Gyms, Rankings, Profile)
- `PageContainer`: content wrapper with safe-area padding

## Interaction Patterns

- **Press feedback:** all tappable elements scale to 98% + 90% opacity on active
- **Glass effect:** `.glass` class for elevated overlays (blurred card background)
- **Stagger animation:** `.stagger-children` for list entry animations (60ms intervals)
- **Page transitions:** `animate-page-in` (translateY 6px, 300ms ease-out)

## Layout Constraints

- Mobile-first, max-width container for tablet/desktop
- Bottom nav is fixed, content must account for safe-area insets
- Top header is sticky with backdrop blur
- Sheets (bottom drawers) are the primary modal pattern, not centered dialogs
