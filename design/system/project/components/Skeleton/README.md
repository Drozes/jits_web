# Skeleton

Skeleton is the loading placeholder set: neutral `plate-bright` bars and blocks that one shared clock sweeps with a faint `ink` band, laid out to mirror the real screen.

## Props, variants, states

| Piece | Props | Notes |
|---|---|---|
| `SkeletonProvider` | `pulse` (default true) | Turns the shimmer on for its tree and holds the shared clock while mounted. |
| `SkeletonBlock` | `width`, `height`, `radius`: `xs` 2px, `md` 4px (default), `full` | One `plate-bright` rect; shimmers inside a shimmering provider, static otherwise. |
| `SkeletonText` | `lines` (1), `lastLineWidth` ("60%"), `lineHeight` (12), `gap` (6) | Stacked blocks, narrowed last line, `xs` radius. |
| `SkeletonAvatar` | `size` (32), `radius` (`md`) | Square, never circular. |
| `SkeletonPlate` | `variant`: default, accent, live | Mirrors Plate 1:1. |
| `SkeletonRankRow`, `SkeletonParticipantRow` | | Row-shaped compositions (sizes in the preview are the code's). |

Screen skeletons (`ArenaSkeleton`, `FilmRoomSkeleton`, `MatchDetailSkeleton`, `ViewerSkeleton`, Profile's) compose these. Skeletons are hidden from assistive tech.

**Bar tier (WP6, jits-3eeg.7).** `SkeletonBlock` is `bg-surface-4` (`plate-bright`), one tier above the `plate` of `Plate`, `SkeletonPlate` and the rank and participant rows, so the bars read at rest, between sweeps and under Reduce Motion (before WP6 they shared the `plate` tier and a row read as an empty plate without the band). Because no surface sits above `plate-bright`, the band is `ink` at 8% opacity: one step further in the theme's lift direction (lighter in dark, darker in light). The preview shows one sweep frame and the Reduce Motion frame side by side.

## Tokens used

`plate-bright` (bars), `ink` (band at 0.08 opacity), `plate` (the host plate and rows), `hairline`, `radius-tag`, `radius-plate`.

## Motion

Registry row **Skeleton shimmer** (Ambient): one module-level clock (`duration.shimmer` 1400ms) drives a band 40% of the bar's width across every bar, in phase; only `translateX` animates. Held by providers, paused in the background. Reduce Motion: plain static bars. No haptic. The preview freezes the band at mid-sweep (30% from the left).

## Source

`apps/mobile/components/ui/skeleton/skeleton.tsx` (`BAND_FRACTION` 0.4, `BAND_OPACITY` 0.08). Provider 7 screen sites, every one shimmering (Film Room and the highlight viewer poster frame since WP6).

## Web twin and parity

None shared: web skeletons are separate (web Tailwind `shimmer` runs 3s).

## Do and don't

- Do mirror the real layout so content lands without a jump.
- Do wrap a screen's skeleton in one `SkeletonProvider`.
- Don't use a spinner for a whole-screen load where a skeleton fits.
- Don't paint a bar the same tier as its container; check the Reduce Motion frame.
- Don't opt a loading state out of the shimmer (`pulse={false}`) to make it static; Reduce Motion already does that.
