# Matches tab + Home reel carousel (mobile, phase 1)

Status: owner-approved direction (2026-10-06), build-ready spec, amended with the owner's round-2 decisions (2026-10-06, section 2.3). Where round 2 and earlier text disagree, round 2 wins; this file has been edited throughout so it should not disagree anywhere. Author: PM agent, 2026-10-06.
Platform: `apps/mobile` only, plus five small `jr_be` RPC changes. Web is out of scope (native-first rollout rule).
Beads: mobile epic `jits-a4fw` (children `.1` to `.11`), follow-up `jits-766g`; backend `jr_be-405`, `jr_be-cl1`, `jr_be-pdf`, `jr_be-62n`, `jr_be-gpz`; future gated epics `jr_be-o7c`, `jr_be-tjx`, `jr_be-880`, `jr_be-293`, `jr_be-7t0`. Full map in section 20.

Code references below were verified against `origin/development` of both repos on 2026-10-06. The local `development` checkouts are behind (jits_web by about 220 commits, jr_be by about 100). Every implementer must branch from, and read current code at, `origin/development`, never the stale local tip.

---

## 1. Problem

The athlete's own match history is buried. Today it lives in the Film Room (`apps/mobile/app/(app)/film-room.tsx`), a pushed screen reached only from a preview block halfway down Profile (`components/profile/film-room-preview.tsx`) or from a back-button fallback on match detail. Profile itself has grown three overlapping "my matches" surfaces (Recent Matches list, the HighlightsRow, the Film Room preview) on top of identity, stats and settings, so it reads as a dumping ground rather than an identity page.

At the same time Home has no social pull. The only highlight surface there is a single "Your new highlight" card (`components/dashboard/new-highlight-card.tsx`) that appears only while one unseen reel exists and disappears as soon as it is dismissed. There is nothing that makes opening the app feel rewarding, and nothing that makes a brand new athlete want to play their first match.

Finally, low-data states are dead ends. A new athlete sees "NO FILM YET" and "No Matches Yet" panels that explain the absence instead of selling the next action, and the first match, first win and first highlight pass without any moment of celebration.

## 2. Decisions

### 2.1 Owner decisions (2026-10-06, final)

1. A fifth tab named **Matches**. Tab order: Home, Arena, Matches, Rankings, Profile. This reopens the settled four-tab decision recorded in jits_web `jits-tj5n` / `jits-icei` (a note is added there).
2. The **Matches tab is the athlete's own history only** and replaces the pushed Film Room screen. Layout, top to bottom: a horizontal reel carousel of the athlete's own highlights (9:16 tiles, a reusable component shared with Home); the Film Room filter chips (All, Wins, Losses, Draws, plus the Opponent picker); a vertical feed of full-width match cards (YouTube mobile style). Matches with no film are still listed. Keyset pagination, pull to refresh, empty state, skeletons. The Oct 4 upload strip applies here as on every tab. Portrait phone footage needs an explicit crop rule.
3. **Profile cleanup**: the Film Room preview, the HighlightsRow and the Recent Matches list leave Profile. Profile keeps identity, stats and settings.
4. **Home is the social surface.** A reel carousel at the top of Home. (Amended by round 2, R2-1: one mixed carousel titled **Highlights**, not a "Your Reels" lane.) Phase 1 fills it only with the athlete's own reels (from `get_my_highlights`), and it absorbs the `NewHighlightCard` and its unseen treatment. Friend, Local (nearby) and Elo highlights, Athletes you might follow, and a Me / Friends / Gym / World filter on the Matches tab are future, gated epics (section 18). A carousel tap opens a vertical, swipeable, shorts-style viewer; swiping between the athlete's own reels is in phase 1, full-screen (R2-2).
5. **Low-data and empty states are first-class and designed for a dopamine hit, not a dead end** (owner requirement, 2026-10-06). See section 10.

### 2.2 PM decisions taken in this spec

| # | Decision | Why |
|---|---|---|
| PM1 | Profile keeps **no** "View all matches" link. | The Matches tab is one tap away on every screen, so a link row on Profile is a second path to the same place that has to be kept in sync and pulls Profile back toward being a history page. The Profile stat tiles stay non-interactive in phase 1. If analytics later show athletes looking for history on Profile, a link row is a one-line addition. |
| PM2 | Matches tab route directory is `app/(app)/(tabs)/matches/` (`_layout.tsx` + `index.tsx`); href constant `MATCHES_TAB_HREF = "/(app)/(tabs)/matches"` replaces `FILM_ROOM_HREF` in `lib/film-room/href.ts`. | A Tabs.Screen must land with its route directory or expo-router drops it (comment in `(tabs)/_layout.tsx`). |
| PM3 | `app/(app)/film-room.tsx` becomes a one-line `<Redirect href={MATCHES_TAB_HREF} />` for two OTA releases, then is deleted (owner confirmed, Q5; tracked in `jits-766g`). | No push payload or universal link targets the Film Room today (verified in `lib/notifications/handlers.ts` and `+native-intent.tsx`), but navigation state restoration and any build running the previous bundle can still hold the path; a redirect is free insurance. |
| PM4 | Directory and file names under `components/film-room/` and `lib/film-room/` are **not** renamed. The seen-store key `film-room:seen:v1` is **not** renamed. | Renames churn imports, the canvas `board-map.json`, and a key rename would reset every athlete's NEW badges. User-facing copy changes; code names do not. |
| PM5 | Backend: the minimum is the `get_my_highlights` id tiebreak (B1). Three further small, additive changes are recommended (B2 in-flight reels, B3 elected primary flag in the library, B4 two new funnel steps). No combined `get_film_feed` / home-carousel RPC. | A combined RPC would duplicate two well-tested RPCs and their pagination for one saved round trip on Matches (library and highlights load in parallel anyway). B2 is the one change that genuinely saves Home several calls. |
| PM6 | No new native dependency. The feed uses `FlatList` (no FlashList), the celebration uses Reanimated, haptics use the already-linked `expo-haptics`. | Keeps the whole client OTA-eligible on runtime 0.4.0 (section 15). |
| PM7 | Home order: `ResumeMatchCard` (only when a lost match exists) sits above the carousel; otherwise the carousel is the first thing in the Home scroll. | A lost live match is the one urgent, money-on-the-line action and owns Home's single red CTA; it is rare. Everything else yields to the carousel. |
| PM8 | Phase 1 milestones: first match, first win, first highlight. Elo milestones are deferred. | The verdict screen already animates every Elo change, so an Elo milestone on Home would double-celebrate. The three phase 1 milestones are moments nothing celebrates today. |
| PM9 | Matches tab has no tab-bar badge in phase 1. | The Arena badge is the only tab badge and carries live state; a second badge dilutes it. Unseen reels already ring on Home. |
| PM10 | Tab icon: lucide `Film`. | Reads as "my footage", is distinct from Arena's blades and Rankings' trophy, and is already in `lucide-react-native` (no install). Design may swap it at canvas review without changing the spec. |
| PM11 | Home carousel title `Highlights` (C-HM3). | Neutral enough to hold the athlete's own reels now and friend, nearby and Elo highlights later without a rename; matches the in-app term "highlight" (`TERM_APP`). |
| PM12 | Pager is a `FlatList` with `pagingEnabled`, not `react-native-pager-view`. | `react-native-pager-view` is not in `apps/mobile/package.json` (verified on `origin/feat/matches-tab`, 2026-10-06); adding it is a native dependency and would force a TestFlight build. `FlatList` paging is native scroll on both platforms and ships OTA. |
| PM13 | Zero-state secondary CTA when invites are on: `Challenge a friend` (C-Z7), opening the shipped challenge invite screen `/invite?from=matches`. | "Challenge" is the word the invite flow already uses ("Keep this challenge open?", "Withdraw this challenge?"), and it frames the invite as a match, which is what the zero state is selling. A new `matches` entry point (B5) keeps invite conversion from this surface measurable. |

### 2.3 Owner decisions, round 2 (2026-10-06, final)

The owner reviewed the spec and said "the rest looks solid". Everything not listed here stands.

- **R2-1 Home: one mixed carousel.** The "Your reels" lane and label are removed. Home gets one carousel titled `Highlights` (C-HM3, PM11). Phase 1 holds only the athlete's own reels (`ReelItem.source === "own"`). Later the friend, local (new: nearby athletes' highlights, gated on `jr_be-17f` plus location consent, epic `jr_be-880`) and Elo highlights join the **same** carousel as further sources, never as separate titled lanes. Non-own tiles carry a small source chip (section 5). Home's zero and low-data tiles and the first-highlight milestone on Home stay. Sections 7, 11, 17.3 and 18 are amended.
- **R2-2 Full-screen swipe viewer.** Smooth native swiping is a must. Phase 1 pager pages are full-screen, edge-to-edge 9:16 video (Shorts / TikTok style) with actions overlaid, not today's inset `ViewerScreen` layout. Q6 is resolved this way. Single-reel mode (push, bell, match detail) is full-screen too. Section 8 is rewritten.
- **R2-3 Not yours.** When `ReelItem.isOwn` is false, the viewer hides Share to Instagram, Save to Photos and Improve this reel. It may show the athlete's name, and Open match only when the viewer is a participant (else it opens the athlete profile). Phase 1 has only own reels, but the rule is implemented and unit tested now against the committed contract `apps/mobile/lib/highlight/reel-types.ts` (`ReelItem`, `ReelSource`, `isOwn`, `canManageReel`). Section 8.6.
- **R2-4 Open questions resolved.** Q3: no Matches tab badge (PM9 stands). Q5: delete the Film Room redirect after two OTAs (follow-up `jits-766g`). Q6: per R2-2. Q7: a carousel with 1 to 2 ready reels appends one C-L5 ghost.
- **R2-5 Zero-state invite CTA.** On the Matches tab zero state (boards `P-MT-10` and the clips-off zero state on `P-MT-16`), the secondary "Try a practice match" link (C-Z5) is replaced by a challenge-invite CTA, `Challenge a friend` (C-Z7, PM13). When `invites_enabled` is false the practice link comes back so the zero state always has a secondary action. The red primary "Find a match in the Arena" stays. Section 10.2.

## 3. Goals and non-goals

Goals:

1. One tap from anywhere to "my matches": a fifth tab with the full history, newest first, including matches without film.
2. A reusable reel carousel, used by the Matches tab and Home, that makes the athlete's own highlights the first thing they see.
3. A full-screen, shorts-style viewer that swipes smoothly between the athlete's own reels, already enforcing the "not yours" rule for future sources.
4. A leaner Profile: identity, stats, settings.
5. Empty, low-data and in-flight states that sell the next action and celebrate firsts.

Non-goals (phase 1):

- Showing any reel or match that is not the athlete's own. No friend, local or Elo sources, follows, suggestions, or visibility filter (section 18). No change to any RPC's read scope: everything stays participant-scoped. (The client-side "not yours" rule and the source chip are built and tested now, R2-3, so future sources need no viewer or tile change.)
- Web. The web Film Room and profile are untouched.
- The match detail screen, the match video player (`video/[id]`), the verdict screen and the highlight share flow, beyond the links that point at the Film Room and the viewer's new swipe container.
- Renaming Film Room code (PM4), a Matches tab badge (PM9), Elo milestones (PM8).
- Home's `RecentActivitySection` (its "My matches" / "All activity" segments) is left as is in phase 1 (owner decision 2026-10-06, Q1).

## 4. Navigation

### 4.1 Tab bar

- `apps/mobile/app/(app)/(tabs)/_layout.tsx` registers five `Tabs.Screen`s in order: `(home)` Home, `arena` Arena, `matches` Matches, `leaderboard` Rankings, `profile` Profile. The `matches` Screen and the `matches/` route directory land in the same commit.
- `components/layout/elo-tab-bar.tsx` needs no structural change (flex-1 columns read off the navigator), but at 375 pt width each column is 75 pt; labels must render on one line without truncation at 375 pt and 390 pt (AC 1.3). If "Rankings" does not fit at the current label size, the fix is a label letter-spacing or size token change applied to all five labels, never a per-tab exception.
- The layout's doc comment ("The bar is the target 4-up") is updated to record the five-tab decision and the date.
- The header on the Matches tab root is the shared `TabHeader` (`title="Matches"`) so it carries the Live Chip and the single bell exactly like the other tab roots (spec `specs/arena-live-chip/spec.md` section 4).
- The upload strip already sits on the tab bar for every tab (`TabsUploadStrip`, jits-n2im.2), so the Matches tab gets it with no work. AC 2.14 verifies it.

