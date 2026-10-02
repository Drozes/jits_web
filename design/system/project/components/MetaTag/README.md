# MetaTag

MetaTag is the small uppercase mono label in a hairline box that names a section or a card's state ("Recent Matches", "In progress").

## Props, variants, states

| Prop | Values | Notes |
|---|---|---|
| `children` | text | Drawn uppercase, JetBrains Mono 400 10px, tracking 1.68px (`tracking-caps-l`), `ink-2`. |
| `className`, `ViewProps` | | Self-aligns to the start of its row. |

One variant, static. Padding 7px x 3.5px (`px-2 py-1` at rem 14). Real copy in the preview comes from Home, Profile, Rankings and the dashboard cards.

## Tokens used

`hairline` (border), `ink-2` (text), `radius-tag` 2px, `space-2` 7px, `space-1` 3.5px; type `mono` 400.

## Motion

None.

## Source

`apps/mobile/components/ui/elo-system/meta-tag.tsx`. 21 JSX uses in 17 files.

## Web twin and parity

`apps/web/components/ui/elo-system/meta-tag.tsx`. Same recipe; web tracking is `0.12em` (1.2px at 10px), mobile is a fixed 1.68px, so mobile tags are wider-tracked.

## Do and don't

- Do use it for section labels and card states.
- Do keep the copy short (one to three words).
- Don't color it: state color belongs on rails, dots and numbers, not on the tag. `OutcomeTag`, the participant status badge, `FilmBadge` and `HudTag` are planned to fold into one `Tag` with tones (see Components).
- Don't use it as a button; it has no pressed state.
