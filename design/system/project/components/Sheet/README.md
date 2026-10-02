# Sheet

Sheet is the bottom sheet chrome for every modal surface: a panel-tier sheet with 8px top corners, a hairline top edge, a 30x4 ink-3 handle, a brand caps title, and the shared 55% black scrim behind it.

**Status: Target (WP1).** Today the app has three sheet mechanisms (the shadcn `Sheet` wrapper on `@gorhom/bottom-sheet`, used once by Share Profile; direct `BottomSheetModal` in the notifications panel, pre-share and highlight feedback sheets; RN `Modal` sheets for the challenge prompt, start-blocked and go-live-location prompts and pickers). Every gorhom sheet keeps the library's default 15px corner radius (finding SH-1), the shadcn wrapper uses the legacy `card` and `mutedForeground` tokens (SH-2), and its title falls back to the system font (SH-3). WP1 (bead jits-3eeg.2) gives them one shared background and handle style with 8px top corners, the brand title, one scrim token and a Reduce-Motion-aware present animation. The card shows the target first and today's Share Profile chrome below (its legacy `card` fill is approximated with `panel`; the 15px corners and the system-font title are exact).

## Props, variants, states

Today's API (`components/ui/sheet.tsx`): `Sheet`, `SheetTrigger` (`asChild`), `SheetContent` (`snapPoints`, default `["50%", "90%"]`; pan down to close), `SheetHeader` (6px gap, 10.5px bottom padding), `SheetFooter`, `SheetTitle`, `SheetDescription`, `SheetClose`, `controllerRef`. Content padding 14px.

| Part | Target |
|---|---|
| Background | `panel` (the notifications panel already uses it), top corners `radius-sheet` 8px, square bottom |
| Handle | gorhom indicator 30x4, `ink-3` |
| Title | DM Sans 700 caps, `ink` (Notifications uses 14px with tracking 1.68px) |
| Description | Inter, `ink-2` |
| Scrim | `on-media-scrim` (black 55%); five literals today (SH-4) |

States: closed, open at a snap point, dragging, closing. The challenge prompt is centred by decision and keeps `PROMPT_RADIUS` 8.

The preview's content is the real Share Profile sheet (`components/share-profile-sheet.tsx`): accent Plate with the athlete's name, ELO, record in mono and weight in lbs, the red "Share my number" CTA with lucide Share2, and the privacy note with lucide Info.

## Tokens used

`panel`, `hairline`, `ink`, `ink-2`, `ink-3`, `on-media-scrim`, `radius-sheet` 8px; content uses `plate`, `signal-red`, `on-signal`, `negative`, `radius-plate`, `radius-button`.

## Motion

Today: gorhom's slide and RN `Modal` `fade`/`slide`, none registered or gated on Reduce Motion (MO-5). WP1 adds a "Sheet / modal present" Reactive registry row and `useModalAnimation()` returning no animation under Reduce Motion. The preview shows the open, settled frame.

## Source

`apps/mobile/components/ui/sheet.tsx`, `components/share-profile-sheet.tsx`, `components/notifications/notification-panel.tsx`, `components/highlight-viewer/pre-share-sheet.tsx`, `components/match-detail/highlight/highlight-feedback-sheet.tsx`, `components/arena/challenge-prompt-sheet.tsx` (`PROMPT_RADIUS`, `PROMPT_BACKDROP`).

## Web twin and parity

`apps/web/components/ui/sheet.tsx` (shadcn). Web modals use 8px (`rounded-lg`).

## Do and don't

- Do use a sheet as the default modal; document any centred exception.
- Do keep corners at 8px or less and no shadow.
- Don't stack two sheets.
- Don't use the shadcn `SheetTitle` styling (system font) on a user-facing sheet.