### 4.2 Film Room retirement

Every path into the Film Room is retargeted:

| Today | After |
|---|---|
| Profile `FilmRoomPreview` pushes `FILM_ROOM_HREF` | Component deleted (section 9). |
| `components/match-detail/match-hero.tsx` back-button fallback `"/(app)/film-room"` | Fallback `MATCHES_TAB_HREF`. |
| `app/(app)/film-room.tsx` (the screen) | Redirect to `MATCHES_TAB_HREF` (PM3). Its list logic moves into the Matches tab screen. Deleted after two OTAs (Q5 resolved, `jits-766g`). |
| `app/(app)/_layout.tsx` `<Stack.Screen name="film-room" />` | Kept while the redirect file exists, comment updated. |
| `settings/help.tsx` footage answer "...in the Film Room on your profile..." | "...in the Matches tab, where you can watch them back..." (copy C-H1). |
| Doc comments that say "Film Room" for the history screen | Updated where they describe navigation; component internals may keep the name. |

The owner brief lists `video/[id]` and `verdict-hero` as Film Room link sites. On `origin/development` neither navigates to the Film Room route (they only import Film Room components or `videoHref`); the retirement task re-greps `FILM_ROOM_HREF`, `film-room"` and `/film-room` and must leave zero navigation references except the redirect file (AC 7.2).

## 5. The reusable reel carousel

New components in `apps/mobile/components/reels/`:

- `ReelCarousel`: a horizontal `FlatList` of tiles with a title row (MetaTag left, optional "See all" text button right), snap to tile, 16 px side gutter, 8 px gap. Props: `title` (string), `laneKey: ReelLaneKey` (`"home" | "matches"`, from `reel-types.ts`; also the `testID` suffix and the viewer lane token), `tiles: ReelTileModel[]`, `loading`, `onTilePress(tile, index)`, `onSeeAll?`, `onEndReached?`, `size: "home" | "matches"`. It renders nothing when `tiles` is empty and not loading (callers always supply ghost tiles when they want a row; see section 10), so "an empty row" is structurally impossible. One carousel holds items from any number of sources (R2-1); a future source is merged into the tile list by the host's hook, never added as a second carousel.
- `ReelTile`: one 9:16 tile. Sizes: `home` 104 x 185 pt, `matches` 96 x 171 pt. Kinds (`ReelTileModel.kind`):
  - `ready`: carries a `ReelItem` (`apps/mobile/lib/highlight/reel-types.ts`; phase 1 builds every item with `ownReelItem`). Signed poster (`expo-image`, `contentFit="cover"`, centred), duration chip bottom-left in mono (`28s`), caption line under the tile, one line: `vs {opp}` when `item.isOwn` (`vs D. Okafor`), else the subject athlete's short name. **Source chip** when `item.source !== "own"`: a small mono caps chip in the tile's top-left corner, 6 pt inset, `surface-3` at 85% opacity with `ink-2` text, 2 pt radius, never Signal Red and never the gain or loss colour: `FRIEND` (C-S1) for `friend`, `NEARBY` (C-S2) for `local`, `ELO RATED` (C-S3) for `elo`. Own tiles never show a chip. The chip is read in the tile's accessibility label (`, from a friend` / `, nearby` / `, from ELO RATED`). Phase 1 never produces a non-own item, but the chip is implemented and unit tested with fixture items so a future source needs no tile change. `unseen: true` adds the unseen ring: a 2 px stroke on the tile edge in the semantic token `unseen-ring` (an alias of `ink`, #E8EDF2 dark), separated from the poster by a 2 px surface gap. The alias is added to `apps/mobile/lib/tokens.ts` and to the design system ("ELO RATED Design System" artifact and its jits_web mirror `design/system/project/`) so the colour guard can assert it (AC 3.5). The ring is never Signal Red (Home's one red CTA rule, carried from `NewHighlightCard`). Design review ruling, 2026-10-06.
  - `building`: the anticipation tile (section 10.5).
  - `ghost`: dashed hairline outline, a placeholder silhouette, and a line of copy (section 10). Never pressable unless it carries a CTA.
  - `cta`: a ghost tile whose whole surface is a button (secondary style, not red) with a label and an icon.
  - `see_all`: last tile on a lane that has more items than shown, label "See all", routes to the Matches tab (Home only).
  - `skeleton`: the shared skeleton shimmer.
- Every tile is at least 44 pt in both dimensions (deck convention 10), has an accessibility label (copy table), and `ready` tiles announce "unwatched" when unseen.
- Poster crop rule for tiles: reels are rendered 9:16 by the pipeline, so `cover` centred is correct. A legacy landscape poster is also `cover` centred (acceptable crop on a thumbnail).

Data hook `useReelLane(athleteId, { surface })` in `apps/mobile/lib/reels/`:

- Reads `get_my_highlights` through the existing deduped `readMyHighlights` store (`lib/highlight/highlight-store.ts`), first page `limit 10`, and later pages with the B1 cursor.
- Maps each row to a `ReelItem` with `ownReelItem` (source `own`, `isOwn: true`), so the carousel, the tiles and the viewer only ever see the shared contract.
- Produces the ordered tile list: building tiles (from B2 `in_flight`, or on the Matches tab from library phases when B2 is absent; section 12.3), then unseen ready reels newest first, then seen ready reels newest first.
- Signs posters with the existing `signPosterKey` (batch where possible) with the 50 minute re-sign rule from `use-new-highlight.ts`.
- Exposes `clipsEnabled`; when false the lane returns no tiles at all, and callers hide the lane (section 10.7).
- Re-reads on focus, on a real foreground, on match exit, on `notifyHighlightsChanged`, and on the host screen's pull to refresh, exactly as `useNewHighlight` does today (that hook's behaviour moves here; the hook and `useMyHighlights` are deleted once nothing imports them).
- `markSeenLocally(highlightId)` clears the ring at once when the viewer opens a reel.

## 6. Matches tab

### 6.1 Layout, top to bottom

1. `TabHeader` "Matches" (Live Chip, bell).
2. Record strip (moved from the Film Room): `recordStrip(recordOf(history), current_elo)` in mono caps, which is exactly what the shipped `recordStrip` in `lib/film-room/format.ts` returns, e.g. `21 MATCHES · 14W 6L 1D · 1487` (rating omitted when unknown).
3. **Your highlights** carousel (`ReelCarousel size="matches"`, lane title C-M2). Hidden when clips are off. Horizontal pagination via `onEndReached` with the B1 cursor.
4. Filter chips (`components/film-room/filter-chips.tsx`, unchanged) and the Opponent picker sheet (`opponent-picker.tsx`, unchanged). Filters apply to the feed only, never to the carousel.
5. The match feed: month section headers (`MonthHeader`, carried) and one full-width `MatchFeedCard` per match, newest first.
6. List footer (`ListFooter`, carried): loading more spinner, or "Couldn't load more" with Try again.

The whole screen is one vertical `FlatList` (carousel, chips and record strip live in `ListHeaderComponent`), `onEndReachedThreshold 0.6`, pull to refresh refreshes library, phases and the reel lane together.

### 6.2 MatchFeedCard

New component `components/matches/match-feed-card.tsx`. Full width (screen width minus 32 pt gutters), stacked:

