# Toast

Toast is the brand toast card: a plate-tier card with a strong hairline, 4px corners, no shadow and a 3px left rule that names the type (ink for success, Signal Red for error, ink-3 for info).

## Props, variants, states

API: `toast.success`, `toast.error`, `toast.info` (and `show`, `hide`), taking a string or `{ text1, description }`, mirroring the web sonner API.

| Type | Left rule | Notes |
|---|---|---|
| `success` | `ink` | Deliberately not Gain Green (green is reserved for rating gains, wins and live). |
| `error` | `signal-red` | A failure is state-negative. |
| `info` | `ink-3` | |

Card: 16px side margins, 14px x 10.5px padding, 3.5px gap. Title DM Sans 700 13px `ink` (2 lines max); description Inter 12px `ink-2` (3 lines max). `accessibilityRole="alert"` so VoiceOver announces it. Any other type throws. `Toaster` is mounted once in `app/_layout.tsx`; `ModalToaster` is a second host inside an RN `Modal` (the challenge prompt) that hands an unfinished toast back to the root host when the modal closes.

Copy in the preview is real: "Saved locally" / "Confirmation will sync when you're back online." (confirm step, offline), "Could not share", "Result disputed" / "NAME disputed the result. An admin will review it."

## Tokens used

`plate`, `hairline-strong`, `ink`, `ink-2`, `ink-3`, `signal-red`, `radius-plate` 4px, `stroke-rail` 3px; type `heading` 700, `body` 400.

## Motion

The library's slide in and out (react-native-toast-message). It is not in the Motion registry yet and is not gated on Reduce Motion (motion hygiene item for WP6). No haptic of its own; an error flow may fire `haptics.error`.

## Source

`apps/mobile/components/ui/toast.tsx` (`BrandToast`, `toastConfig`, `Toaster`, `ModalToaster`). 89 `toast.*` calls in 35 files.

## Web twin and parity

`apps/web/components/ui/sonner.tsx` (sonner). Same three types.

## Do and don't

- Do keep the title to a short outcome and put the reason in the description.
- Do use `error` for failures and `info` for state changes caused by someone else.
- Don't color a success toast green.
- Don't add a shadow or elevation; the card already zeroes them.
