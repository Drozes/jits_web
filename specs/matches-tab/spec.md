# Matches tab + Home reel carousel (mobile, phase 1)

Status: owner-approved direction (2026-10-06), build-ready spec. Author: PM agent, 2026-10-06.
Platform: `apps/mobile` only, plus four small `jr_be` RPC changes. Web is out of scope (native-first rollout rule).
Beads: mobile epic `jits-a4fw` (children `.1` to `.11`); backend `jr_be-405`, `jr_be-cl1`, `jr_be-pdf`, `jr_be-62n`; future gated epics `jr_be-o7c`, `jr_be-tjx`, `jr_be-293`, `jr_be-7t0`. Full map in section 20.

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
4. **Home is the social surface.** A reel carousel at the top of Home. Phase 1 has one lane, **Your Reels** (from `get_my_highlights`), which absorbs the `NewHighlightCard` and its unseen treatment. Elo Reels, Friend Reels, Athletes you might follow, and a Me / Friends / Gym / World filter on the Matches tab are future, gated epics (section 18). A carousel tap opens a vertical, swipeable, shorts-style viewer; swiping between the athlete's own reels is in phase 1.
5. **Low-data and empty states are first-class and designed for a dopamine hit, not a dead end** (owner requirement, 2026-10-06). See section 10.

### 2.2 PM decisions taken in this spec

| # | Decision | Why |
|---|---|---|
| PM1 | Profile keeps **no** "View all matches" link. | The Matches tab is one tap away on every screen, so a link row on Profile is a second path to the same place that has to be kept in sync and pulls Profile back toward being a history page. The Profile stat tiles stay non-interactive in phase 1. If analytics later show athletes looking for history on Profile, a link row is a one-line addition. |
| PM2 | Matches tab route directory is `app/(app)/(tabs)/matches/` (`_layout.tsx` + `index.tsx`); href constant `MATCHES_TAB_HREF = "/(app)/(tabs)/matches"` replaces `FILM_ROOM_HREF` in `lib/film-room/href.ts`. | A Tabs.Screen must land with its route directory or expo-router drops it (comment in `(tabs)/_layout.tsx`). |
| PM3 | `app/(app)/film-room.tsx` becomes a one-line `<Redirect href={MATCHES_TAB_HREF} />` for two OTA releases, then is deleted (tracked in the retirement task). | No push payload or universal link targets the Film Room today (verified in `lib/notifications/handlers.ts` and `+native-intent.tsx`), but navigation state restoration and any build running the previous bundle can still hold the path; a redirect is free insurance. |
| PM4 | Directory and file names under `components/film-room/` and `lib/film-room/` are **not** renamed. The seen-store key `film-room:seen:v1` is **not** renamed. | Renames churn imports, the canvas `board-map.json`, and a key rename would reset every athlete's NEW badges. User-facing copy changes; code names do not. |
| PM5 | Backend: the minimum is the `get_my_highlights` id tiebreak (B1). Three further small, additive changes are recommended (B2 in-flight reels, B3 elected primary flag in the library, B4 two new funnel steps). No combined `get_film_feed` / home-carousel RPC. | A combined RPC would duplicate two well-tested RPCs and their pagination for one saved round trip on Matches (library and highlights load in parallel anyway). B2 is the one change that genuinely saves Home several calls. |
| PM6 | No new native dependency. The feed uses `FlatList` (no FlashList), the celebration uses Reanimated, haptics use the already-linked `expo-haptics`. | Keeps the whole client OTA-eligible on runtime 0.4.0 (section 15). |
| PM7 | Home order: `ResumeMatchCard` (only when a lost match exists) sits above the carousel; otherwise the carousel is the first thing in the Home scroll. | A lost live match is the one urgent, money-on-the-line action and owns Home's single red CTA; it is rare. Everything else yields to the carousel. |
| PM8 | Phase 1 milestones: first match, first win, first highlight. Elo milestones are deferred. | The verdict screen already animates every Elo change, so an Elo milestone on Home would double-celebrate. The three phase 1 milestones are moments nothing celebrates today. |
| PM9 | Matches tab has no tab-bar badge in phase 1. | The Arena badge is the only tab badge and carries live state; a second badge dilutes it. Unseen reels already ring on Home. |
| PM10 | Tab icon: lucide `Film`. | Reads as "my footage", is distinct from Arena's blades and Rankings' trophy, and is already in `lucide-react-native` (no install). Design may swap it at canvas review without changing the spec. |

## 3. Goals and non-goals

Goals:

1. One tap from anywhere to "my matches": a fifth tab with the full history, newest first, including matches without film.
2. A reusable reel carousel, used by the Matches tab and Home, that makes the athlete's own highlights the first thing they see.
3. A shorts-style viewer that swipes between the athlete's own reels.
4. A leaner Profile: identity, stats, settings.
5. Empty, low-data and in-flight states that sell the next action and celebrate firsts.