**Media area, 16:9.**
- Poster: chosen by `pickCardMedia(item, viewerId)` (section 6.3). Signed poster URLs come from the library page (`poster_url`, already batch-signed by `getMyMatchLibrary`).
- No poster: the existing two-athlete fallback (viewer and opponent photo or monogram, `OpeningStill` / `PosterCard` fallback art), so a match with no film still looks like a card, not a hole.
- Duration chip bottom-right, mono, `m:ss` (e.g. `4:12`; `h:mm:ss` past an hour), from the selected video's `duration_seconds`, formatted by a new `formatDuration(seconds)` added to `lib/film-room/format.ts` (or `formatCountdown(seconds * 1000)` from `lib/video/video-status-copy.ts` if its output matches exactly). Not `formatClock`, which zero-pads minutes (`04:12`) for the match clock. Shown only when the selected video is `playable` (deck rule 9.4 and 9.9: never a duration for an angle that is not ready, never the match clock).
- One status badge top-left: `deriveCardStatus` (`lib/film-room/card-status.ts`) and `statusBadgeLabel`, which already implement the deck's badge priority (`COPY-DECK.md` section 9): local `Didn't upload` > local `Upload paused` > local uploading overlay (`Uploading {pct}%` with track) > `Waiting {mm:ss}` > `Building highlight` > `Uploading` (collecting) > `New` > `Breakdown ready` > `No film` > none. `Processing` is never a card badge. The badge component is the existing `status-badge.tsx`. Retry affordances (`cardOffersRetry`) stay as on the Film Room card.
- A play glyph centred over the poster only when the selected video is playable.

**Meta row** (under the media, 12 pt top padding): opponent avatar (24 pt), then `vs {opp}` in heading type, then a mono line: outcome letter (`W` / `L` / `D`), Elo delta from the shipped `deltaLabel` (`▲ +12` / `▼ −8` / `± 0`; `Pending` while `elo_delta` is null on a disputed match), and the shipped `shortDate` (`OCT 04`). Colours: `W` and a positive delta use the gain token, `L` and a negative delta the loss token; **a draw and a zero delta are neutral (`ink-2`)**: amber is not used for D in lists (design review ruling 2026-10-06; amber stays reserved for the verdict and the video waiting states). Reuse `outcomeLetter`, `deltaLabel`, `shortDate`, `shortName` from `lib/film-room/format.ts` so the strings match what shipped. A disputed match adds a mono `DISPUTED` tag at the end of the line. A trailing chevron at the right end of the meta row is decoration inside the meta `Pressable` (`accessibilityElementsHidden`, no hit target of its own), not a separate control.

**Tap targets.**
- Tap on the media area when the selected video is playable: `router.push(videoHref(selectedVideoId))` (the player, primary angle).
- Tap on the media area when nothing is playable, and tap anywhere on the meta row: `router.push(matchDetailHref(matchId))`.
- Each target is a separate `Pressable` with its own accessibility label (copy table C-M10, C-M11). Long press does nothing in phase 1.
- Opening either target calls `markMatchSeen(matchId)` (clears NEW) exactly as match detail does today.

### 6.3 Media selection and crop rule

`pickCardMedia(item: MatchLibraryItem, viewerId: string)` in `lib/matches/card-media.ts`, pure and unit tested:

- **Play target** (first match wins): the video with `is_primary === true` and `playability === "playable"` (B3; absent key means false); else the viewer's own video (`uploaded_by === viewerId`) that is playable; else the first playable video in server order (`created_at, id`). None playable: no play target.
- **Poster**: the play target's `poster_url` if present; else, by the same order ignoring playability, the first video with a `poster_url`; else none (fallback art).
- Deterministic: the same input always yields the same choice, so the card does not flicker between angles across refetches.

**Crop rule** (`cropFor(width, height)` in the same file), for the 16:9 media area:

- Known dimensions and `width / height >= 1.0` (landscape or square): `contentFit="cover"`, centred.
- Known dimensions and `width / height < 1.0` (portrait phone footage): a **pillarbox**. Behind, the same image with `contentFit="cover"`, `blurRadius` 24 and a 40% `void` scrim; in front, the image with `contentFit="contain"`. The athlete's full frame is visible and the card keeps its 16:9 shape.
- Unknown dimensions (`thumbnail_width` or `thumbnail_height` null): read the intrinsic size from `expo-image`'s `onLoad` event and apply the rule; until it loads, render `cover`. A legacy row therefore never shows a stretched or awkwardly cropped portrait.

### 6.4 States

- Loading (no cached page): record strip placeholder, carousel skeleton (4 tiles), feed skeleton of 3 cards (16:9 block plus two meta lines). Shared skeleton shimmer.
- Refreshing: pull spinner only; stale content stays (SWR).
- Error with nothing cached: the existing error panel (C-E1, Try again). Error with cached content: content stays, a toast says C-E2.
- Load more failed: list footer C-E3; the whole footer row is the tap target that retries.
- Filter with no results: carried Film Room copy (C-F1 / C-F2 with its "Search older matches" or "Show all" action).
- Zero matches and low data: section 10.

### 6.5 Freshness

Carried from the Film Room screen: `useRefetchOnUploadSettled(ids, library.revalidate)`, `useRefetchOnRefocus(library.revalidate, useMatchExitCount())`, and `useFilmRoomPhases` for the newest six matches within 48 h (its shared cache already backs both the old screen and the old Profile preview). The library cache key `match-library:<id>` keeps its name; after Profile cleanup the Matches tab is its only reader, and `useMatchLibraryFirstPage` is deleted if nothing else imports it.

## 7. Home

### 7.1 Layout

1. `BrandHeader` (unchanged).
2. `ResumeMatchCard` when a lost match exists (PM7).
3. **Highlights** carousel (`ReelCarousel size="home" laneKey="home"`, title C-HM3 `Highlights`). It replaces `NewHighlightCard`, which is deleted along with its call site. There is no "Your reels" label anywhere (C-HM1 retired, R2-1).
4. Welcome / name, Elo tile, practice offer, invite card (`InviteHomeCard`, unchanged: it still shows only when Home has no practice offer and no active match, and invites are on), `RecentActivitySection`, in today's order.

### 7.2 Highlights carousel, phase 1

- One mixed carousel. In phase 1 its only source is the athlete's own reels: tiles from `useReelLane(athleteId, { surface: "home" })`: building tiles, then unseen reels with the ring, then seen reels; at most 10, then a `see_all` tile that switches to the Matches tab when more exist (the Matches tab holds the athlete's full own history).
- The unseen treatment of the old card moves to the tile ring. The first unseen tile pulses once (scale 1.0 to 1.04 and back over the new motion token `moment.reelRingPulse = 600`, registered in the `moment` registry of `lib/motion/tokens.ts`; Reanimated; skipped under Reduce Motion) the first time it appears in a session.
- There is no dismiss control. Watching a reel marks it seen (as today in the viewer), which clears the ring and the bell's unread dot (`notifyHighlightsChanged`). Removing dismiss is deliberate: the carousel is a persistent shelf, not a notification.
- Tap on a tile opens the full-screen viewer at that reel with `source=home` (section 8), swipeable across the carousel's ready items.
- The carousel never shows an empty row: section 10 defines its ghost and CTA tiles; when clips are off it is hidden.

### 7.3 Future sources (same carousel)

Friend, Local (nearby) and Elo highlights are **sources in the one Highlights carousel**, not separate titled lanes (R2-1). When a source's gate clears (section 18):

- Home's carousel hook (a thin `useHomeHighlights` that composes `useReelLane` with each enabled source hook) merges the source's `ReelItem`s into the same tile list. Each source hook is gated by its own feature flag and returns `[]` when off, so phase 1 is simply "own only".
- Default merge order (the source's epic may refine it, recorded in this spec): own building tiles, then own unseen reels, then every other ready item from all sources (own seen, friend, local, elo) newest first by `readyAt`, de-duplicated by `highlightId` (an own reel always wins a duplicate, so a reel of the athlete's match never shows as `FRIEND`).
- Non-own tiles show the source chip (section 5: `FRIEND`, `NEARBY`, `ELO RATED`) and the subject athlete's name as the caption. The viewer applies the "not yours" rule (8.6).
- The title stays `Highlights`. The `see_all` tile keeps routing to the Matches tab and counts own reels only; a future "see all" for other sources is that source's epic's decision.
- Athletes you might follow is a different object (people, not reels) and is not part of this carousel; its placement is decided in `jr_be-293`.

## 8. Full-screen shorts-style swipe viewer

Owner decision R2-2 (2026-10-06): smooth native swiping is a must, and every viewer page is full-screen, edge-to-edge 9:16 video with actions overlaid (Shorts / TikTok style). This replaces today's inset `ViewerScreen` layout (header, framed 9:16 player, meta and action buttons stacked below) for every reel the viewer shows, from a carousel or from a single-reel entry point. Q6 is resolved.

### 8.1 Route and entry points

- The route stays `app/(app)/highlight/[id].tsx`. A carousel opens `/highlight/<id>?source=home|matches&lane=<token>`; the lane token keys a small in-memory session store holding the carousel's ordered `ReelItem[]` and its B1 cursor (building, ghost, cta, see_all and skeleton tiles are never pages).
- **Pager mode** (lane token present and resolvable): the vertical pager below, opened at the tapped reel.
- **Single-reel mode** (no lane token, or a token the store no longer holds, e.g. after a cold start: push, bell, match detail, summary): the same full-screen page for one reel, with no paging, no swipe hint and no prefetch. Every existing entry point keeps its route, params, `source` value and telemetry; only the page layout changes.
- The screen is presented as a stack push with the header hidden, the status bar light over the video, and the iOS full-screen swipe-back gesture disabled (`fullScreenGestureEnabled: false`) so vertical paging never fights a dismiss gesture; the iOS left-edge back swipe and Android system back still close it.

### 8.2 Page layout (both modes)

New `components/highlight-viewer/reel-page.tsx` renders one page at exactly the window size (`useWindowDimensions`), drawing under the status bar and the home indicator:

- **Video**, edge to edge: an `expo-video` `VideoView` with `contentFit="cover"` and `nativeControls={false}`. Reels are rendered 9:16 by the pipeline, and on a 19.5:9 phone `cover` trims a thin strip from each side, which is the Shorts convention. If a reel's intrinsic aspect is not within 9:16 plus or minus 10% (a legacy asset), it renders `contain` over its own poster blurred (`expo-image` `blurRadius` 24, 40% `void` scrim), the same pillarbox rule as the feed card (6.3).
- **Poster**: until the page's player has rendered its first frame, the signed 9:16 poster sits over the video (`expo-image`, `cover`), so a page is never black. It is removed on the `VideoView` first-frame callback (`onFirstFrameRender`, available in expo-video 3.0.x), falling back to the player `status` becoming `readyToPlay` if that callback never fires.
- **Scrims** for legibility: a top gradient (`void` 50% to 0, 120 pt) and a bottom gradient (0 to `void` 70%, 240 pt), drawn with `react-native-svg` `LinearGradient` (already linked; `expo-linear-gradient` is not a dependency and must not be added). The overlays sit on these, never on raw video.
- **Top overlay** (inside the top safe area): close button top-left (an `X` icon, 44 pt hit target, a11y C-V4 `Close`); the mute toggle top-right (icon `Volume2` / `VolumeX`, a11y C-V3 `Mute` / `Unmute`).
- **Right rail** (bottom-right, above the bottom meta, 12 pt from the edge, 20 pt between items): stacked icon buttons with a small label under each, in this order: Share to Instagram (or "Share reel" when the Reels path is unavailable, exactly as `viewer-actions.tsx` chooses today), Save to Photos, Improve this reel. Each is a 44 pt target. The existing rules about when each shows (`highlight_share_enabled`, `canSaveToPhotos`, the permission-denied "Open Settings" fallback, the regenerating banner) are carried over unchanged from `viewer-actions.tsx` and `viewer-states.tsx`; only their placement changes. The whole rail is subject to the ownership rule (8.6).
- **Bottom meta** (bottom-left, above the progress bar, right edge clear of the rail): `vs {opp}` in heading type for an own reel (subject name otherwise, 8.6), then a mono line with `shortDate` and the duration (`OCT 04 · 0:28`), then an `Open match` text button (8.6 decides whether it shows and where it goes). The existing caption card and collab tip (`caption-card.tsx`, `collab-tip.tsx`) stay where the share flow shows them today (in the share sheet), not on the page.
- **Progress bar**: a 2 pt bar across the full width at the very bottom, directly above the home indicator safe area: `ink` fill on an `ink-3` track at 40% opacity, driven by the player's `currentTime / duration` (a `timeUpdate` event at about 4 Hz, interpolated on the UI thread with Reanimated so it moves smoothly). Not scrubbable in phase 1.
- **Building, failed, replaced and not-found states** (today's `viewer-progress-state.tsx` and `viewer-states.tsx`) render full-screen on the same page frame with the close button, so a page in pager mode that turns out not to be playable never breaks the pager; it shows its state and the athlete swipes on.

### 8.3 Pager mechanics

New `components/highlight-viewer/reel-pager.tsx`:

- A vertical `FlatList` with `pagingEnabled` (PM12: `react-native-pager-view` is not a dependency and must not be added; this must ship OTA), `decelerationRate="fast"`, `snapToAlignment="start"`, `disableIntervalMomentum` (one page per fling), `showsVerticalScrollIndicator={false}`, `getItemLayout` with item length equal to the window height, `initialScrollIndex` at the tapped reel, `initialNumToRender={1}`, `maxToRenderPerBatch={2}`, `windowSize={3}` and `removeClippedSubviews` on Android.
- The active page is decided by `onMomentumScrollEnd` (offset divided by page height, rounded), with `onViewableItemsChanged` at an 80% `itemVisiblePercentThreshold` as a backup; both handlers are stable (`useRef`) and do no work beyond setting the active index.
- **Player pool of 3**: the pager owns exactly three `expo-video` players (`useVideoPlayer` called three times at the pager level, never one per page), assigned to the slots previous, current and next by `index mod 3`. On a page change only the one slot that falls out of the window is re-pointed (`player.replaceAsync(source)` to the new neighbour), so a swipe re-uses the already-loaded neighbour and never re-creates a player. Players loop (`loop = true`), as today. No auto-advance to the next reel in phase 1.
- **Only the visible page plays.** On becoming current: `play()`. Neighbours are `pause()`d with `currentTime = 0` and show their poster until their first frame is ready. Leaving a page pauses it and resets it to 0, so swiping back starts that reel from the top.
- **Prefetch**: when page `i` becomes current, sign playback for `i + 1`, `i + 2` and `i - 1` with the existing `signHighlightPlayback` (one call per reel, results cached in the session store with the 50 minute re-sign rule from `use-new-highlight.ts`), prefetch their posters with `Image.prefetch`, and load `i + 1` and `i - 1` into their pool slots. Nothing beyond `i + 2` is signed. Prefetch requests that resolve after the athlete has moved on are dropped.
- **Pagination**: when the current index is within 2 of the last loaded item and the carousel has more, load the next `get_my_highlights` page with the B1 cursor, append to the session store (de-duplicated by `highlightId`) and to the pager. If the athlete reaches the last loaded page while that read is in flight, a full-height loading page (spinner on `void`) follows it and is replaced when the page arrives.
- **End of list**: the last page simply bounces (no extra page, no wrap-around to the first reel). A swipe past the end on a fully loaded list shows the mono caption C-V2 `You're all caught up` above the progress bar for 2 s (detected in `onScrollEndDrag` when the drag offset passes the last page by more than 48 pt). No caption in single-reel mode.
- **Tap to pause and play**: a single tap anywhere on the video area that is not an overlay control toggles play and pause; while paused a centred play glyph (64 pt, `ink` at 80%) shows and the progress bar holds. A paused page resumes playing when it becomes current again. Double tap and long press do nothing in phase 1.
- **Mute**: one mute state shared by every page and both modes, persisted in AsyncStorage `reels:muted:v1` and read before the first page plays. With no stored value the deck section 5 rule applies (the full-screen viewer starts with sound). Toggling applies to the current player at once and to every pool player; the stored value survives app restarts. All reads and writes are wrapped so a storage failure falls back to the deck default without breaking playback.
- **Modals suspend paging**: while the share sheet, the improve sheet, the pre-share sheet or any alert is open, `scrollEnabled` is false and the current player pauses; closing it restores both.
- **Close and back** return to the surface that opened the viewer (Home, Matches, push target, bell, match detail) with that surface's scroll position intact. A swipe never closes the viewer.
- **Swipe hint** (design review ruling 2026-10-06, kept): when the pager opens with 2 or more pages, the hint C-V1 ("Swipe up for the next one") with an up chevron sits above the bottom meta. It shows once per install (AsyncStorage flag `reels:swipe-hint:v1`), never in single-reel mode or with one page, and disappears for good after the first successful swipe, or after 4 s, whichever is first (and stays marked shown).
- **Seen**: an own reel is marked seen (`mark_highlight_seen` plus `markSeenLocally`) when its page becomes current, exactly once per pager session, so the carousel ring is cleared on return. Non-own reels are not marked through this call; their seen tracking belongs to their source's epic.

