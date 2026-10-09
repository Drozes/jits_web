# Components

The family map of the mobile app (`apps/mobile`), which component is canonical in each family, and what is legacy. Each kit card (`components/<Comp>/`) is a static HTML twin of a React Native component, drawn from the code with these tokens; React Native cannot run in the preview frame, so every card README says which RN file it was hand-written from.

Three token channels exist in code, and the kit draws all three from the same tokens: NativeWind ELO classes (most components), `usePalette()` JS colors (the match flow; a mirror of the same values), and the fixed `ON_MEDIA` / `BROADCAST` on-media set (chrome over video). The legacy shadcn classes were a fourth channel; WP4 removed them (see Legacy).

## Which component to use

| I need... | Use | Not |
|---|---|---|
| A destructive action | `Button` destructive: an outline in `negative` | a red fill (the retired `DestructiveButton`) |
| A primary action | `Button` primary (`components/ui/elo-system/button.tsx`; `FightButton` is its match-flow alias) | a hand-rolled `bg-cta` Pressable (the shadcn `Button` was deleted by WP4) |
| A secondary or text action | `Button` secondary / ghost | a raw `Pressable` with an `active:` class |
| An action over camera or film | `Button` glass | a hand-rolled glass `Pressable` |
| A compact strip action (ROLL, OPEN, CANCEL, CONFIRM) | `OutlineAction` | a small `Button` |
| Anything pressable that commits | `PressableScale` underneath | raw `Pressable` with a function `style` |
| A still pressable (rows, chips, toggles, chrome over video) | `StatePressable` (`dim` for the 0.7 pressed dip) | raw `Pressable` with no pressed feedback or a function `style` |
| A container | `Plate` (variants default, accent, live, win, loss) | shadcn `Card` (deleted, WP4) |
| An Arena strip | `StripShell` (compact Plate on `panel`, 3px rail) | |
| A caps label tag | `MetaTag`; `Badge` is the same tag with tones (WP4) | |
| Win / loss / draw | `OutcomeTag` | |
| A filter or segment | `Chip` (+ a row of chips); selected = `plate-bright` fill, `hairline-strong` border, `ink` label | shadcn `Tabs` (deleted, WP4) |
| A count badge | `CountPill` | |
| Live state | `LivePill`, `LiveDot` | a green dot drawn by hand |
| A rating | `EloTile` with `RollingNumber` | |
| A rating change | `DeltaNumber` (static) or `DeltaChip` (after a roll) | a third formatter |
| A person | `Avatar32` (square initials or photo) | shadcn `Avatar` (round, deleted by WP4), `InitialsBlock` outside the match flow |
| A notice | `toast.success / error / info` (`BrandToast`) | a banner for a one-off message |
| Loading | the skeleton set (`SkeletonProvider`, `SkeletonBlock`, `SkeletonPlate`, ...) | a free-floating red `ActivityIndicator` |
| A busy action | `Button busy` (the busy-button pattern) | a spinner next to a button |
| A picker | `SearchSelect` (`NativeSelect` wraps it) | shadcn `Select` (deleted, WP4) |
| A sheet | `Sheet` or a `BottomSheetModal` spreading `useSheetChrome()` with `SheetBackdrop` (`components/ui/sheet.tsx`); an RN `Modal` picker uses `SHEET_RADIUS`, `panel`, `ON_MEDIA.scrim` and `useModalAnimation("slide")` | gorhom's default 15px radius, a sheet's own background, handle or black backdrop literal |

## Families

### Actions

| Component | Path | Status |
|---|---|---|
| `PressableScale` | `components/ui/pressable-scale.tsx` | Canonical press primitive: 0.97 scale on `duration.instant` brand ease-out, `spring.press` release, optional semantic haptic |
| `StatePressable` | `components/ui/state-pressable.tsx` | Canonical still pressable |
| `Button` | `components/ui/elo-system/button.tsx` | The one brand button (WP3): primary / secondary / ghost / destructive / glass, `busy`, `disabled` (the one 0.5 dim), `height` 56, `icon`, `trailing`, `haptic`, `sheen`, on `PressableScale` |
| `FightButton` | `components/match-flow/fight/fight-ui.tsx` | Thin match-flow alias of `Button` (primary / secondary / ghost) |
| `OutlineAction` | `components/arena/strip-primitives.tsx` | Canonical compact action: 28px tall, `radius-tag`, `hairline-strong`, `action-sm` label, 44px hit area |
| `SteelSheen` | `components/ui/steel-sheen.tsx` | Ambient sweep on a waiting-on-you button (Accept, Confirm result) |
| shadcn `Button` | `components/ui/button.tsx` | Deleted by WP4; the update banner, its last caller, is on the unified `Button` |

Cards (Actions family): **Button** (primary, secondary, ghost, destructive outline in `negative`; states rest, pressed, disabled, busy) and **OutlineAction**.

### Status and badges

