# Components

The family map of the mobile app (`apps/mobile`), which component is canonical in each family, and what is legacy. Each kit card (`components/<Comp>/`) is a static HTML twin of a React Native component, drawn from the code with these tokens; React Native cannot run in the preview frame, so every card README says which RN file it was hand-written from.

Three token channels exist in code, and the kit draws all three from the same tokens: NativeWind ELO classes (most components), `usePalette()` JS colors (the match flow; a mirror of the same values), and the fixed `ON_MEDIA` / `BROADCAST` on-media set (chrome over video). Legacy shadcn classes are a fourth channel that is retiring (see Legacy).

## Which component to use

| I need... | Use | Not |
|---|---|---|
| A destructive action | `Button` destructive: an outline in `negative` (kit proposal) | today's `DestructiveButton` red fill under a 3.54:1 label |
| A primary action | `Button` primary (today: `CtaButton`, `FightButton` primary) | the shadcn `Button` default variant, a hand-rolled `bg-cta` Pressable |
| A secondary or text action | `Button` secondary / ghost (today: `SecondaryButton`, `TertiaryButton`, `FightButton`) | `ViewerButton`, `PracticeButton` (copies) |
| A compact strip action (ROLL, OPEN, CANCEL, CONFIRM) | `OutlineAction` | a small `Button` |
| Anything pressable that commits | `PressableScale` underneath | raw `Pressable` with a function `style` |
| A still pressable (rows, chrome over video) | `StatePressable` | raw `Pressable` with a function `style` |
| A container | `Plate` (variants default, accent, live, win, loss) | shadcn `Card` (dead) |
| An Arena strip | `StripShell` (compact Plate on `panel`, 3px rail) | |
| A caps label tag | `MetaTag` | shadcn `Badge` |
| Win / loss / draw | `OutcomeTag` | |
| A filter or segment | `Chip` (+ a row of chips); selected = `plate-bright` fill, `hairline-strong` border, `ink` label | shadcn `Tabs` (unused) |
| A count badge | `CountPill` | |
| Live state | `LivePill`, `LiveDot` | a green dot drawn by hand |
| A rating | `EloTile` with `RollingNumber` | |
| A rating change | `DeltaNumber` (static) or `DeltaChip` (after a roll) | a third formatter |
| A person | `Avatar32` (square initials or photo) | shadcn `Avatar` (round, unused), `InitialsBlock` outside the match flow |
| A notice | `toast.success / error / info` (`BrandToast`) | a banner for a one-off message |
| Loading | the skeleton set (`SkeletonProvider`, `SkeletonBlock`, `SkeletonPlate`, ...) | a free-floating red `ActivityIndicator` |
| A busy action | `FightButton busy` (the busy-button pattern) | a spinner next to a button |
| A picker | `SearchSelect` (`NativeSelect` wraps it) | shadcn `Select` (dead) |
| A sheet | one bottom-sheet shell with 8px top corners (WP1 target; today `Sheet`, direct `BottomSheetModal`, or RN `Modal`) | gorhom's default 15px radius |

## Families

### Actions

| Component | Path | Status |
|---|---|---|
| `PressableScale` | `components/ui/pressable-scale.tsx` | Canonical press primitive: 0.97 scale on `duration.instant` brand ease-out, `spring.press` release, optional semantic haptic |
| `StatePressable` | `components/ui/state-pressable.tsx` | Canonical still pressable |
| `FightButton` | `components/match-flow/fight/fight-ui.tsx:105` | The API the unified `Button` takes: primary / secondary / ghost, `busy`, `disabled`, `height` 56, `icon`, `trailing`, `haptic`, `sheen` |
| `CtaButton`, `SecondaryButton`, `TertiaryButton`, `DestructiveButton` | `components/auth/auth-buttons.tsx` | The real app-wide buttons (30 / 16 / 19 / 1 call sites) but on raw `Pressable` with no press scale (R3 BT-1); WP3 aliases them onto `Button` |
| `OutlineAction` | `components/arena/strip-primitives.tsx` | Canonical compact action: 28px tall, `radius-tag`, `hairline-strong`, `action-sm` label, 44px hit area |
| `SteelSheen` | `components/ui/steel-sheen.tsx` | Ambient sweep on a waiting-on-you button (Accept, Confirm result) |
| `ViewerButton`, `PracticeButton` | highlight-viewer, practice | Copies of the three tiers; fold into `Button` |
| shadcn `Button` | `components/ui/button.tsx` | Legacy: admin and the update banner only; white label on red (3.54:1) |

Cards (Actions family): **Button** (target: primary, secondary, ghost, destructive outline in `negative`; states rest, pressed, disabled, busy) and **OutlineAction**.

