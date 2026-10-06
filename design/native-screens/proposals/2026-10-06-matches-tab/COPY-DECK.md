# Matches tab and Home reel carousel: copy deck (PROPOSED, FOR OWNER REVIEW; reviewed 2026-10-06)

Every user-facing string on the `P-MT-*` boards, by board and state. Source: `specs/matches-tab/spec.md`
section 11 (ids `C-*`), the Oct 4 video status deck for badge strings (`lib/video/video-status-copy.ts`
`CARD_BADGE`, `PHASE_TAG`), and shipped strings where the spec says "carried". Spec copy wins.

Conventions: source strings are sentence case; tags, badges and buttons render caps by style (mono caps
or the `button` style), so VoiceOver reads words. No em dashes, no exclamation marks, no emoji. The in-app
noun is "highlight". `{opp}` is the opponent short name (`D. Okafor`), `{mmss}` the deck countdown,
`{pct}` a whole percent. Sample data (names, numbers, dates) is illustrative and not copy.

## Navigation (board 01)

| Id | Where | String |
|---|---|---|
| C-T1 | Tab label | `Matches` (other tabs unchanged: `Home`, `Arena`, `Rankings`, `Profile`) |
| C-M1 | Matches TabHeader title | `Matches` |
| shipped | Header status chip (sample) | `GO LIVE · 5` |

## Matches tab (boards 02, 03)

| Id | Where | String |
|---|---|---|
| shipped `recordStrip` | Record strip | `{n} MATCHES · {w}W {l}L {d}D · {elo}` (e.g. `21 MATCHES · 14W 6L 1D · 1487`) |
| C-M2 | Carousel lane title (MetaTag) | `Your highlights` |
| shipped | Filter chips | `All`, `Wins`, `Losses`, `Draws`, `Opponent ▾` (selected opponent: `vs {opp} ▾`) |
| shipped | Month header | `{MONTH YYYY}` and `{n} MATCHES` |
| shipped `shortDate` | Meta date | `OCT 04` |
| shipped `deltaLabel` | Meta delta | `▲ +18` (gain-green), `▼ −11` (negative), `± 0` (neutral ink-3 in lists) |
| C-M14 | Meta, delta unknown | `Pending` |
| C-M13 | Meta, disputed tag | `DISPUTED` |
| C-L3 | Meta tag, oldest match | `FIRST MATCH` |
| C-L4 | Meta tag, oldest win | `FIRST WIN` |
| C-L7 | Fallback art caption, no film | `No film for this one` |
| C-L6 | Recording helper (first no-film card only, and not while the lane already shows C-L6) | `Turn on Record from my phone at face-off.` |
| C-M10 | a11y, media tap (playable) | `Play match vs {opp}` |
| C-M11 | a11y, meta row | `Open match vs {opp}` (VoiceOver then reads outcome word, delta, date) |
| C-M12 | a11y, ready tile | `Watch your highlight vs {opp}` plus `, unwatched` when unseen |

Card badges (one per card, deck priority, board 03 top to bottom):

| State | Badge | Tone |
|---|---|---|
| Didn't upload, retry works | `DIDN'T UPLOAD` (plus `Try again` button) | red (muted when terminal) |
| Upload paused | `UPLOAD PAUSED` (caption `Still arrives after upload`) | amber |
| Uploading on this phone | `UPLOADING 42%` with track | amber |
| Waiting for another angle | `WAITING {mmss}` (e.g. `WAITING 8:12`) | amber |
| Building | `BUILDING HIGHLIGHT` | amber |
| Collecting | `UPLOADING` | amber |
| New | `NEW` | light chip |
| Ready | `BREAKDOWN READY` | outline |
| No usable film | `NO FILM` | muted |
| No film recorded | none (fallback caption C-L7) | |
| Server processing failed | `FAILED` (fallback caption `Film failed to process`) | red |
| Processing (film landed, not playable) | none (fallback caption `Processing film`, shipped `PROCESSING FILM`) | |
| Shipped fallback without a phase | `ANALYZING 3/7` | amber |

## Loading, filters, offline, errors (board 04)

| Id | Where | String |
|---|---|---|
| shipped | Loading a11y | `Loading your matches` |
| C-F2 | Filter empty | `NO MATCHES FOR THIS FILTER` / `Try another result or opponent.` / `Show all` |
| C-F1 | Filter empty, older pages unloaded | `NO MATCHES FOR THIS FILTER YET` / `Older matches have not loaded yet.` / `Search older matches` |
| C-E1 | Error, nothing cached | `COULDN'T LOAD YOUR MATCHES` / `Check your connection and try again.` / `Try again` |
| shipped | Offline banner | `You're offline. Some features may not work.` |
| C-E2 | Toast, error with cache | `Couldn't refresh your matches` |
| C-E3 | Load more failed (carried ListFooter) | `COULDN'T LOAD MORE. TAP TO RETRY` |

## Home (boards 05, 06, 07)