`MetaTag` (21 sites) is the canonical tag: `hairline` border, `radius-tag`, `meta-label` text in `ink-2`. `OutcomeTag` and `LivePill` are semantic wrappers. `CountPill` (`components/ui/count-pill.tsx`) is the filled count: `signal-red` fill, `on-signal` 9px mono bold digits, `radius-tag`, shared by the header bell and the tab bar. `HeaderStatusChip` (`components/layout/header-status-chip.tsx`) sits on every tab root and says live (`gain-green` edge), neutral (`ink-3` edge) or incoming (`signal-red` edge). Overlapping tags (`FilmBadge`, `HudTag`, participant `StatusBadge`) fold into one tag with tones. `Badge` (`components/ui/badge.tsx`, admin members) already is that tag since WP4: the `MetaTag` look with tones `default` (`hairline-strong` border, `ink`), `secondary` (`plate` fill, `ink-2`), `destructive` (`negative`), `success` (`gain-green`, wins only) and `outline` (exactly `MetaTag`).

Cards (Status family): **MetaTag**, **LivePill** (with LiveDot), **CountPill** (with tab badges). The header status chip is drawn in the AppHeader card.

### Data and ELO

| Component | Path | Notes |
|---|---|---|
| `EloTile` | `components/ui/elo-system/elo-tile.tsx` | Sizes hero 96, large 64, medium 44, small 36; before/after; tone positive / negative / amber; optional 3px `signal-red` bottom bar |
| `RollingNumber` | `components/ui/elo-system/rolling-number.tsx` | The odometer roll (600ms, once per result); mobile only |
| `DeltaChip` | `components/ui/elo-system/delta-chip.tsx` | "▲ +14" pop after the roll; mobile only |
| `DeltaNumber` | `components/ui/elo-system/delta-number.tsx` | Static signed delta, s 12 / m 16 / l 28 |
| `RankRow` | `components/ui/elo-system/rank-row.tsx` | Ladder row; leader marked by a `signal-red` left rule; every rank numeral is data, the leader's in `ink` (WP2, R3 RK-1) |
| `ParticipantRow`, `DataRow` | `components/ui/elo-system/` | `DataRow` is unused on mobile |
| `Mono`, `StakesStrip`, `RatingBlock`, `StatusPlate` | `fight-ui.tsx` | Match-flow building blocks on `usePalette()` |

Cards (Data family): **EloTile**, **RollingNumber** (settled frame), **DeltaChip**.

### Navigation