### 8.4 Reduce Motion

- Paging itself is user-driven native scrolling and is unchanged.
- No bounce on the swipe-hint chevron; the hint appears and disappears without animation.
- The poster-to-video swap is instant (no cross-fade), the pause glyph appears without a scale animation, and the progress bar still advances (it conveys information, not decoration).

### 8.5 Performance budget

Measured on a release build (not Expo Go) on an iPhone 12-class device and a mid-range Android, with the reel list loaded:

- Scrolling between pages holds 60 fps (no dropped frames visible in the performance monitor across 10 consecutive swipes); no JS-thread task over 16 ms during a swipe.
- When the next reel was prefetched, its first video frame renders within about 300 ms after the swipe settles. Without prefetch (first page, or a fast double swipe) the poster shows at once and the first frame follows within 1.5 s on Wi-Fi.
- At most three `VideoView`s are mounted and three players exist at any time; memory does not grow across 30 swipes (pool reuse, no player leak).
- `viewer_swiped` carries the measured `first_frame_ms` and `prefetched` (section 13) so the budget is checked in the field, not only on a device in the office.

### 8.6 Ownership rule ("not yours", R2-3)

The contract is `apps/mobile/lib/highlight/reel-types.ts`, already committed on `feat/matches-tab`: `ReelItem.isOwn` is true only when the signed-in athlete is the reel's subject, and `canManageReel(item)` returns `item.isOwn === true`. Never derive ownership from `source` alone.

- When `canManageReel(item)` is false, the right rail hides **Share to Instagram** (and "Share reel"), **Save to Photos** and **Improve this reel**, along with every sheet they open (pre-share, share, improve). With all three hidden the rail is empty and is not rendered. Mute and close stay.
- The bottom meta shows the subject athlete's short name for a non-own reel (with the source chip text from section 5 as a mono tag after it), and `vs {opp}` for an own reel.
- **Open match** shows only when the viewer is a participant in the reel's match, and opens `match-detail/[matchId]`. When the viewer is not a participant, the same slot reads `View profile` (C-V5) and opens the subject athlete's profile (the existing route `app/(app)/athlete/[id].tsx`). This needs two additive fields on `ReelItem`, added in `jits-a4fw.5`: `viewerIsParticipant: boolean` and `subjectAthleteId: string | null`; `ownReelItem` sets `viewerIsParticipant: true` and `subjectAthleteId` to the caller's athlete id. Every future source's read RPC must return both (noted on `jr_be-tjx`, `jr_be-o7c`, `jr_be-880`). Note a participant's non-own reel is possible later (a friend's reel of a match against you): it shows Open match but still hides the owner-only actions.
- Phase 1 only ever builds own items, but this rule is implemented now and unit tested with fixture items (`isOwn: false` with and without `viewerIsParticipant`), section 16.

### 8.7 Telemetry (per page)

- `viewer_opened` is logged once per reel per viewer session with the page's real `source` (`home`, `matches`, or the single-reel entry point's existing source) and `detail.swiped = true` for pages reached by swiping, `detail.layout = "fullscreen"`.
- `viewer_swiped` (B4) is logged on each swipe that lands on a new reel: `source`, `direction: "next" | "previous"`, `index`, `first_frame_ms` (from settle to first frame, null if the athlete left first), `prefetched` (boolean).

## 9. Profile cleanup

`app/(app)/(tabs)/profile/index.tsx` loses the Recent Matches block, `HighlightsRow`, `FilmRoomPreview`, `useMatchLibraryFirstPage`, `useMyHighlights` and `useRefetchOnUploadSettled`, and the pull to refresh only re-reads the profile. `ProfileSkeleton` drops its Recent Matches rows. Kept, in order: `ProfileHeader`, Share profile, invite actions, `ProfileQuickStats`, View Detailed Stats, `AccountSection`, the beta and version footer. No "View all matches" link (PM1).

Deleted when unreferenced: `components/profile/film-room-preview.tsx`, `components/profile/highlights-row.tsx`, `components/profile/highlight-tile.tsx` (unless `ReelTile` reuses it), `components/profile/history-row-action.tsx` (if no other importer). The `profile_row_tapped` funnel step stays in the DB enum for history but loses its emitter.

The zero-match Profile reframing in `jits-r75.2` (kill the "0%" win rate) is unaffected; it touches `ProfileQuickStats`, which stays.

## 10. Low-data, empty and celebration states

The owner's rule: a thin history is never a sad screen. Every state below either shows what exists with pride or shows what is coming with a single clear next action. All copy follows the deck conventions: sentence case source strings, no em dashes, no exclamation marks, no emoji.

### 10.1 State definitions (and what data they need)

| State | Definition | Data | Client-only? |
|---|---|---|---|
| Zero | Library first page loaded, `items.length === 0`, no error, no filter. | Library | Yes |
| Low data | 1 to 3 matches total (`!hasMore` and `items.length <= 3`). | Library | Yes |
| No reels yet | Clips on, `get_my_highlights` returned no items and no `in_flight`. | Highlights | Yes |
| No film on a match | `pickCardMedia` finds no poster. | Library | Yes |
| Reel building | B2 `in_flight` entry (Home and Matches), or library phase `building` / `waiting_for_angle` for a recent match (Matches fallback). | B2 or phases | B2 is backend; fallback is client-only |
| Milestone | First match, first win, first highlight (10.6). | Stats, library, highlights | Yes (device-local seen store) |
| Clips off | `clips_enabled === false`. | Highlights | Yes |
| Offline / error | Read failed. | n/a | Yes |

### 10.2 Zero matches (brand new athlete)

**Matches tab.** The feed area is replaced by a "first match" hero:
- A **ghost match card**: the MatchFeedCard silhouette (16:9 dashed outline, the viewer's own photo or monogram on the left half and a dashed "?" opponent slot on the right), caption C-Z1.
- Above it, in the carousel slot, a **ghost 9:16 reel tile** with C-Z2 ("Your first highlight lands here") plus two more faint ghost tiles fading to the right, so the row reads as a shelf waiting to be filled.
- A progress line C-Z3 ("0 of 1 matches to your first highlight") with a 1-step progress bar at 0.
- Primary CTA C-Z4 ("Find a match in the Arena"), Signal Red, the screen's one red CTA. It switches to the Arena tab. When the athlete is offline in the Arena, the Arena's own one-tap go-live is right there; this CTA does not go live on their behalf.
- **Secondary action: challenge invite** (owner R2-5, PM13). A secondary text button C-Z7 (`Challenge a friend`, icon `QrCode` or `UserPlus`, never red) under the red CTA. It pushes `/invite?from=matches`, the shipped challenge invite screen `app/(app)/invite/index.tsx` (jr_be spec 016 M2): it creates one single-use challenge invite and shows its QR, the short code, the Share row, the live waiting state, Withdraw, and the open challenges list. This is the same screen Home's `InviteHomeCard` opens with `from=home`; it is not `/invite/join` (the training-partner join invite behind Profile's "Invite a training partner" row). The `matches` entry point needs B5 (`jr_be-gpz`): add `"matches"` to `InviteEntryPoint` (`packages/shared/src/api/invites.ts`) and to `ENTRY_POINTS` in `invite/index.tsx` in the same OTA, after B5 is on prod (an unknown entry point makes `create_invite` raise `invalid_entry_point`).
- **Flag gate and fallback.** C-Z7 shows only when `invites_enabled` is true. When it is false, the secondary action is the practice link C-Z5 (`Try a practice match`), which opens the practice route exactly as the Home practice offer does, shown whenever `shouldOfferPracticeMatch` is true. So the zero state always has a secondary action when either path is available, and never shows both. `useInvitesEnabled` (`lib/invites/use-invites-enabled.ts`) is fail-closed (false until a read succeeds) and does not say whether the flag is known, so `jits-a4fw.9` adds an additive sibling hook `useInvitesFlagState(): { enabled: boolean; known: boolean }` over the same cache; while `known` is false the secondary slot renders nothing (no practice-to-invite flash). Note: the round-2 brief describes `invites_enabled` as false on prod, while jits_web `CLAUDE.md` records it as turned on since 2026-10-05. Either way the flag is server-tunable, so both branches ship and are tested.
- The same rule applies to the clips-off zero state (board `P-MT-16`): C-Z7 when invites are on, else C-Z5.
- Helper C-Z6 explains recording in one line.

**Home.** Home's existing practice offer card and `InviteHomeCard` are unchanged (the invite card already appears when there is no practice offer and no active match, so Home needs no new invite entry). The Highlights carousel shows: one `cta` tile (C-HZ1 "Get your first highlight", icon `Swords`, secondary style) that switches to the Arena tab, followed by one `ghost` tile (C-Z2). Never red: Home's red CTA stays with the practice offer or Resume.

### 10.3 Low data (1 to 3 matches)

**Matches tab.**
- The existing cards render normally.
- Under the last card, a **"next match" ghost card** (dashed 16:9 outline, caption C-L1 "Your next match goes here", text button C-L2 "Find a match" to the Arena tab). Shown only while `!hasMore` and `items.length <= 3`, and only with no filter applied.
- The oldest match ever (`!hasMore`, last item) carries a mono `FIRST MATCH` tag in its meta row (C-L3), and the athlete's first win (oldest `win` when `!hasMore`) carries `FIRST WIN` (C-L4). Celebrating what exists is cheap and permanent.
- Carousel with no reels: one `ghost` tile with C-L5 ("Record your next match to get a highlight") and C-L6 helper ("Turn on Record from my phone at face-off"), then two faint ghosts.
- Carousel with 1 to 2 ready reels (owner confirmed, Q7, 2026-10-06): the carousel appends one C-L5 ghost tile after the last reel, so a short shelf still points at the next action. With 3 or more reels no ghost is appended.

**Matches without film** (any history size): a card whose match has **no video rows at all** (`videos.length === 0`) shows a small caption under the monogram pair, C-L7 ("No film for this one"). A card that has video rows but reads the deck's `No film` phase shows the deck badge string (`CARD_BADGE.noFilm`) and no C-L7, so the two never stack. The first C-L7 card in the loaded list (and only that one) adds the helper C-L6 so the tip is taught once, not on every card; that card helper is suppressed entirely while the carousel on the same screen is showing C-L6 (no reels yet), so the tip never appears twice on one screen.

**Home** with matches but no reels: the Highlights carousel shows a `cta` tile C-L2 ("Find a match") to the Arena tab, then a `ghost` tile C-L5 (CTA first, as in 10.2).

### 10.4 Filter with no results, offline and error, loading

- Filter with no results: carried Film Room panels (C-F1, C-F2). The carousel stays visible above (filters never touch it).
- Offline or error with nothing cached: Matches shows the error panel C-E1 with Try again; Home hides the carousel (a failed quiet discovery read never shows an error on Home, as today).
- Error with cached content: content stays; Matches toasts C-E2; Home stays quiet.
- Loading: skeletons as in 6.4; the Home carousel shows 3 skeleton tiles while the first read is in flight, never a blank gap that pops.

### 10.5 In-flight as anticipation

A `building` tile replaces the dead wait with a reveal:
- The tile shows the match's poster (or the monogram pair) under a dark scrim, an animated shimmer sweep, and a two-step line taken from the deck's reel copy (section 5): step 1 C-B1 ("Finding your best moments") while the reel is `planning` or `waiting`, step 2 C-B2 ("Cutting your highlight") while `rendering`, each with the step counter C-B5 (`Step 1 of 2` / `Step 2 of 2`). The tile's accessibility label is C-B6. A `waiting` reel with a known deadline shows C-B3 (`Waiting {mm:ss}`, the deck's countdown, server-clock based).
- Under the tile: C-B4 ("Usually 1 to 3 minutes").
- Tapping a building tile opens match detail on its Film status plate (the one source of truth, deck convention 9), never the viewer.
- When the reel lands while the screen is visible (the next read returns it as ready), the tile cross-fades from building to ready with the unseen ring, a single ring pulse (`moment.reelRingPulse`) and a success haptic (`Haptics.notificationAsync(Success)`). This is the reveal.

