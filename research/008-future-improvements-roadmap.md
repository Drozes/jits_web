# 008 — Future Improvements Roadmap

> Generated 2026-02-16 from a full codebase audit. Prioritized by functional impact.

---

## High Priority

### 1. Consolidate Auth Forms

**Problem:** `login-form.tsx` (186 lines), `sign-up-form.tsx` (169 lines), and `forgot-password-form.tsx` (105 lines) share ~70% identical code — Card/Header/Content structure, email input, error handling, loading states, and a duplicated Google OAuth SVG (147 lines each).

**Files:**
- `components/login-form.tsx`
- `components/sign-up-form.tsx`
- `components/forgot-password-form.tsx`

**Recommendation:** Extract shared pieces into reusable components:
- `<AuthFormLayout>` — Card wrapper with header/footer
- `<GoogleAuthButton>` — OAuth button with SVG icon
- `<EmailField>` / `<PasswordField>` — Labeled inputs with error states
- `<AuthFormFooter>` — Links to alternate auth routes

**Impact:** ~320 lines of duplication removed, easier to maintain auth UI.

---

### 2. Merge Duplicate Date Formatting

**Problem:** Two separate implementations of relative date formatting:
- `timeAgo()` inline in `app/(app)/arena/arena-content.tsx:31-40` (mins/hours/days)
- `formatRelativeDate()` in `lib/utils.ts:50-61` (Today/Yesterday/weeks/months)

**Consumers of `formatRelativeDate()`:**
- `components/domain/notification-panel.tsx`
- `components/domain/challenge-versus-card.tsx`
- `components/domain/match-card.tsx`

**Consumer of `timeAgo()`:**
- `app/(app)/arena/arena-content.tsx:176`

**Recommendation:** Consolidate into a single `formatRelativeDate()` in `lib/utils.ts` with an optional `style` parameter for short vs long form. Remove the inline `timeAgo()`.

**Impact:** Consistent date display across the app, single source of truth.

---

### 3. Add Accessibility Labels

**Problem:** Only 2 components in the entire codebase have `aria-label` attributes (`app-header.tsx`, `notification-bell.tsx`). Zero `role=` attributes found.

**Missing ARIA labels in:**
- Icon-only buttons: swipe controls, edit buttons, share buttons (`swipe-discovery-client.tsx`, `editable-profile-header.tsx`, `share-profile-sheet.tsx`)
- Interactive cards used as links: `athlete-card.tsx`, `match-card.tsx`, `conversation-card.tsx`
- Password visibility toggle: `login-form.tsx:110-129`
- Bottom nav items: `bottom-nav-bar.tsx` — needs `aria-current="page"` on active item
- Modal dialogs: `challenge-sheet.tsx`, `challenge-response-sheet.tsx`, `compare-stats-modal.tsx` — need `aria-labelledby`
- Loading/typing indicators — need `role="status"`
- Form error messages — need `aria-describedby` on associated inputs

**Recommendation:** Systematic pass through all interactive elements. Start with buttons and navigation, then forms and modals.

**Impact:** Screen reader support, WCAG compliance baseline.

---

## Medium Priority

### 4. Split Oversized Components

**Target:** Under 80 lines per component (120 for server data-fetching components per CLAUDE.md).

| File | Lines | Suggested Splits |
|------|-------|-----------------|
| `app/(app)/messages/[id]/chat-thread.tsx` | 293 | `<MessageList>`, `<ChatHeader>`, `<ChatInput>` |
| `app/(app)/arena/swipe/swipe-discovery-client.tsx` | 280 | `<SwipeCard>`, `<SwipeControls>`, `<SwipeResults>` |
| `components/domain/challenge-response-sheet.tsx` | 277 | `<EloStakesDisplay>`, `<WeightInput>`, `<ChallengeResponseActions>` |
| `components/domain/challenge-sheet.tsx` | 239 | Extract shared ELO stakes logic with response sheet |
| `app/(app)/match/pending/pending-challenges-content.tsx` | 227 | Extract individual challenge list sections |
| `app/(app)/arena/arena-content.tsx` | 191 | `<CompetitorSection>`, `<ActivityFeed>` |
| `app/(app)/profile/stats/stats-tabs.tsx` | 186 | Extract individual tab content |
| `app/(app)/athlete/[id]/athlete-profile-content.tsx` | 181 | Separate data fetching from rendering |
| `app/(app)/profile/profile-content.tsx` | 165 | Extract `<ProfileStats>` section |
| `components/domain/compare-stats-modal.tsx` | 124 | `<StatsComparisonGrid>` sub-component |
| `components/domain/conversation-card.tsx` | 108 | `<ConversationMeta>` sub-component |
| `components/domain/notification-panel.tsx` | 103 | `<ChallengeNotificationItem>` sub-component |
| `components/domain/message-bubble.tsx` | 99 | `<MessageTimestamp>`, `<MessageAvatar>` |

