# Button

Button is the one brand button of the target kit (work package WP3): Signal Red primary, plate-and-hairline secondary, text-only ghost and an outlined destructive, all on `PressableScale` so every press scales to 0.97.

**Status: Target (WP3).** Today the app has five overlapping button implementations (`FightButton`, the auth `CtaButton`/`SecondaryButton`/`TertiaryButton`/`DestructiveButton`, `ViewerButton`, `PracticeButton`, and the legacy shadcn `Button`). WP3 (bead jits-3eeg.4) replaces them with this one component, built from `FightButton`'s API. The card shows the target first and today's most-used family (the auth buttons) at the bottom.

## Props, variants, states

| Prop | Values | Notes |
|---|---|---|
| `label` | string | DM Sans Bold, uppercase, 14px (ghost 13px), tracking 1.12px. |
| `variant` | `primary` (default), `secondary`, `ghost`, `destructive` | `glass` (over media) is also planned in WP3; it is not drawn here. |
| `height` | number, default 56 | Real call sites use 44, 56, 64 and 72. |
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

**Destructive is a kit proposal.** The code has no ELO destructive button: today's `DestructiveButton` (one use, Delete account) fills with the legacy `bg-destructive` red under a #E8EDF2 label at 3.54:1, which would also read as a second red CTA. The kit draws it as an outline in `negative` (AA in both themes: 6.28:1 on `void` dark, 6.37:1 light; 5.22:1 and 5.13:1 on `plate`) and lists it under Open decisions for the owner to confirm.

**Secondary fill.** `FightButton` secondary uses `usePalette().secondaryBg` (white 8% dark, Void 5% light), which is not a kit token; the target uses the BT-2 fix (`plate` with `hairline-strong`), matching the auth `SecondaryButton` that 16 call sites already use.

The spinner is a static stand-in for the native `ActivityIndicator`, which the preview cannot draw.

## Tokens used

`signal-red`, `signal-red-lift`, `on-signal`, `plate`, `plate-bright`, `hairline-strong`, `ink`, `ink-2`, `negative`, `radius-button` 3px, `size-button` 56px, `size-hit` 44px, `opacity-disabled` 0.5, `opacity-pressed` 0.7; type `heading` (DM Sans 700).

## Motion

Registry row **Press scale** (Reactive): press-in to `PRESS_SCALE` 0.97 over `duration.instant` (100ms) on `easing.brandOut`, release on `spring.press` (damping 18, stiffness 300); disabled controls do not move. Reduce Motion: a 0.85 opacity dip while held, haptic kept. Registry row **Steel sheen** (Ambient) through `sheen`: an 800ms sweep with about 2s rest, paused in the background, none under Reduce Motion. Busy uses the native spinner. The preview shows the pressed frame at rest scale 0.97.

## Source

- Target API: `apps/mobile/components/match-flow/fight/fight-ui.tsx` (`FightButton`), `apps/mobile/components/ui/pressable-scale.tsx`, `apps/mobile/components/ui/steel-sheen.tsx`.
- Today: `apps/mobile/components/auth/auth-buttons.tsx` (CtaButton 30, SecondaryButton 16, TertiaryButton 19 call sites, DestructiveButton 1), `apps/mobile/components/ui/button.tsx` (legacy shadcn, admin only), `components/highlight-viewer/viewer-button.tsx`, `components/practice/practice-steps.tsx`.
- Work package: WP3 in Conformance (findings BT-1 to BT-7).

## Web twin and parity

Web uses the shadcn `apps/web/components/ui/button.tsx` with a CSS `:active` press (`scale 0.98`, `opacity 0.9`). There is no web twin of the target Button yet; the web press scale is 0.98, mobile 0.97.

## Do and don't

- Do give each surface at most one `primary` button.
- Do use `busy` for in-flight actions instead of swapping the label to "Saving..." or a free-floating spinner.
- Do pass `haptic` only on commit actions that do not already buzz.
- Don't use a raw `Pressable` with a function `style` for a button (NativeWind drops it on device).
- Don't put Signal Red text on a Signal Red fill, or the brand red as text anywhere (`signal-red-text` exists for red text).
- Don't use `sheen` on more than one button per screen.