### 10.6 Milestones and celebration

Milestones, phase 1 (PM8):

| Milestone | Trigger (client-derived) | Where it shows | Copy |
|---|---|---|---|
| `first_match` | Total matches becomes 1: stats `wins + losses + draws === 1`, and the newest library item completed within the last 7 days. | Matches tab, on the first card | C-C1 |
| `first_win` | Stats `wins === 1`, and the newest win in the library completed within the last 7 days. | Matches tab, on that card | C-C2 |
| `first_highlight` | `get_my_highlights` first page returns exactly one item (limit 10, so the athlete has exactly one reel), and it is unseen. | Home Highlights carousel, else Matches carousel, whichever the athlete opens first | C-C3 |

Celebration, once per milestone:
- A light burst: 12 to 16 Reanimated confetti particles in brand colours from the celebrated card or tile, under 1.2 s, no sound; a success haptic; a one-line banner above the card or lane with the copy, which fades after 4 s or on tap.
- **Loss exception** (design review ruling 2026-10-06): when the celebrated match is a loss (only possible for `first_match`), there is **no haptic**, and the confetti uses ink-only pieces (`ink`, `ink-2`, `ink-3`; no red, no gain green). The banner copy is unchanged.
- **First match that is also the first win:** show only the First win banner (C-C2) and burst, and mark both `first_match` and `first_win` seen in `milestones:v1:<athleteId>` in the same write. The permanent `FIRST MATCH` and `FIRST WIN` meta tags (10.3) both still show on that card.
- Under Reduce Motion: no particles and no pulse; the banner and haptic still show (except the loss exception: no haptic).
- **Fires once** per athlete per device, recorded in a new AsyncStorage store `milestones:v1:<athleteId>` (same module pattern as `lib/film-room/seen-store.ts`), written the moment the celebration starts so a crash mid-animation does not repeat it. The 7 day freshness guard stops a reinstall, a new phone or a returning athlete from celebrating an old first win. A milestone that fires on Home is marked and does not also fire on Matches.
- Never fires during an active Arena match or over a modal; it waits for the next time the surface is focused.

### 10.7 Clips off (and future sources off)

- `clips_enabled === false`: the Home Highlights carousel and the Matches carousel are hidden entirely (not shown empty, and no ghost promising a highlight that cannot be made). Home still looks alive through its other blocks; the Matches tab still has its feed or its zero / low-data hero, with the highlight copy swapped for the film copy: C-Z2b "Your first match lands here" replaces C-Z2, C-Z3 is omitted, and the zero-state helper C-Z6 (which promises a highlight) is replaced by C-L6.
- With clips on and every future source off (phase 1 always), the Home carousel holds only the athlete's own items, which by 10.2 to 10.5 always has at least one real, building, ghost or CTA tile. Home never renders an empty row.

### 10.8 Analytics for empty-state CTAs

See section 13: every CTA in this section and every milestone shown emits one funnel event.

## 11. Copy strings

All strings are final source strings (sentence case; tags render in mono caps by style). No em dashes, no exclamation marks, no emoji. `{opp}` is the opponent short name, `{pct}` a whole percent, `{mm:ss}` the deck countdown. The term in-app is "highlight" (`TERM_APP`).

| Id | Where | String |
|---|---|---|
| C-T1 | Tab label | `Matches` |
| C-M1 | Matches header | `Matches` |
| C-M2 | Matches carousel lane title | `Your highlights` |
| C-HM1 | RETIRED (round 2, R2-1) | ~~`Your reels`~~: must not appear anywhere in the app |
| C-HM3 | Home carousel title | `Highlights` |
| C-HM2 | See all tile | `See all` |
| C-M10 | a11y, media tap (playable) | `Play match vs {opp}` |
| C-M11 | a11y, meta tap | `Open match vs {opp}` |
| C-M12 | a11y, ready tile | `Watch your highlight vs {opp}` (`, unwatched` appended when unseen) |
| C-M13 | Meta, disputed | `DISPUTED` |
| C-M14 | Meta, delta unknown | `Pending` |
| C-Z1 | Zero, ghost match card | `Your first match will show up here` |
| C-Z2 | Ghost reel tile | `Your first highlight lands here` |
| C-Z2b | Ghost card, clips off | `Your first match lands here` |
| C-Z3 | Zero, progress | `0 of 1 matches to your first highlight` |
| C-Z4 | Zero, primary CTA | `Find a match in the Arena` |
| C-Z5 | Zero, secondary, only when `invites_enabled` is false (10.2) | `Try a practice match` |
| C-Z7 | Zero, secondary, when `invites_enabled` is true (10.2, PM13) | `Challenge a friend` (a11y: `Challenge a friend to a match. Opens an invite with a QR code and link.`) |
| C-Z6 | Zero, helper (clips on) | `Turn on Record from my phone at face-off and we cut your best moments into a highlight.` With clips off, C-L6 is shown instead (10.7). |
| C-HZ1 | Home zero, CTA tile | `Get your first highlight` |
| C-L1 | Low data, next match ghost | `Your next match goes here` |
| C-L2 | Low data, CTA | `Find a match` |
| C-L3 | Meta tag | `FIRST MATCH` |
| C-L4 | Meta tag | `FIRST WIN` |
| C-L5 | No reels ghost tile | `Record your next match to get a highlight` |
| C-L6 | Recording helper | `Turn on Record from my phone at face-off.` |
| C-L7 | No film caption (cards with no video rows only) | `No film for this one` |
| C-B1 | Building step 1 | `Finding your best moments` |
| C-B2 | Building step 2 | `Cutting your highlight` |
| C-B3 | Building, waiting | `Waiting {mm:ss}` (at 0:00: `Any second now`) |
| C-B4 | Building helper | `Usually 1 to 3 minutes` |
| C-B5 | Building step counter | `Step {n} of 2` (`Step 1 of 2` while C-B1, `Step 2 of 2` while C-B2) |
| C-B6 | a11y, building tile | `Your highlight vs {opp} is being made. {step line}. Opens the match.` (`{step line}` is C-B1, C-B2 or C-B3 as shown) |
| C-V1 | Viewer swipe hint | `Swipe up for the next one` |
| C-V2 | Viewer, swipe past the last reel | `You're all caught up` |
| C-V3 | a11y, mute toggle | `Mute` / `Unmute` |
| C-V4 | a11y, close | `Close` |
| C-V5 | Viewer, non-participant on a non-own reel (8.6) | `View profile` |
| C-S1 | Source chip, `friend` (future; built and tested now) | `FRIEND` (a11y `, from a friend`) |
| C-S2 | Source chip, `local` (future; built and tested now) | `NEARBY` (a11y `, nearby`) |
| C-S3 | Source chip, `elo` (future; built and tested now) | `ELO RATED` (a11y `, from ELO RATED`) |
| C-C1 | Milestone first match | `First match in the books` |
| C-C2 | Milestone first win | `First win. That one counts.` |
| C-C3 | Milestone first highlight | `Your first highlight is ready` |
| C-E1 | Error panel | title `COULDN'T LOAD YOUR MATCHES`, body `Check your connection and try again.`, action `Try again` (carried) |
| C-E2 | Error toast, cached | `Couldn't refresh your matches` |
| C-E3 | Load more failed | carried `ListFooter` string `COULDN'T LOAD MORE. TAP TO RETRY`; the whole row is tappable and retries (no separate button) |
| C-F1 | Filter empty, more pages | carried: `NO MATCHES FOR THIS FILTER YET` / `Older matches have not loaded yet.` / `Search older matches` |
| C-F2 | Filter empty | carried: `NO MATCHES FOR THIS FILTER` / `Try another result or opponent.` / `Show all` |
| C-H1 | Help, footage answer | `You own your match footage. Your recorded matches are in the Matches tab, where you can watch them back. Server-side retention on the free tier may be limited; access to your own data is not.` |

Badge strings (`New`, `Breakdown ready`, `Building highlight`, `Waiting {mm:ss}`, `Uploading`, `No film`, `Upload paused`, `Didn't upload`, `Uploading {pct}%`) are not redefined here: they come from `lib/video/video-status-copy.ts` (`CARD_BADGE`, `PHASE_TAG`) per the Oct 4 deck so every surface says the same thing (deck contradiction rule 2).

## 12. Data contracts

### 12.1 Client reads (unchanged RPCs)

| Surface | RPC / call | Notes |
|---|---|---|
| Matches feed | `get_my_match_library(p_limit, p_before, p_before_id)` via `getMyMatchLibrary` / `useMatchLibrary` | Keyset `(completed_at, match_id)`, already tie-safe. Includes completed and disputed matches, with or without video. |
| Card badges | `get_match_video_status` via `useFilmRoomPhases` | Newest 6 matches in 48 h, backoff polling, shared cache. |
| Record strip | `useProfileData` history + `athletes.current_elo` | As the Film Room. |
| Reels (both surfaces) | `get_my_highlights` via `readMyHighlights` | Participant-scoped, clips-flag gated, one item per match while the multi-angle gate is on (jr_be-1qz.15, `20261006200400`). |
| Viewer | `get_highlight_detail`, `mark_highlight_seen` | Unchanged. |
| Milestones | `get_athlete_stats` (via `useProfileData` / dashboard summary), library, highlights | No new read. |

### 12.2 Backend changes (jr_be)

All five are additive, keep participant scope, keep `SECURITY DEFINER` + `auth_athlete_id()`, and ship as migrations applied to prod by hand before the OTA that depends on them (jr_be CLAUDE.md "Prod migrations are applied by hand").

**B1 (required, P1). `get_my_highlights` keyset tiebreak.**

```sql
public.get_my_highlights(
  p_limit       INTEGER     DEFAULT 20,
  p_before      TIMESTAMPTZ DEFAULT NULL,
  p_unseen_only BOOLEAN     DEFAULT false,
  p_before_id   UUID        DEFAULT NULL   -- new
) RETURNS JSONB
```

- When `p_before_id` is not null: keyset `(d.live_ready_at, d.id) < (p_before, p_before_id)`. When null: today's `d.live_ready_at < p_before` (back compatible). The final `ORDER BY d.live_ready_at DESC, d.id DESC` already exists.
- New additive top-level keys `next_before` (the last item's `live_ready_at`) and `next_before_id` (its id), both null when fewer than `v_limit` items were returned. Note the item key `ready_at` must equal `live_ready_at` for the cursor to be usable client side; if it is not, the client must use `next_before` only.
- Drop the 3-argument function before creating the 4-argument one (a second overload makes PostgREST named-argument calls ambiguous), re-apply the `REVOKE ... FROM PUBLIC, anon` / `GRANT ... TO authenticated`, and update the function COMMENT.
- pgTAP: three reels sharing one `live_ready_at`, page size 2: page 1 plus page 2 equals all three with no duplicate and no gap; legacy 3-argument named call still works; `p_unseen_only` combined with the cursor; cursor keys null on the last page; clips off still returns `items: []`.

**B2 (recommended, P2). In-flight reels on the first page.**

- Additive top-level key `in_flight` on `get_my_highlights`, filled only when `p_before IS NULL` and `p_unseen_only` is false, else `[]`; `[]` when clips are off.
- At most 3 entries, newest first, for the caller's matches completed in the last 48 h whose caller reel state (the same derivation `get_highlight_progress` returns as `reel_state`, factored into a shared helper if needed) is `waiting`, `planning` or `rendering`. Each entry: `match_id`, `match_video_id` (any visible angle of the match, for match detail's Film status), `reel_state`, `wait_deadline_at` (null unless waiting), `server_now`, `opponent_name`, `played_at`, `poster_path` (storage key of the elected primary or first poster, nullable).
- Why: it lets Home draw the anticipation tile from the call it already makes, instead of a library page plus up to six status reads. If B2 slips, Home shows no building tiles and the Matches tab derives them from library phases (12.3); nothing else changes.
- pgTAP: an athlete with a rendering reel sees one entry; a ready reel never appears in `in_flight`; another athlete's match never appears; non-first pages and `p_unseen_only` return `[]`; a match older than 48 h is excluded.

