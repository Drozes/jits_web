# V-epic: watch match videos and open any older match (mobile + web)

Status: build-ready spec for the 2026-09-25 overnight demo run. Author: PM/UX agent. Epic: `jits-5tj9`.
Source requirement: `tools/match-loop/DEMO-READINESS.md` section 3, P0 item 1.

> User requirement: on mobile AND web, a player can watch match videos and open ANY older match
> (from every match history row) and watch its video.

| Slice | Bead | Depends on | Summary |
|---|---|---|---|
| S1 | `jits-5tj9.6` | none (lands first) | Shared data layer in `packages/shared` |
| S2 | `jits-5tj9.7` | S1 | Mobile match detail screen + player hardening |
| S3 | `jits-5tj9.8` | S1 (route path from S2 by contract, not by code) | Mobile history rows open match detail; Past Match Videos overhaul |
| S4 | `jits-5tj9.9` | S1 | Web `/matches/[id]` route, viewer, row links, jits-8t0m fix |
| S5 | `jits-5tj9.10` | S1, S2, S3 | Harness scenario E17 (local only) + prod read-only storage integrity SQL |

S2, S3 and S4 can run in parallel in separate worktrees once S1 is merged to `development`. S2 and
S3 do not share any file (see the ownership table in section 9); S3 pushes a route that S2 creates,
which is safe because expo-router typed routes are NOT enabled (`app.json` has no `experiments.typedRoutes`),
so a `router.push` to a not-yet-existing path still typechecks.

---

## 1. Decisions and rationale

### D1. No migration. Everything works with RPCs and RLS already on prod.

Verified in `jr_be/supabase/migrations` (latest definitions):

