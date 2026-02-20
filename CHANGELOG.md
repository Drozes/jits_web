# Changelog

## [Unreleased]

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