**B3 (recommended, P2). Elected primary angle in the library.**

- `get_my_match_library` adds a per-video key `is_primary` (boolean): true only when the match has an elected primary and this row is it (per `20261005100000`, `match_videos.primary_video_id = match_videos.id`), else false. Nothing else changes.
- Works before the election is switched on (jr_be-1qz.10 is built dark): every row reads false and the client falls back deterministically (6.3). When the election runs, cards start using the elected angle and poster with no client release.
- pgTAP: a match with an elected primary marks exactly one video; a match with no election marks none; the key is present on every video object.
- Related: `jr_be-ou8` (Film Room `highlight_count` should follow the playable-version model) touches the same RPC; whoever lands second rebases. The Matches card does not display `highlight_count` in phase 1.

**B4 (recommended, P3). Two new funnel steps.**

- Add `matches_reel_tapped` and `viewer_swiped` to the `video_highlight_share_events.step` CHECK and to `log_highlight_share_event`'s accepted set; mirror them in `HIGHLIGHT_SHARE_STEPS` (`packages/shared/src/constants/highlights.ts`) in the same client release. `docs/highlight-reels-alpha-metrics.sql` gains the carousel and swipe funnel queries.
- Until B4 is in prod, the client's events for these steps are rejected server side and swallowed by the fire-and-forget wrapper: harmless, but the data is lost, so apply B4 before the OTA.
- pgTAP: both steps accepted; an unknown step still rejected; the 300 per hour limit unchanged.

**B5 (required for C-Z7, P2; round 2). Invite entry point `matches`.** Bead `jr_be-gpz`.

- Add `'matches'` to the `invites.entry_point` CHECK (`20261001100000_invites_schema.sql`) and to `create_invite`'s `p_entry_point` allowlist (`20261001100100_invites_rpcs.sql`, which raises `invalid_entry_point` for anything else). Nothing else changes.
- Required, not merely recommended: the client sends `p_entry_point = 'matches'` from the zero-state CTA, and without B5 the invite screen cannot create the challenge. Apply before the OTA (backend first, section 15). The release gate (`jits-a4fw.10`) checks it on prod.
- pgTAP: `matches` accepted and stored; an unknown entry point still rejected; existing entry points unchanged.

### 12.3 Client contract changes (`packages/shared`)