Non-goals (phase 1):

- Any reel or match that is not the athlete's own. No Elo Reels, Friend Reels, follows, suggestions, or visibility filter (section 18). No change to any RPC's read scope: everything stays participant-scoped.
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
| `app/(app)/film-room.tsx` (the screen) | Redirect to `MATCHES_TAB_HREF` (PM3). Its list logic moves into the Matches tab screen. |
| `app/(app)/_layout.tsx` `<Stack.Screen name="film-room" />` | Kept while the redirect file exists, comment updated. |
| `settings/help.tsx` footage answer "...in the Film Room on your profile..." | "...in the Matches tab, where you can watch them back..." (copy C-H1). |
| Doc comments that say "Film Room" for the history screen | Updated where they describe navigation; component internals may keep the name. |

The owner brief lists `video/[id]` and `verdict-hero` as Film Room link sites. On `origin/development` neither navigates to the Film Room route (they only import Film Room components or `videoHref`); the retirement task re-greps `FILM_ROOM_HREF`, `film-room"` and `/film-room` and must leave zero navigation references except the redirect file (AC 7.2).

## 5. The reusable reel carousel

New components in `apps/mobile/components/reels/`:

- `ReelCarousel`: a horizontal `FlatList` of tiles with a lane title row (MetaTag left, optional "See all" text button right), snap to tile, 16 px side gutter, 8 px gap. Props: `lane` (title string, `testID`), `tiles: ReelTileModel[]`, `loading`, `onTilePress(tile, index)`, `onSeeAll?`, `onEndReached?`, `size: "home" | "matches"`. It renders nothing when `tiles` is empty and not loading (callers always supply ghost tiles when they want a row; see section 10), so "an empty row" is structurally impossible.
- `ReelTile`: one 9:16 tile. Sizes: `home` 104 x 185 pt, `matches` 96 x 171 pt. Kinds (`ReelTileModel.kind`):
  - `ready`: signed poster (`expo-image`, `contentFit="cover"`, centred), duration chip bottom-left in mono (`28s`), opponent line under the tile (`vs D. Okafor`, one line). `unseen: true` adds the unseen ring: a 2 px stroke on the tile edge in the semantic token `unseen-ring` (an alias of `ink`, #E8EDF2 dark), separated from the poster by a 2 px surface gap. The alias is added to `apps/mobile/lib/tokens.ts` and to the design system ("ELO RATED Design System" artifact and its jits_web mirror `design/system/project/`) so the colour guard can assert it (AC 3.5). The ring is never Signal Red (Home's one red CTA rule, carried from `NewHighlightCard`). Design review ruling, 2026-10-06.
  - `building`: the anticipation tile (section 10.5).
  - `ghost`: dashed hairline outline, a placeholder silhouette, and a line of copy (section 10). Never pressable unless it carries a CTA.
  - `cta`: a ghost tile whose whole surface is a button (secondary style, not red) with a label and an icon.
  - `see_all`: last tile on a lane that has more items than shown, label "See all", routes to the Matches tab (Home only).
  - `skeleton`: the shared skeleton shimmer.
- Every tile is at least 44 pt in both dimensions (deck convention 10), has an accessibility label (copy table), and `ready` tiles announce "unwatched" when unseen.
- Poster crop rule for tiles: reels are rendered 9:16 by the pipeline, so `cover` centred is correct. A legacy landscape poster is also `cover` centred (acceptable crop on a thumbnail).

Data hook `useReelLane(athleteId, { surface })` in `apps/mobile/lib/reels/`:

- Reads `get_my_highlights` through the existing deduped `readMyHighlights` store (`lib/highlight/highlight-store.ts`), first page `limit 10`, and later pages with the B1 cursor.
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
3. **Your Reels** carousel (`ReelCarousel size="home"`, lane title C-HM1). It replaces `NewHighlightCard`, which is deleted along with its call site.
4. Welcome / name, Elo tile, practice offer, invite card, `RecentActivitySection`, in today's order.

### 7.2 Your Reels lane, phase 1

- Tiles from `useReelLane(athleteId, { surface: "home" })`: building tiles, then unseen reels with the ring, then seen reels; at most 10, then a `see_all` tile that switches to the Matches tab when more exist.
- The unseen treatment of the old card moves to the tile ring. The first unseen tile pulses once (scale 1.0 to 1.04 and back over the new motion token `moment.reelRingPulse = 600`, registered in the `moment` registry of `lib/motion/tokens.ts`; Reanimated; skipped under Reduce Motion) the first time it appears in a session.
- There is no dismiss control. Watching a reel marks it seen (as today in the viewer), which clears the ring and the bell's unread dot (`notifyHighlightsChanged`). Removing dismiss is deliberate: the carousel is a persistent shelf, not a notification.
- Tap on a tile opens the viewer at that reel with `source=home` (section 8), swipeable across the lane's reels.
- The lane never shows an empty row: section 10 defines its ghost and CTA tiles; when clips are off it is hidden.

### 7.3 Future lanes

Elo Reels, Friend Reels and Athletes you might follow are separate lanes stacked under Your Reels when their gates clear (section 18). `ReelCarousel` takes one lane per instance so a future lane is a second instance with its own hook, not a change to this one.

## 8. Shorts-style swipe viewer

Today `app/(app)/highlight/[id].tsx` renders `ViewerScreen` for one reel. Phase 1 wraps it:

- New `components/highlight-viewer/reel-pager.tsx`: a vertical `FlatList` with `pagingEnabled`, one page per reel, full-screen pages, `initialScrollIndex` at the tapped reel, `getItemLayout` for instant positioning, `windowSize` small (3) so at most the current page and its neighbours are mounted.
- Each page renders today's `ViewerScreen` body for that reel id. Only the visible page's `HighlightPlayer` (`expo-video`) is playing; neighbours show their poster frame and are paused. The page change is decided by `onViewableItemsChanged` with an 80% visibility threshold.
- The reel list comes from the same `useReelLane` data the carousel showed (passed through a small in-memory session store keyed by a `lane` token in the route params, e.g. `/highlight/<id>?source=home&lane=<token>`); `building` and `ghost` tiles are not pages. When the athlete nears the end, the pager loads the next page with the B1 cursor.
- A route opened without a lane token (push, bell, match detail, summary, a cold start) behaves exactly as today: one reel, no swipe. This keeps every existing entry point and its tests unchanged.
- Per page: `viewer_opened` is logged once per reel per pager session with the page's real `source` and `detail.swiped = true` for pages reached by swiping; marking seen, share, improve and the mute rule (deck section 5: full-screen viewer starts with sound unless the viewer muted last time) behave as today.
- **Swipe hint** (design review ruling 2026-10-06): when the pager opens on a lane with 2 or more pages, a small hint C-V1 ("Swipe up for the next one") with an up chevron sits above the bottom safe area. It shows once per install (AsyncStorage flag `reels:swipe-hint:v1`), never when the lane has a single page, and disappears for good after the first successful swipe (or after 4 s, whichever is first, and stays marked shown). Reduce Motion: no bounce on the chevron.
- Page layout: each pager page reuses today's viewer layout unchanged (header, 9:16 frame, meta, actions). A full-bleed shorts-style page (video edge to edge with overlaid controls) is a separate owner decision (open question Q6), not phase 1.
- Close returns to the surface that opened the pager. A swipe never closes the viewer; the close control and the system back gesture do.
- The share sheet, improve sheet and any modal suspend paging while open.

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
- Secondary text button C-Z5 ("Try a practice match") only when `shouldOfferPracticeMatch` is true; it opens the practice route exactly as the Home practice offer does.
- Helper C-Z6 explains recording in one line.

**Home.** The Your Reels lane shows: one `cta` tile (C-HZ1 "Get your first highlight", icon `Swords`, secondary style) that switches to the Arena tab, followed by one `ghost` tile (C-Z2). Never red: Home's red CTA stays with the practice offer or Resume.

### 10.3 Low data (1 to 3 matches)

**Matches tab.**
- The existing cards render normally.
- Under the last card, a **"next match" ghost card** (dashed 16:9 outline, caption C-L1 "Your next match goes here", text button C-L2 "Find a match" to the Arena tab). Shown only while `!hasMore` and `items.length <= 3`, and only with no filter applied.
- The oldest match ever (`!hasMore`, last item) carries a mono `FIRST MATCH` tag in its meta row (C-L3), and the athlete's first win (oldest `win` when `!hasMore`) carries `FIRST WIN` (C-L4). Celebrating what exists is cheap and permanent.
- Carousel with no reels: one `ghost` tile with C-L5 ("Record your next match to get a highlight") and C-L6 helper ("Turn on Record from my phone at face-off"), then two faint ghosts.
- Carousel with 1 to 2 ready reels (owner to confirm, design review proposal 2026-10-06): the lane appends one C-L5 ghost tile after the last reel, so a short shelf still points at the next action. With 3 or more reels no ghost is appended.

**Matches without film** (any history size): a card whose match has **no video rows at all** (`videos.length === 0`) shows a small caption under the monogram pair, C-L7 ("No film for this one"). A card that has video rows but reads the deck's `No film` phase shows the deck badge string (`CARD_BADGE.noFilm`) and no C-L7, so the two never stack. The first C-L7 card in the loaded list (and only that one) adds the helper C-L6 so the tip is taught once, not on every card; that card helper is suppressed entirely while the carousel on the same screen is showing C-L6 (no reels yet), so the tip never appears twice on one screen.

**Home** with matches but no reels: the lane shows a `cta` tile C-L2 ("Find a match") to the Arena tab, then a `ghost` tile C-L5 (CTA first, as in 10.2).

### 10.4 Filter with no results, offline and error, loading

- Filter with no results: carried Film Room panels (C-F1, C-F2). The carousel stays visible above (filters never touch it).
- Offline or error with nothing cached: Matches shows the error panel C-E1 with Try again; Home hides the lane (a failed quiet discovery read never shows an error on Home, as today).
- Error with cached content: content stays; Matches toasts C-E2; Home stays quiet.
- Loading: skeletons as in 6.4; the Home lane shows 3 skeleton tiles while the first read is in flight, never a blank gap that pops.

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
| `first_highlight` | `get_my_highlights` first page returns exactly one item (limit 10, so the athlete has exactly one reel), and it is unseen. | Home lane, else Matches carousel, whichever the athlete opens first | C-C3 |

Celebration, once per milestone:
- A light burst: 12 to 16 Reanimated confetti particles in brand colours from the celebrated card or tile, under 1.2 s, no sound; a success haptic; a one-line banner above the card or lane with the copy, which fades after 4 s or on tap.
- **Loss exception** (design review ruling 2026-10-06): when the celebrated match is a loss (only possible for `first_match`), there is **no haptic**, and the confetti uses ink-only pieces (`ink`, `ink-2`, `ink-3`; no red, no gain green). The banner copy is unchanged.
- **First match that is also the first win:** show only the First win banner (C-C2) and burst, and mark both `first_match` and `first_win` seen in `milestones:v1:<athleteId>` in the same write. The permanent `FIRST MATCH` and `FIRST WIN` meta tags (10.3) both still show on that card.
- Under Reduce Motion: no particles and no pulse; the banner and haptic still show (except the loss exception: no haptic).
- **Fires once** per athlete per device, recorded in a new AsyncStorage store `milestones:v1:<athleteId>` (same module pattern as `lib/film-room/seen-store.ts`), written the moment the celebration starts so a crash mid-animation does not repeat it. The 7 day freshness guard stops a reinstall, a new phone or a returning athlete from celebrating an old first win. A milestone that fires on Home is marked and does not also fire on Matches.
- Never fires during an active Arena match or over a modal; it waits for the next time the surface is focused.

### 10.7 Clips off (and future lanes off)

- `clips_enabled === false`: the Home lane and the Matches carousel are hidden entirely (not shown empty, and no ghost promising a highlight that cannot be made). Home still looks alive through its other blocks; the Matches tab still has its feed or its zero / low-data hero, with the highlight copy swapped for the film copy: C-Z2b "Your first match lands here" replaces C-Z2, C-Z3 is omitted, and the zero-state helper C-Z6 (which promises a highlight) is replaced by C-L6.
- With clips on and every future lane off (phase 1 always), Home shows only Your Reels, which by 10.2 to 10.5 always has at least one real, building, ghost or CTA tile. Home never renders an empty row.

### 10.8 Analytics for empty-state CTAs

See section 13: every CTA in this section and every milestone shown emits one funnel event.

## 11. Copy strings

All strings are final source strings (sentence case; tags render in mono caps by style). No em dashes, no exclamation marks, no emoji. `{opp}` is the opponent short name, `{pct}` a whole percent, `{mm:ss}` the deck countdown. The term in-app is "highlight" (`TERM_APP`).

| Id | Where | String |
|---|---|---|
| C-T1 | Tab label | `Matches` |
| C-M1 | Matches header | `Matches` |
| C-M2 | Matches carousel lane title | `Your highlights` |
| C-HM1 | Home lane title | `Your reels` |
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
| C-Z5 | Zero, secondary | `Try a practice match` |
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

All four are additive, keep participant scope, keep `SECURITY DEFINER` + `auth_athlete_id()`, and ship as migrations applied to prod by hand before the OTA that depends on them (jr_be CLAUDE.md "Prod migrations are applied by hand").

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

### 12.3 Client contract changes (`packages/shared`)

- `getMyHighlights(supabase, { limit, before, beforeId, unseenOnly })`: sends `p_before_id` only when `beforeId` is set, and on a PostgREST "function not found" error for a call that sent it, retries once without it (a backend without B1). Returns `nextBefore`, `nextBeforeId` (null when absent) and `inFlight: InFlightReel[]` (`[]` when the key is absent, i.e. a backend without B2).
- `MatchLibraryVideo` gains `is_primary: boolean` (false when the key is absent).
- `HIGHLIGHT_SHARE_SOURCES` gains `"matches"`; `lib/highlight/discovery.ts` `SOURCES` gains `"matches"` so `parseHighlightSource` accepts it.
- Matches-tab fallback for building tiles without B2: for each of the newest six library items whose `useFilmRoomPhases` phase is `building` or `waiting_for_angle` and whose viewer reel state is not final, a `building` tile (reel state mapped: `waiting_for_angle` to `waiting`, `building` to `rendering` unless the viewer's reel reads `planning`).

## 13. Analytics

The repo has two telemetry channels and no general analytics sink:

1. **Highlight funnel** (`log_highlight_share_event`, server table `video_highlight_share_events`, spec 015 16.3.6), keyed by highlight id, via `logHighlightEvent` (`lib/highlight/highlight-event.ts`), which adds device keys.
2. **Sentry funnel telemetry** (`captureMessage` events with tags, scrubbed by `scrubTelemetryUser`, the pattern in `lib/video/playback-telemetry.ts` and `upload-telemetry.ts`) for anything not keyed by a highlight.

Events:

| Event | Channel | When | Detail / tags |
|---|---|---|---|
| `home_card_tapped` (existing step) | Highlight funnel | Home lane `ready` tile tapped | `source: "home"`, `surface: "carousel"`, `position`, `unseen` |
| `matches_reel_tapped` (B4) | Highlight funnel | Matches carousel `ready` tile tapped | `source: "matches"`, `position`, `unseen` |
| `viewer_opened` (existing) | Highlight funnel | Each pager page shown (once per reel per pager session) | `source`, `swiped: true` when reached by swipe |
| `viewer_swiped` (B4) | Highlight funnel | Each swipe that lands on a new reel | `source`, `direction: "next" | "previous"`, `index` |
| `matches.empty_cta` | Sentry funnel | Any CTA in section 10 tapped | tags `surface: "matches" | "home"`, `state: "zero" | "low_data" | "no_reels"`, `cta: "arena" | "practice"` |
| `matches.milestone_shown` | Sentry funnel | A celebration starts | tag `milestone: "first_match" | "first_win" | "first_highlight"` |
| `matches.tab_opened` | Sentry breadcrumb only | Matches tab focused | tag `entry: "tab" | "redirect" | "see_all"` (a breadcrumb, not an event, to keep volume low) |

`home_card_dismissed` and `profile_row_tapped` lose their emitters (the card and the row are removed); both stay in the DB enum for historical queries.

## 14. Performance and accessibility

- One `expo-video` player alive at a time in the pager; the feed has no inline autoplay in phase 1 (posters only).
- Posters are signed in one batch per library page (existing) and per highlights page (new batch call); never one signing call per tile.
- `MatchFeedCard` and `ReelTile` are memoised with stable props (as `LibraryPoster` is today); the feed `FlatList` uses `getItemLayout` for fixed-height cards where possible and `removeClippedSubviews` on Android.
- Every control is at least 44 pt (deck 10). VoiceOver reads the badge, then `vs {opp}`, outcome word, delta, date for the meta target. The carousel is an `accessibilityRole="list"` with each tile a button. Reduce Motion disables pulses, shimmer sweeps and confetti.
- Dark mode first, light mode supported, real tokens from `apps/mobile/lib/tokens.ts`, NativeWind rem = 14 px on native.

## 15. Rollout

- **Client: OTA.** Everything here is JS/TS under `apps/mobile` and `packages/shared`. Every native module it uses (`expo-video`, `expo-image` including `blurRadius`, `react-native-reanimated`, `react-native-gesture-handler`, `expo-haptics`, `@react-native-async-storage/async-storage`, `lucide-react-native` over the linked `react-native-svg`) is already in build 23 / runtime 0.4.0. No `app.json` / `app.config` change, no native dependency added, no version bump. Ship with the `ship-mobile` skill on the OTA path. If an implementer finds they need a native dependency, stop and escalate: that changes the release to a TestFlight build (jits_web CLAUDE.md "Mobile deploy").
- **Backend first.** Apply B1, then B2, B3, B4 to prod by hand (`supabase migration list --linked`, `supabase db push --linked --dry-run` listing only the intended files, `supabase db push --linked`) before publishing the OTA. The client tolerates their absence (12.3), so a backend slip degrades gracefully rather than breaking.
- **No feature flag.** The tab change is structural and the owner approved it; a flag would mean keeping both the Film Room and the tab alive. The existing `highlight_clips_enabled` flag still gates every reel surface (10.7).
- **Order inside the OTA:** the tab, feed, Profile cleanup and Film Room redirect ship together, so there is never a build where history has no entry point.
- **After release:** `/canvas-sync` (section 19).

## 16. Test plan

jits_web (`npm run typecheck` and `npm run test` across workspaces; the husky pre-commit runs both; the mobile quality gate also needs `npx expo export` to bundle cleanly):

- `lib/matches/card-media.test.ts`: primary wins when playable; viewer's own when no primary; server order otherwise; nothing playable gives no play target but a poster; deterministic across calls; crop rule landscape, square, portrait, unknown.
- `components/matches/match-feed-card.test.tsx`: renders badge from each `CardStatus` kind with the deck string; no duration and no play glyph when nothing is playable; media tap pushes `videoHref`, meta tap pushes `matchDetailHref`; disputed and pending delta strings; fallback art with C-L7; `FIRST MATCH` / `FIRST WIN` tags; draw and zero delta render neutral (`ink-2`), never amber; duration via `formatDuration` (`252` -> `4:12`); the meta chevron is not a separate accessible control; C-L7 only with no video rows.
- `components/reels/reel-carousel.test.tsx` and `reel-tile.test.tsx`: every tile kind renders and labels; unseen ring present only when unseen; renders nothing with no tiles; `see_all` routes to the Matches tab; ring never uses the Signal Red token (extend `color-semantics-guard.test.ts`).
- `lib/reels/use-reel-lane.test.tsx`: ordering (building, unseen, seen); clips off yields no tiles; B2 absent falls back; B1 cursor pagination; `markSeenLocally`; poster re-sign rule.
- `packages/shared` `highlight-share` tests: `beforeId` sent only when set; retry without `p_before_id` on function-not-found; `inFlight` and cursor parsing with keys present and absent; `is_primary` default false in the library parser.
- `screens/matches.test.tsx`: zero, low-data, filter-empty, error, error-with-cache, loading skeleton, load-more failure, pull to refresh refreshes all three sources.
- `screens/home.test.tsx`: lane replaces `NewHighlightCard`; Resume above the lane; zero and no-reels tiles; clips off hides the lane; never an empty row.
- `screens/profile.test.tsx`: no Recent Matches, no highlights row, no Film Room preview, no matches link.
- `components/highlight-viewer/reel-pager.test.tsx`: opens at the tapped index; only the visible page plays; `viewer_opened` once per reel with `swiped`; `viewer_swiped` per landing; swipe hint C-V1 once per install on 2+ page lanes, gone after the first swipe, never on a single page; no lane token means single-reel behaviour (existing `highlight-route.test.tsx` and `viewer-screen.test.tsx` stay green unchanged).
- `lib/milestones/milestone-store.test.ts`: fires once per athlete; freshness guard; a Home fire suppresses the Matches fire; Reduce Motion path; first match that is a loss: no haptic and ink-only confetti; first match that is also first win: only the First win banner, both keys written.
- `app/film-room-redirect.test.tsx`: the old route redirects to the Matches tab; a repo grep test (or lint) finds no remaining navigation to `/film-room` outside the redirect.
- `layout/tab-bar.test.tsx`: five tabs in order with the right labels and icons; labels fit at 375 pt (snapshot of computed widths or `numberOfLines` without truncation in the test renderer).

jr_be (`supabase test db`): new pgTAP files for B1 to B4 as listed in 12.2, plus the existing `063_get_my_match_library_test.sql` and highlight tests staying green, and pgTAP 073 (no direct `current_setting('app.settings.*')`).

Device QA (iOS simulator plus one physical iPhone against a local stack): portrait and landscape footage cards, the pager with 3+ reels, a reel landing while Home is visible (reveal), zero-match account, 2-match account, clips off, airplane mode.

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
3.1 `NewHighlightCard` no longer renders anywhere; the Your reels lane renders at the top of Home's scroll content, below `ResumeMatchCard` when one is shown.
3.2 Unseen reels show the ring, come before seen reels, and the first unseen tile pulses once per session for `moment.reelRingPulse` (600 ms) (not under Reduce Motion).
3.3 Watching a reel clears its ring on return and clears the bell's unread dot.
3.4 With more than 10 reels the lane ends in a See all tile that switches to the Matches tab.
3.5 The unseen ring is a 2 px edge stroke in the `unseen-ring` token (alias of `ink`) with a 2 px gap; the colour guard asserts the ring resolves to `unseen-ring`, and neither the ring nor the CTA tiles ever use Signal Red.

### 17.4 Swipe viewer
4.1 Opening the viewer from a carousel lets the athlete swipe vertically to the next and previous reel of that lane; building and ghost tiles are not pages.
4.2 Only the visible page plays; leaving a page pauses it.
4.3 Opening the viewer from push, bell, match detail or summary shows one reel with no swipe, as before.
4.4 Nearing the end of the loaded reels loads the next page without a duplicate.
4.5 `viewer_opened` is logged once per reel per pager session; `viewer_swiped` once per landing.
4.6 On a lane with 2 or more pages the swipe hint C-V1 shows once per install and is gone after the first swipe; it never shows on a single-page lane.

### 17.5 Profile
5.1 Profile shows no Recent Matches list, no highlights row and no Film Room preview.
5.2 Profile keeps header, Share profile, invite actions, quick stats, View Detailed Stats, account section and the version footer.
5.3 Profile has no "View all matches" link.

### 17.6 Low-data, empty and celebration
6.1 Zero matches: the Matches tab shows the ghost match card (C-Z1), the ghost reel tile (C-Z2), the progress line (C-Z3) and the red primary CTA (C-Z4) that switches to the Arena tab.
6.2 Zero matches with the practice offer eligible: C-Z5 opens the practice match.
6.3 Zero matches: Home's lane shows the C-HZ1 CTA tile (not red) and the C-Z2 ghost tile.
6.4 One to three matches with no more pages and no filter: a "Your next match goes here" ghost card with "Find a match" follows the last card.
6.5 The oldest match carries `FIRST MATCH` and the oldest win carries `FIRST WIN` once the full history is loaded.
6.6 No reels with clips on: both carousels show the C-L5 ghost with the recording helper; Home adds the C-L2 CTA tile.
6.7 A card with no video rows shows C-L7; a card with video rows in the `No film` phase shows the deck badge and no C-L7; only the first C-L7 card shows the recording helper, and not while the carousel shows C-L6.
6.7a With 1 to 2 ready reels the carousel appends one C-L5 ghost (pending owner confirmation).
6.8 A reel in flight shows a building tile with C-B1 or C-B2 by reel state (or C-B3 with a live countdown when waiting) and C-B4; tapping it opens match detail.
6.9 When a building reel becomes ready while the surface is visible, the tile turns into a ready tile with the ring, one pulse and a success haptic.
6.10 First match, first win and first highlight each celebrate exactly once per athlete per device, only within 7 days of the event, never during an active match or over a modal, and without particles under Reduce Motion. A first match that is a loss celebrates with no haptic and ink-only confetti. A first match that is also the first win shows only the First win banner and marks both milestones seen; both meta tags still show.
6.11 With clips off, neither carousel renders and no copy promises a highlight; the Matches zero state uses C-Z2b and C-L6 in place of C-Z2 and C-Z6.
6.12 Home never renders an empty carousel row in any state.
6.13 Offline with nothing cached: the Matches tab shows the C-E1 panel with Try again; Home hides the lane.
6.14 Every CTA in 6.1 to 6.6 emits `matches.empty_cta` with the right tags; every celebration emits `matches.milestone_shown`.

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
8.5 All jr_be pgTAP tests pass; B1 to B4 are applied to prod before the OTA.

### 17.9 Release
9.1 `npm run typecheck`, `npm run test` and `npx expo export` pass; no native dependency is added; the release is an OTA on runtime 0.4.0.
9.2 Changed boards are redrawn by `/canvas-sync` after the OTA (section 19).

## 18. Future gated epics (not scoped for build)

Each is filed as a gated epic so it cannot start without hitting its gate.

1. **Elo Reels lane** (Home). Content program output (jr_be-dd4, spec 016 on branch `spec/016-content-programs`) shown in the app. **Gates:** Terms v2 live (`jr_be-dd4.5`, social-publishing licence for match footage including the opponent, plus takedown), and a spec 016 amendment, because spec 016 G5 says it does "nothing that widens in-app read access" and the Terms v2 licence covers social platforms only. Work: a world-readable read RPC over published program posts, takedown honoured in-app, a lane hook and a second `ReelCarousel`.
2. **Friend Reels lane** (Home). Friends' highlights, using `athlete_friendships` (on jr_be origin/development; invites plan `research/invites-join-and-challenge.md` section 15). **Gate:** consent decision `jr_be-17f`. Open question for that decision: extend the spec 016 approach (ToS licence, no opt-in, takedown path) or add a per-athlete visibility setting. Work: a visibility model, a friends-scoped read RPC with both participants' consent rule, a lane.
3. **Follows and Athletes you might follow.** Needs a follows table (does not exist), RLS, a suggestions RPC, and World visibility. **Gates:** `jr_be-17f` (what a follower may see) and the visibility model from item 2.
4. **Matches visibility filter** (Me / Friends / Gym / World on the Matches tab). Reuses the same visibility model. **Gates:** item 2's visibility model and `jr_be-17f`. Note: "Gym" may need a new athlete-gym affiliation model, since the Arena replaced gyms and sessions (memory "Arena replaces gyms and sessions"; `athletes.primary_gym_id` exists but gym membership is no longer how matches happen).

## 19. Canvas follow-ups ("ELO RATED Native Screens", https://claude.ai/artifact/PJWm2WeqsG56HS13jHsd5D)

After the OTA ships, `/canvas-sync` redraws from code, with an independent review, reading `project/canvas.json` first:

- `Main` and every tab-root board: the five-tab bar.
- `11-Home-Resume`: Your reels lane at the top, Resume above it, no `NewHighlightCard`.
- `17-Profile`: the leaner Profile.
- `31-Film-Room`: becomes the Matches tab board (retitle it; keep its slot), with the feed card and the carousel.
- `34-Highlight-Viewer`: the swipe affordance.
- New "Current app" boards for the states that ship: Matches zero, Matches low data, Home lane no reels, building tile, milestone banner.
- `design/native-screens/board-map.json` regenerated via `build-board-map.py` so the new source files (`components/reels/*`, `components/matches/*`, `app/(app)/(tabs)/matches/*`) map to their boards.

Before build (owner decision 2026-10-06, Q4): the "Proposed (Oct 6 Matches tab)" page with every `P-MT-*` board, plus a clickable prototype, for the owner to react to.

## 20. Issue map

### 20.1 jits_web (epic `jits-a4fw`, "Matches tab + Home reel carousel (phase 1)")

| Bead | Title | Depends on |
|---|---|---|
| `jits-a4fw.1` | Data + hooks foundation (getMyHighlights cursor and in_flight, is_primary, useReelLane, pickCardMedia + crop rule, milestone store) | none |
| `jits-a4fw.2` | Reusable ReelCarousel + ReelTile | .1 |
| `jits-a4fw.3` | 5th tab + matches route + screen shell | none |
| `jits-a4fw.4` | MatchFeedCard + carousel on the tab | .1, .2, .3 |
| `jits-a4fw.5` | Shorts-style swipe viewer (ReelPager) | .1 |
| `jits-a4fw.6` | Home: Your reels lane replacing NewHighlightCard | .2 |
| `jits-a4fw.7` | Profile cleanup | .3 |
| `jits-a4fw.8` | Film Room route retirement | .3, .4, .7 |
| `jits-a4fw.9` | Low-data, empty, in-flight and milestone states | .2, .4, .6 |
| `jits-a4fw.10` | Release gate (quality gate, device QA, OTA eligibility, backend-first) | .4, .5, .6, .7, .8, .9 |
| `jits-a4fw.11` | Canvas sync after the OTA | .10 |

Parallel lanes: `.1` and `.3` start at once (separate worktrees); then `.2`, `.5` and `.7` in parallel; then `.4` and `.6`; then `.8` and `.9`. Every slice gets an independent reviewer before merge (workspace policy section 2).

### 20.2 jr_be

| Bead | Title | Depends on |
|---|---|---|
| `jr_be-405` | B1: get_my_highlights keyset tiebreak (required) | none |
| `jr_be-cl1` | B2: get_my_highlights in_flight array | jr_be-405 (same function, sequenced migrations) |
| `jr_be-pdf` | B3: get_my_match_library is_primary | none |
| `jr_be-62n` | B4: funnel steps matches_reel_tapped, viewer_swiped | none |

### 20.3 Future gated epics (jr_be)

| Epic | Gate task (real blocker edge) | Blocked by |
|---|---|---|
| `jr_be-o7c` Elo Reels lane | `jr_be-o7c.1` | `jr_be-dd4.5` (Terms v2) + spec 016 amendment; related `jr_be-dd4` |
| `jr_be-tjx` Friend Reels lane | `jr_be-tjx.1` | `jr_be-17f` |
| `jr_be-293` Follows + suggested athletes | `jr_be-293.1` | `jr_be-17f`; epic blocked by `jr_be-tjx` |
| `jr_be-7t0` Matches visibility filter | `jr_be-7t0.1` | `jr_be-17f` + Gym affiliation decision; epic blocked by `jr_be-tjx` |

(bd refuses a task blocking an epic directly, so each epic carries a gate child task that holds the blocker edge.)

### 20.4 Notes filed

- `jits-tj5n` and `jits-icei`: note recording the reopened tab decision.
- `jr_be-17f` and `jr_be-dd4.5`: notes listing the epics they gate.
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
- Q3. Matches tab badge for NEW film or unseen reels: recommendation: none in phase 1 (PM9).
- Q4. RESOLVED (owner, 2026-10-06): the full "Proposed (Oct 6 Matches tab)" canvas page (all `P-MT-*` boards, not only the low-data states) plus a clickable prototype are produced and reviewed by the owner before build starts.
- Q5. Keep the Film Room redirect for two OTAs, then delete: confirm. Recommendation: yes.
- Q6. Pager page layout: phase 1 pages reuse today's viewer layout. Should a later phase move to a full-bleed shorts page (edge-to-edge video, overlaid controls)? Recommendation: decide after the swipe funnel (`viewer_swiped`) shows athletes actually swipe; it is a separate owner decision and a separate bead when approved.
- Q7. A lane with 1 to 2 ready reels appends one C-L5 ghost (10.3, AC 6.7a): owner to confirm. Recommendation: yes; it keeps the shelf pointing at the next action and costs nothing.
