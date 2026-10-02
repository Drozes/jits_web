# Plate

Plate is the standard content container: a plate-tier surface with a 1px hairline border, 4px corners and 14px padding, plus an optional 3px left rail that names the plate's state.

## Props, variants, states

| Prop | Values | Notes |
|---|---|---|
| `variant` | `default` (1px hairline left edge), `accent` (3px `signal-red` rail), `live` (3px `gain-green`), `win` (3px `gain-green`), `loss` (3px `negative`) | The rail is the only variant difference. |
| `className`, `ViewProps` | | Callers add gaps and margins. |

Static: no pressed, disabled or loading state of its own. Loading uses `SkeletonPlate` (see Skeleton), which mirrors Plate 1:1.

The preview shows two real Home cards (the practice offer on `default`, Resume match on `accent`, copy verbatim from `components/dashboard/practice-offer-card.tsx` and `resume-match-card.tsx`) and the three state rails.

## Tokens used

`plate` (fill), `hairline` (border and default left edge), `signal-red` (accent rail), `gain-green` (live and win rails), `negative` (loss rail), `radius-plate` 4px, `space-4` 14px padding, `stroke-hairline` 1px, `stroke-rail` 3px. Inside the cards: `ink`, `ink-2`, `ink-3`, `on-signal`.

## Motion

None. Plates appear with their screen; the Rankings, Arena roster and Profile lists use the registry row "List enter stagger" (first load only) on the rows, not on Plate itself.

## Source

`apps/mobile/components/ui/elo-system/plate.tsx` (classes `bg-surface-3 border border-hairline rounded-md p-4`, rails `border-l-[3px] border-l-cta|positive|negative`). 71 JSX uses in 48 files: the dominant surface.

## Web twin and parity

`apps/web/components/ui/elo-system/plate.tsx`. Same variants and 3px rails. Web padding is `var(--space-4)` = 16px; mobile `p-4` at rem 14 is 14px (every mobile spacing class renders at 87.5% of the web px value).

## Do and don't

- Do use Plate for every card-like container; the shadcn `Card` is dead and must not be used.
- Do keep one red CTA per surface. A Home screen that shows the practice offer gives it Home's red CTA.
- Don't add shadows or a second border color; hierarchy comes from the surface step (`void` to `panel` to `plate` to `plate-bright`).
- Don't use the `accent` rail as decoration: it marks the plate that holds the surface's primary action or the athlete's own active thing.
- Don't use `win`/`live` green for anything but gains, wins and live state.