- `getMyHighlights(supabase, { limit, before, beforeId, unseenOnly })`: sends `p_before_id` only when `beforeId` is set, and on a PostgREST "function not found" error for a call that sent it, retries once without it (a backend without B1). Returns `nextBefore`, `nextBeforeId` (null when absent) and `inFlight: InFlightReel[]` (`[]` when the key is absent, i.e. a backend without B2).
- `MatchLibraryVideo` gains `is_primary: boolean` (false when the key is absent).
- `InviteEntryPoint` gains `"matches"` (B5), and `app/(app)/invite/index.tsx` `ENTRY_POINTS` with it.
- `ReelItem` (`apps/mobile/lib/highlight/reel-types.ts`) gains `viewerIsParticipant: boolean` and `subjectAthleteId: string | null` (8.6); `ownReelItem` fills them (`true`, the caller's athlete id). The client file is the contract; future source RPCs must supply both.
- `HIGHLIGHT_SHARE_SOURCES` gains `"matches"`; `lib/highlight/discovery.ts` `SOURCES` gains `"matches"` so `parseHighlightSource` accepts it.
- Matches-tab fallback for building tiles without B2: for each of the newest six library items whose `useFilmRoomPhases` phase is `building` or `waiting_for_angle` and whose viewer reel state is not final, a `building` tile (reel state mapped: `waiting_for_angle` to `waiting`, `building` to `rendering` unless the viewer's reel reads `planning`).

## 13. Analytics

The repo has two telemetry channels and no general analytics sink:

1. **Highlight funnel** (`log_highlight_share_event`, server table `video_highlight_share_events`, spec 015 16.3.6), keyed by highlight id, via `logHighlightEvent` (`lib/highlight/highlight-event.ts`), which adds device keys.
2. **Sentry funnel telemetry** (`captureMessage` events with tags, scrubbed by `scrubTelemetryUser`, the pattern in `lib/video/playback-telemetry.ts` and `upload-telemetry.ts`) for anything not keyed by a highlight.

Events:

| Event | Channel | When | Detail / tags |
|---|---|---|---|
| `home_card_tapped` (existing step) | Highlight funnel | Home Highlights carousel `ready` tile tapped | `source: "home"`, `surface: "carousel"`, `position`, `unseen`, `reel_source` (`own` in phase 1) |
| `matches_reel_tapped` (B4) | Highlight funnel | Matches carousel `ready` tile tapped | `source: "matches"`, `position`, `unseen` |
| `viewer_opened` (existing) | Highlight funnel | Each page shown (once per reel per viewer session), both modes | `source`, `swiped: true` when reached by swipe, `layout: "fullscreen"` |
| `viewer_swiped` (B4) | Highlight funnel | Each swipe that lands on a new reel | `source`, `direction: "next" | "previous"`, `index`, `first_frame_ms` (nullable), `prefetched` |
| `matches.empty_cta` | Sentry funnel | Any CTA in section 10 tapped | tags `surface: "matches" | "home"`, `state: "zero" | "low_data" | "no_reels"`, `cta: "arena" | "practice" | "invite"` (`invite` is C-Z7; the invite itself is also attributed server side by `invites.entry_point = 'matches'`, B5) |
| `matches.milestone_shown` | Sentry funnel | A celebration starts | tag `milestone: "first_match" | "first_win" | "first_highlight"` |
| `matches.tab_opened` | Sentry breadcrumb only | Matches tab focused | tag `entry: "tab" | "redirect" | "see_all"` (a breadcrumb, not an event, to keep volume low) |

`home_card_dismissed` and `profile_row_tapped` lose their emitters (the card and the row are removed); both stay in the DB enum for historical queries.

## 14. Performance and accessibility

- The pager keeps a pool of exactly three `expo-video` players (previous, current, next) and only the current one plays (8.3); performance budget in 8.5. The feed has no inline autoplay in phase 1 (posters only).
- Posters are signed in one batch per library page (existing) and per highlights page (new batch call); never one signing call per tile.
- `MatchFeedCard` and `ReelTile` are memoised with stable props (as `LibraryPoster` is today); the feed `FlatList` uses `getItemLayout` for fixed-height cards where possible and `removeClippedSubviews` on Android.
- Every control is at least 44 pt (deck 10). VoiceOver reads the badge, then `vs {opp}`, outcome word, delta, date for the meta target. The carousel is an `accessibilityRole="list"` with each tile a button. Reduce Motion disables pulses, shimmer sweeps and confetti.
- Dark mode first, light mode supported, real tokens from `apps/mobile/lib/tokens.ts`, NativeWind rem = 14 px on native.

## 15. Rollout

- **Client: OTA.** Everything here is JS/TS under `apps/mobile` and `packages/shared`. Every native module it uses (`expo-video`, `expo-image` including `blurRadius`, `react-native-reanimated`, `react-native-gesture-handler`, `expo-haptics`, `@react-native-async-storage/async-storage`, `lucide-react-native` over the linked `react-native-svg`) is already in build 23 / runtime 0.4.0. No `app.json` / `app.config` change, no native dependency added, no version bump. Ship with the `ship-mobile` skill on the OTA path. If an implementer finds they need a native dependency, stop and escalate: that changes the release to a TestFlight build (jits_web CLAUDE.md "Mobile deploy").
- **Backend first.** Apply B1, then B2, B3, B4, B5 to prod by hand (`supabase migration list --linked`, `supabase db push --linked --dry-run` listing only the intended files, `supabase db push --linked`) before publishing the OTA. The client tolerates the absence of B1 to B4 (12.3), so a backend slip degrades gracefully rather than breaking. B5 is the exception: without it C-Z7 fails, so it is a hard precondition of the OTA.
- **No feature flag.** The tab change is structural and the owner approved it; a flag would mean keeping both the Film Room and the tab alive. The existing `highlight_clips_enabled` flag still gates every reel surface (10.7).
- **Order inside the OTA:** the tab, feed, Profile cleanup and Film Room redirect ship together, so there is never a build where history has no entry point.
- **After release:** `/canvas-sync` (section 19).

## 16. Test plan

jits_web (`npm run typecheck` and `npm run test` across workspaces; the husky pre-commit runs both; the mobile quality gate also needs `npx expo export` to bundle cleanly):

- `lib/matches/card-media.test.ts`: primary wins when playable; viewer's own when no primary; server order otherwise; nothing playable gives no play target but a poster; deterministic across calls; crop rule landscape, square, portrait, unknown.
- `components/matches/match-feed-card.test.tsx`: renders badge from each `CardStatus` kind with the deck string; no duration and no play glyph when nothing is playable; media tap pushes `videoHref`, meta tap pushes `matchDetailHref`; disputed and pending delta strings; fallback art with C-L7; `FIRST MATCH` / `FIRST WIN` tags; draw and zero delta render neutral (`ink-2`), never amber; duration via `formatDuration` (`252` -> `4:12`); the meta chevron is not a separate accessible control; C-L7 only with no video rows.
- `components/reels/reel-carousel.test.tsx` and `reel-tile.test.tsx`: every tile kind renders and labels; a `ready` tile with an own item shows no source chip and the `vs {opp}` caption; fixture items with `source` `friend`, `local` and `elo` (and `isOwn: false`) show `FRIEND`, `NEARBY`, `ELO RATED` with the subject caption and the chip text in the a11y label; the chip never uses Signal Red or gain/loss tokens; unseen ring present only when unseen; renders nothing with no tiles; `see_all` routes to the Matches tab; ring never uses the Signal Red token (extend `color-semantics-guard.test.ts`).
- `lib/reels/use-reel-lane.test.tsx`: ordering (building, unseen, seen); clips off yields no tiles; B2 absent falls back; B1 cursor pagination; `markSeenLocally`; poster re-sign rule.
- `packages/shared` `highlight-share` tests: `beforeId` sent only when set; retry without `p_before_id` on function-not-found; `inFlight` and cursor parsing with keys present and absent; `is_primary` default false in the library parser.
- `screens/matches.test.tsx`: zero state secondary action: invites on shows C-Z7 and pushes `/invite?from=matches`, invites off shows C-Z5 (when `shouldOfferPracticeMatch`), flag unknown shows neither, never both; the same on the clips-off zero state; C-Z7 emits `matches.empty_cta` with `cta: "invite"`; zero, low-data, filter-empty, error, error-with-cache, loading skeleton, load-more failure, pull to refresh refreshes all three sources.
- `screens/home.test.tsx`: the Highlights carousel (title `Highlights`) replaces `NewHighlightCard`; the string `Your reels` is never rendered; Resume above the carousel; zero and no-reels tiles; clips off hides the carousel; never an empty row; `InviteHomeCard` behaviour unchanged.
- `screens/profile.test.tsx`: no Recent Matches, no highlights row, no Film Room preview, no matches link.
- `components/highlight-viewer/reel-pager.test.tsx`: opens at the tapped index; exactly three players are created and re-used across swipes (only the slot leaving the window is re-pointed); only the visible page plays, neighbours are paused at 0 with the poster shown until first frame; next pages are signed and posters prefetched (`i + 1`, `i + 2`, `i - 1`, nothing further); tap toggles pause and play; mute persists to `reels:muted:v1` and applies to every page; pagination near the end with no duplicate; end of list shows C-V2 and no extra page; modals disable scrolling and pause; `viewer_opened` once per reel with `swiped` and `layout`; `viewer_swiped` per landing with `first_frame_ms` and `prefetched`; swipe hint C-V1 once per install on 2+ page lanes, gone after the first swipe, never on a single page; Reduce Motion: no chevron bounce, instant poster swap.
- `components/highlight-viewer/reel-page.test.tsx`: full-screen layout (video `cover`, close, mute, right rail, bottom meta, progress bar); a non-9:16 asset uses `contain` over the blurred poster; single-reel mode (no lane token, or an unknown token) renders the same full-screen page with no paging and no hint; the building, failed, replaced and not-found states render full-screen. Existing `highlight-route.test.tsx` and `viewer-screen.test.tsx` are updated only where they assert the old inset layout; their entry-point, source and telemetry assertions stay as they are.
- `lib/highlight/reel-types.test.ts` and `components/highlight-viewer/viewer-actions.test.tsx` (ownership, 8.6): `canManageReel` is true only for `isOwn: true` (and false for a `source: "own"` fixture with `isOwn: false`, proving source is not used); with `isOwn: false` the rail renders no Share to Instagram, Share reel, Save to Photos or Improve this reel and no sheet can open; `viewerIsParticipant: true` shows Open match to match detail; `viewerIsParticipant: false` shows View profile (C-V5) to `athlete/[id]`; `ownReelItem` sets `viewerIsParticipant: true` and `subjectAthleteId`.
- `lib/milestones/milestone-store.test.ts`: fires once per athlete; freshness guard; a Home fire suppresses the Matches fire; Reduce Motion path; first match that is a loss: no haptic and ink-only confetti; first match that is also first win: only the First win banner, both keys written.
- `app/film-room-redirect.test.tsx`: the old route redirects to the Matches tab; a repo grep test (or lint) finds no remaining navigation to `/film-room` outside the redirect.
- `layout/tab-bar.test.tsx`: five tabs in order with the right labels and icons; labels fit at 375 pt (snapshot of computed widths or `numberOfLines` without truncation in the test renderer).

jr_be (`supabase test db`): new pgTAP files for B1 to B4 as listed in 12.2, plus the existing `063_get_my_match_library_test.sql` and highlight tests staying green, and pgTAP 073 (no direct `current_setting('app.settings.*')`).

Device QA (iOS simulator plus one physical iPhone against a local stack): portrait and landscape footage cards, the full-screen pager with 3+ reels in a release build (60 fps swiping, next reel's first frame within about 300 ms when prefetched, no black page, mute persisting across a restart), a single-reel open from a push, a reel landing while Home is visible (reveal), zero-match account, 2-match account, clips off, airplane mode.

## 17. Acceptance criteria

### 17.1 Navigation
1.1 The tab bar shows five tabs in this order with these labels: Home, Arena, Matches, Rankings, Profile; Matches uses the lucide `Film` icon.
1.2 Tapping Matches shows the Matches tab root with the shared `TabHeader` (Live Chip and bell present).
1.3 At 375 pt and 390 pt screen widths no tab label is truncated.
1.4 The Arena tab badge and live marks behave exactly as before.

### 17.2 Matches tab
2.1 The feed lists every completed and disputed match of the athlete, newest first, including matches with no film.
2.2 Scrolling to the end loads the next page with the `(completed_at, match_id)` cursor; no match is duplicated or skipped across pages.
2.3 Pull to refresh re-reads the library, the card phases and the reel lane.
2.4 Each card shows a 16:9 media area, at most one status badge, and a meta row with opponent, outcome letter, `deltaLabel` delta and `shortDate` date (`OCT 04`); a draw and a zero delta render neutral, never amber; the duration chip reads `m:ss` (`4:12`).
2.5 Badge choice follows the deck priority exactly; `Processing` never appears as a card badge.
2.6 Tapping the media of a card with a playable video opens `video/[id]` for the selected video; tapping the meta row, or the media of a card with nothing playable, opens `match-detail/[matchId]`.
2.7 The selected video is the elected primary when B3 marks one and it is playable, else the viewer's own playable video, else the first playable video in server order.
2.8 A portrait poster renders pillarboxed (contain over a blurred cover); a landscape poster renders cover; an unknown-size poster applies the rule after load.
2.9 No duration chip and no play glyph appear for a card whose selected video is not playable.
2.10 Filter chips and the Opponent picker filter the feed only; the carousel is unaffected.
2.11 The record strip renders the shipped `recordStrip` output, e.g. `21 MATCHES · 14W 6L 1D · 1487`.
2.12 Loading with no cache shows skeletons for the carousel and three feed cards.
2.13 With clips on and at least one reel, the Your highlights carousel shows the athlete's own reels; tapping one opens the swipe viewer at that reel.
2.14 The upload strip shows above the tab bar on the Matches tab during an upload, as on other tabs.
2.15 Opening a card (either target) clears its NEW badge.

### 17.3 Home
3.1 `NewHighlightCard` no longer renders anywhere; one carousel titled `Highlights` (C-HM3) renders at the top of Home's scroll content, below `ResumeMatchCard` when one is shown. The string `Your reels` appears nowhere in the app.
3.1a In phase 1 every tile in the Home carousel is the athlete's own (`source: "own"`) and shows no source chip; a non-own item (fixture) shows the `FRIEND` / `NEARBY` / `ELO RATED` chip in the same carousel, never in a second carousel.
3.2 Unseen reels show the ring, come before seen reels, and the first unseen tile pulses once per session for `moment.reelRingPulse` (600 ms) (not under Reduce Motion).
3.3 Watching a reel clears its ring on return and clears the bell's unread dot.
3.4 With more than 10 reels the carousel ends in a See all tile that switches to the Matches tab.
3.5 The unseen ring is a 2 px edge stroke in the `unseen-ring` token (alias of `ink`) with a 2 px gap; the colour guard asserts the ring resolves to `unseen-ring`, and neither the ring nor the CTA tiles ever use Signal Red.

### 17.4 Swipe viewer
4.1 Opening the viewer from a carousel lets the athlete swipe vertically to the next and previous reel of that carousel; building and ghost tiles are not pages.
4.2 Every page is full-screen, edge-to-edge 9:16 video with the close and mute controls on top, the actions on a right rail, the meta and Open match bottom-left and a progress bar at the bottom; there is no inset frame.
4.3 Only the visible page plays; neighbours are paused at frame 0 showing their poster until ready; leaving a page pauses it and resets it; at most three players exist.
4.4 Opening the viewer from push, bell, match detail or summary shows one reel full-screen with no swipe; its route, source and telemetry are unchanged.
4.5 Nearing the end of the loaded reels loads the next page without a duplicate; swiping past the last reel of a fully loaded list bounces and shows C-V2.
4.6 `viewer_opened` is logged once per reel per viewer session; `viewer_swiped` once per landing, with `first_frame_ms` and `prefetched`.
4.7 On a carousel with 2 or more pages the swipe hint C-V1 shows once per install and is gone after the first swipe; it never shows with a single page or in single-reel mode.
4.8 A tap on the video toggles pause and play; the mute choice persists across pages and app restarts.
4.9 In a release build swiping holds 60 fps and a prefetched next reel shows its first frame within about 300 ms after the swipe settles; no page is ever black (the poster covers until first frame).
4.10 No native dependency is added: the pager is a `FlatList` with `pagingEnabled`, gradients use `react-native-svg`.
4.11 For a reel with `isOwn: false`, Share to Instagram, Share reel, Save to Photos and Improve this reel are not shown and cannot be opened; Open match shows only when `viewerIsParticipant` is true, else View profile opens the athlete profile. Covered by unit tests with fixture items although phase 1 produces only own reels.
4.12 Under Reduce Motion the swipe hint does not bounce and the poster-to-video swap is instant.

### 17.5 Profile
5.1 Profile shows no Recent Matches list, no highlights row and no Film Room preview.
5.2 Profile keeps header, Share profile, invite actions, quick stats, View Detailed Stats, account section and the version footer.
5.3 Profile has no "View all matches" link.

### 17.6 Low-data, empty and celebration
6.1 Zero matches: the Matches tab shows the ghost match card (C-Z1), the ghost reel tile (C-Z2), the progress line (C-Z3) and the red primary CTA (C-Z4) that switches to the Arena tab.
6.2 Zero matches with `invites_enabled` on: the secondary action is C-Z7 `Challenge a friend` (not red), which opens the challenge invite screen `/invite?from=matches` and the created invite is stored with `entry_point = 'matches'`. With `invites_enabled` off: the secondary action is C-Z5 and opens the practice match (when `shouldOfferPracticeMatch`). Never both; neither while the flag is unknown. The clips-off zero state follows the same rule. The red primary C-Z4 is unchanged.
6.3 Zero matches: Home's Highlights carousel shows the C-HZ1 CTA tile (not red) and the C-Z2 ghost tile.
6.4 One to three matches with no more pages and no filter: a "Your next match goes here" ghost card with "Find a match" follows the last card.
6.5 The oldest match carries `FIRST MATCH` and the oldest win carries `FIRST WIN` once the full history is loaded.
6.6 No reels with clips on: both carousels show the C-L5 ghost with the recording helper; Home adds the C-L2 CTA tile.
6.7 A card with no video rows shows C-L7; a card with video rows in the `No film` phase shows the deck badge and no C-L7; only the first C-L7 card shows the recording helper, and not while the carousel shows C-L6.
6.7a With 1 to 2 ready reels the carousel appends one C-L5 ghost (owner confirmed, Q7); with 3 or more none.
6.8 A reel in flight shows a building tile with C-B1 or C-B2 by reel state (or C-B3 with a live countdown when waiting) and C-B4; tapping it opens match detail.
6.9 When a building reel becomes ready while the surface is visible, the tile turns into a ready tile with the ring, one pulse and a success haptic.
6.10 First match, first win and first highlight each celebrate exactly once per athlete per device, only within 7 days of the event, never during an active match or over a modal, and without particles under Reduce Motion. A first match that is a loss celebrates with no haptic and ink-only confetti. A first match that is also the first win shows only the First win banner and marks both milestones seen; both meta tags still show.
6.11 With clips off, neither carousel renders and no copy promises a highlight; the Matches zero state uses C-Z2b and C-L6 in place of C-Z2 and C-Z6.
6.12 Home never renders an empty carousel row in any state.
6.13 Offline with nothing cached: the Matches tab shows the C-E1 panel with Try again; Home hides the carousel.
6.14 Every CTA in 6.1 to 6.6 emits `matches.empty_cta` with the right tags (C-Z7 with `cta: "invite"`, C-Z5 with `cta: "practice"`); every celebration emits `matches.milestone_shown`.

### 17.7 Retirement and links
7.1 Navigating to `/(app)/film-room` lands on the Matches tab.
7.2 No code path other than the redirect file navigates to the Film Room route; the match-hero back fallback goes to the Matches tab.
7.3 The Help footage answer says "Matches tab" (C-H1).
7.4 `film-room-preview.tsx`, `highlights-row.tsx` and `new-highlight-card.tsx` are deleted, along with any helper left with no importer.

### 17.8 Backend
8.1 B1: paging `get_my_highlights` with the returned cursor never skips or duplicates reels that share `live_ready_at`; the 3-argument named call still works.
8.2 B2: `in_flight` lists only the caller's in-flight reels from the last 48 h, first page only, at most 3, `[]` when clips are off.
8.3 B3: `is_primary` is present on every library video and true for at most one video per match, only when elected.
8.4 B4: `matches_reel_tapped` and `viewer_swiped` are accepted by `log_highlight_share_event`.
8.4a B5: `create_invite` accepts `p_entry_point = 'matches'`; unknown values are still rejected.
8.5 All jr_be pgTAP tests pass; B1 to B5 are applied to prod before the OTA.

### 17.9 Release
9.1 `npm run typecheck`, `npm run test` and `npx expo export` pass; no native dependency is added; the release is an OTA on runtime 0.4.0.
9.2 Changed boards are redrawn by `/canvas-sync` after the OTA (section 19).

## 18. Future gated epics (not scoped for build)

Each is filed as a gated epic so it cannot start without hitting its gate.

**Round 2 rule (owner, 2026-10-06):** the friend, local and Elo items are **sources in Home's one Highlights carousel**, not separate titled lanes (R2-1, section 7.3). Each source maps its rows to `ReelItem` with its own `source` value (`friend`, `local`, `elo`), sets `isOwn` true only when the viewer is the subject, and supplies `viewerIsParticipant` and `subjectAthleteId`. Its tiles carry the source chip (`FRIEND` C-S1, `NEARBY` C-S2, `ELO RATED` C-S3) and its viewer pages obey the ownership rule (8.6), so no tile or viewer change is needed when a source turns on. Each source sits behind its own feature flag; its hook returns `[]` while off.

1. **Elo highlights source** (`jr_be-o7c`, Home carousel, source `elo`). Content program output (jr_be-dd4, spec 016 on branch `spec/016-content-programs`) shown in the app. **Gates:** Terms v2 live (`jr_be-dd4.5`, social-publishing licence for match footage including the opponent, plus takedown), and a spec 016 amendment, because spec 016 G5 says it does "nothing that widens in-app read access" and the Terms v2 licence covers social platforms only. Work: a world-readable read RPC over published program posts, takedown honoured in-app, a source hook merged into the Home carousel.
2. **Friend highlights source** (`jr_be-tjx`, Home carousel, source `friend`). Friends' highlights, using `athlete_friendships` (on jr_be origin/development; invites plan `research/invites-join-and-challenge.md` section 15). **Gate:** consent decision `jr_be-17f`. Open question for that decision: extend the spec 016 approach (ToS licence, no opt-in, takedown path) or add a per-athlete visibility setting. Work: a visibility model, a friends-scoped read RPC with both participants' consent rule, a source hook.
3. **Local highlights source** (`jr_be-880`, new in round 2, Home carousel, source `local`, chip `NEARBY`). Highlights from athletes near the viewer. **Gates** (gate task `jr_be-880.1`): consent decision `jr_be-17f` (what a non-participant may see, covering the opponent too) and a location-consent model: an explicit opt-in to being discoverable by area and to seeing nearby highlights, separate from the match location permission used for go-live and `match_location_required`; coarse area only (city or a geohash cell), never a precise position, never derived from another athlete's live location. The epic is also blocked by `jr_be-tjx`, whose visibility model it reuses. Work: an area-scoped read RPC applying both consents, takedown honoured, a source hook.
4. **Follows and Athletes you might follow** (`jr_be-293`). Needs a follows table (does not exist), RLS, a suggestions RPC, and World visibility. **Gates:** `jr_be-17f` (what a follower may see) and the visibility model from item 2. Suggested athletes are people, not reels, so they are not a source in the Highlights carousel; their placement is that epic's decision.
5. **Matches visibility filter** (`jr_be-7t0`, Me / Friends / Gym / World on the Matches tab). Reuses the same visibility model. **Gates:** item 2's visibility model and `jr_be-17f`. Note: "Gym" may need a new athlete-gym affiliation model, since the Arena replaced gyms and sessions (memory "Arena replaces gyms and sessions"; `athletes.primary_gym_id` exists but gym membership is no longer how matches happen).

## 19. Canvas follow-ups ("ELO RATED Native Screens", https://claude.ai/artifact/PJWm2WeqsG56HS13jHsd5D)

After the OTA ships, `/canvas-sync` redraws from code, with an independent review, reading `project/canvas.json` first:

- `Main` and every tab-root board: the five-tab bar.
- `11-Home-Resume`: the Highlights carousel at the top, Resume above it, no `NewHighlightCard`.
- `17-Profile`: the leaner Profile.
- `31-Film-Room`: becomes the Matches tab board (retitle it; keep its slot), with the feed card and the carousel.
- `34-Highlight-Viewer`: redrawn as the full-screen page (edge-to-edge video, right rail, bottom meta, progress bar) with the swipe hint.
- New "Current app" boards for the states that ship: Matches zero (with C-Z7), Matches low data, Home carousel no reels, building tile, milestone banner.
- `design/native-screens/board-map.json` regenerated via `build-board-map.py` so the new source files (`components/reels/*`, `components/matches/*`, `app/(app)/(tabs)/matches/*`) map to their boards.

Before build (owner decision 2026-10-06, Q4): the "Proposed (Oct 6 Matches tab)" page with every `P-MT-*` board, plus a clickable prototype, for the owner to react to.

Round 2 changes the following proposed boards (source `design/native-screens/proposals/2026-10-06-matches-tab/`); they are updated on the proposed page, with an independent review, before build starts:

- `P-MT-05-Home-Default`, `P-MT-06-Home-Resume`, `P-MT-11-Zero-Home`, `P-MT-13-Low-Data-Home`, `P-MT-15-Milestones` (Home part): the lane title `Your reels` becomes `Highlights`.
- `P-MT-07-Home-Future-Lanes`: redrawn as one Highlights carousel mixing own tiles with `FRIEND`, `NEARBY` and `ELO RATED` chipped tiles; no stacked titled lanes. Retitle the board (for example `P-MT-07-Home-Future-Sources`).
- `P-MT-08-Reel-Viewer`: redrawn full-screen (edge-to-edge video, close and mute top, right rail, bottom meta with Open match, progress bar, swipe hint), plus a variant for a non-own reel with the rail hidden and View profile.
- `P-MT-10-Zero-Matches` and the zero state on `P-MT-16-Clips-Off`: C-Z5 replaced by C-Z7 `Challenge a friend`; annotate the flag-off fallback to C-Z5.
- `P-MT-12-Low-Data-Matches`: drop the "pending owner confirmation" annotation on the 1 to 2 reel ghost (Q7 confirmed).
- `P-MT-00-Map`: update the board list and the decisions summary.

## 20. Issue map

### 20.1 jits_web (epic `jits-a4fw`, "Matches tab + Home reel carousel (phase 1)")

| Bead | Title | Depends on |
|---|---|---|
| `jits-a4fw.1` | Data + hooks foundation (getMyHighlights cursor and in_flight, is_primary, useReelLane, pickCardMedia + crop rule, milestone store) | none |
| `jits-a4fw.2` | Reusable ReelCarousel + ReelTile | .1 |
| `jits-a4fw.3` | 5th tab + matches route + screen shell | none |
| `jits-a4fw.4` | MatchFeedCard + carousel on the tab | .1, .2, .3 |
| `jits-a4fw.5` | Full-screen shorts-style swipe viewer (ReelPager + ReelPage, player pool of 3, prefetch, ownership rule) | .1 |
| `jits-a4fw.6` | Home: Highlights carousel (one mixed carousel, own only in phase 1) replacing NewHighlightCard | .2 |
| `jits-a4fw.7` | Profile cleanup | .3 |
| `jits-a4fw.8` | Film Room route retirement | .3, .4, .7 |
| `jits-a4fw.9` | Low-data, empty, in-flight and milestone states | .2, .4, .6 |
| `jits-a4fw.10` | Release gate (quality gate, device QA, OTA eligibility, backend-first) | .4, .5, .6, .7, .8, .9 |
| `jits-a4fw.11` | Canvas sync after the OTA | .10 |
| `jits-766g` | Delete the Film Room redirect after two OTAs (Q5) | .10 |

Parallel lanes: `.1` and `.3` start at once (separate worktrees); then `.2`, `.5` and `.7` in parallel; then `.4` and `.6`; then `.8` and `.9`. Every slice gets an independent reviewer before merge (workspace policy section 2).

### 20.2 jr_be

| Bead | Title | Depends on |
|---|---|---|
| `jr_be-405` | B1: get_my_highlights keyset tiebreak (required) | none |
| `jr_be-cl1` | B2: get_my_highlights in_flight array | jr_be-405 (same function, sequenced migrations) |
| `jr_be-pdf` | B3: get_my_match_library is_primary | none |
| `jr_be-62n` | B4: funnel steps matches_reel_tapped, viewer_swiped | none |
| `jr_be-gpz` | B5: invites entry_point `matches` (required for C-Z7) | none |

### 20.3 Future gated epics (jr_be)

| Epic | Gate task (real blocker edge) | Blocked by |
|---|---|---|
| `jr_be-o7c` Elo highlights source (Home carousel) | `jr_be-o7c.1` | `jr_be-dd4.5` (Terms v2) + spec 016 amendment; related `jr_be-dd4` |
| `jr_be-tjx` Friend highlights source (Home carousel) | `jr_be-tjx.1` | `jr_be-17f` |
| `jr_be-880` Local highlights source (Home carousel, round 2) | `jr_be-880.1` | `jr_be-17f` + location-consent model; epic blocked by `jr_be-tjx` |
| `jr_be-293` Follows + suggested athletes | `jr_be-293.1` | `jr_be-17f`; epic blocked by `jr_be-tjx` |
| `jr_be-7t0` Matches visibility filter | `jr_be-7t0.1` | `jr_be-17f` + Gym affiliation decision; epic blocked by `jr_be-tjx` |

(bd refuses a task blocking an epic directly, so each epic carries a gate child task that holds the blocker edge.)

### 20.4 Notes filed

- `jits-tj5n` and `jits-icei`: note recording the reopened tab decision.
- `jr_be-17f` and `jr_be-dd4.5`: notes listing the epics they gate (`jr_be-17f` also gates `jr_be-880`, noted 2026-10-06).
- `jr_be-tjx` and `jr_be-o7c`: round-2 notes that they join the single Home Highlights carousel as sources with chips, and must return `viewer_is_participant` and `subject_athlete_id`.
- jits_web memory `nav-five-tabs-matches`.

## 21. Assumptions and open questions

Assumptions:

1. `get_my_highlights` item `ready_at` equals the row's `live_ready_at` (verified in `_highlight_list_item`, `20261006200400`), so a client-built cursor works; B1 adds an explicit `next_before` regardless.
2. RESOLVED (design review, 2026-10-06): the unseen ring is `ink` (#E8EDF2 dark) through a new semantic alias `unseen-ring -> ink`, added to `apps/mobile/lib/tokens.ts` and the design system in `jits-a4fw.1`.
3. `expo-image` `blurRadius` is available in the shipped version (3.0.x); if not, the pillarbox background falls back to a flat `void` fill.
4. Device-local milestone and seen stores are acceptable (no server column), matching the shipped seen-store choice.
5. The tab label size token fits five labels at 375 pt, or a small shared size change is acceptable.

Open questions (each with a recommendation):

- Q1. RESOLVED (owner, 2026-10-06): Home's `RecentActivitySection` keeps its "My matches" segment in phase 1. A follow-up may turn Home's activity social-only ("All activity") with a "My matches" link to the tab.
- Q2. RESOLVED (owner, 2026-10-06): Elo milestones are deferred (PM8); revisit after the first-match / first-highlight funnel numbers exist.
- Q3. RESOLVED (owner, round 2, 2026-10-06): no Matches tab badge in phase 1 (PM9).
- Q4. RESOLVED (owner, 2026-10-06): the full "Proposed (Oct 6 Matches tab)" canvas page (all `P-MT-*` boards, not only the low-data states) plus a clickable prototype are produced and reviewed by the owner before build starts.
- Q5. RESOLVED (owner, round 2, 2026-10-06): keep the Film Room redirect for two OTAs, then delete it (`jits-766g`).
- Q6. RESOLVED (owner, round 2, 2026-10-06): phase 1 pages are full-screen, edge-to-edge 9:16 video with overlaid actions, in pager and single-reel mode alike (section 8).
- Q7. RESOLVED (owner, round 2, 2026-10-06): a carousel with 1 to 2 ready reels appends one C-L5 ghost (10.3, AC 6.7a).

Round 2 assumptions (PM, 2026-10-06):

6. `onFirstFrameRender` on `VideoView` works in the shipped expo-video 3.0.x on iOS and Android; if it does not fire on one platform, the poster drops on `status === "readyToPlay"` instead (8.2).
7. Three concurrent `expo-video` players (one playing, two paused) fit the memory budget of the oldest supported iPhone; if device QA shows otherwise, the pool drops to two (current and next) with no spec change elsewhere.
8. The practice route can be offered again to a zero-match athlete whenever `shouldOfferPracticeMatch` is true; C-Z5 keeps that rule rather than showing practice unconditionally.
9. The full-screen deck rule "starts with sound" (deck section 5) applies to the pager; today's `use-highlight-player.ts` starts every reel muted for the inset player, so the full-screen page changes that default: with sound unless `reels:muted:v1` records that the athlete muted last time.

Round 2 open questions (each with a recommendation):

- Q8. Should the viewer auto-advance to the next reel when one ends, instead of looping? Recommendation: no in phase 1 (loop, as Shorts does); revisit with `viewer_swiped` data.
- Q9. Should Home's practice offer card yield to an invite card for zero-match athletes, mirroring C-Z7? Recommendation: no; Home already shows `InviteHomeCard` whenever there is no practice offer, and changing Home's red-CTA owner is out of scope for round 2.