### Status and badges

`MetaTag` (21 sites) is the canonical tag: `hairline` border, `radius-tag`, `meta-label` text in `ink-2`. `OutcomeTag` and `LivePill` are semantic wrappers. `CountPill` (`components/ui/count-pill.tsx`) is the filled count: `signal-red` fill, `on-signal` 9px mono bold digits, `radius-tag`, shared by the header bell and the tab bar. `HeaderStatusChip` (`components/layout/header-status-chip.tsx`) sits on every tab root and says live (`gain-green` edge), neutral (`ink-3` edge) or incoming (`signal-red` edge). Overlapping tags (`FilmBadge`, `HudTag`, participant `StatusBadge`, shadcn `Badge`) fold into one tag with tones.

Cards (Status family): **MetaTag**, **LivePill** (with LiveDot), **CountPill** (with tab badges). The header status chip is drawn in the AppHeader card.

### Data and ELO

| Component | Path | Notes |
|---|---|---|
| `EloTile` | `components/ui/elo-system/elo-tile.tsx` | Sizes hero 96, large 64, medium 44, small 36; before/after; tone positive / negative / amber; optional 3px `signal-red` bottom bar |
| `RollingNumber` | `components/ui/elo-system/rolling-number.tsx` | The odometer roll (600ms, once per result); mobile only |
| `DeltaChip` | `components/ui/elo-system/delta-chip.tsx` | "▲ +14" pop after the roll; mobile only |
| `DeltaNumber` | `components/ui/elo-system/delta-number.tsx` | Static signed delta, s 12 / m 16 / l 28 |
| `RankRow` | `components/ui/elo-system/rank-row.tsx` | Ladder row; leader marked by a `signal-red` left rule. Its rank numeral is red today (R3 RK-1): it should be `ink` |
| `ParticipantRow`, `DataRow` | `components/ui/elo-system/` | `DataRow` is unused on mobile |
| `Mono`, `StakesStrip`, `RatingBlock`, `StatusPlate` | `fight-ui.tsx` | Match-flow building blocks on `usePalette()` |

Cards (Data family): **EloTile**, **RollingNumber** (settled frame), **DeltaChip**.

### Navigation

`EloTabBar` (`components/layout/elo-tab-bar.tsx`): four tabs (Home, Arena, Rankings, Profile) on `panel`, 18px lucide icons, `tab-label` text (`ink` active, `ink-3` inactive), a 2px `signal-red` top edge on the active tab, tab select bounce. `ArenaTabIcon` (`components/layout/arena-tab-icon.tsx`) draws lucide `Swords` as two blade halves so it can carry heat: live embers, countable embers (1 to 3 pending), blade clash. Headers are one system of three slots on the same 56px `panel` bar: `AppHeader` (pushed screens), `BrandHeader` (wordmark; Home, Rankings), `TabHeader` (Arena, Profile).

