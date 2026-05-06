# Next Development Phases (Post-Alpha)

**Date:** 2026-05-06
**Context:** Alpha build is code-complete. First TestFlight/Play Internal Test build is blocked only on account enrollment and provisioning (manual steps).

---

## Phase 6: Gym Manager Onboarding + Seeding

**Goal:** Make it easy for real gyms to get started.

**Scope:**
1. **Admin seed flow** -- script or Supabase dashboard insert to designate first gym manager per gym
2. **Manager invitation** -- gym managers can invite other managers via email/link (new endpoint + UI)
3. **Gym creation** -- gym managers or admins can create new gyms (currently gyms are seed data)
4. **Gym profile editing** -- managers can update gym name, city, description, logo
5. **Session templates** -- save recurring session configs ("Tuesday Open Mat, 6pm, 2h") for one-tap creation

**Backend work (jr_be):**
- `invite_gym_manager(p_gym_id, p_email)` RPC
- `create_gym` RPC or direct INSERT policy for managers
- `gym_templates` table for saved session configs

**Autonomy:** Mostly automatable. Backend migration + frontend UI on both platforms.

---

## Phase 7: Mobile Typography + Polish

**Goal:** Close the "medium" tech debt items before public beta.

**Scope:**
1. **Tailwind font families** -- add `font-display`, `font-heading`, `font-body`, `font-mono` to mobile tailwind.config.js. Replace ~60 raw `font-bold`/`font-semibold` instances with semantic classes.
2. **Themed headers** -- apply `useThemedTokens()` header styles to remaining Stack layouts (`gyms/_layout`, `profile/_layout`, `leaderboard/_layout`, `settings/_layout`).
3. **Component line counts** -- split oversized components: `compare-stats-modal` (184), `match-flow-wizard` (182), `notification-panel` (158), `athlete-card` (145).
4. **Screen line counts** -- split oversized screens: `realtime-test` (389), `leaderboard/index` (330), `athlete/[id]` (297).

**Autonomy:** Fully automatable. Style and refactor work with clear targets.

---

## Phase 8: Test Coverage Expansion

**Goal:** Cover critical user paths before opening to beta users.

**Scope:**
1. **Session join wizard** -- test geo check, waiver, weight validation, confirm flow
2. **Match flow state machine** -- test step-router transitions, edge cases (timeout, disconnect)
3. **Realtime sync hooks** -- test lobby sync, match sync, presence with mock channels
4. **Offline mutation queue** -- test queue persistence, flush on reconnect, error handling
5. **Web E2E expansion** -- Playwright tests for: signup flow, join session, complete match
6. **Auth form extraction** -- deduplicate login/signup/forgot-password (70% shared code), then test once

**Autonomy:** Fully automatable. Testing and refactoring.

---

## Phase 9: Notifications + Social

**Goal:** Drive engagement and retention.

**Scope:**
1. **Push notification channels** -- configurable per-type preferences (match invites, session start, results)
2. **In-app notification center** -- list view of recent notifications with read/unread state
3. **Chat reactivation** -- unhide messaging feature, add mobile implementation
4. **Social sharing** -- share match results, profile cards, session invites as deep links with OG images
5. **Activity feed** -- gym-scoped feed showing recent matches, new members, session creation

**Backend work (jr_be):**
- Notification preferences already exist (`notification_preferences` table)
- Chat tables exist (direct + gym group)
- OG image generation (edge function or server-side)

**Autonomy:** Partially automatable. Chat mobile implementation is a large feature. Social sharing and OG images need design decisions.

---

## Phase 10: Analytics + Insights

**Goal:** Give athletes and gym managers data-driven feedback.

**Scope:**
1. **Athlete insights dashboard** -- win rate trends, weight class performance, ELO trajectory chart
2. **Gym manager dashboard** -- session attendance trends, active member count, match volume
3. **Head-to-head comparison** -- already partially built (`compare-stats-modal`), enhance with historical data
4. **Rating milestones** -- badges/achievements for ELO thresholds, streaks, match count
5. **Submission analytics** -- most common submissions given/received

**Backend work (jr_be):**
- New RPCs for aggregated stats (weekly/monthly)
- Materialized views for performance

**Autonomy:** Mostly automatable. UI work with clear data sources.

---

## Recommended Execution Order

| Priority | Phase | Effort | Automatable |
|----------|-------|--------|-------------|
| 1 | Phase 7: Mobile Polish | 1-2 days | Fully |
| 2 | Phase 8: Test Coverage | 2-3 days | Fully |
| 3 | Phase 6: Gym Manager Onboarding | 2-3 days | Mostly |
| 4 | Phase 9: Notifications + Social | 3-5 days | Partially |
| 5 | Phase 10: Analytics + Insights | 3-5 days | Mostly |

Phases 7 and 8 are polish/quality work that strengthens the alpha. Phase 6 is needed before real gyms can self-serve. Phases 9-10 are growth features for public beta.

---

## Manual Steps Still Pending (Alpha)

These block the actual build distribution, not development:

1. Enroll in Apple Developer Program + Google Play Console
2. Create Sentry project, update app.json
3. Run `eas init`, update PLACEHOLDER_PROJECT_ID
4. Create staging + production Supabase projects
5. Set EAS secrets
6. Apply gym_managers migration to staging/prod
7. Seed initial gym managers
8. Replace TEAM_ID/SHA256 in universal link files
9. Host AASA + assetlinks at elorated.com
10. Run `eas build --profile preview --platform all`
