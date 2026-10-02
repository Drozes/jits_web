# Skeleton

Skeleton is the loading placeholder set: neutral plate-tier bars and blocks that one shared clock sweeps with a faint plate-bright band, laid out to mirror the real screen.

## Props, variants, states

| Piece | Props | Notes |
|---|---|---|
| `SkeletonProvider` | `pulse` (default true) | Turns the shimmer on for its tree and holds the shared clock while mounted. |
| `SkeletonBlock` | `width`, `height`, `radius`: `xs` 2px, `md` 4px (default), `full` | One `plate` rect; shimmers inside a shimmering provider, static otherwise. |
| `SkeletonText` | `lines` (1), `lastLineWidth` ("60%"), `lineHeight` (12), `gap` (6) | Stacked blocks, narrowed last line, `xs` radius. |
| `SkeletonAvatar` | `size` (32), `radius` (`md`) | Square, never circular. |
| `SkeletonPlate` | `variant`: default, accent, live | Mirrors Plate 1:1. |
| `SkeletonRankRow`, `SkeletonParticipantRow` | | Row-shaped compositions (sizes in the preview are the code's). |

Screen skeletons (`ArenaSkeleton`, `FilmRoomSkeleton`, `MatchDetailSkeleton`, `ViewerSkeleton`, Profile's) compose these. Skeletons are hidden from assistive tech.

**Known issue (flag for WP6).** `SkeletonBlock` is `bg-surface-3`, the same tier as `Plate`, `SkeletonPlate` and the rank and participant rows. Inside those containers the bars are visible only while the band crosses them; under Reduce Motion (no band) or between sweeps the row reads as an empty plate. The bars are clearly visible on `void` and `panel`. The preview shows one sweep frame and the Reduce Motion frame side by side.

## Tokens used

`plate` (bars), `plate-bright` (band at 0.55 opacity), `hairline`, `radius-tag`, `radius-plate`.

## Motion

Registry row **Skeleton shimmer** (Ambient): one module-level clock (`duration.shimmer` 1400ms) drives a band 40% of the bar's width across every bar, in phase; only `translateX` animates. Held by providers, paused in the background. Reduce Motion: plain static bars. No haptic. The preview freezes the band at mid-sweep (30% from the left).

## Source

`apps/mobile/components/ui/skeleton/skeleton.tsx` (`BAND_FRACTION` 0.4, `BAND_OPACITY` 0.55). Block 28 uses, Provider 6.

## Web twin and parity

None shared: web skeletons are separate (web Tailwind `shimmer` runs 3s).

## Do and don't

- Do mirror the real layout so content lands without a jump.
- Do wrap a screen's skeleton in one `SkeletonProvider`.
- Don't use a spinner for a whole-screen load where a skeleton fits.
- Don't put plate-tier bars on a plate-tier container without checking the Reduce Motion frame.