- `get_match_details(p_match_id)` (`20260501020000_match_details_missing_fields.sql`), SECURITY DEFINER,
  granted to `authenticated`. Caller must be a participant (or the timekeeper). **No match-status filter**
  (so disputed, voided, cancelled all come back). Returns
  `{ match: {id, challenge_id, session_id, match_type, duration_seconds, status, result, started_at, completed_at, paused_at, total_paused_duration, timekeeper_id}, participants: [{athlete_id, display_name, current_elo, current_weight, profile_photo_url, default_still_url, role, outcome, elo_before, elo_after, elo_delta, weight_division_gap}], videos: [{id, uploaded_by, uploaded_by_name, status, duration_seconds, thumbnail_url, camera_angle, angle_quality, has_analysis, analysis_tier}] }`.
  Videos exclude only `status='deleted'`, so `failed` videos ARE returned. Raises P0001 with hint
  `match_not_found` or `not_participant`. This is the one RPC the detail screen needs. The shared
  wrapper `getMatchDetails` currently DROPS `videos`; we add a new wrapper rather than changing it
  (the wizard and reconciler depend on the old one's `null`-on-error contract).
- `match_videos` RLS `match_videos_select_participant`: any participant of the match can SELECT every
  video row of that match (both uploaders). So the client can read `storage_path`, `normalized_path`,
  `thumbnail_url`, `status` for a video by id (this is exactly what the existing private helper
  `loadMatchVideoSignedUrl` in `packages/shared/src/api/queries.ts` ~L2274 already does).
- Storage policy on bucket `match-videos` (private, `20260610000000_match_videos_bucket.sql`): SELECT
  (hence `createSignedUrl`) is allowed when `foldername[1]` is a match the caller participates in.
  **No check on the uploader segment**, so the opponent can sign the uploader's MP4 and its poster key.
- `get_match_history(p_athlete_id)`: self only, `status='completed'` only, no limit, includes `match_id`,
  `opponent_id`, `opponent_display_name`, `athlete_outcome`, `match_type`, `elo_delta`, `completed_at`.
  Every history row therefore already carries the match id we need to link.
- `get_athlete_videos` is NOT used by the new code: it hides failed videos, hides disputed matches, has no
  offset, and is scout-gated for others. It stays in place for anything else that uses it.
- `get_match_videos` is not used either: it does not return `normalized_path` and returns nothing
  `get_match_details` does not.

The "all my videos including disputed and failed" list is composed on the client in the shared layer
(D4). An additive RPC would be cleaner but needs a human-approved prod migration; it is spec'd as an
optional follow-up in section 8 with this client composition as the permanent fallback.

### D2. One pushed "match detail" screen per platform; the player stays a separate screen on mobile.

- Mobile: new route `apps/mobile/app/(app)/match-detail/[matchId].tsx`, pushed on the `(app)` Stack.
  It is NOT the live wizard (`match/[matchId]`), and must NOT call `useArenaMatchScreen` (that marks the
  athlete offline and suppresses challenge prompts). "Watch" pushes the existing player
  `apps/mobile/app/(app)/video/[id].tsx` (id = `match_videos.id`), which S2 hardens.
- Web: new route `apps/web/app/(app)/matches/[id]` (plural, deliberately distinct from the hidden legacy
  `/match/[id]/...` tree). Video plays inline inside its card (a web `<video controls>` gives fullscreen
  natively, no separate player route needed).
- Hidden routes stay hidden: do not link or modify `/match/[id]/live`, `/match/[id]/results`,
  `/match/pending`, `/match/lobby/[id]`.

### D3. Keep expo-av for the mobile player tonight.

`expo-video ~3.0.16` is compiled into every build since runtime 0.2.0 (commit `eae11cb`), so a swap would
be OTA-legal, but the expo-av player is the one path verified on prod hardware. Rewriting the player
the night before a demo buys nothing the requirement needs. expo-av `Video` supports `posterSource`,
`usePoster`, `onPlaybackStatusUpdate`, `setPositionAsync`, which cover every hardening item. The
expo-video swap stays with `jits-kaf.2.2` / `jits-kaf.2.6`.

### D4. Past Match Videos becomes a per-MATCH list that opens the match detail screen.

Grouping by match (one row per match, "2 videos" in the subtitle) resolves `jits-7b7v` on the list
side: two identical rows can no longer happen, and the detail screen labels each angle. Tapping a row
opens match detail (not the player directly), which is the one place that explains states.

### D5. Playability is derived from `match_videos.status`, and `failed` still attempts playback.

`failed` means the analysis/slicing pipeline failed; the original MP4 is usually still in storage (on
prod the pipeline GUCs are unset, so nothing post-upload runs anyway). So `failed` shows a note but keeps
the Watch action; only a real storage miss (signing returns "Object not found") becomes the
"file missing" state. See the table in section 3.

### D6. Thumbnails are storage keys, not URLs (jits-fjzy).

`match_videos.thumbnail_url` holds a storage KEY in the private bucket. It must be signed like
`storage_path`. The shared layer signs it best-effort (a signing failure yields `posterUrl: null` and
never fails the call). If the value already starts with `http` (legacy row), pass it through unchanged.
On prod today every row has `thumbnail_url = NULL`, so the placeholder is the common case.

### D7. Server-first on web, re-sign on the client only on error.

Initial data and initial signed URLs are fetched in the async server component (CLAUDE.md: never fetch
Supabase data client-side for initial loads). The client card re-signs only after a `<video>` error
(expired URL), using the browser client and the same shared wrapper.

### D8. Out of scope tonight (polish-level rule)

No new tabs, no expo-video swap, no upload-side changes (`jits-sb83` / `jits-qeuf` duration + thumbnail
on upload, `jits-05xx.16` persistence), no analysis UI, no dispute-surface playback entry beyond the
detail screen, no change to `get_match_history` (disputed matches without a video remain absent from
history rows; see risks). No "All" scope linking on Home (global feed rows can be matches the viewer
is not in).

---

## 2. S1: shared data layer (`jits-5tj9.6`, must land first, small)

All additions are additive. Do NOT change the signature or behavior of `getMatchDetails`,
`getMatchVideoSignedUrl`, `getMatchVideoSignedUrlResult`, `getAthleteVideos`.

### 2.1 `packages/shared/src/api/errors.ts`

- Add to `DomainErrorCode`: `"MATCH_NOT_FOUND"` and `"VIDEO_FILE_MISSING"`.
- Add to `HINT_TO_CODE`: `match_not_found: { code: "MATCH_NOT_FOUND", message: "Match not found." }`.
  (Existing `not_participant` already maps to `NOT_PARTICIPANT`. Leave the existing `not_found` entry alone.)
- Extend `errors.test.ts` for the new hint.

### 2.2 `packages/shared/src/utils/match-video.ts` (new, pure, exported from `packages/shared/src/utils/index.ts`)

```ts
export type VideoPlayability = "playable" | "processing" | "failed";

/** Map match_videos.status to what the UI may do with it. */
export function videoPlayability(status: string): VideoPlayability;
//   "ready" | "processing" | "slicing" | "analyzing" | "analyzed"  -> "playable"
//   "uploading" | "merging"                                         -> "processing"
//   "failed"                                                        -> "failed" (UI still offers Watch)
//   anything else (unknown future status)                           -> "playable" (attempt; the player handles a miss)

/** "Your recording" when uploaded_by === viewerId, else "<name>'s recording" ("Opponent's recording" when name is null). */
export function videoAngleLabel(uploadedBy: string, viewerId: string, uploaderName: string | null): string;

/** Viewer's own videos first, then others; stable by input order within each group. */
export function sortMatchVideosForViewer<T extends { uploaded_by: string }>(videos: T[], viewerId: string): T[];

/** m:ss for a duration in seconds, or null when null/<=0. (If an equivalent already exists in utils, reuse it instead and do not add this.) */
export function formatVideoDuration(seconds: number | null | undefined): string | null;
```

Tests: `packages/shared/src/utils/match-video.test.ts`, every status value above, label with and
without a name, sort stability, duration edge cases (0, null, 59, 60, 3599).

### 2.3 `packages/shared/src/api/queries.ts`: new section "Match detail view (history + playback)"

Place it after the existing "Match videos" section. Hand-type the JSON payloads (the RPCs are typed
`Returns: Json` in `database.ts`); cast through `unknown` exactly as `getMatchDetails` does.

```ts
export interface MatchDetailVideo {
  id: string;                      // match_videos.id
  uploaded_by: string;             // athlete id
  uploaded_by_name: string | null;
  status: string;                  // raw match_videos.status
  playability: VideoPlayability;   // videoPlayability(status)
  duration_seconds: number | null;
  camera_angle: string | null;
  has_analysis: boolean;
  is_mine: boolean;                // uploaded_by === viewerAthleteId
  angle_label: string;             // videoAngleLabel(...), opponent name from participants
  poster_url: string | null;       // signed thumbnail key (1h), http passthrough, or null
}

export interface MatchDetailView {
  match: Omit<MatchDetails, "participants">;   // reuse the existing type
  me: MatchParticipant;                        // viewer's participant row
  opponent: MatchParticipant | null;           // the other participant (null only on corrupt data)
  videos: MatchDetailVideo[];                  // sortMatchVideosForViewer, deleted never present
}

/**
 * Match detail for a history row, via `get_match_details` (SECURITY DEFINER, participant-gated,
 * no status filter, so disputed matches are included). Result-shaped so the UI can tell
 * "not yours" from "gone" from "network".
 */
export async function getMatchDetailView(
  supabase: Client,
  matchId: string,
  viewerAthleteId: string,
): Promise<Result<MatchDetailView>>;
```

Behavior (each is a unit test):
1. `matchId` not UUID-shaped (`/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i`):
   return `{ ok: false, error: { code: "MATCH_NOT_FOUND", ... } }` WITHOUT calling the RPC.
2. RPC error: `mapPostgrestError(error, "match_detail")` (so hint `not_participant` -> `NOT_PARTICIPANT`,
   `match_not_found` -> `MATCH_NOT_FOUND`, anything else -> its mapped code / `UNKNOWN`).
3. `data` null: `MATCH_NOT_FOUND`.
4. Viewer not in `participants` (timekeeper or corrupt): `NOT_PARTICIPANT`.
5. `videos` absent or null in payload: treat as `[]`.
6. Poster signing: for each video with a non-null `thumbnail_url` key, `createSignedUrl(key, 3600)` on
   `match-videos` in parallel (`Promise.all`); failure or missing URL -> `poster_url: null`, never an
   error. Key starting with `http` -> passthrough.
7. `angle_label` uses `uploaded_by_name` falling back to the opponent participant's `display_name`.

```ts
export interface MatchVideoPlayback {
  url: string;                  // signed URL of normalized_path ?? storage_path
  posterUrl: string | null;     // signed thumbnail key, best effort
  status: string;               // match_videos.status at read time
  playability: VideoPlayability;
}

/**
 * Everything the player needs for one video id.
 *   { ok: true, data: MatchVideoPlayback }  sign it and play
 *   { ok: true, data: null }                no row visible (deleted, or not a participant) or no path yet
 *   { ok: false, error: VIDEO_FILE_MISSING } row exists, storage says the object does not
 *   { ok: false, error: <other> }           read or sign failed, retryable
 */
export async function getMatchVideoPlaybackResult(
  supabase: Client,
  videoId: string,
  expiresInSeconds = 3600,
): Promise<Result<MatchVideoPlayback | null>>;
```

Implementation: `.from("match_videos").select("storage_path, normalized_path, thumbnail_url, status").eq("id", videoId).maybeSingle()`;
`playbackPath = normalized_path ?? storage_path` (the jits-8t0m rule; keep the single-source comment);
sign it; a sign error whose `message` matches `/not.?found/i` (supabase storage answers
"Object not found") -> `VIDEO_FILE_MISSING` with message "The video file was not found."; any other
sign error -> `UNKNOWN`; poster signed best-effort as in 2.3.6. It may share code with the private
`loadMatchVideoSignedUrl`, but the two existing exported functions must keep their exact behavior and
existing tests must pass unchanged.

```ts
export interface MatchVideoListItem {
  match_id: string;
  match_status: string;              // "completed" for history matches, else from get_match_details ("disputed", ...)
  match_type: string | null;         // "ranked" | "casual"
  match_date: string | null;         // completed_at, else newest video created_at
  opponent_id: string | null;
  opponent_name: string | null;
  outcome: "win" | "loss" | "draw" | null;
  video_count: number;
  playable_count: number;            // videos whose playability !== "processing"
  latest_video_at: string;           // max created_at of the group
}

/**
 * Every non-deleted video in the caller's matches (both uploaders, failed included, disputed
 * matches included), grouped one item per match, newest first. Composed client-side because
 * get_athlete_videos hides failed videos and disputed matches and caps at 10 with no offset.
 */
export async function getMyMatchVideos(
  supabase: Client,
  athleteId: string,
  opts?: { limit?: number },       // max video ROWS read, default 100
): Promise<Result<MatchVideoListItem[]>>;
```

Implementation:
1. `supabase.from("match_videos").select("id, match_id, uploaded_by, status, created_at").neq("status", "deleted").order("created_at", { ascending: false }).limit(limit)`.
   RLS scopes this to the caller's matches. Do NOT embed `matches(...)` or `athletes(...)` joins
   (avoids FK join shape pitfalls; match_participants is RLS-blocked anyway). Error -> `{ ok: false, error: mapPostgrestError(...) }`.
2. Group by `match_id` preserving newest-first order.
3. `getMatchHistory(supabase, athleteId)` once; map by `match_id` -> opponent id/name, `athlete_outcome`,
   `match_type`, `completed_at`, status `"completed"`.
4. For groups NOT in history (disputed, voided, or an in-progress match): `getMatchDetails(supabase, id)`
   in parallel for at most 20 such groups; derive opponent from the participant whose `athlete_id !== athleteId`,
   outcome from the viewer's participant row, status/type/date from `match`. If that call returns null,
   keep the item with `opponent_name: null`, `match_status: "unknown"` (never drop a video).
   Groups beyond the 20-call cap are also kept with nulls.
5. A `getMatchHistory` failure returns `[]` internally (existing behavior); items then come from step 4
   within the cap. The only `ok: false` is step 1.

Tests: new `packages/shared/src/api/match-detail-view.test.ts` (vitest, same mocking style as
`athlete-videos.test.ts` / `match-video.test.ts`): all numbered behaviors above; `getMatchVideoPlaybackResult`
prefers `normalized_path`, maps "Object not found" to `VIDEO_FILE_MISSING`, returns `ok:true,null` on no row,
signs poster best-effort; `getMyMatchVideos` groups two uploaders into one item with `video_count: 2`,
includes a `failed` video, includes a disputed match via the `getMatchDetails` fallback, respects the
20-call cap, and returns `ok:false` on the list read error.

### 2.4 S1 acceptance criteria
- New exports reachable via `@jits/shared/api/queries`, `@jits/shared/api` and `@jits/shared/utils`.
- Existing shared tests untouched and green; new tests cover every numbered behavior.
- `npm run typecheck` and `npm run test` green. CHANGELOG entry under `### Shared`.
- No `.rpc()` or `.from()` added outside `packages/shared`.

---

## 3. UX spec (both platforms)

Brand rules (CLAUDE.md Design System) are binding: Signal Red only for the ONE primary CTA per surface and
for losses/negative; Gain Green only for rating increases; amber (`text-amber-500` / mobile amber token)
for draws and the disputed badge; JetBrains Mono `tabular-nums` for every number (ELO, delta, duration,
date digits in metadata); no drop shadows; 4px radius (8px max for modals); motion only reactive 100ms (no
new animations; skeletons may use the existing pulse class already used on the platform).

### 3.1 Match detail layout (top to bottom)

1. **Header bar**: title "Match", back. (Mobile `AppHeader title="Match" back`; web `AppHeader title="Match" back`.)
2. **Result plate** (Plate / Card, surface background shift, no shadow):
   - Verdict word in `font-display` all caps: `WIN` (default foreground), `LOSS` (Signal Red / negative token),
     `DRAW` (amber). Null outcome (not recorded): `NO RESULT` in muted.
   - ELO delta (ranked only) via existing `DeltaNumber`/`EloTile` conventions: positive Gain Green, negative
     red, draw amber (draws always cost ELO). Show `elo_before -> elo_after` in mono muted beneath when both are non-null.
   - Casual: replace the delta with the metadata text "Casual, unrated".
   - **Disputed badge** when `match.status === "disputed"`: amber chip `DISPUTED` plus one line of muted copy
     "This result is disputed and under review." Voided/cancelled: muted chip `VOIDED` / `CANCELLED`.
3. **Opponent row**: avatar (circular, initials fallback via `getInitials`) + display name + current ELO in mono;
   the whole row links to the opponent profile (mobile `/(app)/athlete/<id>`, web `/athlete/<id>`).
   Accessibility label "View <Name>'s profile".
4. **Meta row** (muted, small): date (`formatRelativeDate(completed_at ?? started_at)`), a `RANKED`/`CASUAL`
   MetaTag, duration `m:ss` mono when `duration_seconds > 0`, and "Submission" or "Draw" from `match.result`.
5. **Video section** heading: `MATCH VIDEO` (1 video) / `MATCH VIDEOS` (2).
   One card per video, order: mine first. Card contents:
   - 16:9 poster: `poster_url` image when present, else placeholder (elevated surface + PlayCircle icon in
     `text-muted-foreground`/ink-3, no color).
   - Label: `angle_label` ("Your recording" / "Demo Red's recording"), duration mono if known.
   - Status line + action by `playability`:

| playability / case | Status line (muted unless noted) | Action |
|---|---|---|
| playable | (none) | **Watch** button |
| processing | amber chip `UPLOADING` (status `uploading`) or `PROCESSING` (`merging`), copy "Still uploading. Pull down to refresh." (web: "Still uploading. Refresh the page to check again.") | disabled "Processing..." button |
| failed | "Processing failed. The original recording may still play." | **Watch** button |

   - **Only one primary (Signal Red) Watch per surface**: the first card with a Watch action gets the primary
     variant; any second card's Watch uses the secondary/outline variant.
   - Accessibility label of Watch: "Watch <angle_label>" (e.g. "Watch Your recording" is awkward; use
     "Watch your recording" / "Watch Demo Red's recording").
6. **No video**: a single muted plate "No video was recorded for this match." with sub-copy
   "Videos show up here when either athlete records the match." No CTA.

### 3.2 Screen-level states

| State | Title | Body | Action |
|---|---|---|---|
| Loading | (skeleton: plate block, row block, 16:9 block) | a11y label "Loading match" | none |
| Not a participant (`NOT_PARTICIPANT`) | "You can't view this match" | "Only the two athletes in a match can see its details and video." | Back |
| Not found (`MATCH_NOT_FOUND`) | "Match not found" | "It may have been cancelled or removed." | Back |
| Load error (any other code) | "Couldn't load this match" | "Check your connection and try again." | "Try again" (refetch) |

### 3.3 Player states (mobile `video/[id]`, web inline card)

| State | Title | Body | Action |
|---|---|---|---|
| Loading / signing | spinner (mobile, existing) / poster with spinner overlay (web) | | |
| Playing | native controls | | |
| Row absent (`ok:true, null`) | "Video unavailable" | "This recording was removed or you don't have access to it." | Back |
| Processing (row `playability === "processing"`) | "Still uploading" | "This recording hasn't finished uploading. Check back in a minute." | "Try again" |
| File missing (`VIDEO_FILE_MISSING`) | "Video file not found" | "The upload didn't finish, so this recording can't be played." | Back |
| Failed status but playable | (plays; mobile shows nothing extra) | | |
| Playback / network error | "Couldn't play this video" | "The link may have expired or your connection dropped." | "Try again" (re-signs the URL) |

Titles on mobile keep the existing panel style (`font-mono` caps title, `font-body` 12px body, text CTA in
`text-cta`). The not-a-participant case is indistinguishable from "row absent" on the player (RLS hides the
row), which is why the copy covers both; the detail screen is where NOT_PARTICIPANT is precise.

---

## 4. S2: mobile match detail screen + player hardening (`jits-5tj9.7`)

### 4.1 Files

Create:
- `apps/mobile/app/(app)/match-detail/[matchId].tsx`: screen, target under 200 lines, orchestrates the hook
  and the components below. `useLocalSearchParams<{ matchId: string }>()`. testID `match-detail-screen` on
  the root View, with `accessibilityLabel` `Match detail vs <opponent name>` once loaded. `ScrollView` with
  `RefreshControl` (pull-to-refresh -> `refetch`). MUST NOT import `useArenaMatchScreen` or anything from
  `components/match-flow`.
- `apps/mobile/lib/match-detail/use-match-detail.ts`: `useMatchDetail(matchId: string | undefined)` returning
  `{ state: "loading" | "ready" | "error", data: MatchDetailView | null, error: DomainError | null, refreshing: boolean, refetch: () => void }`.
  Pattern: `useEffect` + cancelled flag like `apps/mobile/lib/match-flow/use-match-details.ts`; calls
  `getMatchDetailView(supabase, matchId, athlete.id)` with `athlete` from `useAuth()`. Also refetch on focus
  via `useFocusEffect` from `expo-router` (skip the very first focus, since mount already fetched), so a video
  that finished uploading appears when the user comes back. A refetch keeps the old data on screen
  (`refreshing: true`), never flashes the skeleton.
- `apps/mobile/components/match-detail/match-result-header.tsx`: result plate + disputed badge + meta row (3.1 items 2 and 4).
- `apps/mobile/components/match-detail/opponent-link-row.tsx`: opponent row (3.1 item 3) using `ParticipantRow`
  or `Avatar32` from `components/ui/elo-system`; pushes `/(app)/athlete/<id>`.
- `apps/mobile/components/match-detail/match-video-card.tsx`: one card (3.1 item 5); poster via `expo-image`
  `Image` (already installed, in the build). Props: `{ video: MatchDetailVideo; primary: boolean; onWatch: () => void }`.
  testID `match-video-card-<videoId>`; the Watch Pressable has `accessibilityRole="button"` and the label
  from 3.1. `onWatch` pushes `/(app)/video/<videoId>`.
- `apps/mobile/components/match-detail/match-detail-states.tsx`: skeleton, no-video plate, and the three
  screen-level error panels (3.2), each with a testID: `match-detail-loading`, `match-detail-no-video`,
  `match-detail-not-participant`, `match-detail-not-found`, `match-detail-error`.
- Tests (jest-expo, mock style of `__tests__/screens/video-playback.test.tsx`):
  `apps/mobile/__tests__/screens/match-detail.test.tsx` (every 3.1/3.2 state; two-video fixture renders two
  labelled cards with exactly one primary Watch; disputed badge; casual shows "Casual, unrated"; opponent row
  pushes athlete route; Watch pushes video route; the screen never renders when `useArenaMatchScreen` would
  be called: assert by mocking `@/lib/arena/arena-store` and expecting `useArenaMatchScreen` not called),
  `apps/mobile/__tests__/lib/match-detail/use-match-detail.test.tsx` (cancel on unmount, refetch keeps data).

Modify:
- `apps/mobile/app/(app)/_layout.tsx`: register `<Stack.Screen name="match-detail/[matchId]" />` next to
  `video/[id]` (same options as `athlete/[id]`). Nothing else in this file.
- `apps/mobile/app/(app)/video/[id].tsx`: hardening (keep expo-av, D3):
  1. Use `getMatchVideoPlaybackResult` instead of `getMatchVideoSignedUrlResult`; map results to the 3.3 table
     (phases: `loading | ready | absent | processing | missing | failed`). For `processing`, do not mount the player.
  2. `posterSource={{ uri: posterUrl }}` + `usePoster` when `posterUrl` is non-null.
  3. Track `positionMillis` from `onPlaybackStatusUpdate` in a ref. On `onError`: if this is the first error
     since the last successful sign, silently re-sign once (`getMatchVideoPlaybackResult`), remount the player
     with the new URL (key it by URL) and `setPositionAsync(lastPosition)` once loaded; a second consecutive
     error shows the "Couldn't play this video" panel. "Try again" always re-signs (the existing `attempt`
     counter already re-runs the effect).
  4. Large MP4s: keep progressive streaming (no download); do not add `shouldCorrectPitch` or preload hacks.
     `resizeMode CONTAIN` stays.
  5. Harness hook: wrap the player area in a View with testID `video-player-state` and
     `accessibilityLabel` `Video state: <loading|loaded|error|absent|processing|missing>`, where `loaded` is set
     the first time `onPlaybackStatusUpdate` reports `isLoaded: true`. Keep existing testIDs
     `video-load-failed` and `video-unavailable`; add `video-processing`, `video-file-missing`.
  6. Update `apps/mobile/__tests__/screens/video-playback.test.tsx` to the new wrapper and add cases: processing,
     missing, poster passed, one silent re-sign then panel on the second error, state label transitions.

### 4.2 S2 acceptance criteria
- From a pushed `/(app)/match-detail/<id>` for a completed match with one playable video, the header shows the
  correct verdict, opponent (tappable), ELO delta (ranked) or "Casual, unrated", date, type; the video card shows
  "Your recording" or "<Opponent>'s recording" and Watch opens the player, which plays.
- Two videos: two labelled cards, exactly one primary Watch.
- Disputed match: renders with the amber DISPUTED badge and its videos.
- Failed-status video: shows the note and still offers Watch; the player attempts playback.
- Not a participant, not found, network error: the 3.2 panels, never a crash or blank screen.
- Opening the detail screen does not change live/presence state (no `useArenaMatchScreen`).
- Player: expired URL recovers with one silent re-sign; persistent failure shows the retry panel; the
  `video-player-state` label reaches `Video state: loaded` on a good file.
- Brand: no shadows, 4px radius, mono numbers, one red CTA. Screen file under 200 lines.
- Gate: `npm run typecheck`, `npm run test`, `expo export --platform ios --no-bytecode` green.

---

## 5. S3: mobile history rows + Past Match Videos (`jits-5tj9.8`)

Contract with S2: the detail route is `/(app)/match-detail/<matchId>`. S3 defines the helper
`apps/mobile/lib/match-detail/href.ts`: `export function matchDetailHref(matchId: string): string` returning
that path (S2 does not need it; S2 owns the rest of `lib/match-detail/`).

### 5.1 Files and changes

- `apps/mobile/lib/match-detail/href.ts` (new, above) + a one-line test in
  `apps/mobile/__tests__/lib/match-detail/href.test.ts`.
- `apps/mobile/app/(app)/(tabs)/(home)/index.tsx`: replace `onPressMatch={() => toast.info("Match details coming soon")}`
  with `onPressMatch={(id) => router.push(matchDetailHref(id))}`. Also map `matchType: m.match_type` into the
  "Me" rows if `RecentActivitySection`'s MatchCard accepts it (it does via `MatchCard.matchType`). "All" scope rows
  stay non-pressable (D8). Add `useFocusEffect` refetch of the dashboard resource (skip first focus).
- `apps/mobile/components/match-card.tsx`: add optional `accessibilityLabel?: string` passed to the Pressable;
  when `onPress` is set, default label `Open match vs <opponentName>` and render a trailing `ChevronRight`
  (16px, secondary token). No other visual change.
- `apps/mobile/components/dashboard/recent-activity-section.tsx`: only if needed to pass the label; it already
  forwards `m.id`.
- `apps/mobile/app/(app)/(tabs)/profile/index.tsx`: Recent Matches `ParticipantRow`s get
  `onPress={() => router.push(matchDetailHref(m.match_id))}`, `accessibilityLabel="Open match vs <name>"`, and a
  `ChevronRight` `action` only where no other action is rendered (keep the `DeltaNumber`; if `action` is already
  used for the delta, put the chevron after it in a row). Profile's pull-to-refresh must also refetch the videos
  hook. Add a `useFocusEffect` that refetches profile data and videos (skip first focus).
- `apps/mobile/app/(app)/(tabs)/profile/stats.tsx`: FlatList `MatchCard` gets `onPress={() => router.push(matchDetailHref(m.match_id))}`.
- `apps/mobile/app/(app)/athlete/[id].tsx`: head-to-head `ParticipantRow`s get the same `onPress` + label.
  (Note: this screen fetches the VIEWER's own history, so these are the viewer's matches; linking is correct.)
- `apps/mobile/lib/profile/use-my-match-videos.ts` (new, replaces `use-athlete-videos.ts` for this surface):
  `useCachedResource<MatchVideoListItem[]>("my-match-videos:<athleteId>", fetcher)` where the fetcher calls
  `getMyMatchVideos(supabase, athleteId, { limit: 100 })` and THROWS on `ok:false` so the hook's `error` is set.
  Returns `{ items, isLoading, error, refetch }`. Leave `use-athlete-videos.ts` in place if anything else imports
  it; delete it only if nothing does.
- `apps/mobile/components/profile/past-match-videos.tsx`: rewrite:
  - One `ParticipantRow` per match item: name `vs <opponent_name ?? "Opponent">`; subtitle joined with " · ":
    `formatRelativeDate(match_date)`, `2 videos` when `video_count > 1`, `Disputed` when `match_status === "disputed"`,
    `Processing` when `playable_count === 0`. Action icon `Play`. `onPress` -> `matchDetailHref(match_id)`.
    `accessibilityLabel` `Open match video vs <name>`; testID `past-video-row-<matchId>`.
  - Show the first 5; a text button "Show all (N)" / "Show fewer" toggles in place (no pagination UI; 100-row
    read covers the demo).
  - Empty and not loading: render nothing (keep the first-run rule). Cold loading: render nothing.
    Error with no data: render the section with one muted row "Couldn't load your videos. Tap to retry." that calls `refetch`.
- `apps/mobile/components/match-flow/steps/summary-step.tsx` (jits-p75q, reopen case): when `videoId` is null
  AND `videoPending` is false, render a secondary text link "View match details" that pushes
  `matchDetailHref(matchId)` so a reopened completed/disputed match (empty in-memory upload store) can still
  reach its videos. This needs `matchId` as a prop: add `matchId: string` to `SummaryStepProps` and pass it from
  `apps/mobile/components/match-flow/match-step-renderer.tsx` (one line). Not a primary CTA (the exit CTA stays
  the only red button). COLLISION NOTE: P0 item 3 (mobile match-flow nits) edits `ready-step`, `step-router`,
  reconcile and tests, not these two files; if the orchestrator sees a conflict in `match-step-renderer.tsx`,
  it is a one-line prop add.
- Tests:
  - `apps/mobile/__tests__/components/profile/past-match-videos.test.tsx` (new): grouped two-video item shows
    "2 videos"; disputed item shows "Disputed"; processing; show-all toggle; error row retries; empty renders null;
    press pushes `/(app)/match-detail/<id>`.
  - Update `apps/mobile/__tests__/screens/dashboard.test.tsx`: pressing a Me-scope match pushes the detail
    route; the "coming soon" toast is gone.
  - Update `apps/mobile/__tests__/screens/profile.test.tsx`: recent match row press pushes the route.
  - Update `apps/mobile/__tests__/components/match-flow/upload-status-visibility.test.tsx` (and any summary tests)
    for the new `matchId` prop and the "View match details" link when no video id.
  - Add row-press tests for stats and athlete screens if a test file exists; otherwise one focused test each is enough.

### 5.2 S3 acceptance criteria
- Every match history row on Home (Me), Profile Recent Matches, Stats full history and athlete head-to-head
  pushes `/(app)/match-detail/<matchId>`; no "coming soon" toast remains (`grep -r "coming soon" apps/mobile` finds no match-detail toast).
- Past Match Videos lists one row per match, includes disputed matches and failed-status videos, is not capped at 10,
  refreshes when the Profile tab regains focus and on pull-to-refresh, shows an error row instead of hiding on failure.
- The summary step of a reopened completed match offers "View match details" when it has no video id.
- Rows have accessibility labels starting "Open match vs " (harness depends on this; see S5).
- Gate: typecheck, test, `expo export` green.

---

## 6. S4: web match detail route + viewer + row links (`jits-5tj9.9`)

### 6.1 Files

Create (all under `apps/web/app/(app)/matches/[id]/`):
- `page.tsx`: synchronous default export
  `export default function MatchDetailPage({ params }: { params: Promise<{ id: string }> })` returning
  `<Suspense fallback={<MatchDetailSkeleton />}><MatchDetailContent paramsPromise={params} /></Suspense>`.
  No `export const dynamic`. Skeleton is a local function (pattern: `app/(app)/athlete/[id]/page.tsx`) with
  `<AppHeader title="Match" back />` and `animate-pulse` blocks using `var(--bg-elevated)`.
- `match-detail-content.tsx`: async server component. `const { id } = await paramsPromise;` then
  `const { athlete } = await requireAthlete();`, `const supabase = await createClient();`
  (`@/lib/supabase/server`), `getMatchDetailView(supabase, id, athlete.id)`.
  - `MATCH_NOT_FOUND` -> `notFound()`.
  - `NOT_PARTICIPANT` / other errors -> render the 3.2 panel inline (other errors: "Couldn't load this match",
    with a "Try again" link to the same URL).
  - For each video with `playability !== "processing"`, sign server-side in parallel with
    `getMatchVideoPlaybackResult(supabase, video.id)`; pass `{ video, initialUrl, initialError }` to the card.
  - Renders `<AppHeader title="Match" back />` + body in `flex flex-col animate-page-in`, max width consistent
    with the athlete page. Target under 120 lines; split presentational parts below.
- `match-result-header.tsx`: server component, 3.1 items 2 to 4. Use `components/ui/elo-system` (`OutcomeTag`,
  `DeltaNumber`, `MetaTag`, `Chip`, `Avatar32`) and `next/link` to `/athlete/<opponentId>`.
- `match-video-card.tsx`: `"use client"`. Props `{ video: MatchDetailVideo; initialUrl: string | null; initialError: DomainErrorCode | null; primary: boolean }`.
  Before Watch: poster (`<img>` of `poster_url` or placeholder) + label + status + Watch button (shadcn `Button`,
  default variant when `primary`, `outline` otherwise). After Watch: `<video src controls playsInline preload="metadata" poster={poster_url ?? undefined} className="h-full w-full" />`
  in an `aspect-video bg-black` box, autoplay after the click. `onError`: re-sign once via the browser client
  (`createClient` from `@/lib/supabase/client`) + `getMatchVideoPlaybackResult`, restore `currentTime`, and
  resume; second error shows the 3.3 "Couldn't play this video" panel with "Try again" (re-signs). Initial
  `VIDEO_FILE_MISSING` / absent / processing render the 3.3 panels without a Watch button.
- `match-detail-states.tsx`: not-participant / error panels and the no-video plate.
- Tests (vitest, colocated): `match-video-card.test.tsx` (poster vs placeholder; primary vs outline; Watch mounts
  `<video>` with the initial URL; error triggers one re-sign then the panel; processing and missing panels) and
  `match-result-header.test.tsx` (win/loss/draw colors via class names, disputed chip, casual copy, opponent link href).

Modify:
- `apps/web/app/(app)/profile/profile-history-list.tsx`: wrap each `Row` in
  `<Link href={`/matches/${row.matchId}`} prefetch={false} aria-label={`Open match vs ${row.opponentName}`}>`
  with the existing grid inside and a hover background shift (`hover:bg-[var(--bg-elevated)]` or the existing
  interactive surface token), no shadow. This one change links BOTH Profile Recent Matches and the athlete page
  Head-to-Head (both render `ProfileHistoryList`).
- `apps/web/app/(app)/profile/stats/match-history-list.tsx`: pass `href={`/matches/${m.match_id}`}` to `MatchCard`.
- `apps/web/components/domain/recent-activity-section.tsx`: Me scope `MatchCard` gets `href={`/matches/${m.id}`}`.
  "All" scope `ActivityFeedItem` unchanged (D8).
- `apps/web/components/domain/video-analysis-viewer.tsx` (jits-8t0m): replace the inline
  `.from("match_videos").select("storage_path")` + `createSignedUrl` with `getMatchVideoSignedUrlResult(supabase, videoId)`
  from `@jits/shared/api/queries` (keeps `normalized_path ?? storage_path` in one place). Preserve its current
  behavior otherwise; add or update its test to assert the wrapper is called.
- `apps/web/e2e/smoke.spec.ts`: add "unauthenticated user is redirected from /matches/<uuid> to login", same style
  as the existing `/profile` case. (`proxy.ts` needs NO change: `/matches` is not in `publicPaths`.)
- Do NOT touch `nav-config.ts` (the page shows the normal nav; no tab highlights, which is fine), and do NOT
  modify anything under `app/(app)/match/`.

### 6.2 S4 acceptance criteria
- `/matches/<id>` for a participant renders header + per-video cards; Watch plays inline; expired URL recovers
  via one silent re-sign; non-participant sees "You can't view this match"; unknown id gives the 404 page;
  unauthenticated redirects to `/login`.
- Home (Me scope), Profile Recent Matches, athlete Head-to-Head, and Stats history rows are links to `/matches/<id>`.
- The web session wizard viewer uses the shared wrapper (grep `normalized_path` usage: none needed in apps/web; grep
  `from("match_videos")` in apps/web returns nothing).
- Cache Components rules: page sync, params awaited inside Suspense, no `dynamic` export. `npm run build:web` green.
- Gate: typecheck, test, `build:web`, `cd apps/web && npm run test:e2e` green.

---

## 7. S5: harness scenario E17 + prod integrity check (`jits-5tj9.10`)

Local only. Never weaken `config.ts` guards; never use a service-role key.

### 7.1 Fixture
- `tools/match-loop/fixtures/video/sample-3s.mp4` (new, committed, target under 100 KB). Generate once with:
  `ffmpeg -f lavfi -i testsrc=size=320x240:rate=15 -f lavfi -i sine=frequency=440 -t 3 -c:v libx264 -pix_fmt yuv420p -profile:v baseline -c:a aac -b:a 32k -movflags +faststart -shortest tools/match-loop/fixtures/video/sample-3s.mp4`
  (ffmpeg is at `/opt/homebrew/bin/ffmpeg`). Record the command in a comment at the top of the seed helper.
  Ensure `.gitignore` does not exclude it (check `*.mp4` rules; add a negation for this path if needed).

### 7.2 Seeding (no service role)
- `tools/match-loop/lib/video-seed.ts` (new): `seedMatchVideo(cfg, password, who: "red" | "blue", matchId, athleteId)`:
  creates a publishable-key supabase client (same construction as `bot/opponent.ts`, passing through
  `assertBotKey`), signs in as `demo-<who>@elorated.dev`, uploads the fixture with
  `storage.from("match-videos").upload(buildMatchVideoStoragePath(...) or the documented `<matchId>/<athleteId>/<unix_ts>.mp4`, bytes, { contentType: "video/mp4" })`,
  then `upsertMatchVideo(client, { matchId, uploaderAthleteId: athleteId, storagePath, durationSeconds: 3 })`.
  Storage INSERT policy allows it (own folder + participant); `match_videos` INSERT RLS allows it. Signing in Blue
  in a Node client does not affect the simulator's session. Also export `removeSeededVideo(...)` that removes the
  objects it uploaded (as the same uploader, DELETE policy allows own folder) for cleanup at scenario end.

### 7.3 Scenario `tools/match-loop/scenarios/extended/e17-match-video-history.ts` (register in `scenarios/index.ts`)
Steps:
1. `prepare(ctx)`; Red goes live; drive a decisive match with the existing flows exactly like C1
   (`blueChallengesRed`, `readyToLive`, `blueEnds`, `blueRecordsSubmission`, `bothConfirm`, `checkDecisiveDb`, `exitToArena`).
2. Seed Blue's and Red's videos for that `matchId` (7.2). Oracle `db:video-rows` = 2 rows, status `ready`
   (via `queryJson` psql read), and `db:video-objects` = 2 `storage.objects` rows with those names.
3. Entry points (each: navigate, tap the row whose label matches `/^Open match (video )?vs Demo Red/i`, assert
   `match-detail-screen` with label containing "Demo Red", go back):
   - Home: `ui.tab("Home")`, tap the "Me" scope toggle (default scope is "all"), tap the first row. Oracle `ui:detail-from-home`.
   - Profile Recent Matches. Oracle `ui:detail-from-profile`.
   - Profile > "View all"/Stats history. Oracle `ui:detail-from-stats`.
   - Athlete page for Demo Red (via Rankings or the detail screen's opponent row), head-to-head row. Oracle `ui:detail-from-athlete`.
   - Profile > Past Match Videos row `past-video-row-<matchId>` (pull-to-refresh first). Oracle `ui:detail-from-past-videos`.
4. On the detail screen: oracle `ui:video-cards-labelled`: elements labelled "Watch your recording" and
   "Watch Demo Red's recording" both exist.
5. Tap "Watch Demo Red's recording"; wait up to 20 s for `video-player-state` label `Video state: loaded`
   (oracle `ui:player-loaded`), and assert `video-load-failed`, `video-file-missing`, `video-unavailable` are absent
   (oracle `ui:no-error-panel`).
6. Back out to Arena; cleanup seeded objects (rows may remain; local only).
Put any new page-object helpers in a NEW file `tools/match-loop/sim/match-detail.ts` (not `sim/screens.ts`) to avoid
colliding with the P0 item 4 harness-protocol work. If a gorhom sheet or text testID limitation blocks a step, record
it with `ctx.skip` and a reason rather than weakening an oracle.

### 7.4 Tests and gate
- Unit test the pure parts of `video-seed.ts` (path building, key guard is applied) in
  `tools/match-loop/tests/video-seed.test.ts` and add it to the `match-loop:test` script in `package.json`.
- Gate: `npm run match-loop:typecheck`, `npm run match-loop:test`, plus one real run
  `npm run match-loop -- --only E17` on the local stack after S1 to S3 are merged; attach `result.json` path.

### 7.5 Prod read-only integrity check (run by the orchestrator, TARGET=PROD, not by an implementer)
```sql
BEGIN READ ONLY;
SELECT mv.id, mv.match_id, mv.status, COALESCE(mv.normalized_path, mv.storage_path) AS path
FROM public.match_videos mv
LEFT JOIN storage.objects o
  ON o.bucket_id = 'match-videos' AND o.name = COALESCE(mv.normalized_path, mv.storage_path)
WHERE mv.status <> 'deleted' AND o.id IS NULL;
ROLLBACK;
```
Expected: zero rows. Any row is a video that will show "Video file not found".

---

## 8. Optional additive migration (NOT required tonight)

Recommended for after the demo, only via the section 0 prod-migration procedure:
`public.get_my_match_videos(p_limit int default 50, p_offset int default 0) RETURNS jsonb`, SECURITY DEFINER,
`search_path = public`, granted to `authenticated`, revoked from `anon`; returns one item per match the caller
participates in that has at least one non-deleted video, with the exact `MatchVideoListItem` fields (opponent via
`match_participants` join, any match status). It widens nothing (the caller can already read all of it through
RLS plus `get_match_details`). The client would switch `getMyMatchVideos` to it behind the same signature. Fallback
without it: the S1 client composition, which is the shipping design. A second optional follow-up is a
`get_match_history` variant that includes disputed matches, so a disputed match with no video appears in history rows.

---

## 9. File ownership (no overlaps)

| File / path | Owner |
|---|---|
| `packages/shared/src/api/errors.ts`, `errors.test.ts` | S1 |
| `packages/shared/src/api/queries.ts` (new section only) | S1 |
| `packages/shared/src/api/match-detail-view.test.ts` (new) | S1 |
| `packages/shared/src/utils/match-video.ts`, `.test.ts` (new), `packages/shared/src/utils/index.ts` | S1 |
| `apps/mobile/app/(app)/match-detail/[matchId].tsx` (new) | S2 |
| `apps/mobile/app/(app)/_layout.tsx` | S2 |
| `apps/mobile/app/(app)/video/[id].tsx` | S2 |
| `apps/mobile/lib/match-detail/use-match-detail.ts` (new) | S2 |
| `apps/mobile/components/match-detail/*` (new) | S2 |
| `apps/mobile/__tests__/screens/match-detail.test.tsx`, `__tests__/lib/match-detail/use-match-detail.test.tsx`, `__tests__/screens/video-playback.test.tsx` | S2 |
| `apps/mobile/lib/match-detail/href.ts` (new) + `__tests__/lib/match-detail/href.test.ts` | S3 |
| `apps/mobile/app/(app)/(tabs)/(home)/index.tsx` | S3 |
| `apps/mobile/app/(app)/(tabs)/profile/index.tsx`, `profile/stats.tsx` | S3 |
| `apps/mobile/app/(app)/athlete/[id].tsx` | S3 |
| `apps/mobile/components/match-card.tsx`, `components/dashboard/recent-activity-section.tsx` | S3 |
| `apps/mobile/components/profile/past-match-videos.tsx`, `lib/profile/use-my-match-videos.ts` (new), `lib/profile/use-athlete-videos.ts` | S3 |
| `apps/mobile/components/match-flow/steps/summary-step.tsx`, `components/match-flow/match-step-renderer.tsx` (one prop) | S3 |
| mobile tests: dashboard, profile, past-match-videos, upload-status-visibility, stats/athlete row tests | S3 |
| `apps/web/app/(app)/matches/**` (new) | S4 |
| `apps/web/app/(app)/profile/profile-history-list.tsx`, `profile/stats/match-history-list.tsx` | S4 |
| `apps/web/components/domain/recent-activity-section.tsx`, `components/domain/video-analysis-viewer.tsx` | S4 |
| `apps/web/e2e/smoke.spec.ts` | S4 |
| `tools/match-loop/fixtures/video/sample-3s.mp4`, `lib/video-seed.ts`, `sim/match-detail.ts`, `scenarios/extended/e17-*.ts`, `tests/video-seed.test.ts` (all new) | S5 |
| `tools/match-loop/scenarios/index.ts` (one registry line), root `package.json` `match-loop:test` script, `.gitignore` negation if needed | S5 |
| `CHANGELOG.md` | every slice, append-only under `## [Unreleased]` in its own area heading; the orchestrator resolves merge conflicts |

---

## 10. Assumptions and open questions

Assumptions:
1. `get_match_details`, `match_videos` RLS and the storage SELECT policy on prod match the latest migrations read
   in jr_be (prod is migrated through `20260925120100` per DEMO-READINESS section 2).
2. Supabase storage returns an error whose message matches `/not.?found/i` when signing a missing object.
   (If it signs successfully instead, the player's load error covers it with the generic retry panel.)
3. 100 video rows is enough for the demo (prod has 1 row).
4. `useFocusEffect` from `expo-router` works in these tab stacks (it is the standard React Navigation hook; not yet
   used in this codebase).

Open questions (decided conservatively for tonight, revisit later):
1. Should disputed matches without a video appear in history rows? Not tonight (needs a backend change).
2. Should the timekeeper (web sessions) be able to open `/matches/<id>`? Tonight: `NOT_PARTICIPANT`.
3. expo-video swap timing (`jits-kaf.2.2`): after the demo.

## 11. Risks
- Tabs stay mounted; the focus refetch is new code in three tabs. Keep it throttled (skip first focus) so it does
  not double-fetch on mount.
- `getMyMatchVideos` does up to 20 extra `get_match_details` calls for non-history matches; on prod that set is tiny.
- The 1h signed URL can expire mid-playback on a long match; the one silent re-sign with position restore handles it.
- S3 pushes a route that exists only after S2 merges; merge S2 before S3 or together, and run E17 only after both.
- `summary-step.tsx` / `match-step-renderer.tsx` are near P0 item 3's files; conflict risk is a one-line prop.
- Old clients (pre-OTA JS) will keep the toast and the old Past Match Videos until they cold-start twice.
