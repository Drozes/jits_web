# Avatar

Avatar is the square athlete mark: a photo or the athlete's initials on a plate-bright square with a strong hairline and 2px corners; never a circle in the shipped app.

## Props, variants, states

**Avatar32** (`components/ui/elo-system/avatar-32.tsx`)

| Prop | Values | Notes |
|---|---|---|
| `name` | string | Initials "F·L" (first and last word, middle dot), one letter for a one-word name, "?" for none. Mono 700 10px `ink`, tracking 1.68px. Also the accessibility label. |
| `photoUrl` | string or null | Photo, cover-fit, clipped to the square. |

Size: `w-8 h-8`, which renders at **28px** on device (rem 14), despite the name. The preview's photo slot is a hatched stand-in; no athlete photo ships with the kit.

**InitialsBlock** (match flow, `components/match-flow/fight/fight-ui.tsx`): initials without a dot ("MP") on a `plate-bright` square (or `plate` when `size="fill"`), `hairline-strong` border, 2px corners; DM Sans 700, or Bebas Neue with `display`; optional 3px bottom `accent` rule (Signal Red marks "you" on the face-off card). Real sizes: 40/14 (confirm step), 88 (challenge prompt), 96/32 (waiting), 104/34 (verdict), 112/36 (result form), fill x 176 with Bebas 64 (face-off).

Planned (R2 recommendation): one square `Avatar` with sizes and initials generalized from Avatar32, replacing InitialsBlock (the round shadcn `Avatar` was deleted by WP4).

**Open decision.** The kit spec's radius rule says "avatars round", but every avatar in the shipped code is square (Avatar32 and InitialsBlock at 2px; the skeleton notes "app avatars are sharp, never circular"), and the circular-element rule is still an open DESIGN.md item (WP7, D-items). This card draws the code. The owner should confirm square or round before the Avatar consolidation lands.

## Tokens used

`plate-bright`, `plate`, `hairline-strong`, `ink`, `signal-red` (face-off "you" rule), `radius-tag` 2px, `stroke-rail` 3px; type `mono` 700, `heading` 700, `display`.

## Motion

None.

## Source

`apps/mobile/components/ui/elo-system/avatar-32.tsx`, `apps/mobile/components/match-flow/fight/fight-ui.tsx` (`InitialsBlock`, `initialsOf`, `shortName`), `apps/mobile/components/match-flow/faceoff/faceoff-top.tsx`.

## Web twin and parity

`apps/web/components/ui/elo-system/avatar-32.tsx` (32px on web, 28px on mobile because of the rem rule).

## Do and don't

- Do show initials when there is no photo; never an empty box or a generic silhouette.
- Do keep avatars square with the 2px tag radius until the open decision says otherwise.
- Don't draw a round avatar (the shadcn round `Avatar` was deleted by WP4).
- Don't color the initials; the red bottom rule on the face-off is the only accent.
