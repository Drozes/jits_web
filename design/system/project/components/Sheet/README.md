# Sheet

Sheet is the bottom sheet chrome for every modal surface: a panel-tier sheet with 8px top corners, a hairline top edge, a 30x4 ink-3 handle, a brand caps title, and the shared 55% black scrim behind it.

**Status: Shipped (WP1, bead jits-3eeg.2).** Every gorhom sheet (Share Profile through the shadcn `Sheet` wrapper; the notifications panel, highlight pre-share and highlight feedback sheets as direct `BottomSheetModal`s) spreads `useSheetChrome()` from `components/ui/sheet.tsx`: the `panel` background with 8px top corners, a square bottom and a `hairline` top edge (gorhom's default 15px radius, finding SH-1, is gone), the 30x4 `ink-3` handle, a background with no VoiceOver stop, and the Reduce-Motion-aware present. `SheetBackdrop` is the one `on-media-scrim` backdrop. `SheetTitle` is the brand caps title (SH-3) and the legacy `card` / `mutedForeground` tokens are gone (SH-2). RN `Modal` pickers (date of birth, Film Room opponent) use `SHEET_RADIUS`, the same scrim and `useModalAnimation("slide")`. The card shows the shipped chrome first and the pre-WP1 Share Profile chrome below for reference (its legacy `card` fill is approximated with `panel`; the 15px corners and the system-font title are exact).

## Props, variants, states

API (`components/ui/sheet.tsx`): `Sheet`, `SheetTrigger` (`asChild`), `SheetContent` (`snapPoints`, default `["50%", "90%"]`; pan down to close), `SheetHeader` (6px gap, 10.5px bottom padding), `SheetFooter`, `SheetTitle` (role header), `SheetDescription`, `SheetClose`, `controllerRef`. Content padding 14px. Shared chrome for any `BottomSheetModal`: `useSheetChrome()` (spread it), `SheetBackdrop` (`pressBehavior` `close` by default), `SheetBackground`, `sheetBackgroundStyle(tokens)`, `sheetHandleIndicatorStyle(tokens)`, `SHEET_RADIUS`.

| Part | Shipped (WP1) |
|---|---|
| Background | `panel`, top corners `radius-sheet` 8px, square bottom, 1px `hairline` top edge |
| Handle | gorhom indicator 30x4, `ink-3` |
| Title | DM Sans 700 14px caps, tracking 1.68px, `ink` (same as Notifications) |
| Description | Inter 13px, `ink-2` |
| Scrim | `on-media-scrim` (black 55%): `SheetBackdrop`, `bg-on-media-scrim`, `ON_MEDIA.scrim` |

States: closed, open at a snap point, dragging, closing. The challenge prompt is centred by decision and keeps `PROMPT_RADIUS` 8.

The preview's content is the real Share Profile sheet (`components/share-profile-sheet.tsx`): accent Plate with the athlete's name, ELO, record in mono and weight in lbs, the red "Share my number" CTA with lucide Share2, and the privacy note with lucide Info.

## Tokens used

`panel`, `hairline`, `ink`, `ink-2`, `ink-3`, `on-media-scrim`, `radius-sheet` 8px; content uses `plate`, `signal-red`, `on-signal`, `negative`, `radius-plate`, `radius-button`.

## Motion

"Sheet / modal present" (Reactive registry row): gorhom sheets slide on a `fast` (240ms) brand ease-out timing (`useSheetAnimationConfigs()`, inside `useSheetChrome()`), RN `Modal` sheets slide and centered dialogs fade (`useModalAnimation()`). Under Reduce Motion both appear and leave in place (gorhom `ReduceMotion.Always`, `animationType` `"none"`). The preview shows the open, settled frame.

## Source

`apps/mobile/components/ui/sheet.tsx`, `components/share-profile-sheet.tsx`, `components/notifications/notification-panel.tsx`, `components/highlight-viewer/pre-share-sheet.tsx`, `components/match-detail/highlight/highlight-feedback-sheet.tsx`, `components/arena/challenge-prompt-sheet.tsx` (`PROMPT_RADIUS`, `PROMPT_BACKDROP`).

## Web twin and parity

`apps/web/components/ui/sheet.tsx` (shadcn). Web modals use 8px (`rounded-lg`).

## Do and don't

- Do use a sheet as the default modal. Centred exceptions are documented (DESIGN.md, "Inputs and overlays"): blocking prompts (challenge prompt, start blocked, go-live location) and the read-only Compare Stats dialog.
- Do keep corners at 8px or less and no shadow.
- Don't stack two sheets.
- Don't set a sheet's own `backgroundStyle`, `handleIndicatorStyle` or black backdrop literal; the guard test `__tests__/components/ui/modal-chrome-guard.test.ts` fails on it.
