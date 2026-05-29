# Changelog

## [Unreleased]

**Web bug batch: build prerender, video pre-flight, video-progress hook (2026-05-29)**

**Fixed**
- `jits-v0n` — production `build:web` failed prerendering `/` (and, once `/` was fixed, `/leaderboard`, `/notifications`, `/settings`, `/settings/notifications`): each page's default export was `async` and awaited `requireAthlete()`/`requireAuth()` in the page body, outside `<Suspense>`, which violates Next 16 `cacheComponents` ("Uncached data accessed outside of <Suspense>"). All five pages are now synchronous; the guard already runs inside their Suspense'd content components, so auth/activation enforcement is unchanged. Verified: `build:web` generates all 51 pages; unauthed `/leaderboard`/`/notifications`/`/settings`/`/settings/notifications` return 307→`/login` (middleware) and unauthed `/` redirects to `/login` in-browser (page-level redirect streams correctly through Suspense — no 500).
- `jits-3ng` — `apps/web/hooks/use-video-recorder.ts`: the 2 GiB `MAX_UPLOAD_BYTES` cap was only checked after recording stopped, so a user could record for minutes then be rejected. Now tracks recorded bytes live in `ondataavailable`, exposes `nearingLimit` (≥90%), and auto-stops recording at the cap with a clear error (parity with mobile's pre-flight check). The post-record check remains as a backstop. `nearingLimit` is an additive, non-breaking field on the hook's return.
- `jits-02w` / `jits-5q6` / `jits-c67` / `jits-5uc` — `packages/shared/src/hooks/use-video-progress.ts`: (02w) the `rpcMissing→ref` mirror moved out of the render body into a `useEffect`; (5q6) removed `fetchSnapshot`/`scheduleRefresh` from the realtime-channel effect deps (version-gated via `versionRef`) so a non-memoized `supabase` no longer rebuilds the channel every render; (c67) `rpcMissing` now resets on `videoId` change and on `refresh()`, so degraded "Realtime-only" mode recovers after the RPC ships; (5uc) a transient fallback miss now signals via `error` ("Progress temporarily unavailable") instead of silently keeping stale data. Exported API unchanged.

**Web parity: EloTile Signal Red accent bar (2026-05-29)**

**Added**
- `apps/web/components/ui/elo-system/elo-tile.tsx`: optional `accentBar` prop matching the mobile EloTile and the canonical `.elo-tile::after` wireframe spec (3px Signal Red bottom bar via `var(--accent-cta)`, with `position: relative` + `overflow: hidden`). Enabled on the web Home "Current ELO Rating" hero (`apps/web/app/(app)/page.tsx`); the design-system showcase (`apps/web/app/design/elo-system/page.tsx`) now demonstrates the `accentBar` variant.

**Web: fix /eua dead-end for incomplete (Google-SSO/seed) accounts (2026-05-29)**

**Fixed**
- `apps/web/components/auth/eua-form.tsx`: pending athletes with an incomplete profile (every Google-SSO and seed account) were stuck in an invisible loop at `/eua`. The form tried to activate via `update athletes set status='active'`, but the backend `guard_athlete_columns` BEFORE-UPDATE trigger silently reverts any client status write (`NEW.status := OLD.status`), so the UPDATE returned success with no error, `router.push("/")` ran, and `requireAthlete()` bounced the still-`pending` athlete straight back to `/eua` ("nothing happens"). Activation is owned by the `handle_athlete_activation` trigger, which flips `pending -> active` only when an `athletes` UPDATE supplies `current_weight` + (`primary_gym_id` OR `free_agent`). The form now collects the missing profile fields (weight, gender, DOB, city, gym/free-agent) when needed and writes them (triggering activation) instead of writing `status`; the dead `status` write is removed. The app-liability waiver ack insert is now idempotent (guarded by a prior select, since its `session_id` is NULL and the unique constraint won't catch repeats).
- `apps/web/app/(auth)/eua/page.tsx`: now a server component that fetches the current athlete (via `getCurrentAthlete`, not `requireAthlete`, to avoid the redirect loop), computes `needsProfile`, and passes the profile values + active gyms/cities to `EuaForm`.

**Mobile cleanup: silence dev warnings, dedupe athlete-photo URL helper (2026-05-29)**

**Changed**
- Moved `apps/mobile/app/(app)/(tabs)/gyms/gym-detail-parts.tsx` to `apps/mobile/components/gyms/gym-detail-parts.tsx` (it is a named-export helper, not a route; living under `app/` made expo-router warn "missing the required default export"). Import in `gyms/[id].tsx` updated to `@/components/gyms/gym-detail-parts`.
- New `apps/mobile/lib/athlete-photo.ts` (`athletePhotoSource`): single source of truth that resolves a bare Supabase storage key to a public URL, passes through absolute URLs, or returns null. `Avatar32` now routes `photoUrl` through it (previously it handed a bare key straight to `<Image>`, producing a `file://…/profile.png` "could not find image" warning). `match-card.tsx` and `profile-header.tsx` now import the shared helper instead of each carrying a private copy.

**Home hero ELO tile: vertical clip fix + Signal Red accent bar (2026-05-29)**

**Fixed**
- `apps/mobile/components/ui/elo-system/elo-tile.tsx`: the hero number was vertically clipped because `lineHeight` equalled `fontSize` (React Native crops the glyph box, unlike CSS `line-height: 1`); bumped `lineHeight` to `1.1x` for breathing room and added the brand-required `fontVariant: ["tabular-nums"]` (was missing on mobile).

**Added**
- `apps/mobile/components/ui/elo-system/elo-tile.tsx`: optional `accentBar` prop that renders the 3px Signal Red bottom accent bar from the canonical `.elo-tile::after` wireframe spec (with `overflow-hidden` so it follows the rounded corner). Enabled on the Home "Current ELO Rating" hero in `apps/mobile/app/(app)/(tabs)/(home)/index.tsx`.

**Profile tab: SWR cache + skeleton loading state (2026-05-29)**

**Changed**
- `apps/mobile/lib/profile/use-profile-data.ts`: the composed `{ stats, gymName, eloThisMonth, history }` payload now flows through `useCachedResource` (cache key `profile:${athleteId}`). The fetcher keeps the single `Promise.all([getAthleteStatsRpc, gymLookup, getMatchHistory])` (all three keyed only by `athleteId`, mutually independent) and derives `eloThisMonth` from that same history array. Errors surface via the existing `toast.error` while any stale payload stays on screen; `refreshing` maps to `isStale` and `onRefresh` is `refetch()` (the 600ms `setTimeout` is gone, no manual refresh state). Same public return shape (`{ stats, gymName, eloThisMonth, history, isLoading, refreshing, onRefresh }`).
- `apps/mobile/app/(app)/(tabs)/profile/index.tsx`: the cold-load `<ActivityIndicator>` is replaced by `ProfileSkeleton` (`<SkeletonProvider>` with a header `SkeletonPlate` (64px `SkeletonAvatar` + `SkeletonText lines={2}`), a 3-tile stat strip of `SkeletonBlock`s in a flex-row, then four `<SkeletonParticipantRow/>` under the "Recent Matches" `MetaTag`). `recent` continues to be served from the cached `history.slice(0, 5)` (no second round-trip). The remaining `<ActivityIndicator>` is the pre-auth `!athlete` guard only.

**Mobile Home tab: SWR cache + skeleton loading state (2026-05-29)**

**Changed**
- `apps/mobile/app/(app)/(tabs)/(home)/index.tsx`: rewrote the inline `useDashboardData()` hook on top of `useCachedResource` (cache key `dashboard:${athleteId}`), wrapping the existing parallel `Promise.all([getDashboardSummary, getActiveSession])` as the fetcher body (shared queries untouched). Cold start now renders a `DashboardSkeleton` (a hero `SkeletonBlock` h140 rounded-md for the ELO tile, an accent `SkeletonPlate` with `SkeletonText lines={2}` for the active-session slab, and a `SkeletonPlate` holding 3 `SkeletonParticipantRow` for recent activity) that mirrors the real layout, replacing the bare `<ActivityIndicator>` branch. The real header (Wordmark/NotificationBell/Avatar32) and Welcome-back block render above the skeleton since they don't depend on dashboard data. Pull-to-refresh now calls `refetch()` and drops the artificial 600ms `setTimeout` (SWR keeps stale data on screen while revalidating; `RefreshControl.refreshing` is driven by `isStale`). Fetch errors surface via the existing toast while stale data stays on screen.

**Rankings tab: SWR cache + list-body skeleton loading state (2026-05-29)**

**Changed**
- `apps/mobile/lib/leaderboard/use-leaderboard-data.ts`: routes the composed `{ athletes, gyms }` payload through `useCachedResource` (cache key `leaderboard:athletes`; the gender filter is client-side over the same payload, so it is NOT part of the key). The athletes-table SELECT and `getAthletesStatsRpc(ids)` stay strictly sequential inside the fetcher (the stats RPC genuinely depends on the returned IDs) with no wasted await between them; the fetcher checks the `CancelToken` before post-processing. Errors surface via the existing per-tab `toast.error` while any stale payload stays on screen. Hook still returns `{ athletes, gyms, isLoading, isRefreshing, refresh }` (`isRefreshing` now mapped from `isStale`).
- `apps/mobile/app/(app)/(tabs)/leaderboard/index.tsx`: the full-screen `<ActivityIndicator>` now gates on auth only (`authLoading || !athlete`). Once the athlete resolves, the header + Fighters/Gyms chips + gender filter paint immediately and the list body carries a `RankingsSkeleton` (`<SkeletonProvider>` with 8 static `<SkeletonRankRow/>`) until BOTH the athletes and stats land — never a half-empty list. The skeleton covers both the Fighters and Gyms views; `FightersList`/`GymsList` receive real data only when not loading.

**Parallelize independent sequential round-trips (latency, no behavior change) (2026-05-29)**

**Changed**
- `packages/shared/src/api/queries.ts` `getActiveSession()`: in both priority paths the gym-name lookup and the participant-count query (and, in Priority 2, the athlete check-in row) are now awaited together via `Promise.all` instead of serially. Each batched call depends only on the already-resolved session row (and `athleteId`), so none feeds another. Function signature, return shape, and every query (selects, filters, FK shapes) are unchanged.
- `apps/mobile/lib/profile/use-profile-data.ts`: collapsed the parallel `Promise.all([getAthleteStatsRpc, gymLookup])` + sequential `getMatchHistory` leg into a single `Promise.all([getAthleteStatsRpc, gymLookup, getMatchHistory])` (all three keyed only by `athleteId`, mutually independent). `eloThisMonth` is derived from that history array; the hook now also returns `history` (typed `getMatchHistory` wrapper, replacing the prior raw `supabase.rpc`).
- `apps/mobile/app/(app)/(tabs)/profile/index.tsx`: removed the duplicate `getMatchHistory` `useEffect` (a redundant network round-trip); `recent` is now sliced from the single cached `history` payload returned by `useProfileData`.

**Mobile: first/last name at signup, native elo-system restyling, Google SSO (2026-05-29)**

**Added**
- `apps/mobile/components/ui/elo-system/`: native ELO design-system primitive set (Plate, EloTile, Wordmark, Avatar32, LivePill, MetaTag, Chip, DataRow, DeltaNumber, OutcomeTag, ParticipantRow, RankRow), mirroring `apps/web/components/ui/elo-system/`.
- `apps/mobile/components/layout/`: `app-header.tsx`, `elo-tab-bar.tsx`, `page-container.tsx` layout primitives.
- `apps/mobile/components/auth/auth-buttons.tsx` (`CtaButton`/`TertiaryButton`) and `apps/mobile/components/profile-setup/elo-form-field.tsx` (`EloField`/`EloTextInput`).
- Native Google SSO: `signInWithGoogle` in `apps/mobile/lib/auth/auth-context.tsx` via `@react-native-google-signin/google-signin` (`GoogleSignin.signIn` -> `supabase.auth.signInWithIdToken`), wired into `apps/mobile/app/(auth)/login.tsx`. `apps/mobile/app.json` gains the google-signin config plugin (`iosUrlScheme`).
- `apps/mobile/app/(app)/(tabs)/gyms/gym-detail-parts.tsx`.

**Changed**
- Profile setup collects structured `first_name`/`last_name` (replacing single `display_name`); `display_name` kept in sync as a derived "First Last" label. Validation, submit payload, and the athlete read updated. Aligns with `jr_be` migration `20260529120000`.
- Mobile screens/components rebuilt on the elo-system primitives + ELO tokens (home, gyms, leaderboard, profile, sessions, match-flow, settings, auth, notifications). `apps/mobile/lib/tokens.ts` adds `textSecondary`/`textTertiary` + ELO palette; `apps/mobile/tailwind.config.js` gains the ELO radius/font scale; `apps/mobile/lib/theme/theme-provider.tsx` maps the new vars.
- `packages/shared/src/api/mutations.ts`: `createSessionTemplate` now sets `created_by` (via `auth_athlete_id`); `createInSessionMatch` timekeeper param aligned with the regenerated `database.ts`.

**Removed**
- `apps/mobile/components/athlete-card.tsx`, `athlete-card-parts.tsx`, `elo-badge.tsx` (superseded by elo-system primitives).

**Internal founders Kanban board at /design/board (2026-05-29)**

**Added**
- Backend (`/Users/msponagle/code/experiments/jr_be/supabase/migrations/20260529000000_admin_cards.sql`): new `public.admin_cards` table (`id`, `title`, `notes`, `status` checked `todo|doing|done`, `created_by` defaulting to `auth.uid()`, `created_at`, `updated_at`). Reuses the existing `set_updated_at()` trigger; RLS grants any authenticated user full CRUD (internal/undiscoverable for now). Self-contained and idempotent so it can be published to the remote project unchanged. **Applied to the LOCAL Supabase DB only** (this `jr_be` checkout has no migrations dir / git / config.toml, so `psql` was used directly; remote/prod application is a separate manual step).
- `packages/shared/src/api/queries.ts`: `AdminCard`/`AdminCardStatus` types and `getAdminCards()` query.
- `packages/shared/src/api/mutations.ts`: `createAdminCard()`, `updateAdminCard()`, `deleteAdminCard()` (all return `Result<T>`).
- `apps/web/app/design/board/page.tsx`: new `/design/board` route. Synchronous page wraps an async `BoardContent` (server-side fetch via `getAdminCards`) in `<Suspense>` per the cacheComponents pattern.
- `apps/web/app/design/board/kanban-board.tsx`: client board (To Do / Doing / Done columns) with add, move-between-columns, and delete, persisting via the shared mutations on the browser Supabase client.
- `apps/web/app/design/board/kanban-card.tsx`, `apps/web/app/design/board/add-card-input.tsx`: card and quick-add primitives.
- `apps/web/app/design/board/card-dialog.tsx`: click a card to open a detail dialog (shadcn `Dialog`) that edits the title and a description (the `notes` column) and shows `Created`/`Updated` relative times. Card faces are now clickable and show a compact "updated" timestamp.

**Changed**
- `packages/shared/src/api/queries.ts` + `mutations.ts`: `AdminCard` now exposes `updated_at` (added to the type and the select column lists) so the board can show last-updated times.
- `apps/web/app/design/page.tsx`: added "Founders Board" card to the design hub.
- `apps/web/app/design/layout.tsx`: added "Board" link to the design nav.
- `apps/web/lib/supabase/proxy.ts`: removed `/design` from `publicPaths`, so the entire design section (including the board) is now gated behind login via the existing `proxy.ts` middleware (unauthenticated requests 307 to `/login`). This is also what makes the board's authenticated-only RLS write path work without weakening the policy.
- `packages/shared/src/types/database.ts`: regenerated (`npm run db:types`) to include `admin_cards`.

**Web layout concepts: full-screen desktop directions for team preview (2026-05-29)**

**Added**
- `apps/web/app/design/web-layouts/page.tsx`: new `/design/web-layouts` route. A client-side switcher (segmented tabs) previewing seven full-screen desktop layout directions, each demonstrated on a different screen, in a full-bleed faux-browser frame with per-concept caption (blurb + pros/cons). Built to explore alternatives to the shipping app's centered `max-w-md` mobile column.
- `apps/web/app/design/web-layouts/_data.ts`: shared hardcoded placeholder data (athlete, rankings, gyms, profile stats, activity feed, fixtures/news, arena) so concepts render with no Supabase/auth and stay visually consistent.
- `apps/web/app/design/web-layouts/_frame.tsx`: `ConceptFrame` (full-bleed breakout + browser chrome) and `SectionLabel` shared primitives.
- `apps/web/app/design/web-layouts/concepts/`: seven concept components built from real `elo-system`/shadcn components and brand tokens: `sidebar-home` (persistent left sidebar, Home), `topnav-rankings` (top nav + wide centered, Rankings), `three-col-gyms` (nav, list, detail rail, Gyms), `bento-profile` (asymmetric bento grid, Profile), `split-arena` (55/45 immersive split, Arena), `strava-feed` (Strava-style social activity feed, Home/Activity), `espn-scores` (ESPN-style live scores ticker + news, Home/Live).

**Changed**
- `apps/web/app/design/page.tsx`: added "Web Layouts" card between "Canonical Wireframe" and "Web Screens".
- `apps/web/app/design/layout.tsx`: added "Web Layouts" link to the design nav.

**Public design assets synced with upstream SharePoint brand kit (2026-05-19)**

**Added**
- `apps/web/public/design/tokens.css`: canonical brand tokens copied from `outside_assets/Jits Arena SharePoint/Brand/design-system/tokens.css`. Static HTML in `/public/design/` now references a single source of truth instead of duplicating raw values.
- `apps/web/public/design/wireframe.html`: alpha wireframe (light + dark) synced from `outside_assets/.../activation-kit/app-screens/wireframe.html`. Expanded from 28 to **39 screens** to reach parity with the shipped app surface.
- `apps/web/app/design/wireframe/page.tsx`: new `/design/wireframe` route that iframes the canonical wireframe; linked from the design hub.
- Upstream `outside_assets/.../wireframe.html` and the synced `apps/web/public/design/wireframe.html`: 12 new screen sections added to close the gap between the wireframe and the shipped app: **A4** Forgot Password, **A5** Setup, Identity step, **A6** Setup, Training step (with Free Agent toggle), **F2** Global Ladder, Gyms tab, **G5** Profile Stats (win rate, streak, weekly activity chart, submission breakdown), **H1** Notification Center, **H2** Notification Preferences (push toggles by category), **H3** Feedback (form with category + screenshot), **H4** Video Settings (auto-record toggle, upload quality, storage), **I1** Offline Banner overlay, **I2** Error Boundary overlay, **I3** Toast overlay. Picker dropdown gains three new optgroups (Activation, Notifications, Overlays) and one renamed optgroup (Settings).

**Changed**
- `apps/web/app/design/page.tsx`: added "Canonical Wireframe" card between "UI Kit" and "Web Screens".
- `apps/web/app/design/layout.tsx`: added "Wireframe" link to the design nav.
- `apps/web/public/design/elo-rated-style-guide.html`: replaced inline `:root` raw-color block with `<link>` to `./tokens.css`, plus a bridge layer mapping the page's legacy names (`--void`, `--signal-red`, `--ease-out`, ...) onto canonical tokens (`--color-void`, `--color-signal-red`, `--easing-default`, ...). Eliminates drift risk against the brand system.
- `outside_assets/.../activation-kit/app-screens/wireframe.html`: removed a stray leading `S` character before the `<!DOCTYPE html>` declaration that prevented the page from validating; updated screen-count caption from "28 Screens" to "39 Screens".

**Removed**
- `apps/web/public/design/elo-rated-rebrand.html`: 100KB pre-rebrand Visual Review comparison doc (titled "2026-05-01"). Orphan (not referenced by any route); the rebrand shipped 2026-05-06 so the comparison is no longer load-bearing. Recoverable via git history if needed.

**Verified**
- `apps/web/app/globals.css`, `apps/web/app/design-system/tokens.css`, and `apps/mobile/lib/tokens.ts` already mirror the canonical brand tokens 1:1 (HSL form on web, hex form on mobile). No app-code changes were needed to bring web and native implementations into alignment.

**Match flow two-browser fixes (2026-05-16)**

**Fixed**
- Web `apps/web/hooks/use-session-lobby-realtime.ts`: stop passing the acceptor as `timekeeperId` on `respondToChallenge`. `create_session_match` rejects when the timekeeper is one of the competitors (`HINT invalid_timekeeper`), so accepting a challenge always failed silently for 2-fighter session matches.
- Web `apps/web/app/(app)/session/[id]/match/[matchId]/match-flow-content.tsx` + `match-flow-wizard.tsx`: thread `hasTimekeeper` (`!!match.timekeeper_id`) through the wizard.
- Web `steps/ready-check-step.tsx`: only require the assigned timekeeper to call `startMatch` when one actually exists. With no timekeeper (2-fighter session match), either competitor can start; `start_match` is idempotent and the broadcast `timer_started` event syncs the loser forward.
- Web `steps/fighter-live-step.tsx`: show the "End Match" button when `timekeeperEnabled` is true but the match has no assigned timekeeper.
- Web `steps/result-recording-step.tsx`: only lock the result form behind the timekeeper when one actually exists.
- Web `apps/web/components/sign-up-form.tsx`: switch from `athletes.insert` to `athletes.update`. The auth `on_auth_user_created` trigger already inserts a pending athlete row, so the prior insert always hit RLS (403) and the profile fields (gym, weight, gender, DOB) were never saved — leaving every new user stranded as `pending` after signup.
- Backend (jr_be `supabase/migrations/20260516000000_start_match_accept_session_statuses.sql`): `start_match` now accepts `pending`, `awaiting_timekeeper`, and `weight_check`. `create_session_match` parks 2-fighter session matches in `awaiting_timekeeper`, so the prior `pending`-only check made startMatch unreachable from the ready-check step.

**Gyms wireframe pass (2026-05-15)**

**Changed**
- Web gym detail (`apps/web/app/(app)/gyms/[id]/gym-stats.tsx`): replaced "Matches" stat tile with "Avg ELO" to match wireframe E2 (line ~1440). Placeholder "—" rendered until `getGymManagerStats` exposes `avgElo`.
- Web gym detail (`apps/web/app/(app)/gyms/[id]/gym-detail-content.tsx`): added "Last Session" plate (4-cell DataRow grid: Attendees, Avg Matches, ELO Range, Median) below the stats tiles, per wireframe E2 lines 1444-1450. Values are "—" placeholders pending `getGymDetail` last-session aggregates.
- Web gym list (`apps/web/components/domain/gym-card.tsx`): per-row schedule label now renders next upcoming session day+time (e.g. "Sun 11AM") via `Intl.DateTimeFormat` instead of "N upcoming". Falls back to "No sessions" when none. Live sessions still take precedence.
- Shared (`packages/shared/src/types/session.ts`, `packages/shared/src/api/queries.ts`): `GymListItem` gains `nextSessionStart: string | null`; `getGymsWithSessions` computes the earliest future scheduled-session timestamp per gym.

**Phase 6C: Mobile Gym Management (2026-05-06)**

**Added**
- Mobile: gym creation sheet, gym edit sheet, session templates section with full CRUD.
- Mobile: template-card, template-form-sheet with day/time/duration pickers.
- Gym list "Create" button and gym detail edit button (managers only).

**Phase 10: Analytics + Insights (2026-05-06)**

**Added**
- Analytics queries: `getWeeklyMatchActivity`, `getSubmissionBreakdown`, `getWeightClassStats`, `getGymManagerStats`.
- Rating milestones: 7-tier system (Newcomer to Legend) with `getCurrentMilestone`, `getNextMilestone`, `getMilestoneProgress`.
- Web: athlete insights tab (weekly activity chart, submission breakdown, weight class stats) with CSS-only visualizations.
- Web: gym manager stats dashboard (sessions, check-ins, matches, members) on gym detail page.
- Mobile: submission breakdown, weekly activity, milestone progress on profile stats screen.
- Analytics types: `WeeklyActivity`, `SubmissionBreakdown`, `WeightClassStats`, `GymManagerStats`.

**Phase 6: Gym Manager Onboarding (2026-05-06)**

**Added**
- Gym creation: any active athlete can create a gym and auto-becomes its first manager (backend trigger + web dialog).
- Gym profile editing: managers can update gym name/city via edit dialog on web.
- Session templates: managers can save recurring session configs (day, time, duration, capacity). One-tap "Create Session" from template.
- Backend migration: `session_templates` table, `gyms_insert_active_athlete` policy, `gyms_update_manager` policy, `auto_add_gym_manager` trigger, `create_session_from_template` RPC.
- Shared mutations: `createGym`, `updateGym`, `createSessionTemplate`, `updateSessionTemplate`, `deleteSessionTemplate`, `createSessionFromTemplate`.
- Web components: `create-gym-dialog`, `edit-gym-dialog`, `session-templates`, `template-card`, `template-form-dialog`.

**Phase 9: Notifications + Social (2026-05-06)**

**Added**
- Push notification preferences: dedicated settings page (web) and screen (mobile) with per-channel toggles (challenges, matches, chat).
- Notification center: full notification history built from challenges + match results. Web: `/notifications` route with date grouping. Mobile: enhanced bottom sheet panel with grouped feed.
- Social sharing utilities: `buildShareUrl()` and `buildShareText()` in `@jits/shared/utils/share`.
- Match result sharing: "Share Result" button on match summary (web + mobile) via native share APIs.
- Session invite sharing: "Invite" button on session lobby (web + mobile).
- Existing share-profile sheets migrated to shared utilities and `elorated.com` URLs.

**Changed**
- Web notification bell now links to `/notifications` page instead of opening a sheet panel.
- Mobile notification panel rewritten to show full feed (challenges + match results) grouped by date.
- Web settings page: notification prefs moved to dedicated `/settings/notifications` route.

**Removed**
- `apps/web/components/domain/notification-panel.tsx` (replaced by notifications page).
- `apps/mobile/components/notifications/challenge-item.tsx` (replaced by notification-item).

**Phase 7: Mobile Typography + Polish (2026-05-06)**

**Added**
- Mobile Tailwind font families: `font-display` (Bebas Neue), `font-heading` (DM Sans Bold), `font-body` (Inter), `font-mono` (JetBrains Mono).
- 15 extracted component/hook files from oversized components and screens.

**Changed**
- ~100 raw `font-bold`/`font-semibold` instances replaced with semantic `font-heading`, `font-mono`, or `font-display` across 45+ mobile files.
- 6 Stack layout files updated with themed header styles via `useThemedTokens()`.
- Component splits: `compare-stats-modal` (184->100), `match-flow-wizard` (182->104), `recent-activity-section` (164->110), `notification-panel` (158->119), `athlete-card` (145->110).
- Screen splits: `leaderboard/index` (330->71), `athlete/[id]` (297->108), `profile/index` (236->96).

**Phase 8: Test Coverage + Auth Dedup (2026-05-06)**

**Added**
- 171 new tests across 13 new test files (27 suites, 346 total tests):
  - Match flow: step-router (14), format-elapsed (14), parse-finish-time (17).
  - Session: validate-weight (14), haversine distance (20).
  - Realtime: session-match-sync (15), lobby-sync (13), pending-challenges (8), global-notifications (11).
  - Offline: mutation-queue (17), use-unread-count (9).
  - Mobile: CreateSessionSheet (8), SessionActions (4).
  - Web: session-actions (8), session-list (6).
  - Shared: GymDetail type assertions (5).

**Changed**
- Auth forms deduplicated: extracted 4 shared primitives (`auth-form-shell`, `email-input`, `password-input`, `google-oauth-button`). Forms reduced from 466 to 228 total lines (51%).

**Alpha Build Verification & Hardening (2026-05-06)**

**Added**
- Automation scripts: `scripts/verify-alpha.sh` (full CI verification), `scripts/setup-supabase-env.sh` (staging/prod provisioning), `scripts/seed-gym-manager.sh` (initial manager seeding).
- Mobile tests: `CreateSessionSheet` (8 tests) and `SessionActions` (4 tests) at `apps/mobile/__tests__/components/session/`.
- Web tests: 6 new tests for session list gym manager gating and type assertions.
- Shared tests: `GymDetail.isGymManager` type assertion test.
- Backend: 17 pgTAP tests for `gym_managers` table, RLS policies, `is_gym_manager()` function, and session creation gating.
- Total test count: 16 suites, 175 tests (up from 11/144).

**Changed**
- CLAUDE.md updated: alpha status, app identity, gym manager docs, resolved tech debt items, new directory structure.

**Alpha Build Phase 3: Gym Manager Feature (2026-05-06)**

**Added**
- Gym manager role support: `isGymManager` check in `getGymDetail` query, `gym_managers` table type in `database.ts`.
- Web: session creation gated behind gym manager role (was member-only). Session actions visible to gym managers and creators.
- Mobile: `CreateSessionSheet` (`apps/mobile/components/session/create-session-sheet.tsx`) with title, time presets, duration, capacity, notes.
- Mobile: `SessionActions` (`apps/mobile/components/session/session-actions.tsx`) with activate, end, cancel via native Alert menus.
- Mobile: gym detail screen shows "Start Session" for gym managers and management controls on session cards.

**Alpha Build Phase 4: Build Pipeline (2026-05-06)**

**Added**
- Universal link verification files: `public/.well-known/apple-app-site-association` and `assetlinks.json` for `elorated.com`.
- EAS setup guide (`docs/eas-setup.md`): step-by-step for EAS Build, secrets, TestFlight, Play Console.
- Universal links setup guide (`docs/universal-links-setup.md`).
- EAS submit config for iOS (App Store Connect) and Android (Play Console internal track).

**Changed**
- EAS build profiles use `EXPO_PUBLIC_APP_ENV` (aligned with env setup docs).
- All legal docs (PRIVACY_POLICY.md, TERMS.md) updated: "JITS" to "ELO RATED", domain to `elorated.com`.
- STORE_LISTING.md updated: app name, bundle ID, domain, all user-facing text to ELO RATED branding.

**Alpha Build Phase 1: Infrastructure (2026-05-06)**

**Added**
- GitHub Actions CI/CD pipeline (`.github/workflows/ci.yml`): typecheck, test, build-web, and bundle-mobile jobs on push/PR.
- Sentry error tracking wired for mobile: `apps/mobile/lib/error-tracking/sentry.ts` with guarded init, error boundary forwarding, and `@sentry/react-native/expo` config plugin.
- Multi-environment configuration: `docs/environment-setup.md` covering development/staging/production Supabase project isolation.
- Web `.env.example` with full variable list (`apps/web/.env.example`).

**Changed**
- App identity updated to ELO RATED: bundle ID `com.elorated.mobile`, slug `elo-rated`, scheme `elorated://`, associated domains `elorated.com`.
- Deep link handler and auth redirect updated from `jits://` to `elorated://`.
- Mobile `.env.example` updated with `EXPO_PUBLIC_APP_ENV` and `EXPO_PUBLIC_SENTRY_DSN`.

**Fixed**
- Supabase realtime "Cannot add 'postgres_changes' callbacks after 'subscribe'" error caused by async `removeChannel` race with React 19 Strict Mode effect re-firing. Added unique mount-ID channel names to all affected hooks: `use-pending-challenges` (shared), `use-global-notifications` (shared), `use-session-lobby-realtime` (web), `use-chat-channel` (web), `use-online-presence` (mobile).
- `joinSessionLobby` now uses upsert instead of insert, preventing 23505 duplicate key errors when re-joining a session (`packages/shared/src/api/mutations.ts`).
- Suppress noisy `[push] registration failed not_a_device` console warning on iOS Simulator (`apps/mobile/lib/notifications/push-registration-bootstrap.tsx`).

**Mobile Route Restructure (2026-05-01)**

**Fixed**
- Phantom tab bar items (athlete/[id], session/[id], settings) eliminated by moving tab routes into a dedicated `(tabs)` group under `(app)/`. `href: null` alone did not hide them in expo-router v6.
- Session join/lobby header now uses themed dark background instead of default white.
- Mobile profile and home screens now wrap content in `SafeAreaView` so headers no longer overlap the status bar/notch.

**Changed**
- `apps/mobile/app/(app)/_layout.tsx` converted from `Tabs` to `Stack` navigator.
- Tab routes (`(home)`, `gyms`, `leaderboard`, `profile`) moved to `apps/mobile/app/(app)/(tabs)/`.
- New `apps/mobile/app/(app)/(tabs)/_layout.tsx` holds the tab bar configuration.
- `apps/mobile/app/(app)/session/[id]/_layout.tsx` now applies themed header styles.

**All Matches Ranked (2026-05-01)**

**Removed**
- Casual/Ranked match type selection from web session challenge sheet, direct challenge sheet, and challenge response sheet.
- Casual/Ranked match type selection from mobile challenge action sheet (now simple "Challenge?" confirmation).
- "Ranked"/"Casual" filter tabs from recent activity sections (web + mobile).
- "Ranked"/"Casual" labels from match cards (web + mobile).
- "Casual match (no ELO change)" conditional message from mobile match summary step; ELO delta always shown.
- Separate `looking_for_casual` / `looking_for_ranked` toggles from mobile settings; collapsed to single "Looking for matches" toggle.
- Separate casual/ranked preference display from web dashboard hero subtitle; simplified to "Looking for matches".

**Changed**
- All challenge sheets now hardcode `matchType: "ranked"` and always show ELO stakes preview.
- Web arena toggle collapsed from two badges to single on/off toggle.

**Demo Prep Wave 6: Setup + Branding Polish (2026-05-01)**

**Added**
- Web: "Train independently" free agent toggle on profile setup wizard. Users without a gym can now complete activation (mirrors mobile setup flow).

**Changed**
- Version string updated from "JITS v0.1.0" to "JITS Beta" on both web and mobile profile screens.

**Demo Prep Wave 5: Web Parity Fixes (2026-05-01)**

**Fixed**
- Web: Opponent now navigates to match screen via postgres_changes fallback (same fix as mobile wave 2).
- Web: match_started broadcast handler now navigates participants when matchId is present.
- Web: Session cards show "Return to Lobby" and route directly to lobby for active participants (eliminates join-to-lobby redirect flash, matching mobile).

**Demo Prep Wave 4: Final Polish (2026-05-01)**

**Fixed**
- Leaderboard ranks now recalculate after gender filtering (web + mobile). Filtered views show sequential #1, #2, #3 instead of gaps from the full population ranking.

**Demo Prep Wave 3: Consistency + Resilience (2026-05-01)**

**Fixed**
- Web: Leave session now checks result and shows error toast on failure instead of navigating blindly.
- Web: Confirm result now checks RPC response; resets confirmed state and shows error toast on failure.
- Web: Profile stats now include draws in total match count (consistent with mobile and RPC).
- Mobile: Match confirm step auto-advances after both athletes confirm (1.5s delay), matching web behavior.
- Mobile: EndStep `onAdvance` callback wrapped in `useCallback` for stable reference (prevents timeout restart on re-render).
- Mobile: SessionCard routes directly to lobby when user is already a participant (eliminates join-to-lobby redirect flash).

**Demo Prep Wave 2: Functional Fixes (2026-05-01)**

**Fixed**
- Mobile: Opponent now navigates to match screen when challenged in session lobby (added postgres_changes, challenge_accepted, and match_started navigation paths).
- Mobile: Double-tap guard on challenge button prevents duplicate match creation.
- Web: Match confirm step now auto-advances to summary after both athletes confirm (1.5s delay).
- Web: Login now redirects to dashboard (`/`) instead of `/profile`.
- Web: Auth callback error redirect now includes error param for friendly error messages.
- Web: Achievements "Find a match" link points to `/gyms` instead of hidden `/arena` route.
- Web: Match card links removed from dashboard and profile (pointed to hidden `/match/*/results` route).
- Web: Weight validation on session join tightened to 50-400 lbs range (consistent with mobile).
- Web: Error toasts added for result recording, session creation, and RSVP failures (previously silent).
- Mobile: Gym detail hook now uses cancellation guard on unmount.

**Demo Prep Wave 1: Polish (2026-05-01)**

**Fixed**
- Mobile Jest tests now pass: fixed `react` moduleNameMapper to resolve from workspace root instead of non-existent local `node_modules/react`.
- Web bottom nav bar now hides on `/match/*/live`, `/match/*/results`, and `/profile/setup` routes.
- Auth error page (`apps/web/app/(auth)/error/page.tsx`) shows friendly messages instead of raw Supabase error codes, with a "Back to sign in" button.

**Changed**
- Gym detail pages (web + mobile) now show actual member count (e.g., "12 Members") instead of generic "Members at this gym" text. Added `memberCount` to `GymDetail` type and count query to `getGymDetail`.
- Web empty states (`recent-activity-section`) now include actionable hint text guiding users to join sessions.
- Mobile ELO history placeholder shows "N rating points recorded" or "No matches yet" instead of referencing "polish phase" or "placeholder".
- Mobile rank display shows "Unranked" instead of em dash when rank is 0.
- Mobile auth form fields now show red border (`border-destructive`) on validation errors.
- Mobile "coming soon" text updated: removed outdated phase references (profile editing, video settings, notification toggles).
- Mobile challenge button on athlete profile now looks visibly disabled (secondary variant, reduced opacity).
- Mobile empty states (dashboard recent activity) now include actionable guidance text.

### Added

**Phase 5 Track B2 -- Mobile EAS Build, Sentry, Store Listing Prep**
- Mobile dependency: `@sentry/react-native` (~7.2.0) for error tracking. Config plugin auto-registered in `apps/mobile/app.json` via `npx expo install`.
- `apps/mobile/eas.json` -- EAS Build configuration with `development` (developmentClient + iOS simulator), `preview` (internal distribution, APK on Android), and `production` (autoIncrement, AAB) profiles. Channel names match profile names so EAS Update OTA targeting works out of the box.
- `apps/mobile/lib/error-tracking/sentry-init.ts` -- Sentry initialization driven by `EXPO_PUBLIC_SENTRY_DSN`. No-op when DSN absent (local dev). Exports `captureError(err, context?)` for use from non-React contexts. `tracesSampleRate: 0.1` for beta to keep volume low until we have signal.
- `STORE_LISTING.md` (repo root) -- App Store Connect + Play Store listing draft, beta distribution plan, 18-item pre-launch checklist.
- `PRIVACY_POLICY.md`, `TERMS.md` (repo root) -- placeholder content noting legal review is required before publishing.

**Phase 5 Track A -- Mobile Video Recording, Wake-Lock, Haptics**
- Mobile dependencies: `expo-camera`, `expo-av`, `expo-keep-awake`, `expo-haptics`, `expo-file-system` (the latter required for the upload helper's streaming `FileSystem.uploadAsync` call -- `expo-av` installed for forward compatibility although the live recorder only uses `expo-camera`).
- `apps/mobile/lib/video/use-video-recorder.ts` -- Native video recorder hook (`useVideoRecorder`). Wraps `expo-camera`'s `CameraView` ref + `recordAsync`/`stopRecording` lifecycle, exposes a 6-state machine (`idle`/`recording`/`stopping`/`uploading`/`uploaded`/`error`), retries failed uploads once, and surfaces camera + microphone permission state.
- `apps/mobile/lib/video/upload-recording.ts` -- Streams the local file URI to Supabase Storage via `FileSystem.uploadAsync` (BINARY_CONTENT) instead of base64-loading. Bucket `match-videos`, path `matches/{matchId}/{timestamp}.mp4` -- mirrors web's bucket + path convention (web uses `.webm` because `MediaRecorder` produces WebM; native produces MP4).
- `apps/mobile/components/match-flow/camera-overlay.tsx` -- 16:9 camera preview thumbnail mounted above the timer. Renders a permission-gate fallback when access hasn't been granted (or has been denied) so the match flow keeps running.
- `apps/mobile/components/match-flow/upload-progress-banner.tsx` -- Compact status pill showing recording/upload state (spinner + label, success checkmark, or error). No incremental progress because `FileSystem.uploadAsync` does not emit progress for binary uploads.
- `apps/mobile/lib/match-flow/use-keep-awake.ts` -- Wake-lock during the live match step via `expo-keep-awake`'s imperative `activateKeepAwakeAsync` / `deactivateKeepAwake` pair (keyed on an `active` flag so the lock releases on unmount).
- `apps/mobile/lib/match-flow/use-haptics.ts` -- Centralised haptic vocabulary (`matchStart`, `matchEnd`, `resultRecorded`, `error`, `timeWarning`) wrapping `expo-haptics`. All errors silently swallowed since haptics are pure feedback.

**Phase 5 Track B1 -- Mobile Deep Links, Error Boundary, Offline Handling**
- Mobile dependency: `@react-native-community/netinfo`.
- `apps/mobile/lib/network/use-network-status.ts` -- Network state hook (isConnected / isInternetReachable / type).
- `apps/mobile/lib/network/mutation-queue.ts` -- In-memory queue for critical mutations (match result + confirm). Flushes on reconnect.
- `apps/mobile/components/offline-banner.tsx` -- Top-of-screen banner shown when offline.
- `apps/mobile/components/error-boundary.tsx` -- Root error boundary with retry + sign-out.
- `apps/mobile/lib/deep-links/handler.ts` -- Central deep link parser routing `jits://...` and `https://jits.app/...` URLs to Expo Router.

### Changed

- `apps/mobile/lib/match-flow/use-record-result.ts` and `apps/mobile/components/match-flow/steps/confirm-step.tsx` -- Critical match-result writes (`recordMatchResult`, `confirmMatchResult`) now route through the offline-tolerant mutation queue from `lib/network/mutation-queue.ts`. When offline, the wizard advances optimistically and the result syncs on reconnect. Resolves Phase 5 W3.
- `apps/mobile/lib/network/mutation-queue.ts` -- Added a tiny `subscribe(listener)` API so the new banner can react to queue size changes without polling. Notifies on enqueue (offline path), flush, and clear.
- `apps/mobile/components/match-flow/queue-status-banner.tsx` (new) -- Amber warning banner mounted at the top of `match-flow-wizard.tsx`. Shows when one or more critical writes have been queued for offline replay; auto-dismisses when the queue drains on reconnect.

**Phase 5 Track B2 -- Mobile EAS Build, Sentry, Store Listing Prep**
- `apps/mobile/app.json` -- Sets `name` to `JITS`, `slug` to `jits`, `version` to `0.1.0`. Adds `ios.bundleIdentifier` (`com.jits.mobile`, placeholder), `ios.buildNumber` (`1`), `android.package` (`com.jits.mobile`, placeholder), `android.versionCode` (`1`), `runtimeVersion.policy: "appVersion"`, `updates.url` (`https://u.expo.dev/PLACEHOLDER_PROJECT_ID`), `extra.eas.projectId` (`PLACEHOLDER_PROJECT_ID`). Splash + adaptive-icon background updated to brand red `#bf1212`. `@sentry/react-native` config plugin auto-registered.
- `apps/mobile/assets/{icon,adaptive-icon,favicon,splash-icon}.png` -- Replaced default Expo placeholders with branded EloRated logo rendered from `apps/web/public/logo.svg` via `rsvg-convert` (icon + adaptive: 1024x1024 RGBA on rounded brand-red square; favicon: 48x48; splash-icon: 1024x1024 transparent so the splash background colour shows through).
- `apps/mobile/components/error-boundary.tsx` -- `componentDidCatch` now forwards uncaught errors to Sentry via `captureError(error, { componentStack })`. No-op when Sentry isn't initialized. No fallback-UI behaviour changes.
- `apps/mobile/app/_layout.tsx` -- Calls `initSentry()` at module load (single line, additive only) so JS-bootstrap errors are captured.
- `apps/mobile/.env.example` -- Adds `EXPO_PUBLIC_SENTRY_DSN` placeholder.

**Phase 5 Track B1 -- Mobile Deep Links, Error Boundary, Offline Handling**
- `apps/mobile/app/_layout.tsx` -- Wraps app in ErrorBoundary; mounts OfflineBanner + deep link listener (additive only).
- `apps/mobile/app.json` -- Adds iOS `associatedDomains` and Android `intentFilters` for `jits.app` universal/app links.
- `apps/mobile/app/(app)/settings/index.tsx` -- Removes `Link href={href as never}` casts in favor of a typed `SettingsRoute` union; routes simplified to root paths.
- `apps/mobile/lib/auth/auth-context.tsx` -- `resetPassword` now passes `redirectTo: "jits://reset-password"` so the email lands back inside the app via the new deep-link handler.

### Fixed

- Workspace hoisting fix for `npx expo export` -- simplified `apps/mobile/metro.config.js` to use Expo SDK 52+ automatic monorepo configuration. Removed manual `watchFolders`, `nodeModulesPaths`, and `disableHierarchicalLookup: true` overrides. The previous config blocked Metro from walking nested `node_modules`, so transitive deps like `react-native-reanimated`'s `semver@^7.7.2` (which exposes `semver/functions/satisfies`) failed to resolve when an older `semver@6.3.1` was hoisted at the workspace root. `getDefaultConfig(projectRoot)` now discovers the workspace root and watch folders itself, with hierarchical lookup enabled so nested transitives resolve cleanly. Mobile bundle now compiles cleanly on iOS and Android. Unblocks Phase 5 EAS build setup.

**Phase 4 Track A2 -- Mobile Live Match Wizard**
- `apps/mobile/app/(app)/session/[id]/match/[matchId].tsx` -- Live match wizard replacing the Phase 3 stub. 8-step state machine (wait, weight, ready, live, end, result, confirm, summary) using shared `use-session-match-timer` and `use-session-match-sync` hooks.
- `apps/mobile/components/match-flow/*` -- Step components and orchestrator. Each step under 100 lines.
- `apps/mobile/lib/match-flow/*` -- Format/parse helpers and pure step-routing logic. `useMatchDetails` (cancellation-gated fetch), `useLiveControls` (pause/resume/end mutations + debounce), `useMatchCompletion` (postgres_changes listener for completed/disputed status), and `useRecordResult` (record + broadcast wrapper) split mutation logic out of step components.

**Phase 4 Track A1 -- Mobile Session Join Wizard & Lobby**
- `apps/mobile/app/(app)/session/[id]/join.tsx` -- 4-step session join wizard: geo check (expo-location), waiver acceptance, weight confirmation, summary. Uses shared `getSessionForJoin`, `acceptSessionWaiver`, `joinSessionLobby`. Replaces Phase 3 stub.
- `apps/mobile/app/(app)/session/[id]/lobby.tsx` -- Realtime session lobby with participant list, "Find Random Match" button, leave session, challenge participant. Uses native `postgres_changes` + broadcast subscriptions on `session-participants:{id}` and `session:{id}` channels (mobile-local; the shared `useLobbySync` is challenge-scoped, not session-scoped). Replaces Phase 3 stub.
- `apps/mobile/components/session/join-wizard.tsx` -- Wizard orchestrator: builds the step list dynamically (skips geo when gym lacks coords; skips waiver when already signed) and renders progress dots + Back button.
- `apps/mobile/components/session/wizard-progress.tsx` -- Reusable horizontal-dots step indicator (sibling of profile-setup's wizard-progress).
- `apps/mobile/components/session/wizard/{geo-step,waiver-step,weight-step,confirm-step}.tsx` -- Wizard step components mirroring `apps/web/app/(app)/session/[id]/join/steps/*`. Toast-based error surface; cancellation-safe state.
- `apps/mobile/components/session/lobby/{lobby-header,leave-button,participant-row,challenge-action-sheet}.tsx` -- Lobby sub-components. `challenge-action-sheet` uses RN `Alert.alert` (renders as native iOS action sheet) for casual/ranked selection.
- `apps/mobile/lib/session/distance-from-gym.ts` -- 2km proximity threshold helper wrapping `haversineKm` (matches web's lenient threshold).
- `apps/mobile/lib/session/validate-weight.ts` -- 50-400 lbs weight validator (matches profile-setup wizard).
- `apps/mobile/lib/session/use-session-for-join.ts` -- Hydrates `getSessionForJoin` + active waiver id + already-participant check. Cancellation-gated state writes per Phase 3 W3-4 review.
- `apps/mobile/lib/session/use-session-lobby.ts` -- Hydrates `getSessionLobbyData` with refresh and a participants setter so realtime can mutate locally.
- `apps/mobile/lib/session/use-session-lobby-realtime.ts` -- Mobile-local realtime hook for session lobby (postgres_changes + broadcast). Mirrors web's `apps/web/hooks/use-session-lobby-realtime.ts` pattern.

**Phase 4 Track B -- Push Notifications, Online Presence, Settings (Mobile)**
- Mobile dependencies: `expo-notifications`, `expo-device` (push notification token + device info).
- `apps/mobile/lib/notifications/register-push.ts` -- Push registration helper. Requests permission, fetches Expo push token (requires physical device), reads `Device.osName` / `Device.modelName` for the device label, and calls shared `registerPushDevice`. Returns a discriminated `RegisterPushResult` so callers can react to permission denial vs. actual failure.
- `apps/mobile/lib/notifications/handlers.ts` -- `setupNotificationHandlers()` wires `Notifications.setNotificationHandler` (foreground banner display) and `addNotificationResponseReceivedListener` (tap deep-link via `router.push(payload.data.route)`).
- `apps/mobile/lib/notifications/push-registration-bootstrap.tsx` -- Side-effect bootstrap component (renders null) mounted inside `<AuthProvider>` to register on athlete login.
- `apps/mobile/lib/presence/use-online-presence.ts` -- AppState-aware online presence hook on the `app:online` Supabase Presence channel. Subscribes only when foreground; untracks on background to avoid phantom presence. Exposes `useOnlineStatus(athleteId)` consumer hook backed by `useSyncExternalStore` (mirrors web's pattern).
- `apps/mobile/lib/presence/online-presence-bootstrap.tsx` -- Renders null; mounted inside `<AuthProvider>` to start the channel for the current athlete.
- `apps/mobile/components/notifications/notification-bell.tsx` -- Bell icon with unread badge (consumes shared `usePendingChallenges`). Tapping opens `NotificationPanel`.
- `apps/mobile/components/notifications/notification-panel.tsx` -- Bottom-sheet (gorhom) listing pending challenges. Mirrors `apps/web/components/domain/notification-panel.tsx`.
- `apps/mobile/components/online-indicator.tsx` -- Small green dot rendered only when `useOnlineStatus` returns true.
- `apps/mobile/hooks/use-unread-count.ts` -- AppState-aware unread polling (30s + foreground refresh + manual `refreshUnreadCounts()`). Mobile equivalent of web's window-event hook.

**Phase 3 Track A -- Mobile Dashboard & Profile**
- `apps/mobile/app/(app)/(home)/index.tsx` -- Dashboard with stat overview, active session card, recent matches, and recent activity. Pull-to-refresh via `RefreshControl`. Fetches `getDashboardSummary` + `getActiveSession` in parallel from `@jits/shared`.
- `apps/mobile/app/(app)/profile/index.tsx` -- Profile screen with header (avatar via `expo-image`, name, gym, ELO, record), View Stats / Share buttons, quick stats row, and account section (Edit Profile placeholder, Settings link, Sign Out).
- `apps/mobile/app/(app)/profile/stats.tsx` -- Match history list (FlatList with ranked/casual filter, W-L-D summary) and ELO history placeholder card. Pull-to-refresh.
- `apps/mobile/components/match-card.tsx` -- Native MatchCard mirroring web API. Outcome badges (success/destructive/secondary), ELO delta with color, formatted relative date, optional match-type label, optional `onPress` for navigation.
- `apps/mobile/components/elo-badge.tsx` -- ELO display with `getEloTierBorderClass()` helper porting web's tier thresholds (1400+/1200/1000/<1000). Variants: `display`, `compact`, `stakes`.
- `apps/mobile/components/share-profile-sheet.tsx` -- Bottom-sheet share dialog using gorhom + RN `Share.share`. Builds `https://jits.app/athlete/{id}` URL.
- `apps/mobile/components/dashboard/stat-overview.tsx` -- 2x2 stat grid (ELO, Rank, Record, Win Streak) with peak labels.
- `apps/mobile/components/dashboard/active-session-card.tsx` -- Active/scheduled session card with check-in CTA; falls back to "Find a session" prompt when no active session.
- `apps/mobile/components/dashboard/recent-activity-section.tsx` -- Filterable activity feed with scope (All/Me) and type (All/Ranked/Casual) pills, mirroring web's variant.
- `apps/mobile/components/profile/profile-header.tsx` -- Profile avatar (`expo-image`) with tier-colored ring, name, gym, ELO badge, W-L record, win rate.
- `apps/mobile/components/profile/profile-quick-stats.tsx` -- 2x2 quick stats grid (Total Matches, Current Streak, Best Streak, ELO This Month).

**Phase 3 Track B -- Gyms, Leaderboard, Competitor Profile (Mobile)**
- `apps/mobile/app/(app)/gyms/index.tsx` -- Gym finder list with text filter, location-aware distance (opt-in `expo-location`), pull-to-refresh.
- `apps/mobile/app/(app)/gyms/[id].tsx` -- Gym detail screen with upcoming sessions list. Tapping a session navigates to the join wizard (Phase 4 stub).
- `apps/mobile/app/(app)/leaderboard/index.tsx` -- Leaderboard with fighter/gym tabs and gender filter pills (defaults to the athlete's own gender when set).
- `apps/mobile/app/(app)/athlete/[id].tsx` -- Competitor profile with header (avatar, ELO, record), head-to-head stats card, and Compare Stats modal. Challenge button is a Phase 4 stub (toast info).
- `apps/mobile/components/athlete-card.tsx` -- Athlete row card with rank icon, avatar (`expo-image`), ELO trend, record, and gym (mirrors web).
- `apps/mobile/components/session-card.tsx` -- Session row card with start time, capacity, host name; tap routes to session join.
- `apps/mobile/components/gyms/gym-card.tsx` -- Gym row card with city, member/session counts, optional distance label.
- `apps/mobile/components/compare-stats-modal.tsx` -- Side-by-side stats comparison built on the existing `Dialog` primitive, with All/Ranked/Casual filters.
- `apps/mobile/lib/location/use-location.ts` -- `expo-location` permission + position hook (opt-in, no auto-request) plus `haversineKm` and `formatDistanceKm` helpers.

### Changed

**Phase 5 Track A -- Live Step Integration (Mobile)**
- `apps/mobile/components/match-flow/steps/live-step.tsx` -- Mounts the `<CameraOverlay />` thumbnail above the timer, auto-starts recording when permission flips to granted, auto-stops on end-match (both local end and opponent broadcast), activates the wake-lock for the duration of the step, and fires haptics on match start, time-warning (<= 10s remaining), and match end. Recording is best-effort: a permission-denied user still progresses through the wizard normally.
- `apps/mobile/app.json` -- Adds the `expo-camera` plugin entry with iOS camera + microphone permission strings (`NSCameraUsageDescription` + `NSMicrophoneUsageDescription`) and Android `CAMERA` + `RECORD_AUDIO` permissions plus `recordAudioAndroid: true`.

**Phase 4 Track B -- Settings & Bell Placement (Mobile)**
- `apps/mobile/app/(app)/settings/index.tsx` -- Real settings menu replacing Phase 2 stub. Match Preferences (looking-for-casual, looking-for-ranked toggles via `toggleMatchPreferences`), Notifications placeholder card, General links (Video / Feedback / Help), Account (Sign Out with confirm), and dev-gated Realtime smoke test. Preserves the `__DEV__` developer entry.
- `apps/mobile/app/(app)/settings/feedback.tsx` -- Feedback form mirroring web's flow (Bug / Feature / General categories, multiline message, char counter, success state). Inserts into `feedback` table with the same row shape as `apps/web/app/(app)/settings/feedback/feedback-form.tsx`.
- `apps/mobile/app/(app)/settings/help.tsx` -- FAQ ported from web (6 items, expandable rows). Email Support button via `Linking.openURL("mailto:...")`.
- `apps/mobile/app/(app)/settings/video.tsx` -- Placeholder mirroring web's minimal video settings page.
- `apps/mobile/app/_layout.tsx` -- Mounts `<PushRegistrationBootstrap />` and `<OnlinePresenceBootstrap />` inside the existing `<AuthProvider>` (additive only).
- `apps/mobile/app/(app)/(home)/index.tsx` -- Surgical addition: `<NotificationBell athleteId={athlete.id} />` in the existing greeting header.
- `apps/mobile/app.json` -- Adds the `expo-notifications` plugin (notification color, default channel) and iOS `UIBackgroundModes: ["remote-notification"]` for background push.

**Phase 3 Track A**
- `apps/mobile/app/(app)/_layout.tsx` -- Tab bar now uses `lucide-react-native` icons (Home, Dumbbell, Trophy, User) with theme-aware active/inactive tint via `useThemedTokens()`.

**Phase 1 -- Dark Mode + Phase 3 Native Dependencies**
- Mobile dependencies: `lucide-react-native`, `expo-image`, `expo-image-picker`, `expo-location`. Used by Phase 3 screens (profile photo upload, gym distance, tab icons, performant images).
- `apps/mobile/lib/theme/theme-provider.tsx`, `use-theme.ts`, `index.ts` -- Theme provider + hook wiring system color scheme into NativeWind dark variants. `ThemeProvider` mounts at the root and applies `vars()` overrides on dark mode; `useThemedTokens()` returns the right runtime token map for RN APIs that can't take className.

**Phase 1 -- Monorepo + Expo Scaffold**
- `apps/mobile/` -- Expo React Native app scaffold (`@jits/mobile`) on Expo SDK 54 with Expo Router, NativeWind v4, and `@gorhom/bottom-sheet`.
- `apps/mobile/metro.config.js` -- Metro configured to watch the workspace root and resolve hoisted `node_modules` (`watchFolders` + `nodeModulesPaths` + `disableHierarchicalLookup`); wraps the config with `withNativeWind`.
- `apps/mobile/babel.config.js`, `tailwind.config.js`, `global.css`, `nativewind-env.d.ts` -- NativeWind v4 setup using `babel-preset-expo` with `jsxImportSource: "nativewind"`, `nativewind/babel` preset, and `react-native-reanimated/plugin` last.
- `apps/mobile/tsconfig.json` -- Extends root `tsconfig.base.json`, adds `@jits/shared`/`@jits/shared/*` path aliases and `expo-router/types`.
- Root scripts: `start:mobile`, `typecheck:mobile`.
- `apps/mobile/app.json` -- Adds `scheme: "jits"` for deep linking, `plugins: ["expo-router"]`, and `web.bundler: "metro"`.
- `apps/mobile/components/ui/*` -- Native UI primitives (Button, Card, Input, Label, Avatar, Badge with success variant, Separator, Tabs, Switch, Sheet, Dialog, Select, Toast). NativeWind v4 + class-variance-authority. API mirrors shadcn/ui where reasonable.
- `apps/mobile/lib/cn.ts` -- `cn()` helper for conditional classNames (clsx + tailwind-merge).
- `apps/mobile/lib/tokens.ts` -- semantic color tokens (mirrors web globals.css).
- `apps/mobile/tailwind.config.js` -- Theme extends with light/dark semantic tokens.
- `apps/mobile/app/**` -- Expo Router navigation skeleton with stub screens. Auth group (login/signup/forgot-password), app tab navigator (Home/Gyms/Rankings/Profile), nested session and match routes, athlete profile, settings, profile-setup wizard.

**Phase 2 -- Realtime Hooks & Smoke Test (Track B)**
- `packages/shared/src/hooks/*` -- Ported six platform-agnostic realtime hooks from `apps/web/hooks/`: `use-session-match-timer`, `use-session-match-sync`, `use-match-sync`, `use-lobby-sync`, `use-pending-challenges`, `use-global-notifications`. Hooks now accept the Supabase client as a parameter so the same code runs on web and React Native. `use-lobby-sync` parameterizes navigation via an `onMatchStarted` callback (web `router.push`, mobile expo-router); `use-global-notifications` parameterizes toast (`notify`), current-route lookup (`getCurrentRoute`), unread refresh (`onUnreadRefresh`), and deep-link builders (`buildMessageHref`, `buildLobbyHref`).
- `packages/shared/package.json` -- Adds `./hooks` and `./hooks/*` exports plus `react` peerDependency so the package can house React hooks.
- `apps/mobile/app/(app)/settings/realtime-test.tsx` -- Developer-only smoke-test screen exercising all four Supabase realtime patterns (channel subscribe, presence on `app:online`, broadcast self-echo, postgres-changes on `gyms`) plus `AppState` foreground/background logging. Cleans up channels on unmount.
- `apps/mobile/app/(app)/settings/index.tsx` -- Adds a "Realtime smoke test" entry gated by `__DEV__` so it never ships to production.

**Phase 2 -- Auth Foundation**
- `apps/mobile/lib/supabase/client.ts` -- Supabase mobile client using `expo-secure-store` for token persistence; realtime configured with `heartbeatIntervalMs: 15_000` (no Web Worker on RN). Imports `react-native-url-polyfill/auto` for URL support.
- `apps/mobile/lib/supabase/secure-storage.ts` -- async storage adapter wrapping `expo-secure-store` for Supabase auth (matches `SupportedStorage` interface).
- `apps/mobile/lib/auth/auth-context.tsx` -- `AuthProvider` Context exposing `user`, `session`, `athlete`, `isLoading`, `isAthleteActive`, `signIn`, `signUp`, `signOut`, `resetPassword`, `refreshAthlete`. Subscribes to `onAuthStateChange` and keeps the athlete row in sync via inline Supabase query (mirrors `apps/web/lib/guards.ts` select list).
- `apps/mobile/lib/auth/hooks.ts` -- `useAuth`, `useRequireAuth`, `useRequireAthlete` guard hooks. Mirrors web's `lib/guards.ts` but client-side via Expo Router `router.replace()`.
- `apps/mobile/lib/env.ts` -- typed env access via `expo-constants` and `process.env.EXPO_PUBLIC_*`. Lazy getters so `expo export` can bundle without env vars set.
- `apps/mobile/.env.example` -- documents `EXPO_PUBLIC_SUPABASE_URL` and `EXPO_PUBLIC_SUPABASE_ANON_KEY`.
- Mobile dependencies: `@supabase/supabase-js@^2.94.1`, `expo-secure-store@~15.0.8`, `@react-native-async-storage/async-storage@2.2.0`, `react-native-url-polyfill@^3.0.0`.
- `apps/mobile/components/auth/auth-form-field.tsx` -- Shared label + input + inline error component used by login, signup, and forgot-password screens.
- `apps/mobile/components/profile-setup/*` -- Native multi-step setup wizard: `setup-wizard.tsx` (orchestrator), `wizard-progress.tsx`, `tos-step.tsx`, `identity-step.tsx`, `training-step.tsx`, `optional-step.tsx`, plus `types.ts`. Mirrors `apps/web/app/profile/setup/*`.
- `apps/mobile/lib/profile-setup/*` -- Wizard helpers: `validation.ts` (DOB/age/weight rules), `use-setup-data.ts` (loads athlete/gyms/waiver state), `use-setup-submit.ts` (TOS acknowledgement insert + athlete upsert + `refreshAthlete()` + redirect).
- `packages/shared/src/utils/tos-content.ts` -- Shared `TOS_TEXT` consumed by both web and mobile setup flows. Re-exported from `@jits/shared/utils`.

### Changed

- Extracted `getCurrentAthlete(supabase, authUserId)` and `ATHLETE_GUARD_SELECT` constant to `@jits/shared/api/queries`. Web's `lib/guards.ts` and mobile's `lib/auth/auth-context.tsx` now share the same source of truth, eliminating drift risk.

**Phase 1 -- Dark Mode Wiring**
- `apps/mobile/app.json` -- `userInterfaceStyle: "automatic"` (was `"light"`). Adds `expo-image-picker` (`photosPermission`, `cameraPermission`) and `expo-location` (`locationWhenInUsePermission`) plugin entries with iOS permission descriptions.
- `apps/mobile/tailwind.config.js` -- Semantic color tokens now resolve to `var(--<token>)`; light values are declared on `:root` via an `addBase` plugin and `darkMode` is set to `"media"`. NativeWind classes (`bg-background`, `text-foreground`, etc.) automatically follow the system color scheme via the root `ThemeProvider`. Resolves Phase 1 W1, W5.
- `apps/mobile/app/_layout.tsx` -- Wraps the app in `<ThemeProvider>` so dark-mode CSS variables propagate to all descendants.
- `apps/mobile/lib/tokens.ts` -- Both `lightTokens` and `darkTokens` now share an explicit `ColorTokens` type so the dark map is assignable wherever the light map is expected (used by `useThemedTokens()`).
- `apps/mobile/components/ui/switch.tsx` -- Reads system color scheme via `useThemedTokens()` to pick the light/dark token map for `trackColor`, `thumbColor`, and `ios_backgroundColor` (resolves Phase 1 W3).
- `apps/mobile/components/ui/sheet.tsx` -- `BottomSheet.backgroundStyle` and `handleIndicatorStyle` now driven by `useThemedTokens()` (replaces the hardcoded `hsl(0,0%,100%)` background).
- `apps/mobile/components/ui/input.tsx` -- `placeholderTextColor` defaults to the themed `mutedForeground` token instead of the hardcoded light HSL string.

**Phase 1 -- Monorepo Restructure**
- Restructured repo into npm monorepo: web app moved to `apps/web/`, shared data layer extracted to `packages/shared/` (`@jits/shared`).
  - Files moved: `lib/api/*`, `lib/constants.ts`, `types/*`, pure functions from `lib/utils.ts` (`getInitials`, `extractGymName`, `formatRelativeDate`, `formatRelativeTime`).
  - Web app imports updated to reference `@jits/shared`.
  - Web-specific utilities (`cn`, `hasEnvVars`, `getEloTierClass`, `getProfilePhotoUrl`) remain in `apps/web/lib/utils.ts`.
  - `db:types` script moved to root and now writes to `packages/shared/src/types/database.ts`.
  - Husky `prepare` hook moved to root; pre-commit delegates to workspace scripts.
  - Next.js `turbopack.root` set in `apps/web/next.config.ts` to silence multi-lockfile warning.
  - Post-merge tidy: removed dead `outside_assets` from `apps/web/tsconfig.json` exclude, made `.husky/pre-commit` executable, removed stale root-level build artifacts (`.next/`, `tsconfig.tsbuildinfo`, `next-env.d.ts`).

**Phase 2 -- Realtime Hooks (Track B)**
- `apps/web/components/layout/global-notifications-provider.tsx`, `apps/web/components/domain/notification-bell.tsx`, `apps/web/components/domain/notification-panel.tsx`, `apps/web/app/(app)/match/lobby/[id]/lobby-actions.tsx`, `apps/web/app/(app)/match/[id]/live/match-timer.tsx`, `apps/web/app/(app)/match/[id]/results/record-result-form.tsx`, `apps/web/app/(app)/session/[id]/match/[matchId]/{match-flow-wizard,steps/*}.tsx` -- Updated imports from `@/hooks/<name>` to `@jits/shared/hooks/<name>`. Now pass the Supabase client (memoized via `useMemo(() => createClient(), [])`) and platform-specific callbacks (`onMatchStarted`, `notify`, `getCurrentRoute`, `onUnreadRefresh`, `buildMessageHref`, `buildLobbyHref`) into the shared hooks. Behavior is unchanged.

**Phase 2 -- Auth Wiring**
- `apps/mobile/app/_layout.tsx` -- Wraps app in `AuthProvider`; mounts `Toaster` for in-app notifications (resolves Phase 1 W2).
- `apps/mobile/app/index.tsx` -- Auth-aware routing: redirects to `/login`, `/profile-setup`, or `/(app)/(home)` based on auth state. First runtime use of `@jits/shared/types/database` and `@jits/shared/constants` from mobile (resolves Phase 1 W4).
- `apps/mobile/app/(auth)/login.tsx`, `signup.tsx`, `forgot-password.tsx` -- Replace B3 stubs with email/password forms wired to AuthProvider. Use UI primitives (Card, Input, Label, Button) and Toaster for errors. Inline validation, loading states, KeyboardAvoidingView. OAuth deferred.
- `apps/mobile/app/profile-setup.tsx` -- Replace B3 stub with multi-step setup wizard. Step 1: TOS acceptance writes to `waiver_acknowledgements`. Step 2: identity/training/optional sub-steps with display_name, gender, DOB, weight, primary gym (picker) or free agent toggle, city. Calls `refreshAthlete()` after activation, then redirects to `/`.
- Moved `apps/web/lib/tos-content.ts` to `packages/shared/src/utils/tos-content.ts` for use by both web and mobile setup flows. Web import path updated to `@jits/shared/utils`.

### Beta Hardening Pass (2026-04-23)

**Added**
- `app/(app)/settings/help/page.tsx` -- Static FAQ page at `/settings/help` with 6 common questions covering sessions, ELO, match types, results, weight, and issue reporting. Uses native `<details>` elements with support contact section.
- `app/(app)/settings/feedback/page.tsx` + `feedback-form.tsx` -- Real feedback form replacing placeholder. Client component with category selector (Bug Report, Feature Request, General Feedback), textarea with character counter, Supabase insert, success/error states.

**Changed**
- `app/(app)/leaderboard/page.tsx` -- Adds `highest_elo` to query, computes real `eloTrend` per athlete (up/down/neutral based on current vs peak ELO); zero new RPC calls.
- `app/(app)/leaderboard/leaderboard-content.tsx` -- Passes computed `eloTrend` through to `AthleteCard`.
- `components/domain/athlete-card.tsx` -- Renders `TrendingUp`, `TrendingDown`, or `Minus` icon next to ELO value using semantic color tokens.

**Fixed**
- `lib/api/queries.ts` -- All 12 query functions now check for Supabase errors, log via `console.error`, and return safe fallbacks (`null`, `[]`, `new Map()`, or `false`). Previously errors were silently swallowed.
- `lib/api/chat-queries.ts` -- Same fix for `getConversations`, `getUnreadCounts`, and `getMessages`.

**Removed**
- `messagesEnabled` flag from `lib/feature-flags.ts` -- never checked anywhere in codebase
- `hooks/use-feature-flag.ts` -- unused hook wrapper; flags accessed via `getFlag()` directly

### Claude Design Prep + EloRated Rebrand (2026-04-20)

**Added**
- `DESIGN.md` -- Design system reference for Claude Design onboarding: brand identity (EloRated), color token usage rules, full component inventory (15 shadcn primitives, 29 domain components, 5 layout components), interaction patterns, and layout constraints
- `public/logo.svg` -- Geometric E icon mark with ascending bars (rising ELO chart) and gold peak accent. Brand red container, white letterform, gold step. Three colors, ~700 bytes.

### Conversational Design Feedback Tool (2026-04-17)

**Added**
- `specs/visual-review/feedback-server.mjs` -- Zero-dependency Node bridge server (port 3847) that proxies between the browser-based screen inventory and Claude CLI. Endpoints: `POST /api/chat` (SSE-streamed Claude responses via `--output-format stream-json --include-partial-messages`), `GET /api/diff` (git diff of Claude's changes), `POST /api/accept` (selective git commit), `POST /api/reject` (selective file revert using pre-chat snapshot), `POST /api/cancel` (kill active process), `GET /api/status` (busy/idle state). Serves static files from `specs/visual-review/` so the HTML works at `http://localhost:3847/`. Multi-turn conversations via `--session-id` + `--resume`. Snapshot-based revert only touches files Claude changed (not pre-existing uncommitted work).

**Changed**
- `specs/visual-review/feedback-server.mjs` -- Rewrote stream-json parser to handle `stream_event` wrapper format (content_block_delta for incremental text, content_block_start for tool_use). Added stdout line buffer to fix JSON splitting across chunk boundaries. Added `--include-partial-messages` for real token-by-token streaming. Safety: accept/reject guarded during active Claude process (409); snapshot preserved across multi-turn (only taken when no pending changes); getDirtyFiles includes staged files; reject unstages before reverting; per-file try/catch in unlinkSync.
- `specs/visual-review/screen-inventory.html` -- Styled error messages (red block instead of inline text), cost/duration footer after responses, friendly 409 busy message, better tool_use display ("Editing file..." / "Reading file...").
- `specs/visual-review/screen-inventory.html` -- Reconstructed 19-screen wireframe inventory with v2 feedback overlay: chat panel with threaded messages, streaming text display, inline diff preview (colored unified diff), Accept/Reject buttons per response, pin status badges (open/accepted/rejected), server connection indicator with 10s polling, graceful offline fallback to static pin editing. Data model v2 adds `status`, `sessionId`, `messages[]` per pin with backward-compatible migration from v1 `text` field. Enter to send, Shift+Enter for newline, auto-scroll, cancel button.
- `specs/visual-review/apply-feedback.mjs` -- Updated CLI: launcher mode (no args) starts the bridge server + opens browser; legacy CLI mode preserved for batch processing exported JSON files.

### Screen Inventory Updates (2026-04-15)

**Changed**
- `specs/visual-review/screen-inventory.html` -- Match flow routes (screens 10-17) updated from `/match/[id]/*` to `/session/[id]/match/[matchId] (step: <name>)`. Session Lobby header changed to "Session Lobby", removed planned-but-unshipped timer bar and Timekeeper button. Dashboard "Pending Challenges" renamed to "Recent Activity". Bottom nav corrected across all wireframes (Home/Gyms/Rankings/Profile). Gym Detail notes flag shipped vs planned components.

### UX/UI Full-Pass Review (2026-04-13)

Three-team review (PM + design + implementation). 14 ship-now items plus 6 design decisions.

**Added**
- `components/domain/session-unavailable.tsx` — shared "session not available" UI with `reason?: "not-found" | "ended"`
- `app/profile/setup/setup-wizard.tsx` — multi-step profile-setup stepper (replaces single `setup-form.tsx`)
- `app/profile/setup/wizard-progress.tsx` — reusable dot-progress indicator matching join-wizard pattern
- `app/profile/setup/use-setup-submit.ts` — hook extracting TOS accept + submit logic
- `app/profile/setup/steps/identity-step.tsx`, `training-step.tsx`, `optional-step.tsx`
- Match timer end-of-round signals in `fighter-live-step.tsx`: 800Hz/300ms Web Audio beep, `navigator.vibrate([200,100,200])`, and a visual pulse (`.animate-timer-expired` keyframe in `globals.css`). Single-fire guard via ref, respects `prefers-reduced-motion`.
- `sr-only` `aria-live="polite"` regions in lobby (participant join/leave, challenge received) and match (paused/resumed/expired)
- `role="progressbar"` + `aria-value*` + "Step X of Y — {name}" caption on join-wizard and setup-wizard progress dots
- Back button on join-wizard steps 2+ and setup-wizard steps 2+
- `isCheckedIn` field on `ActiveSessionInfo` (extends `getActiveSession` with a light `session_participants` existence check for RSVP path)

**Changed**
- `app/globals.css` — `--success` light-mode lightness `42% → 37%` for WCAG AA contrast on `--background`; added `@keyframes timer-expired-pulse` under `prefers-reduced-motion: no-preference`
- CLAUDE.md Principle 9 — inline win/loss text now recommends `text-success` / `text-destructive` tokens (was `text-green-500` / `text-red-500`)
- Inline W/L/ELO stat text switched to `text-success` / `text-destructive` tokens across 15+ domain components (match-card, elo-badge, athlete-card, profile-header, stat-overview, challenge-sheet, challenge-response-sheet, compare-stats-modal, session-challenge-sheet, match-history-list, stats-tabs, editable-profile-header, match-summary-step)
- `components/domain/challenge-badge.tsx` — added `dark:text-amber-400 dark:bg-amber-500/15` for dark-mode contrast
- `app/(app)/profile/stats/elo-sparkline.tsx` — hardcoded RGB stroke/fill replaced with `hsl(var(--success))` / `hsl(var(--destructive))`
- `app/(app)/session/[id]/join/steps/weight-confirm-step.tsx` — added `<Label htmlFor="weight">`, `id="weight"`, `inputMode="decimal"`, `autoComplete="off"`; heading now "Confirm your weight (lbs)"
- `app/(app)/session/[id]/join/steps/waiver-step.tsx` — loading label "Signing..." → "Accepting..."
- `app/(app)/session/[id]/join/steps/geo-check-step.tsx` — "Continue anyway" → "Continue"; softer explanatory copy for out-of-geo/denied cases
- `app/(app)/session/[id]/match/[matchId]/steps/result-recording-step.tsx` — "Submit Result" → "Record Result"; 60s timekeeper lock shows live countdown ("Waiting for timekeeper... {n}s")
- `app/(app)/session/[id]/match/[matchId]/steps/ready-check-step.tsx` — added subtitle "Both athletes must tap Ready to start."
- `components/domain/recent-activity-section.tsx` — dead `/arena` empty-state link replaced with `/gyms` ("Find a session")
- `components/domain/active-session-card.tsx` — primary button now shows "Check In" (→ `/session/{id}/join`) when `!isCheckedIn`, else "Go to Lobby" (→ `/session/{id}/lobby`)
- `app/(app)/leaderboard/leaderboard-content.tsx` — gender filter and mode toggle now URL-backed via `useSearchParams`; defaults stripped from URL; preserved other params
- `app/(app)/session/[id]/lobby/session-challenge-sheet.tsx` — stake rows get `aria-label="Win/Draw/Loss: ±N ELO"` and icons get `aria-hidden`
- `app/(app)/session/[id]/lobby/session-lobby-content.tsx` — silent redirect on missing session replaced with `<SessionUnavailable reason="not-found" />`; existing ended branch reuses the component
- `app/(app)/session/[id]/join/join-content.tsx` — `notFound()` replaced with `<SessionUnavailable reason="not-found" />` for friendlier messaging
- `lib/api/queries.ts` — `getActiveSession` returns `isCheckedIn`; `types/session.ts` `ActiveSessionInfo` extended
- `hooks/use-session-lobby-realtime.ts` — emits `announcement` state for aria-live consumers
- Auth forms (`login-form.tsx`, `sign-up-form.tsx`, `forgot-password-form.tsx`) — added `autoComplete` (`email`, `current-password`, `new-password`)

**Removed**
- `app/profile/setup/setup-form.tsx` — superseded by `setup-wizard.tsx`

### Phase 9: Leaderboard Updates (2026-04-13)

**Added**
- Gender filter pills (All/Male/Female) on leaderboard for client-side athlete filtering
- `eloTrend` prop on `AthleteCard` for ELO trend indicators (hardcoded neutral for now)

**Changed**
- Leaderboard data fetch now includes `gender` column from athletes table
- `AthleteCard` ELO display updated to support inline trend icon

### Phase 10: Settings and Profile (2026-04-13)

**Added**
- Video Settings stub page at `app/(app)/settings/video/page.tsx`
- Feedback stub page at `app/(app)/settings/feedback/page.tsx`
- Help & Support stub page at `app/(app)/settings/help/page.tsx`
- Settings "General" section with navigation links to Video, Feedback, and Help pages

**Note**
- City display and editing in profile header was already implemented in Phase 1
- City is already included in `ATHLETE_GUARD_SELECT` from Phase 1

### Phase 7-8: Confirmation/Dispute + Dashboard Cleanup (2026-04-13)

**Added**
- "Sessions" section header with Calendar icon on dashboard

**Changed**
- Dashboard `ActiveSessionCard` now wrapped in styled section matching other dashboard sections

**Note**
- `confirmMatchResult`, `disputeMatchResult` mutations and `ALREADY_CONFIRMED`/`ALREADY_DISPUTED` error codes were already implemented in Phase 6
- `ActiveSessionCard` and `getActiveSession` were already implemented in Phase 3
- Challenge sections were already removed in Phase 2

### Phase 6: Session Match Flow (2026-04-12)

**Added**
- Match flow wizard at `/session/[id]/match/[matchId]` with 8-step state machine (`app/(app)/session/[id]/match/[matchId]/`)
- Timer hook (`hooks/use-session-match-timer.ts`) with pause/resume awareness and broadcast sync
- Match sync hook (`hooks/use-session-match-sync.ts`) for 7 broadcast events (timer, ready, result, confirm)
- Video recorder hook (`hooks/use-video-recorder.ts`) with MediaRecorder, codec negotiation, Supabase Storage upload
- 8 step components: timekeeper-wait, weight-verify, ready-check, fighter-live, timekeeper-live, result-recording, match-summary, match-recorded
- 5 mutations: `pauseMatch`, `resumeMatch`, `endMatch`, `confirmMatchResult`, `disputeMatchResult`
- 3 error codes: `MATCH_NOT_PAUSED`, `ALREADY_CONFIRMED`, `ALREADY_DISPUTED`
- Dual confirmation flow with Postgres Changes auto-advance on both-confirm
- Timekeeper disconnect fallback (60s timeout) in result recording

**Changed**
- `lib/api/queries.ts` extended `MatchDetails` with session fields (`session_id`, `paused_at`, `total_paused_duration`, `timekeeper_id`)

### Phase 5: Session Lobby (2026-04-12)

**Added**
- Session lobby page at `/session/[id]/lobby` with real-time participant list (`app/(app)/session/[id]/lobby/`)
- Realtime hook (`hooks/use-session-lobby-realtime.ts`) with Postgres Changes (participant INSERT/UPDATE/DELETE) and Broadcast (ephemeral challenges, match_started, participant_joined)
- Participant card with avatar, ELO, weight, and challenge button (`participant-card.tsx`)
- In-session challenge sheet with match type toggle and ELO stakes preview (`session-challenge-sheet.tsx`)
- Incoming challenge sheet with accept/decline (`session-challenge-received-sheet.tsx`)
- Random match button calling `random_match` RPC (`random-match-button.tsx`)
- `getSessionLobbyData` query wrapping `get_session_lobby` RPC
- `createInSessionMatch`, `leaveSessionLobby`, `requestRandomMatch` mutations
- Broadcast of `participant_joined` from join wizard confirm step for real-time lobby updates

**Changed**
- `types/session.ts` extended `SessionLobbyData` with `gymName` and `status` fields
- `app/(app)/session/[id]/join/confirm-step.tsx` now broadcasts participant info on join

### Phase 4: Session Lobby Entry (Join Wizard) (2026-04-12)

**Added**
- Session join wizard at `/session/[id]/join` with 4 steps: geo check, waiver, weight confirm, lobby entry (`app/(app)/session/[id]/join/`)
- Geo check step with soft location validation using Haversine formula (`steps/geo-check-step.tsx`)
- Waiver signing step with scrollable text and checkbox (`steps/waiver-step.tsx`)
- Weight confirmation step pre-filled from athlete profile (`steps/weight-confirm-step.tsx`)
- Confirm and join step with session summary and lobby entry (`steps/confirm-step.tsx`)
- `requireSessionParticipant` guard in `lib/guards.ts` for lobby page access control
- `getSessionForJoin` query in `lib/api/queries.ts` for fetching session, gym coords, waiver status, and athlete weight
- `joinSessionLobby` and `acceptSessionWaiver` mutations in `lib/api/mutations.ts`
- Context-aware unique constraint mapping in `lib/api/errors.ts` for `session_join` context

### Phase 3: Gym Finder, Sessions & Dashboard Card (2026-04-12)

**Added**
- Gym Finder page at `/gyms` with search and session indicators (`app/(app)/gyms/`)
- Gym Detail page at `/gyms/[id]` with session list and RSVP (`app/(app)/gyms/[id]/`)
- Session card domain component (`components/domain/session-card.tsx`)
- Gym card domain component (`components/domain/gym-card.tsx`)
- Active session card on dashboard (`components/domain/active-session-card.tsx`)
- "Start Session" button for gym members (prototype testing)
- Session types (`types/session.ts`)
- Session queries: `getGymsWithSessions`, `getGymDetail`, `getActiveSession` (`lib/api/queries.ts`)
- Session mutations: `rsvpToSession`, `cancelRsvp`, `createSession` (`lib/api/mutations.ts`)
- Session error codes in `lib/api/errors.ts`: `SESSION_NOT_FOUND`, `SESSION_FULL`, `ALREADY_JOINED`, `SESSION_NOT_ACTIVE`, `NOT_SESSION_PARTICIPANT`, `WAIVER_REQUIRED`

**Changed**
- Dashboard: replaced Challenges section with Active Session card

### Phase 2: Navigation and hidden features (2026-04-12)

**Added**
- `lib/feature-flags.ts` — Hardcoded feature flag utility with `getFlag()` and `FeatureFlag` type. Initial flags: `timekeeperEnabled`, `messagesEnabled` (both false).
- `hooks/use-feature-flag.ts` — Client hook wrapper for `getFlag()`.
- `app/(app)/gyms/page.tsx` — Placeholder Gyms page ("Coming soon") for bottom nav link.

**Changed**
- `components/layout/bottom-nav-bar.tsx` — Replaced 5-tab nav with 4 tabs: Home, Gyms (MapPin icon), Rankings, Profile. Removed Messages tab, unread badge, and `useUnreadCount` hook. Updated `HIDE_PATTERNS` for session sub-routes.
- `components/layout/bottom-nav-bar.test.tsx` — Updated tests for new 4-tab configuration.
- `app/(app)/page.tsx` — Removed Challenges section from dashboard. Updated HeroSubtitle CTA: "/arena" to "/gyms", "Start looking for matches" to "Find a session", Swords icon to MapPin.
- `app/(app)/arena/page.tsx` — Added `redirect("/")` to hide route.
- `app/(app)/arena/swipe/page.tsx` — Added `redirect("/")` to hide route.
- `app/(app)/match/pending/pending-challenges-content.tsx` — Added `redirect("/")` to hide route.
- `app/(app)/match/lobby/[id]/lobby-content.tsx` — Added `redirect("/")` to hide route.
- `app/(app)/athlete/[id]/challenges/challenges-content.tsx` — Added `redirect("/")` to hide route.

### Phase 1: Registration and onboarding updates (2026-04-12)

**Added**
- `app/profile/setup/theme-picker.tsx` — Extracted theme picker into standalone client component (~40 lines).
- `app/profile/setup/tos-step.tsx` — Terms of Service acceptance step with scrollable text, checkbox, and continue button.
- `lib/tos-content.ts` — Placeholder TOS text constant covering risk acknowledgement, liability release, facility rules, health/insurance, and code of conduct.
- Gender (Select, M/F, required), Date of Birth (date input, required, age >= 16), and City (text, optional) fields added to setup form.
- TOS acceptance stored via `waiver_acknowledgements` table (waiver slug `app-liability-v1`); setup form is now a two-step wizard (TOS first, then profile fields).
- City field added to `EditableProfileHeader` with inline edit support (new `CityField` sub-component).

**Changed**
- `app/profile/setup/setup-form.tsx` — Replaced inline theme grid with `<ThemePicker />` import; added gender/DOB/city state, validation, and Supabase payload fields; added TOS step state. TOS insert has error handling with retry support.
- `app/profile/setup/page.tsx` — Fetches `gender`, `date_of_birth`, `city` from athlete record; queries `waivers` and `waiver_acknowledgements` for TOS status; passes new props to `SetupForm`.
- `lib/guards.ts` — Added `gender`, `date_of_birth`, `city` to `ATHLETE_GUARD_SELECT`.
- `types/database.ts` — Updated generated types to include `gender`, `date_of_birth`, `city` on athletes table, plus `waivers`, `waiver_acknowledgements`, and other new tables from Phase 0 migrations.
- `components/profile/editable-profile-header.tsx` — Added `city` to athlete prop Pick type, `EditingField` union, cancel/save logic, and render tree. Note: component is now ~430 lines (tech debt, already tracked).

### Code quality audit fixes (2026-03-06)

**Fixed**
- `components/domain/conversation-card.tsx` — Unread timestamp used `text-primary` (brand color); changed to `text-foreground` per color token conventions.
- `lib/api/mutations.ts` — `createChallenge()` had unsafe `.data!` non-null assertion on `auth_athlete_id` RPC; replaced with proper null check and early error return.
- `app/(app)/arena/looking-for-match-toggle.tsx` — Used raw `supabase.from("athletes").update()` instead of `toggleMatchPreferences()` mutation from API layer; now uses mutation with optimistic rollback on failure.

### Arena toggle defaults to both match types (2026-02-21)

**Changed**
- `app/(app)/arena/looking-for-match-toggle.tsx` — "Looking for Match" toggle now enables both Casual and Ranked by default (was Casual only).

### Version label on profile (2026-02-21)

**Added**
- `package.json` — Added `name` ("jits-web") and `version` ("0.1.0") fields.
- `app/(app)/profile/profile-content.tsx` — Small "JITS v0.1.0" label at bottom of profile page.

### Backend integration: get_match_details RPC, challenge expiration, canCreateChallenge (2026-02-20)

**Changed**
- `types/database.ts` — Regenerated to include `get_match_details` RPC from BE migration.
- `lib/api/queries.ts` — `getMatchDetails()` now uses single `get_match_details` RPC call instead of two-query workaround (match + challenge join with JS merge). Same return type, no consumer changes needed.
- `hooks/use-global-notifications.ts` — Added "Challenge Expired" toast notifications for both challenger (`challenger_id` filter) and opponent (`opponent_id` filter) when pg_cron auto-expires challenges.
- `components/domain/challenge-sheet.tsx` — ChallengeSheet now validates `canCreateChallenge(opponentId)` when opened; shows loading spinner, then error state if at 3-challenge limit or opponent unavailable.

**Fixed**
- `app/(app)/match/[id]/live/match-timer.tsx` — Removed `remaining` from timer interval effect deps; was tearing down and re-creating the interval every second instead of once.
- `app/(app)/match/lobby/[id]/lobby-actions.tsx` — Weight validation uses `isNaN()` instead of falsy check; Decline button now shows spinner instead of "...".
- `components/domain/challenge-sheet.tsx` — Weight validation uses `isNaN()` instead of falsy check; `canCreateChallenge` async call now uses cleanup flag to prevent state update after unmount.
- `hooks/use-global-notifications.ts` — `resolveSender()` no longer caches failed athlete lookups (prevents permanently showing "Someone").

### Push notifications — device registration, service worker, preferences UI (2026-02-20)

**Added**
- `public/sw.js` — Service worker for Web Push notifications (push event → showNotification, notificationclick → navigate to challenge/chat/match).
- `hooks/use-push-registration.ts` — Hook that registers the service worker and subscribes to Web Push on app launch. Silently no-ops if push isn't supported or VAPID key is missing.
- `components/layout/push-registration-bootstrap.tsx` — Side-effect bootstrap component mounted in app layout to trigger push registration.
- `app/(app)/settings/page.tsx` — New settings page with back navigation.
- `app/(app)/settings/settings-content.tsx` — Server component that fetches notification preferences.
- `app/(app)/settings/notification-preferences.tsx` — Client component with three Switch toggles for challenge/chat/match notification preferences.
- `lib/api/mutations.ts` — `registerPushDevice()`, `removePushDevice()`, `getNotificationPreferences()`, `updateNotificationPreferences()` mutations for push subscriptions and notification preferences tables.
- `types/push-subscription.ts` — Type aliases for `PushSubscription`, `PushSubscriptionInsert`.
- `types/notification-preference.ts` — Type aliases for `NotificationPreference`, `NotificationPreferenceUpdate`.

**Changed**
- `types/database.ts` — Regenerated to include `push_subscriptions` and `notification_preferences` tables from BE migration 010.
- `app/(app)/layout.tsx` — Added `PushBootstrap` Suspense wrapper alongside existing bootstrap components.
- `app/(app)/profile/profile-content.tsx` — "Settings & Privacy" button now links to `/settings` (was a dead button).

### Skeleton loading states, guard optimization, realtime optimization (2026-02-19)

**Changed**
- `app/(app)/match/[id]/live/page.tsx` — Replaced generic inline skeleton with named `LiveMatchSkeleton` component matching actual page layout (name vs name text, badge, timer, button).
- `app/(app)/match/[id]/results/page.tsx` — Replaced generic inline skeleton with named `ResultsSkeleton` component matching results card layout (heading, participant rows with avatars/badges, action buttons).
- `app/(app)/match/lobby/[id]/page.tsx` — Replaced generic inline skeleton with named `LobbySkeleton` component matching VS header layout (two athlete columns with avatars/ELO, badge, stakes card, action buttons).
- `app/(app)/match/pending/page.tsx` — Replaced generic `PendingChallengesSkeleton` with layout-accurate version (header, tabs bar, challenge cards with avatar/name/badge, info card).
- `lib/guards.ts` — `requireAthlete()` and `getActiveAthlete()` now use explicit column select (12 columns) instead of `select("*")` (15 columns), reducing payload on every authenticated page load. Excludes unused `created_at`, `push_token`, and `role`.
- `components/domain/stat-overview.tsx` — Props type narrowed from `Athlete` to `Pick<Athlete, "current_elo" | "highest_elo">` to match guard's explicit select.
- `components/profile/editable-profile-header.tsx` — Props type narrowed from `Athlete` to `Pick<Athlete, ...>` (7 fields) to match guard's explicit select.
- `hooks/use-pending-challenges.ts` — Replaced full-refetch-on-every-event with optimistic state patching: INSERT appends new challenge to state (with lightweight name lookup), UPDATE removes non-pending challenges. Full refetch only on initial mount.

### UI: dashboard challenges section + achievements card restyle (2026-02-19)

**Changed**
- `app/(app)/profile/achievements-section.tsx` — Restyled achievement cards to match dashboard stat-overview layout: icon circle floats top-right, label/value stacked vertically on the left, larger text sizing.
- `app/(app)/page.tsx` — Challenges section header is now a tappable link to pending page with chevron, count badge next to title, limited to 3 visible cards with "+N more" overflow link.

### Fix: match results — winner names + auto-fill finish time (2026-02-19)

**Fixed**
- `lib/api/queries.ts` — `getMatchDetails()` FK join `athletes!fk_participants_athlete` returns an object (many-to-one), not an array. Was doing `[0]` on an object which returned `undefined`, causing both participants to show as "Unknown" in the winner dropdown.

**Added**
- `app/(app)/match/[id]/results/results-content.tsx` — Computes elapsed seconds from `match.started_at` and passes to form as default finish time.
- `app/(app)/match/[id]/results/record-result-form.tsx` — Accepts `elapsedSeconds` prop, initializes `finishTime` state with it.
- `app/(app)/match/[id]/results/submission-fields.tsx` — Accepts `defaultElapsedSeconds` prop, pre-fills min/sec inputs from elapsed match time.

### Fix: Start Match RPC response mismatch (2026-02-19)

**Fixed**
- `lib/api/mutations.ts` — `startMatchFromChallenge()` no longer checks for a `success` field that the backend RPC doesn't return. The RPC returns match data directly; errors come as PostgreSQL exceptions (already handled). This was causing every successful "Start Match" click to show "Unknown error".
- `types/composites.ts` — `StartMatchResponse` fields updated from optional to required, removed phantom `success`/`error` fields to match actual backend contract.
- `app/(app)/match/lobby/[id]/lobby-actions.tsx` — Removed non-null assertion on `match_id` (now typed as required).
- `lib/api/errors.ts` — `mapPostgrestError()` now maps `P0001` business logic errors using `error.hint` (e.g. `not_participant`, `invalid_status`) to clean domain error messages instead of falling through to "Unknown error".

### Cleanup: match flow & chat tech debt (2026-02-19)

**Fixed**
- `hooks/use-chat-channel.ts` — Copied `typingTimers.current` to local variable in cleanup to fix React lint warning about stale ref values.
- `app/(app)/match/lobby/[id]/lobby-actions.tsx` — `handleCancel` now checks mutation result and shows errors instead of fire-and-forget navigation.
- `lib/api/mutations.ts` — Removed dead `!response.success` checks from `startMatch()` and `recordMatchResult()` (errors come as PostgreSQL exceptions, not response bodies). Removed unused `mapRpcError` import.

**Changed**
- `lib/utils.ts` — Added `formatRelativeTime()` (minute/hour granularity: "now", "5m", "3h", "2d", "Jan 15") extracted from `conversation-card.tsx`.
- `components/domain/conversation-card.tsx` — Now imports `formatRelativeTime` from `lib/utils` instead of defining its own copy.

### Dashboard Query Consolidation + Dead Code Cleanup (2026-02-18)

**Changed**
- `app/(app)/page.tsx` — Dashboard now uses a single `get_dashboard_summary` RPC call instead of 3-4 separate queries. Accepted challenges, pending challenge photos, and platform-wide recent activity are all included in the RPC response.
- `types/composites.ts` — Extended `DashboardSummary` type with `accepted_challenges`, `recent_activity`, and photo URL fields on pending challenges.

**Backend dependency**
- `get_dashboard_summary` RPC extended (backend migration `20260218100000_dashboard_summary_v2`) to include accepted challenges, platform-wide recent activity, and profile photo URLs on pending challenges. Deploy backend before this frontend.

**Removed**
- `lib/api/queries.ts` — Removed 5 dead functions superseded by RPCs: `getAthleteProfile()`, `getAthleteStats()`, `getLeaderboard()`, `getAthleteRank()` (all used direct `match_participants` queries blocked by RLS), and `getRecentActivity()` (now embedded in dashboard summary). Also removed `ATHLETE_WITH_GYM_SELECT`, `AthleteWithGym`, `AthleteProfile` types.
- `lib/utils.ts` — Removed `computeStats()` and `computeWinStreak()` (only used by the dead query functions; stats are now computed server-side by RPCs).
- `lib/utils.test.ts` — Removed test blocks for `computeStats` and `computeWinStreak`.

### Challenge → Match Flow Fixes (2026-02-18)

**Fixed**
- `components/domain/challenge-response-sheet.tsx` — Broadcast `challenge_accepted` to `lobby:{challengeId}` channel after acceptance so the challenger's lobby page auto-refreshes.
- `components/domain/challenge-sheet.tsx` — Replaced raw `supabase.from("challenges").insert()` with `createChallenge()` mutation. Removes `currentAthleteId` prop (mutation derives it from auth). Error messages now go through domain error mapping.
- `app/(app)/match/pending/sent-challenges-list.tsx` — Replaced raw `supabase.from("challenges").update()` with `cancelChallenge()` mutation for consistent error handling.
- `app/(app)/match/[id]/live/match-timer.tsx` — Timer broadcast now uses `started_at` from `start_match()` RPC response (server clock) instead of client `new Date()`, preventing timer desync between devices.
- `types/composites.ts` — Added `started_at` field to `StartMatchTimerResponse` interface.

**Changed**
- `app/(app)/athlete/[id]/athlete-profile-actions.tsx` — Removed `currentAthleteId` prop from `ChallengeSheet` call site.

### Prototype-to-Production Guide (2026-02-18)

**Added**
- `research/010-prototype-to-production-guide.md` — Comprehensive guide documenting how the JITS Arena project was built from a Figma Make prototype + Supabase backend in 5 days. Covers project setup, governance layer, Figma audit workflow, 6-phase build cycle, Claude Code prompt patterns, cross-repo coordination, and branching strategy.

### Challenge → Match Flow Bug Spec (2026-02-18)

**Added**
- `specs/challenge-match-flow-fixes.md` — E2E flow analysis documenting 4 bugs: missing lobby broadcast on accept, ChallengeSheet/SentChallengesList bypassing mutations layer, timer client-vs-server timestamp desync. Includes exact file locations, prescribed fixes, and manual test scenario.

### PWA Safe Area Fix (2026-02-18)

**Fixed**
- `components/layout/app-header.tsx` — Added `pt-[env(safe-area-inset-top)]` so the header clears the status bar/notch in standalone PWA mode (Add to Home Screen).

### Demo Video Recording System (2026-02-18)

**Added**
- `demo/record.ts` — Playwright test orchestrator that records 12 per-scene video clips with per-scene browser contexts (no dead time between scenes).
- `demo/scenes/01-login.ts` through `demo/scenes/12-profile.ts` — 12 scene scripts covering login, dashboard, arena, swipe, athlete profile, send/accept challenge, live match, record results, leaderboard, messages, and profile.
- `demo/scenes/types.ts` — Scene interface with `shouldRun` pre-check gates and `skipAuth` for login scene.
- `demo/helpers/auth.ts` — `saveAuthState()` for off-screen auth capture, `createSceneContext()` for per-scene video-recording contexts.
- `demo/helpers/nav.ts` — `navigateTo()` and `tapNavItem()` with `waitUntil: "commit"` to handle Next.js streaming.
- `demo/helpers/pause.ts` — Speed-adjustable pause system (`DEMO_SPEED` multiplier) with per-type overrides.
- `demo/playwright.config.ts` — iPhone 14 viewport (390x844, 3x scale), loads `.env.demo` manually.
- `demo/post-process.sh` — Docker-based ffmpeg pipeline (`jrottenberg/ffmpeg:5-alpine`) for webm-to-mp4 conversion, concatenation, and side-by-side dual-account clips.
- `.env.demo.example` — Template for demo account credentials and speed settings.
- `package.json` — Added `demo:record` and `demo:process` scripts.
- `.gitignore` — Added `.env.demo` and `demo/output/` exclusions.

### Stat Cards Redesign (2026-02-17)

**Changed**
- `components/domain/stat-overview.tsx` — Moved icons into the decorative corner circles (top-right), promoted labels to standalone left-aligned `text-sm`, and added subtle 70% opacity to icons for a cleaner look.

### SSO Avatar Support (2026-02-17)

**Changed**
- `lib/utils.ts` — `getProfilePhotoUrl()` now handles absolute URLs (SSO avatars from Google/Apple) in addition to relative Supabase storage paths. Absolute URLs are returned as-is; relative paths still resolve from the `athlete-photos` bucket.

### Premium Features Teaser (2026-02-17)

**Added**
- `components/domain/premium-features-modal.tsx` — Gold gem icon button that opens a "Coming Soon" modal showcasing future premium features (Video Analysis, ELO Tournaments, Advanced Analytics, Gym Leaderboards, AI Match Insights).
- `components/layout/page-header-actions.tsx` — Premium button added to header alongside notification bell on all main nav pages.

### Dynamic Dashboard Hero Subtitle (2026-02-17)

**Changed**
- `app/(app)/page.tsx` — Hero subtitle is now context-aware: shows pulsing green "Looking for Ranked/Casual matches" when active, or a tappable CTA banner linking to Arena when not looking. Removed `bg-gradient-hero` background.

### Modernize UI/UX Design (2026-02-17)

**Changed**
- **Theme refresh** (`app/globals.css`) — Warmer color palette with blue-tinted dark mode (was pure black). Richer borders using proper HSL values instead of alpha-channel opacity. Increased default border radius from `0.5rem` to `0.75rem` for softer, rounder feel.
- **New animations** (`tailwind.config.ts`) — Added `scale-in`, `slide-up-fade`, `shimmer`, and `glow-pulse` keyframes. Stagger animation support for child elements via `.stagger-children` class.
- **Floating bottom nav** (`components/layout/bottom-nav-bar.tsx`) — Floating pill-style navigation with rounded corners, card-style glass background, and active tab indicator with icon highlight bubble. Increased bottom margin for "floating" effect.
- **Glass header** (`components/layout/app-header.tsx`) — Softer backdrop blur with semi-transparent border for modern frosted glass look.
- **Card component** (`components/ui/card.tsx`) — Cards now use `rounded-2xl` globally. Added `glass` variant for frosted glass cards. `interactive` variant uses `shadow-card-hover` on hover instead of accent background. Added `shadow-card` base utility for consistent elevation.
- **Stat overview cards** (`components/domain/stat-overview.tsx`) — Each stat card gets a colored icon pill (rounded-lg with tinted background), decorative background circle element, and staggered entry animation.
- **Profile header** (`components/domain/profile-header.tsx`) — Stats section uses colored tinted backgrounds (green for wins, red for losses) with rounded-2xl pill containers. Wider avatar outline offset, larger looking-for pulse dot, improved spacing.
- **Athlete card** (`components/domain/athlete-card.tsx`) — Colorized W/L record display (green wins, red losses with dot separator). "You" badge uses primary-tinted background. Slightly smaller avatar (h-11) for better proportion.
- **Match card** (`components/domain/match-card.tsx`) — Slightly larger avatar (h-9). Badges use `rounded-lg`. Match type text uses `font-medium` for emphasis.
- **Dashboard hero** (`app/(app)/page.tsx`) — Gradient hero greeting section with `text-gradient-primary` on athlete name and subtitle. Section headers use icon pills (rounded-lg with tinted background).
- **Recent activity** (`components/domain/recent-activity-section.tsx`) — Filter pills have more padding, `shadow-sm` on active state, softer inactive background. Section header uses icon pill. Empty states use `rounded-2xl`.
- **Arena content** (`app/(app)/arena/arena-content.tsx`) — Section headers use colored icon pills. Badges use `rounded-full`. Competitor cards use `border-border` instead of accent.
- **Leaderboard podium** (`app/(app)/leaderboard/leaderboard-content.tsx`) — Podium slots use translucent gradient backgrounds with colored borders instead of opaque gradients. Trophy icons in rounded-2xl containers with glow effects on gold. Toggle labels use `font-medium` with `transition-colors`.
- **Achievements section** (`app/(app)/profile/achievements-section.tsx`) — Each achievement card gets a colored icon pill (rounded-xl, 9x9) with tinted background. Decorative background circle. Section header uses icon pill. Stagger animation on grid.
- **Profile page** (`app/(app)/profile/profile-content.tsx`) — Buttons use `rounded-xl`. Ghost buttons in account section use `rounded-xl`.
- **App layout** (`app/(app)/layout.tsx`) — Background uses `bg-gradient-subtle` for subtle gradient wash.
- **All skeleton loaders** — Updated from `rounded-lg` to `rounded-2xl` to match new card radius.
- **Badge component** (`components/ui/badge.tsx`) — Default border radius changed from `rounded-md` to `rounded-lg`.
- **Page container** (`components/layout/page-container.tsx`) — Bottom padding increased from `5rem` to `6rem` to accommodate floating nav bar.

**Added**
- `bg-gradient-hero` utility — Subtle primary-tinted top gradient for hero sections (light and dark mode variants)
- `bg-gradient-subtle` utility — Vertical gradient wash for page backgrounds
- `text-gradient-primary` utility — Red-to-orange gradient text effect
- `shadow-glow-primary`, `shadow-glow-success`, `shadow-glow-gold` utilities — Colored glow effects for emphasis
- `shadow-card` and `shadow-card-hover` utilities — Consistent card elevation system
- `.glass` component class — Frosted glass card effect with backdrop blur
- `.stagger-children` component class — Auto-staggered fade-in-up animation for child elements (60ms delay per child)

### Challenge Versus Card Navigation (2026-02-17)

**Changed**
- `components/domain/challenge-versus-card.tsx` — Added optional `href` prop; card now wraps in a Link with hover/active feedback when provided.
- `app/(app)/athlete/[id]/challenges/challenges-content.tsx` — Active challenges pass `href` to navigate to lobby on card tap.

### Challenge & Activity UX Improvements (2026-02-17)

**Changed**
- `components/domain/challenge-sheet.tsx` — Challenge sheet now accepts `defaultMatchType` prop and defaults to Ranked when the opponent has `looking_for_ranked` enabled.
- `app/(app)/athlete/[id]/athlete-profile-actions.tsx` — Threads `lookingForRanked` flag to ChallengeSheet.
- `app/(app)/athlete/[id]/athlete-profile-content.tsx` — Passes `competitor.looking_for_ranked` to AthleteProfileActions.
- `components/domain/recent-activity-section.tsx` — Reordered scope filter: "All" is now the default first option instead of "Me".

### Lobby Presence & Unified Challenge Lobby (2026-02-17)

**Added**
- `hooks/use-lobby-presence.ts` — `lobby:online` Supabase Presence channel (tier 2 of two-tier model). External store pattern with `useLobbyStatus(athleteId)`, `useLobbyIds()`, and imperative `joinLobby()`/`leaveLobby()` API for toggle integration without channel teardown.
- `components/layout/lobby-presence-bootstrap.tsx` — Side-effect client component in app layout. Conditionally tracks if `looking_for_casual` or `looking_for_ranked` is true; everyone subscribes to read.
- `components/domain/lobby-active-indicator.tsx` — Pulsing green dot + "Active now" text. Uses `useLobbyStatus()`, renders nothing when athlete is not in lobby.
- `challenge_accepted` broadcast event in `use-lobby-sync.ts` — when opponent accepts a challenge, the challenger's lobby page auto-refreshes to show "Start Match" state.

**Changed**
- `app/(app)/match/lobby/[id]/lobby-actions.tsx` — Rewritten to handle 3 challenge states:
  - **Pending (challenger):** "Waiting for opponent to respond..." with pulsing clock + Cancel button
  - **Pending (opponent):** Weight input + Accept/Decline buttons
  - **Accepted:** Start Match/Cancel buttons (previous behavior)
- `lib/api/queries.ts` — `getLobbyData()` now accepts `pending` and `accepted` challenges (was `accepted` only)
- All challenge card links updated to point to `/match/lobby/[challengeId]` instead of `/athlete/[id]`:
  - `app/(app)/page.tsx` (dashboard pending challenges)
  - `app/(app)/match/pending/received-challenges-list.tsx`
  - `app/(app)/match/pending/sent-challenges-list.tsx`
- `app/(app)/arena/arena-content.tsx` — Removed "Competitors" section. Split `lookingCompetitors` into "Ready to Fight" (online + in lobby) and "Looking for Match" (interested but offline) with descriptive subtitles. Uses `useLobbyIds()` for real-time filtering.
- `app/(app)/arena/looking-for-match-toggle.tsx` — Wired `joinLobby()`/`leaveLobby()` imperative API after DB toggle update.
- `app/(app)/page.tsx` — Dashboard now fetches accepted challenges in parallel and shows them at top of Challenges section with green "Accepted" badge + "Go to Lobby" text.
- `components/domain/match-card.tsx` — Added `variant="success"` badge for accepted status and "Go to Lobby" text below badge.
- `app/(app)/layout.tsx` — Added `LobbyBootstrap` async component in Suspense boundary alongside existing presence bootstrap.

### Profile Photos (2026-02-17)

**Added**
- `components/profile/profile-photo-upload.tsx` — Photo upload component with Supabase storage integration
- Profile photo upload on setup screen (`app/profile/setup/setup-form.tsx`)
- Editable profile photo on Profile tab header (`components/profile/editable-profile-header.tsx`)

### Compare Stats Modal Enhancement (2026-02-16)

**Added**
- Draws row in compare stats modal
- Ranked/Casual filter pills that recompute stats from head-to-head match history

### Arena Weight Display (2026-02-16)

**Changed**
- Arena competitor cards now show weight alongside gym name (e.g., "Gym Name · 185 lbs") using `current_weight` from `get_arena_data` RPC

### Success Color Token (2026-02-16)

**Added**
- `--success` CSS variable (`hsl(145 63% 42%)` light / `hsl(145 63% 49%)` dark)
- `bg-success`/`text-success`/`text-success-foreground` Tailwind tokens
- Badge `variant="success"` for win badges

**Changed**
- Win badges use green (`variant="success"`), loss badges use red (`variant="destructive"`)
- ELO numbers use default foreground (not `text-primary`)

### Match Type Labels (2026-02-16)

**Changed**
- `MatchCard` shows "Ranked"/"Casual" inline with date via `matchType` prop
- All 6 call sites updated: dashboard matches, dashboard challenges, match history, head-to-head, received challenges, sent challenges

### Single-Header Navigation & Profile Redesign (2026-02-16)

**Changed**
- Consolidated app header navigation pattern
- Profile hero section redesigned
- Match history filters added to stats sub-page

### UI Fixes (2026-02-16)

**Fixed**
- Athlete profile action buttons no longer overflow on mobile — Challenge is now full-width primary CTA with Message and Compare side-by-side below
- Gym names showing "Unknown" everywhere — `extractGymName()` now handles PostgREST's to-one FK join shape (single object) instead of incorrectly treating it as an array. Fixes gym leaderboard, arena, and swipe pages.

### Online Presence Indicators (2026-02-16)

**Added**
- `hooks/use-online-presence.ts` — Core Supabase Presence hook for the `app:online` channel. Uses an external store pattern (`useSyncExternalStore`) so any client component can check online status without a React Context provider. Tracks `{ athlete_id, display_name, profile_photo_url }` per the BE contract.
- `components/layout/online-presence-bootstrap.tsx` — Side-effect client component mounted in app layout. Sets up the presence channel on app open (same pattern as `GlobalNotificationsProvider`).
- `components/domain/online-indicator.tsx` — Green dot component. Uses `useOnlineStatus(athleteId)` from the store. Renders nothing when offline, shows an absolutely-positioned green circle when online. Supports `className` override for size variants.
- Online indicators added to 4 avatar locations: leaderboard athlete cards, arena competitor cards, chat conversation list (DMs only), and competitor profile header.

**Changed**
- `app/(app)/layout.tsx` — Added `PresenceBootstrap` async component in a Suspense boundary.
- `CLAUDE.md` — Added Realtime & Presence architecture section documenting the two-tier model, external store pattern, and all realtime hooks.

### Chat UI Polish — Modern Messaging UX (2026-02-16)

**Added**
- **Message grouping** — consecutive messages from the same sender within 2 minutes cluster together with tight spacing (0.5) and larger gaps (12px) between groups, creating a visual conversation rhythm
- **Date separators** — "Today", "Yesterday", weekday names, or "Feb 14" dividers between message groups from different days (`components/domain/date-separator.tsx`)
- **Sender avatars in thread** — received messages show a small avatar (bottom of each group), with initials fallback; group chats also show sender display names above the first message in each group
- **Adaptive bubble corners** — border radius adjusts based on group position (rounded corners flatten where messages connect, matching iMessage/WhatsApp style)
- **"You:" prefix in inbox** — last message preview shows "You: message text" when the current user sent it, using the existing `last_message_sender_id` from the RPC
- **Enhanced thread header** — avatar + name in header bar; taps through to the other athlete's profile page for direct chats; gym chats show a Users icon
- **Unread visual emphasis** — conversations with unread messages show bold name, darker preview text, and primary-colored timestamp
- Participant profiles fetched server-side in thread page (parallel query) for avatar/name data

**Changed**
- `MessageBubble` — new props: `isFirstInGroup`, `isLastInGroup`, `senderName`, `senderPhotoUrl`, `showAvatar`; timestamps only shown on last message in group
- `ChatThread` — extracted `ThreadHeader` and `MessageList` sub-components; receives `participants` map and `conversationType`
- `ConversationCard` — now receives `currentAthleteId` for "You:" prefix; uses `cn()` for conditional unread styling
- Thread page (`messages/[id]/page.tsx`) — fetches all participant profiles in a single query for the participants map

### Step 12: Match Flow — Lobby → Live → Results (2026-02-14)

**Added**
- Match Lobby page (`app/(app)/match/[id]/page.tsx`) — VS screen with both athletes, ELO stakes for ranked, start match via `start_match_from_challenge()` RPC
- Live Match page (`app/(app)/match/[id]/live/page.tsx`) — countdown timer, start/end match controls, `start_match()` RPC for pending → in_progress transition
- Match Results page (`app/(app)/match/[id]/results/page.tsx`) — dual-purpose: records result via `record_match_result()` RPC or displays completed results with ELO changes
- `record-result-client.tsx` — submission type picker (grouped by category), winner selection, finish time from timer
- `results-display.tsx` — victory/defeat/draw display with ELO delta for ranked matches
- `MATCH_STATUS` and `MATCH_RESULT` constants in `lib/constants.ts`
- Unit tests: `lib/constants.test.ts` (9 tests), `results-display.test.tsx` (8 tests), `live-match-client.test.tsx` (9 tests) — 49 total tests now

**Match Flow Lifecycle**
- Challenge accepted → Match Lobby (VS screen + ELO stakes)
- Start Match → creates match via RPC → redirects to Live page
- Live page → Start Timer (pending → in_progress) → countdown → End Match
- End Match → Results page → record submission/draw → ELO updates (ranked only)
- Results display → Back to Arena / Home navigation

### Phase 1 — Safety Net (2026-02-14)

**Added**
- Error boundaries at root (`app/error.tsx`), app (`app/(app)/error.tsx`), and athlete profile (`app/(app)/athlete/error.tsx`) — graceful error UI instead of raw Next.js error page
- Custom 404 pages at root and app levels (`not-found.tsx`)
- Suspense fallback skeletons for Dashboard, Arena, and Leaderboard pages — loading placeholders instead of blank screens
- Pre-alpha codebase audit (`research/006-pre-alpha-codebase-audit.md`)

**Fixed**
- Removed unused `opacity` variable in swipe-discovery-client
- Removed unused `Badge` import in challenge-sheet
- Removed unused `gyms` query in leaderboard page (gym stats already computed from athlete FK joins)
- Excluded `outside_assets/` from ESLint to eliminate 30+ irrelevant warnings

### Phase 2 — Tooling & Test Foundation (2026-02-14)

**Added**
- Unit tests for `lib/utils.ts` — 17 tests covering `getInitials`, `computeStats`, `computeWinStreak`, `extractGymName` (23 total tests now)
- Husky pre-commit hook running `tsc --noEmit`, `eslint`, and `vitest run` on every commit

**Changed**
- Pinned `@supabase/ssr` (^0.8.0), `@supabase/supabase-js` (^2.94.1), and `next` (^16.1.6) — removed `"latest"` tags
- Rewrote E2E smoke tests for auth-aware routes (public pages + redirect assertions instead of guarded pages)
- Playwright config: increased webServer timeout, `reuseExistingServer: true`

**Known Issue**
- Playwright browser launch hangs in current environment — E2E tests need `npx playwright install` and may require system dependencies

### Phase 3 — Type Safety & Data Patterns (2026-02-14)

**Added**
- `lib/constants.ts` — centralized `MATCH_TYPE`, `CHALLENGE_STATUS`, `MATCH_OUTCOME`, `ATHLETE_STATUS` constants with TypeScript types
- `types/composites.ts` — shared FK join shapes (`ChallengerJoin`, `OpponentJoin`, `GymJoin`, `MatchJoin`), `ComputedStats`, and `EloStakes` types

**Changed**
- Replaced `as unknown as Array<...>` casts with proper FK join array types in `pending-challenges-content.tsx` and `athlete-profile-content.tsx`
- Moved gym fetch from client-side `useEffect` in `setup-form.tsx` to server-side in `setup/page.tsx` — gyms now passed as prop
- Challenge sheet and challenge response sheet now use shared `EloStakes` type and `MATCH_TYPE` constants instead of local duplicates
- Match card uses `MATCH_OUTCOME` constants for result config
- Guards use `ATHLETE_STATUS.PENDING` instead of string literal

### Step 1: Layout Shell + Layout Migration (004-plan)

**Added**
- `components/layout/app-header.tsx` — sticky header with title, optional back button, icon, and right action slot
- `components/layout/bottom-nav-bar.tsx` — fixed 4-tab bottom nav (Home / Rankings / Arena / Profile) with active state highlighting
- `components/layout/page-container.tsx` — mobile-width content wrapper (`max-w-md mx-auto px-4 pb-20`)
- `components/layout/header-user-button.tsx` — server component showing user avatar with initials, linked to profile
- `components/ui/avatar.tsx` — installed shadcn avatar primitive
- `app/(app)/profile/profile-content.tsx` — extracted async profile content for Suspense boundary

**Changed**
- `app/(app)/layout.tsx` — replaced desktop nav bar, footer, and `max-w-5xl` container with mobile app shell (app-header + page-container + bottom-nav-bar)
- `app/(app)/profile/page.tsx` — wrapped in Suspense boundary to fix Next.js 16 prerender error; uses `requireAthlete()` guard instead of inline auth check
- `lib/guards.ts` — fixed `requireAthlete()` column name from `user_id` to `auth_user_id` to match database schema

**Removed**
- `EnvVarWarning` from app layout (dev bootstrapping artifact)
- `ThemeSwitcher` from app layout footer (will move to profile settings in Step 4)
- Desktop top nav bar with Home/Challenges/Gyms links (replaced by bottom nav)
- Footer section from app layout

### Test Suite Setup

**Added**
- Vitest configured with React Testing Library and jsdom environment
  - `vitest.config.ts` — path aliases, jsdom, setup file
  - `vitest.setup.ts` — jest-dom matchers
  - `components/layout/bottom-nav-bar.test.tsx` — 3 tests (renders tabs, active state, correct routes)
  - `components/layout/page-container.test.tsx` — 3 tests (renders children, constraint classes, custom className)
- Playwright configured for E2E testing
  - `playwright.config.ts` — chromium + mobile-chrome projects, auto-start dev server
  - `e2e/smoke.spec.ts` — 3 tests (layout shell renders, nav links correct, login form renders)
- npm scripts: `test`, `test:watch`, `test:e2e`, `test:e2e:ui`, `typecheck`

### Constitution Update (v1.0.0 → v1.1.0)

**Added**
- Principle VI: Testing Discipline — Vitest for unit/component, Playwright for E2E, build gates
- Component Architecture subsection in Tech Stack — three-tier layer rules (ui/domain/layout)
- "Database schema management" added to Out of Scope (separate backend repo)

**Changed**
- Principle II: Added component layer table and install-on-demand rules for shadcn
- Principle III: Added `requireAthlete()` guard standardization rule
- Tech Stack table: Updated UI Components entry, added test framework rows