`EloTabBar` (`components/layout/elo-tab-bar.tsx`): four tabs (Home, Arena, Rankings, Profile) on `panel`, 18px lucide icons, `tab-label` text (`ink` active, `ink-3` inactive), a 2px `signal-red` top edge on the active tab, tab select bounce. `ArenaTabIcon` (`components/layout/arena-tab-icon.tsx`) draws lucide `Swords` as two blade halves so it can carry heat: live embers, countable embers (1 to 3 pending), blade clash. Headers are one system of two slot layouts on the same 56px `panel` bar: `AppHeader` (pushed screens) and `BrandHeader` (every tab root: the wordmark, a rule and the athlete's rating, which opens Your numbers).

Cards (Navigation family): **TabBar** (with the Arena icon's live ember and countable embers), **AppHeader** (with the header status chip) and **Chip** (shipped in WP2: selected = `plate-bright`, `hairline-strong`, `ink`).

### Surfaces

`Plate` (71 sites, `components/ui/elo-system/plate.tsx`) is the surface: `plate` fill, 1px `hairline` border, `radius-plate`, `space-4` padding, and a left rail (1px default; 3px `signal-red` accent, `gain-green` live and win, `negative` loss). `StripShell` is its compact Arena strip on `panel` with `radius-tag` and a 3px rail (`signal-red` when someone wants you). `AfterglowEdge` cools a new incoming challenge strip's 2px bottom edge from heat to hairline over 2000ms. `OnAirStrip` (`components/arena/on-air-strip.tsx`) is the green ON AIR tally and heartbeat trace in the Arena body.

Cards: **Plate** (Surfaces family); **OnAirStrip** and **ChallengeStrip** (incoming, afterglow edge cooled) form the Arena family.

### Feedback and loading

`toast` + `BrandToast` (`components/ui/toast.tsx`, 89 calls) is canonical: `plate` fill, `hairline-strong` border, `radius-plate`, a 3px left rule (success `ink`, deliberately not green; error `signal-red`; info `ink-3`), `toast-title` plus `body-12`, no shadow. The skeleton set (`components/ui/skeleton/skeleton.tsx`) runs one shared 1400ms shimmer clock. Skeleton bars (`SkeletonBlock`) are `plate-bright` (`bg-surface-4`), one tier above their host plate (`Plate`, `SkeletonPlate`, the rank and participant rows), with an `ink` band at 8% opacity, so they read at rest and under Reduce Motion (WP6, bead jits-3eeg.7). Banners (offline, update, upload progress, queue status) have no shared shell yet. Since WP4 the offline banner is a `panel` bar with a `hairline-strong` bottom edge and mono caps `ink` copy (R3 SC-1), the update banner is a `panel` card with a `hairline-strong` border, `ink` text and a `secondary` RESTART `Button`, and the critical update modal sits on `void` with `ink` / `ink-2` text (R3 SC-2).

Cards (Feedback family): **Toast**, **Skeleton**.

### Inputs and overlays

`SearchSelect` is the canonical picker. Every gorhom sheet (Share Profile through the shadcn `Sheet`, the notifications panel, the highlight pre-share and feedback sheets) shares one chrome from `components/ui/sheet.tsx` (WP1): `useSheetChrome()` gives the `panel` fill, `radius-sheet` top corners with a square bottom, a `hairline` top edge, the 30x4 `ink-3` handle, a background with no VoiceOver stop and the Reduce-Motion-aware present; `SheetBackdrop` is the `on-media-scrim` backdrop. `SheetTitle` and `DialogTitle` are DM Sans 700 14px caps, tracking 1.68px, `ink`, role header; descriptions are Inter 13px `ink-2`; `DialogContent` is a `panel` card with a `hairline` border and `radius-sheet`. Every modal backdrop is the one scrim: `bg-on-media-scrim` in classes, `ON_MEDIA.scrim` in style props. A dismissable backdrop is a labeled button and a sibling of the card, never its parent (so VoiceOver reaches the card's controls). `AuthFormField` and `EloField` fold into one form field (WP3/WP5 follow-ups); both edge a focused input in `ink-2` (since WP2), and an error in `negative`. `Switch` has the one neutral look since WP2 (R3 ST-1): `switchColors()` gives an `ink` track when on, `ink-3` when off and a `void` thumb, and the face-off record toggle shares it.

**Sheets are the default modal.** A centered dialog is the documented exception for two cases (R3 SH-5, decided in WP1): a blocking prompt that must be answered and is not dismissed by a backdrop tap (the incoming challenge prompt by decision jits-02vo.3 with `radius-sheet`; `StartBlockedSheet`; `GoLiveLocationSheet`, which gates the system location prompt), and a short read-only overlay with no actions (`CompareStatsModal`, through `Dialog`). Anything else with actions or a list is a sheet.

Card (Surfaces family): **Sheet** (shipped in WP1, 8px top corners).

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
| Actions | Button (WP3: primary, secondary, ghost, destructive outline in `negative`; rest, pressed, disabled, busy) | `components/ui/elo-system/button.tsx` |
| Actions | OutlineAction | `components/arena/strip-primitives.tsx` |
| Status | MetaTag | `components/ui/elo-system/meta-tag.tsx` |
| Status | LivePill (with LiveDot) | `components/ui/elo-system/live-pill.tsx` |
| Status | CountPill (with tab badges) | `components/ui/count-pill.tsx`, `elo-tab-bar.tsx` |
| Data | EloTile | `components/ui/elo-system/elo-tile.tsx` |
| Data | RollingNumber (settled frame) | `components/ui/elo-system/rolling-number.tsx` |
| Data | DeltaChip | `components/ui/elo-system/delta-chip.tsx` |
| Navigation | TabBar (Arena icon live ember and countable embers) | `components/layout/elo-tab-bar.tsx`, `arena-tab-icon.tsx` |
| Navigation | AppHeader (with the header status chip) | `components/layout/app-header.tsx`, `header-status-chip.tsx` |
| Navigation | Chip (shipped, WP2; selected: `plate-bright`, `hairline-strong`, `ink`) | `components/ui/elo-system/chip.tsx` |
| Surfaces | Plate | `components/ui/elo-system/plate.tsx` |
| Surfaces | Sheet (shipped, WP1: 8px top corners) | `components/ui/sheet.tsx` (`useSheetChrome()`) and the direct sheets |
| Feedback | Toast | `components/ui/toast.tsx` |
| Feedback | Skeleton | `components/ui/skeleton/skeleton.tsx` |
| Identity | Avatar | `components/ui/elo-system/avatar-32.tsx` |
| Arena | OnAirStrip | `components/arena/on-air-strip.tsx` |
| Arena | ChallengeStrip (incoming, afterglow edge cooled) | `components/arena/mat-board.tsx`, `afterglow-edge.tsx` |
| Match flow | Countdown | `components/match-flow/countdown/countdown.tsx` |
| Match flow | RatingMoment (verdict rating card and the tap) | `components/match-flow/verdict/rating-moment.tsx` |

## Web parity

`components/ui/elo-system/` exists on both platforms and must stay in parity (jits_web `CLAUDE.md:117`). Web has avatar-32, chip, data-row, delta-number, elo-tile, live-dot, live-pill, meta-tag, outcome-tag, participant-row, plate, rank-row, wordmark. Mobile only: `RollingNumber`, `DeltaChip`, `ErMark`, the splash set, every fight and Arena strip primitive. Gaps: web `EloTile` lacks `tone`, `playKey`, `meta` and the roll; web `LivePill` / `LiveDot` lack `pace`, `onDark` and the shared tempo clock.
