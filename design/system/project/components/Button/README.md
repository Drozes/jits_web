# Button

Button is the one brand button of the kit (work package WP3): Signal Red primary, plate-and-hairline secondary, text-only ghost and an outlined destructive, all on `PressableScale` so every press scales to 0.97.

**Status: Shipped (WP3, bead jits-3eeg.4).** `apps/mobile/components/ui/elo-system/button.tsx` is the one button, built from `FightButton`'s API; `FightButton` is now a thin match-flow alias of it. It replaced the auth `CtaButton`/`SecondaryButton`/`TertiaryButton`/`DestructiveButton`, `ViewerButton`, `PracticeButton`, about ten hand-rolled red CTAs and four hand-rolled secondary buttons, and the legacy shadcn `Button` everywhere except the update banner (WP4 restyles that and deletes the shadcn file). The preview's bottom row still shows the retired auth buttons for comparison.

## Props, variants, states

| Prop | Values | Notes |
|---|---|---|
| `label` | string | DM Sans Bold, uppercase, 14px (ghost 13px), tracking 1.12px. Dynamic Type scales it up to `BUTTON_MAX_FONT_SCALE` (1.6); a wrapped label grows the button, since `height` is a minimum. |
| `labelContent` | node | Drawn inside the label in place of `label` (for example mono digits, "Regenerate (3 left)"); `label` stays the accessible name. |
| `accessibilityLabel` | string | Defaults to `label`. |
| `className`, `style` | | Placement only (`w-full`, `flex-1`, margins, `self-center`); `style` is applied last (for example `paddingHorizontal: 0` on an inline ghost link). |
| `hitSlop` | number or insets | Defaults to 8 on `ghost` and on any button shorter than 44, so the touch target stays 44pt. |
| `variant` | `primary` (default), `secondary`, `ghost`, `destructive`, `glass` | `glass` is the on-media look over camera or film (fixed in both themes: white 12% fill, white 40% hairline, white 20% pressed); it is not drawn here. |
| `height` | number, default 56 | A minimum height (`minHeight` plus up to 8px vertical padding): exactly this tall at normal text sizes, taller when a large label wraps. Real call sites use 28 to 72. |
| `icon` | `(color) => node` | Drawn left of the label in the label color, 10px gap. |
| `trailing` | node | Right-aligned mono note (for example "PROCESSING"); the row becomes space-between. |
| `busy` | boolean | Spinner replaces the icon, the button is inert, `accessibilityState.busy`. |
| `disabled` | boolean | 0.5 opacity, inert (no scale, no haptic). |
| `haptic` | `true`, `"press"`, `"accept"` | Commit actions only; one haptic per event. |
| `sheen` | boolean | Steel sheen while the action waits on this user; at most one per screen; never while disabled or busy. |

| State | Primary | Secondary | Ghost | Destructive |
|---|---|---|---|---|
| default | `signal-red` fill, `on-signal` label | `plate` fill, `hairline-strong` border, `ink` label | no fill, `ink` label | no fill, `negative` border and label |
| pressed | `signal-red-lift` fill, scale 0.97 | `plate-bright` fill, scale 0.97 | 0.7 opacity, scale 0.97 | `plate` fill, scale 0.97 |
| disabled | 0.5 opacity | 0.5 opacity | 0.5 opacity | 0.5 opacity |
| busy | spinner in the label color, inert | same | same | same |

Disabled text below 4.5:1 is the WCAG inactive-control exception; never use 0.5 opacity for an enabled control.

**Destructive is an outline in `negative`** (decided 2026-10-02). The retired `DestructiveButton` (one use, Delete account) filled with the legacy `bg-destructive` red under a #E8EDF2 label at 3.54:1, which also read as a second red CTA. The outline is AA in both themes: 6.28:1 on `void` dark, 6.37:1 light; 5.22:1 and 5.13:1 on `plate`.

**Ghost padding.** Ghost buttons use 8px side padding (the other variants 16px) and a default `hitSlop` of 8, so a text action sits close to its neighbours without shrinking its touch target. The retired `TertiaryButton` used 20px.

**Secondary fill.** `FightButton` secondary used `usePalette().secondaryBg` (white 8% dark, Void 5% light), which is not a kit token; the shipped Button uses `plate` with `hairline-strong` for every secondary, as the auth `SecondaryButton` did.

The spinner is a static stand-in for the native `ActivityIndicator`, which the preview cannot draw.

## Tokens used

`signal-red`, `signal-red-lift`, `on-signal`, `plate`, `plate-bright`, `hairline-strong`, `ink`, `ink-2`, `negative`, `radius-button` 3px, `size-button` 56px, `size-hit` 44px, `opacity-disabled` 0.5, `opacity-pressed` 0.7; type `heading` (DM Sans 700).

## Motion

Registry row **Press scale** (Reactive): press-in to `PRESS_SCALE` 0.97 over `duration.instant` (100ms) on `easing.brandOut`, release on `spring.press` (damping 18, stiffness 300); disabled controls do not move. Reduce Motion: a 0.85 opacity dip while held, haptic kept. Registry row **Steel sheen** (Ambient) through `sheen`: an 800ms sweep with about 2s rest, paused in the background, none under Reduce Motion. Busy uses the native spinner. The preview shows the pressed frame at rest scale 0.97.

## Source

- `apps/mobile/components/ui/elo-system/button.tsx` (`Button`, `DISABLED_OPACITY`, `BUTTON_HEIGHT`, `BUTTON_RADIUS`), on `apps/mobile/components/ui/pressable-scale.tsx` and `apps/mobile/components/ui/steel-sheen.tsx`. Colors come from the theme tokens (`useThemedTokens()`); the variant class (`bg-cta`, `bg-surface-3 border-hairline-strong`, `border-negative`) is set too.
- Alias: `apps/mobile/components/match-flow/fight/fight-ui.tsx` (`FightButton`).
- Rows, chips and toggles that do not scale use `StatePressable dim` (`PRESSED_OPACITY` 0.7, `apps/mobile/components/ui/state-pressable.tsx`).
- Guard: `apps/mobile/__tests__/components/ui/one-button-guard.test.ts`.
- Work package: WP3 in Conformance (findings BT-1 to BT-7, SC-3, A1-1 error boundary, MO-9).

## Web twin and parity

Web uses the shadcn `apps/web/components/ui/button.tsx` with a CSS `:active` press (`scale 0.98`, `opacity 0.9`). There is no web twin of the target Button yet; the web press scale is 0.98, mobile 0.97.

## Do and don't

- Do give each surface at most one `primary` button.
- Do use `busy` for in-flight actions instead of swapping the label to "Saving..." or a free-floating spinner.
- Do pass `haptic` only on commit actions that do not already buzz.
- Don't use a raw `Pressable` with a function `style` for a button (NativeWind drops it on device).
- Don't put Signal Red text on a Signal Red fill, or the brand red as text anywhere (`signal-red-text` exists for red text).
- Don't use `sheen` on more than one button per screen.
