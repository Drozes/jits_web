# Proposed (Oct 6 Matches tab): boards, decisions, open questions

Status: **PROPOSED, FOR OWNER REVIEW.** Reviewed 2026-10-06 by an independent reviewer (verdict:
publishable after fixes, no blockers; every fix applied, see "Review fixes" below). Published 2026-10-06
to the canvas "ELO RATED Native Screens" (https://claude.ai/artifact/PJWm2WeqsG56HS13jHsd5D) as the page
"Proposed (Oct 6 Matches tab)", canvas version 1791312407-fcdb. Clickable prototype for the owner review:
https://claude.ai/artifact/FpPnsh7SmY36nYo1Kg7wLE (private to the owner until shared).

Spec: `specs/matches-tab/spec.md` (owner-approved direction 2026-10-06, build-ready). Beads: mobile epic
`jits-a4fw` (children `.1` to `.11`); backend `jr_be-405` (B1), `jr_be-cl1` (B2), `jr_be-pdf` (B3),
`jr_be-62n` (B4); future gated epics `jr_be-o7c`, `jr_be-tjx`, `jr_be-293`, `jr_be-7t0`. This page is
the "Proposed (Oct 6 Matches tab)" canvas page the owner asked for before build starts (spec Q4,
resolved 2026-10-06).

## Purpose

Show the owner, the implementers and the reviewer what phase 1 of the Matches tab and the Home reel
carousel looks like, in every state the spec defines: the fifth tab, the Matches feed and its cards,
the reusable reel carousel on both surfaces, the vertical swipe viewer, the leaner Profile, and the
zero, low-data, in-flight, milestone and highlights-off states. Spec copy wins everywhere; every string
on the boards is in `COPY-DECK.md` with its spec id.

## Files

| File | What it is |
|---|---|
| `project/P-MT-*.dc.html` | 17 board files for the new canvas page (Design type format: the exact `support.js` line, root size equal to the board's w/h and `$preview`, static markup only; 390 px dark, the map is 1440 px). |
| `COPY-DECK.md` | Every string by board and state, with its spec copy id. |
| `canvas-delta.json` | Additive canvas.json delta: one new page `matches-tab`, 17 boards, 3 row titles (`mt-row-0..2`), order entries. Based on canvas version `1791310189-a890`. |
| `boards.json` | Board sizes the generator wrote. |
| `generate.py` | Regenerates every board, `boards.json` and `canvas-delta.json`. Edit boards here, never the output. |
| `measure.sh` | Measures each board's natural height with headless Chrome into `heights.json`. |
| `heights.json` | Measured heights used by the final generator pass. |
| `src/17-Profile.dc.html` | Snapshot of the live Profile board (canvas version above). Board 09 is rebuilt from it by removing the three retired blocks, so the kept blocks stay pixel-identical to "Current app". Set `CANVAS_SRC` to a folder with a fresher copy to rebuild from it; the generator asserts the block order so a changed board fails loudly. |

Regenerate: `python3 generate.py && ./measure.sh && python3 generate.py heights.json`.

## Boards

| Board | One line |
|---|---|
| `P-MT-00-Map` | Map: what changed, design decisions, board links, lanes and their gates, backend asks, open questions, what is retired. |
| `P-MT-01-Tab-Bar` | Five tabs, each active; a 375 pt fit check; icon choice (Film); no Matches badge. |
| `P-MT-02-Matches-Default` | Matches tab: TabHeader, record strip, Your highlights carousel, shipped filter chips, month headers, full-width 16:9 match cards (incl. portrait, no film, disputed). |
| `P-MT-03-Card-States` | MatchFeedCard in every badge state, top to bottom by the deck priority, plus crop rule, disputed and Pending, FIRST MATCH / FIRST WIN tags. |
| `P-MT-04-Matches-Loading-Errors` | Skeleton, filter with no results (C-F1, C-F2), error, offline, error with cache (toast C-E2), load more failed. |
| `P-MT-05-Home-Default` | Home: Your reels lane first (building, unseen with ring and pulse, seen), then Welcome, Elo tile, Recent Activity with All / Me. |
| `P-MT-06-Home-Resume` | Home with a lost live match: Resume above the lane (Resume keeps Home's red CTA). |
| `P-MT-07-Home-Future-Lanes` | Annotated, greyed future lanes under Your reels with their gates and epics. Not phase 1. |
| `P-MT-08-Reel-Viewer` | Vertical swipe pager: each page is today's viewer (board 34); pager model and rules. |
| `P-MT-09-Profile-Clean` | Profile with identity, stats and settings only; no View all matches link; stat tiles not tappable. |
| `P-MT-10-Zero-Matches` | Zero matches on Matches: ghost tiles, ghost card, progress, red Find a match in the Arena, Try a practice match, helper. |
| `P-MT-11-Zero-Home` | Zero matches on Home: CTA tile Get your first highlight (secondary, never red) plus ghost; practice offer keeps the red. |
| `P-MT-12-Low-Data-Matches` | Three no-film matches: C-L5 ghost lane with helper, No film for this one, FIRST MATCH / FIRST WIN, next match ghost card with Find a match. |
| `P-MT-13-Low-Data-Home` | Home with matches but no reels: C-L5 ghost plus Find a match CTA tile, helper. |
| `P-MT-14-Reel-Tiles-In-Flight` | Every ReelTile kind (ready, building steps, waiting, ghost, CTA, See all, skeleton) and the building-to-ready reveal. |
| `P-MT-15-Milestones` | First match, first win, first highlight: banner, confetti, haptic, and the once-only rules. |
| `P-MT-16-Clips-Off` | Highlights flag off: both carousels hidden, C-Z2b zero state, no highlight promises. |

Layout on the page: the map at (0, 0); row 1 (boards 01 to 09) and row 2 (boards 10 to 16) at 470 px
pitch, rows 343 px apart with a title note 280 px above each, as the Oct 4 page. The page is new, so no
board on it can overlap another page's boards; the delta was checked for overlaps within the page and
for key collisions with the live canvas.json (none).

## Decisions

From the spec (owner and PM, 2026-10-06), as drawn:

1. Five tabs: Home · Arena · Matches · Rankings · Profile. Matches uses lucide `Film` (PM10). No badge on Matches (PM9).
2. Matches is the athlete's own history and replaces the pushed Film Room (31). Order: TabHeader, record strip, Your highlights carousel, filter chips and Opponent picker (shipped, unchanged), month headers, MatchFeedCards. Filters touch the feed only.
3. MatchFeedCard: 16:9 media at screen width minus 32, one status badge top left by the deck priority, duration and play glyph only when the selected video is playable. Media tap plays (33) when playable, else opens match detail (32); the meta row always opens match detail. Matches without film are listed with the two-athlete fallback art and C-L7.
4. Crop rule: portrait stills are pillarboxed, the image contained over a blurred cover copy of itself under a 40% void scrim; landscape and square stills fill (cover).
5. Home order: Resume (only for a lost live match), then the Your reels lane, then Welcome, Elo tile, practice offer, invite card, Recent Activity (PM7, spec 7.1). Note this moves Welcome below the lane. The lane absorbs the NEW HIGHLIGHT card and has no dismiss. Home keeps the All / Me Recent Activity toggle in phase 1 (owner, 2026-10-06).
6. Profile loses Recent Matches, the Highlights row and the Film Room preview, and gets no View all matches link (PM1). The stat tiles stay non-interactive.
7. Carousel tap opens a vertical pager over today's viewer; swipe up for the next reel, down for the previous; entry points without a lane token keep today's single-reel viewer.
8. Zero, low-data, in-flight and milestone states per spec section 10. Elo milestones are deferred (PM8, owner 2026-10-06).
9. Highlights flag off hides both carousels and every highlight promise (10.7).

Design decisions taken on this page (within the spec):

- **Unseen ring token: `ink` at `stroke-edge` (2 px), with a 2 px surface gap.** The design system ("ELO RATED Design System" README and `tokens.json`) has no highlight accent token. Its colour rules give every hue a meaning: signal-red is act or lose (and the spec forbids it here), gain-green is gain, win or live only, attention (amber) is draw or waiting, heat is the Arena's alone, and "if a color does not mean one of the above, it is grey". An unseen reel is a state, and the system draws state edges as a 2 px `stroke-edge`; `ink` is the strongest neutral and matches the light NEW film badge (`on-media-chip`), the other "unseen" mark in the app. Spec assumption 2 anticipated this ("if not, design picks one at canvas review"). No new token is proposed; if the team wants a name, a semantic alias `unseen-ring` pointing at `ink` is enough.
- Meta row keeps a chevron at the right, as decoration inside the meta tap target (aria-hidden), so the second target reads as its own control (the spec lists the row's content only).
- A draw delta in a list (`± 0`) is neutral ink-3, matching the shipped poster card's D colours; amber is kept for the verdict, DeltaChip, EloTile and stakes. Pending and DISPUTED stay amber.
- Every tile reserves two caption lines so baselines align across a lane. On Home, the CTA tile comes first, then the ghost, in both the zero and low-data states.
- Ghost match cards draw their meta placeholders as dashed hairlines, like the ghost outline. Avatar is the 24 pt square with F·L initials (Avatar32 look).
- The opponent line under a tile is `vs {opp}`; building tiles add C-B4 as a second line.
- Building tiles use the attention colour for the step progress and the waiting countdown (processing is attention's meaning), over the poster under the on-media scrim with the shared shimmer band.
- Milestone banner: a plate line with a 3 px rail (ink; gain-green for First win) and one icon. Confetti reuses the verdict confetti's brand colours (signal-red, ink, signal-red-text), 14 sharp rectangles, bursting from the banner ends and the celebrated card or tile and never over the header chrome or wordmark. A first match that was a loss uses ink-only pieces and no haptic.
- One match that is both first match and first win shows only the First win banner; both tags remain and both milestones are marked.
- Viewer swipe hint "Swipe up for the next one": shown once per install, only when the lane has 2 or more pages. Pages reuse today's viewer layout (spec 8); a full-bleed shorts page would be a separate decision.
- A lane with 1 to 2 ready reels appends one ghost tile (C-L5) so the shelf reads as filling (spec Q7, owner to confirm; drawn on board 15).
- Zero-state order on Matches: lane, ghost card, progress, red CTA, practice text button, helper. The record strip and the filter chips are hidden at zero matches (nothing to count or filter).
- Profile board is rebuilt from the live 17-Profile board, so everything Profile keeps is exactly the current app (Friends row shown, invite row hidden, as on 17).

## Future lanes and gates

None of these ships in phase 1; board 07 draws them greyed with a FUTURE chip.

| Lane | Gate | Epic |
|---|---|---|
| Your reels | Phase 1. Own highlights from `get_my_highlights`. | `jits-a4fw` |
| Elo reels | Terms v2 live (`jr_be-dd4.5`) plus a spec 016 amendment (016 G5 forbids widening in-app reads). | `jr_be-o7c` |
| Friend reels | Footage consent decision `jr_be-17f`. | `jr_be-tjx` |
| Athletes you might follow | A follows table, RLS and a suggestions RPC; after `jr_be-17f` and the visibility model. | `jr_be-293` |
| Matches visibility filter (Me / Friends / Gym / World) | Same visibility model and `jr_be-17f`; Gym may need a new affiliation model (the Arena replaced gyms and sessions). | `jr_be-7t0` |

## Changes from the partial draft (stopped designer)

- Tab icon Clapperboard changed to Film (spec PM10). Tab links retargeted to the new board names.
- Matches lane title "Your reels" changed to "Your highlights" (C-M2); Home stays "Your reels" (C-HM1).
- Cards: full-bleed 390 media changed to screen width minus 32 (358 x 201), 36 px avatar to 24 px, "2 ANGLES" chip and draft badge set replaced by the one-badge deck priority with shipped strings and tones (red uses `on-media-red`), duration as m:ss, DISPUTED and Pending added, FIRST MATCH / FIRST WIN tags added.
- Crop rule: flat void pillars replaced by the spec's blurred-cover pillarbox.
- No-film card: "No film recorded" plate replaced by fallback art with C-L7 and the once-only C-L6 helper; the "No film" badge state added.
- Filter chips redrawn to the shipped look (ink fill when selected, glass fill otherwise); the draft's invented per-filter celebration copy removed in favour of the carried C-F1 / C-F2 panels; offline and error states use carried strings; error-with-cache toast and load-more footer added; skeleton now shows the shared shimmer and the spec's skeleton set.
- Tiles: sizes per spec (Home 104 x 185, Matches 96 x 171), 8 px gap, 16 px gutter, opponent line, duration bottom left, NEW badge on tiles removed, building tile redrawn (poster, scrim, shimmer, C-B1 / C-B2 / C-B3 / C-B4), ghost tiles dashed with a silhouette, CTA and See all tiles added.
- Home: lane moved above Welcome (spec 7.1), BrandHeader inset fixed to 14 px, Recent Activity now has the All / Me toggle and the shipped row markup; new Resume board; future lanes now name their epics.
- Viewer: the invented full-bleed right-rail viewer and "all caught up" end card replaced by today's viewer (board 34) as pager pages, with a pager model diagram.
- Profile: rebuilt from the live board; the draft's tappable Matches stat (a second path to the tab, against PM1) removed; Theme row is the shipped segmented control.
- Zero and low data: draft "Go live" red CTA and invented copy replaced by spec strings (C-Z1 to C-Z6, C-HZ1, C-L1 to C-L7); Home zero is non-red with the practice offer holding the red; low-data Home now shows the no-reels lane (C-L5 plus C-L2).
- Milestones: bottom-sheet reveals replaced by the spec's 4 s banner, burst and haptic with spec copy (C-C1 to C-C3).
- New boards: 06 Home Resume, 14 tile kinds and in-flight reveal, 16 highlights off. Board files renumbered; stale draft files removed.
- `canvas-delta.json` rebased on canvas version `1791310189-a890` (the live canvas gained the "Proposed (Oct 6 angle switch)" page since the draft).

## Review fixes (2026-10-06)

1. Map status chip and this README now say "Proposed, for owner review" / "Reviewed 2026-10-06".
2. Practice links on boards 10, 11 and 16 point at `41-Practice.dc.html`.
3. Type scale: card title `vs {opp}` is 16 px (subhead); building tile "Step n of 2" is 10 px (micro).
4. Draw delta `± 0` is neutral ink-3 in lists (boards 02, 03, 15); Pending and DISPUTED stay amber.
5. Board 15 confetti starts at the banner and the celebrated card or tile and stays clear of the header; first match on a loss is ink only, haptic withheld.
6. Map open questions synced with this README, plus the pager-layout note.
7. Board 03 adds the shipped FAILED badge (red) and the PROCESSING FILM fallback caption.
8. Board 14 adds the Home lane loading frame (3 skeleton tiles).
9. Board 12 shows C-L6 once (under the lane); the card helper is dropped there.
10. Ghost card meta placeholders are dashed hairlines (boards 10, 12, 16).
11. CTA tile first on zero and low-data Home; two caption lines reserved on every tile; board 03 tag example uses MR; board 16 annotation says "should not occur"; same-match first match and first win shows only the First win banner; chevron marked decorative; swipe hint once per install, 2+ pages only.
12. Board 15 keeps the ghost after a single ready reel, annotated for the owner.
13. `canvas-delta.json` rebased on canvas version `1791310189-a890`.

## Spec conflicts (resolved in the spec on 2026-10-06)

The PM amended `specs/matches-tab/spec.md` on 2026-10-06 to settle every conflict this page raised.
They are now "Decided in design review 2026-10-06 (owner may override)" on the map:

1. Loss haptic: a first match that was a loss gets no haptic and ink-only confetti (spec 10.6 loss exception).
2. First match and first win in one match: only the First win banner shows; both tags remain (spec 10.6).
3. Swipe hint C-V1 "Swipe up for the next one", once per install, only with 2+ pages (spec 8, AC 4.6).
4. Clips off: C-L6 replaces C-Z6 (spec 10.7).
5. Record strip: the shipped `recordStrip` format (spec 6.1).
6. Unseen ring: the `unseen-ring` alias, an `ink` 2 px stroke-edge (spec 5).
7. Meta-row chevron: decoration inside the meta tap target (spec 6.2).

Still shipped-vs-example details, drawn as shipped: short date `OCT 04`, duration `4:12` (m:ss), C-E3
carried footer string. The ring pulse is registered as `moment.reelRingPulse` (600 ms).

## Assumptions

1. The live 17-Profile board is current with code (canvas-sync after OTA aaa9bb67).
2. Invites are drawn off on Home, as on the Main board; the invite card follows its flag unchanged.
3. Record strip and filter chips are hidden at zero matches.
4. The zero-match Elo tile shows `0W · 0L · 0D` (the `jits-r75.2` zero-match reframing is out of scope here).

## Open questions

1. Spec Q5: remove the Film Room redirect after two OTAs (recommendation yes).
2. Spec Q6: full-bleed shorts pager pages, later (phase 1 reuses today's viewer, spec 8).
3. Spec Q7: a lane with 1 to 2 ready reels appends one ghost tile (drawn on board 15).
4. Spec Q3: no Matches tab badge in phase 1.

## Publishing (coordinator only, after review)

Read `project/canvas.json` fresh, merge `canvas-delta.json` (append the page, add boards and notes,
append order; change no existing key), publish the 17 board files and canvas.json with the canvas `url`.