| Id | Where | String |
|---|---|---|
| C-HM1 | Lane title (MetaTag) | `Your reels` |
| C-HM2 | See all tile (more than 10 reels) | `See all` |
| shipped | Welcome tag | `Welcome back` (zero matches: `Welcome`) |
| shipped | Activity | `Recent Activity`, toggle `All` / `Me`, rows `{A} defeated {B} by submission`, `{A} drew with {B}`, time `Today`, `Yesterday`, `2d ago` |
| shipped | Resume card (board 06) | `Match in progress`, tag `In progress`, `vs {name}. Pick up where you left off.`, `Resume match →` |
| board 07 | Future lane titles | `Elo reels`, `Friend reels`, `Athletes you might follow`; chip `Future, not in phase 1`; card button `Follow` |
| board 07 | Gate notes (annotation, not shipped copy) | `Gate: Terms v2 live (jr_be-dd4.5) and a spec 016 amendment for in-app reads. Epic jr_be-o7c.`; `Gate: footage consent decision jr_be-17f (every clip shows two athletes). Epic jr_be-tjx.`; `Gate: a follows table, RLS and a suggestions RPC, after jr_be-17f. Epic jr_be-293.` |

## Reel tiles and in-flight (boards 02, 05, 14)

| Id | Where | String |
|---|---|---|
| tile | Under a ready tile | `vs {opp}`; duration chip `28s` |
| C-B1 | Building step 1 (planning or waiting) | `Finding your best moments` |
| C-B2 | Building step 2 (rendering) | `Cutting your highlight` |
| tile | Building step label | `Step 1 of 2`, `Step 2 of 2` |
| C-B3 | Waiting with a deadline | `Waiting {mmss}`; at 0:00 `Any second now` |
| C-B4 | Under a building tile | `Usually 1 to 3 minutes` |
| a11y | Building tile | `Building your highlight vs {opp}, step {n} of 2. Opens the match` |

## Reel viewer (board 08)

| Id | Where | String |
|---|---|---|
| shipped | Header | Close, `Your highlight` |
| shipped | Meta | `28s · Version 1` |
| shipped | Actions | `Share to Instagram`, `Save to Photos`, `Improve this reel` |
| C-V1 (spec 8, AC 4.6) | Swipe hint, once per install, only when the lane has 2+ pages | `Swipe up for the next one` |

## Profile (board 09)

All strings are the shipped Profile board's: `Share profile`, `Friends`, `Matches`, `Win Rate`, `Streak`,
`Best`, `ELO/Mo`, `View Detailed Stats`, `Account`, `Theme` (`Light`, `Dark`, `System`), `Edit Profile`,
`Settings & Privacy`, `Sign Out`, `ELO RATED Beta`, `v0.5.0 (25) · Embedded`. Removed: `Recent Matches`,
`Highlights`, `Film Room` and its line. No `View all matches` (PM1).

## Zero matches (boards 10, 11)

| Id | Where | String |
|---|---|---|
| C-Z2 | Ghost reel tile (both surfaces) | `Your first highlight lands here` |
| C-Z1 | Ghost match card | `Your first match will show up here` |
| C-Z3 | Progress line | `0 of 1 matches to your first highlight` |
| C-Z4 | Primary CTA, red (Matches only) | `Find a match in the Arena` |
| C-Z5 | Secondary text button (practice eligible) | `Try a practice match` |
| C-Z6 | Helper | `Turn on Record from my phone at face-off and we cut your best moments into a highlight.` |
| C-HZ1 | Home CTA tile (secondary, Swords) | `Get your first highlight` |
| shipped | Practice offer (Home, holds the red) | `Try a practice match`, tag `Practice`, `Walk through a real Arena match against a practice bot. No rating, nobody else sees it, about a minute.`, `Start practice`, `Not now` |

## Low data (boards 12, 13)

| Id | Where | String |
|---|---|---|
| C-L5 | No reels ghost tile | `Record your next match to get a highlight` |
| C-L6 | Recording helper (under the lane) | `Turn on Record from my phone at face-off.` |
| C-L1 | Next match ghost card | `Your next match goes here` |
| C-L2 | Ghost card text button, Home CTA tile | `Find a match` |
| C-L3 / C-L4 | Meta tags | `FIRST MATCH`, `FIRST WIN` |
| C-L7 | No-film caption | `No film for this one` |

## Milestones (board 15)

| Id | Where | String |
|---|---|---|
| C-C1 | Banner, first match (Matches, first card) | `First match in the books` |
| C-C2 | Banner, first win (Matches, that card; also replaces C-C1 when one match is both) | `First win. That one counts.` |
| C-C3 | Banner, first highlight (Home lane, else Matches carousel) | `Your first highlight is ready` |

## Highlights off (board 16)

| Id | Where | String |
|---|---|---|
| C-Z2b | Ghost match card, clips off | `Your first match lands here` |
| C-L6 | Helper, clips off (replaces C-Z6, spec 10.7) | `Turn on Record from my phone at face-off.` |
| C-Z3 | Omitted with clips off | |

## Help (not drawn)

| Id | Where | String |
|---|---|---|
| C-H1 | Settings, Help, footage answer | `You own your match footage. Your recorded matches are in the Matches tab, where you can watch them back. Server-side retention on the free tier may be limited; access to your own data is not.` |