**Note:** `challenge-response-sheet.tsx` and `challenge-sheet.tsx` both implement ELO stakes fetching/display — this logic should be extracted to a shared component or hook.

---

### 5. Implement Code-Splitting with `next/dynamic`

**Problem:** Zero lazy imports or dynamic imports in the codebase. All client components are bundled upfront.

**Good candidates for `next/dynamic`:**
- **Sheet/modal components** (loaded on user interaction): `challenge-sheet.tsx`, `challenge-response-sheet.tsx`, `compare-stats-modal.tsx`, `share-profile-sheet.tsx`
- **Feature pages** (loaded on navigation): `swipe-discovery-client.tsx`, `stats-tabs.tsx`
- **Heavy UI** (deferred rendering): `chat-thread.tsx`, ELO chart in stats

**Impact:** Smaller initial bundle, faster page loads especially on mobile.

---

### ~~6. Improve Skeleton Loading States~~ ✅ DONE

**Fixed:** All 4 pages now have named skeleton components (`LiveMatchSkeleton`, `ResultsSkeleton`, `LobbySkeleton`, `PendingChallengesSkeleton`) that match their actual content layout with appropriate avatar circles, text blocks, badges, and card structures.

---

## Low Priority

### 7. Refactor Challenge Sheet Props

**Problem:** `challenge-sheet.tsx` passes 8 granular props (`competitorId`, `competitorName`, `competitorElo`, `currentAthleteId`, `currentAthleteElo`, `currentAthleteWeight`, `open`, `onOpenChange`) instead of using object props per CLAUDE.md conventions.

**Recommendation:** Refactor to `competitor: { id, name, elo }` and `currentAthlete: { id, elo, weight }` object props. Apply same pattern to `challenge-response-sheet.tsx`.

---

### 8. Move Direct DB Queries Into Data Access Layer

**Problem:** 5 components bypass `lib/api/queries.ts` with raw `.from()` / `.rpc()` calls:

- `components/auth-button.tsx:12-16`
- `components/layout/header-user-button.tsx:13-17`
- `components/profile/editable-profile-header.tsx:54-59`
- `components/domain/challenge-response-sheet.tsx:48-62`
- `components/domain/challenge-sheet.tsx:51-70`

**Recommendation:** Add corresponding functions to `lib/api/queries.ts` and update consumers. This improves consistency and makes it easier to change query logic in one place.

---

### 9. Add Test Coverage for Complex Hooks

**Problem:** The two most complex hooks have no unit tests:
- `hooks/use-chat-messages.ts` (132 lines) — optimistic UI, deduplication, pagination
- `hooks/use-global-notifications.ts` (137 lines) — 2 realtime channels, caching, async sender resolution

**Current test coverage:** 28 test files exist but focus on utilities and simple components. No hook tests.

**Recommendation:** Add tests using `@testing-library/react` with `renderHook`. Mock Supabase channels for realtime behavior. Priority: `use-chat-messages` (most complex state logic).

---

### 10. Reorganize Auth Components

**Problem:** Auth-related components sit in `components/` root alongside domain and layout components:
- `login-form.tsx`
- `sign-up-form.tsx`
- `forgot-password-form.tsx`
- `update-password-form.tsx`
- `auth-button.tsx`

**Recommendation:** Move to `components/auth/` directory. This is low priority — only do it when consolidating auth forms (#1) to avoid unnecessary churn.

---

## Summary

| # | Item | Priority | Effort | Lines Affected |
|---|------|----------|--------|---------------|
| 1 | Consolidate auth forms | High | Medium | ~460 lines |
| 2 | Merge date formatting | High | Small | ~20 lines |
| 3 | Accessibility labels | High | Medium | ~30 files |
| 4 | Split oversized components | Medium | Large | ~2,500 lines |
| 5 | Code-splitting (`next/dynamic`) | Medium | Medium | ~10 files |
| ~~6~~ | ~~Skeleton loading states~~ | ~~Medium~~ | ~~Small~~ | ~~4 pages~~ ✅ |
| 7 | Challenge sheet props | Low | Small | 2 files |
| 8 | Data access layer coverage | Low | Small | 5 files |
| 9 | Hook test coverage | Low | Medium | 2 hooks |
| 10 | Auth component reorganization | Low | Small | 5 files |
