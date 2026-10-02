# OutlineAction

OutlineAction is the compact outline button of the Arena strips (ROLL, OPEN, CANCEL, CONFIRM): 28px tall, 2px corners, a strong hairline and an 11px DM Sans caps label, with a 44pt hit area.

## Props, variants, states

| Prop | Values | Notes |
|---|---|---|
| `label` | string | Drawn uppercase. Real labels: Roll, Open, Cancel, Confirm. |
| `accessibilityLabel` | string, required | Says what the action does ("Open challenge", "Cancel challenge"). |
| `accessibilityHint` | string | Tells apart two buttons with the same label. |
| `onPress` | function | |
| `disabled` | boolean | 0.5 opacity, inert. |
| `dim` | boolean | Muted: `hairline` border and `ink-3` label (an offline ROLL, which goes live rather than challenging). |

States: default, pressed (scale 0.97 plus `plate-bright` fill from `active:bg-surface-4`), disabled, dim. `hitSlop` adds 8pt above and below so the 28pt control has a 44pt target. Text scales with Dynamic Type up to `MAX_SCALE` 1.3.

In the target kit (WP3) this is the visual of `Button` at its compact outline size; the component itself stays.

## Tokens used

`hairline-strong` (border), `hairline` (dim border), `ink` / `ink-3` (label), `plate-bright` (pressed fill), `radius-tag` 2px, `size-action` 28px, `size-hit` 44px, `opacity-disabled`; type `heading` 700 11px, tracking 1.12px. Shown on `panel`, the strip surface it lives on.

## Motion

Registry row **Press scale** (Reactive) via `PressableScale`: 0.97 on press-in over 100ms, `spring.press` back; Reduce Motion dips to 0.85 opacity. No haptic prop: a caller that commits (ROLL sends a challenge) fires `haptics.press` itself.

## Source

`apps/mobile/components/arena/strip-primitives.tsx` (`OutlineAction`, `MAX_SCALE`). Used by the Mat Board strips (`components/arena/mat-board.tsx`) and the invite Booked strip (`components/invite/booked-strip.tsx`).

## Web twin and parity

None. The web Arena has no strip primitives.

## Do and don't

- Do use it inside strips and dense rows where a 56px button would not fit.
- Do always pass a specific `accessibilityLabel`; the visible label is one word.
- Don't fill it red: a strip's red is its left rail, never its action.
- Don't put two OutlineActions with the same label in one row without an `accessibilityHint`.
