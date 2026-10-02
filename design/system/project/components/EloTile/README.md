# EloTile

EloTile is the rating display: a plate-tier tile with a JetBrains Mono Bold tabular number (96, 64, 44 or 36px), an optional mono caps label above it, and a before/after mode whose after tile rolls like an odometer.

## Props, variants, states

| Prop | Values | Notes |
|---|---|---|
| `size` | `hero` 96, `large` 64 (default), `medium` 44, `small` 36 | Line height 1.1x, tracking -0.04x the size, tabular-nums. |
| `label` | string | Mono 700 10px `ink-3`, tracking 2.52px, 8px above the number. Home's hero tile has none. |
| `value` | number or string | Single mode. |
| `accent` | boolean | Border `signal-red` instead of `hairline`. |
| `accentBar` | boolean | 3px `signal-red` bar across the bottom (the canonical hero tile on Home). |
| `meta`, `metaLabel`, `reserveMeta` | string, string, boolean | Single mode: a mono 700 14px `ink-2` line under the number (Home's record "14W · 6L · 1D"); `reserveMeta` holds its 26px while the record loads. |
| `before`, `after` | number or string | Before/after mode: two compact tiles that share the row, a 28px mono `ink-3` arrow between. |
| `tone` | `positive`, `negative`, `amber` | After tile border: `gain-green`, `negative`, `attention`. Never the CTA red. |
| `playKey` | string | Identifies the result so the roll and its haptic play once (persisted). Without it the tile is static and silent. |

States: single, before/after static, rolling (first play), landed. Padding 17.5px x 14px (single, min width 120px) or 10.5px x 14px (compact pair). Compact numbers shrink to fit (`minimumFontScale` 0.6).

Call sites today: Home's hero tile and the practice weight step (`label="lbs"`, medium). The before/after mode has no app caller at commit 69e2e7f (the verdict uses `RatingBlock`, see RatingMoment); it is drawn here from the component.

## Tokens used

`plate`, `hairline`, `signal-red` (accent border and bar), `gain-green`, `negative`, `attention` (tones), `ink` (number), `ink-2` (meta), `ink-3` (label, arrow), `radius-plate` 4px, `stroke-rail` 3px; type `mono` 700.

## Motion

Registry row **Odometer ELO roll** (Moment) through `RollingNumber` in the after tile: only the changing digits roll, 600ms on `easing.brandOut`, once per result (`playKey`). `haptics.ratingGain` fires when a gain lands (never on a loss or a draw). Reduce Motion: the final value at once. The preview shows the landed frame.

## Source

`apps/mobile/components/ui/elo-system/elo-tile.tsx`, `rolling-number.tsx`, `components/match-detail/use-amber.ts` (amber border), `lib/athlete/record.ts` (`formatRecord`).

## Web twin and parity

`apps/web/components/ui/elo-system/elo-tile.tsx`. Parity gap: web lacks `tone`, `playKey`, `meta` and the roll.

## Do and don't

- Do keep every rating in mono tabular-nums, including while it rolls.
- Do use the tone border for the after tile, never a colored number.
- Don't use Bebas Neue for ratings below 40px; ratings are data and stay mono.
- Don't add a playKey where the same result can mount repeatedly without a stable id.