Cards (Navigation family): **TabBar** (with the Arena icon's live ember and countable embers), **AppHeader** (with the header status chip) and **Chip**.

### Surfaces

`Plate` (71 sites, `components/ui/elo-system/plate.tsx`) is the surface: `plate` fill, 1px `hairline` border, `radius-plate`, `space-4` padding, and a left rail (1px default; 3px `signal-red` accent, `gain-green` live and win, `negative` loss). `StripShell` is its compact Arena strip on `panel` with `radius-tag` and a 3px rail (`signal-red` when someone wants you). `AfterglowEdge` cools a new incoming challenge strip's 2px bottom edge from heat to hairline over 2000ms. `OnAirStrip` (`components/arena/on-air-strip.tsx`) is the green ON AIR tally and heartbeat trace in the Arena body.

Cards: **Plate** (Surfaces family); **OnAirStrip** and **ChallengeStrip** (incoming, afterglow edge cooled) form the Arena family.

### Feedback and loading

`toast` + `BrandToast` (`components/ui/toast.tsx`, 89 calls) is canonical: `plate` fill, `hairline-strong` border, `radius-plate`, a 3px left rule (success `ink`, deliberately not green; error `signal-red`; info `ink-3`), `toast-title` plus `body-12`, no shadow. The skeleton set (`components/ui/skeleton/skeleton.tsx`) runs one shared 1400ms shimmer clock. Skeleton bars (`SkeletonBlock`) are `plate-bright` (`bg-surface-4`), one tier above their host plate (`Plate`, `SkeletonPlate`, the rank and participant rows), with an `ink` band at 8% opacity, so they read at rest and under Reduce Motion (WP6, bead jits-3eeg.7). Banners (offline, update, upload progress, queue status) have no shared shell yet; the offline banner is a legacy red bar (R3 SC-1, WP4).

Cards (Feedback family): **Toast**, **Skeleton**.

### Inputs and overlays

`SearchSelect` is the canonical picker. Three sheet mechanisms exist (shadcn `Sheet` once, direct `BottomSheetModal` three times, RN `Modal` seven times); the target is one sheet shell with `radius-sheet` top corners, `panel` fill, `hairline` edge, no shadow. The challenge prompt is a centered card by decision (jits-02vo.3) with `radius-sheet` and the `on-media-scrim` backdrop. `AuthFormField` and `EloField` fold into one form field (WP3/WP5 follow-ups). `Switch` still uses the legacy red track (R3 ST-1).

Card (Surfaces family): **Sheet** (target, 8px top corners).

### Avatars and identity

`Avatar32` (`components/ui/elo-system/avatar-32.tsx`): a 28px square on device, `radius-tag`, `hairline-strong` border, photo or "F·L" initials in mono bold 10px on `plate-bright`. `Wordmark`: "ELO RATED" in Bebas Neue, sm 18 / md 22 / lg 48 / hero 72. `ErMark`: the animated E·R lettermark (same vector as `splash.svg`).

Card (Identity family): **Avatar**.

### Match flow

Built from `fight-ui.tsx` and `fight-tokens.ts` on `usePalette()` and `ON_MEDIA` / `BROADCAST`. The face-off countdown (`components/match-flow/countdown/countdown.tsx`) slams Bebas numerals over the camera with a `signal-red` bar draining to a red GO. The live HUD (clock slab, athlete bar, HUD tags, hold-to-end) is the over-media layer. The verdict shows the odometer roll, the delta chip and, on a submission win, "the tap": three `signal-red` tick marks.

Cards (Match flow family): **Countdown**, **RatingMoment** (verdict rating card with the tap marks).

## Canonical kit set

The 20 cards in `components/`, by family (the `group` on each card):

| Family | Card | RN source |
|---|---|---|
| Actions | Button (target, WP3: primary, secondary, ghost, destructive outline in `negative`; rest, pressed, disabled, busy) | `fight-ui.tsx` API; today `auth-buttons.tsx` |
| Actions | OutlineAction | `components/arena/strip-primitives.tsx` |
| Status | MetaTag | `components/ui/elo-system/meta-tag.tsx` |
| Status | LivePill (with LiveDot) | `components/ui/elo-system/live-pill.tsx` |
| Status | CountPill (with tab badges) | `components/ui/count-pill.tsx`, `elo-tab-bar.tsx` |
| Data | EloTile | `components/ui/elo-system/elo-tile.tsx` |
| Data | RollingNumber (settled frame) | `components/ui/elo-system/rolling-number.tsx` |
| Data | DeltaChip | `components/ui/elo-system/delta-chip.tsx` |
| Navigation | TabBar (Arena icon live ember and countable embers) | `components/layout/elo-tab-bar.tsx`, `arena-tab-icon.tsx` |
| Navigation | AppHeader (with the header status chip) | `components/layout/app-header.tsx`, `header-status-chip.tsx` |
| Navigation | Chip (selected target: `plate-bright`, `hairline-strong`, `ink`) | `components/ui/elo-system/chip.tsx` |
| Surfaces | Plate | `components/ui/elo-system/plate.tsx` |
| Surfaces | Sheet (target, WP1: 8px top corners) | `components/ui/sheet.tsx` and the direct sheets |
| Feedback | Toast | `components/ui/toast.tsx` |
| Feedback | Skeleton | `components/ui/skeleton/skeleton.tsx` |
| Identity | Avatar | `components/ui/elo-system/avatar-32.tsx` |
| Arena | OnAirStrip | `components/arena/on-air-strip.tsx` |
| Arena | ChallengeStrip (incoming, afterglow edge cooled) | `components/arena/mat-board.tsx`, `afterglow-edge.tsx` |
| Match flow | Countdown | `components/match-flow/countdown/countdown.tsx` |
| Match flow | RatingMoment (verdict rating card and the tap) | `components/match-flow/verdict/rating-moment.tsx` |

## Web parity

`components/ui/elo-system/` exists on both platforms and must stay in parity (jits_web `CLAUDE.md:117`). Web has avatar-32, chip, data-row, delta-number, elo-tile, live-dot, live-pill, meta-tag, outcome-tag, participant-row, plate, rank-row, wordmark. Mobile only: `RollingNumber`, `DeltaChip`, `ErMark`, the splash set, every fight and Arena strip primitive. Gaps: web `EloTile` lacks `tone`, `playKey`, `meta` and the roll; web `LivePill` / `LiveDot` lack `pace`, `onDark` and the shared tempo clock.
