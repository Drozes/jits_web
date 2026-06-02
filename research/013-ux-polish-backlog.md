# 013, UI/UX Polish Backlog (safe, client-only, app-wide)

**Date:** 2026-06-02
**Status:** Discovery + recommendation (no feature code written). Filed as epic **`jits-4zp`** (10 children).
**Method:** 10-agent audit, 8 parallel per-surface scanners (mobile Home, Gyms, Rankings+Profile, Match-flow+Lobby, Settings+UI-kit, a cross-cutting design-system-compliance sweep, a cross-cutting accessibility+touch+dead-affordance sweep, and the authenticated web surfaces) -> an adversarial safety/design critic -> a synthesizer. 64 raw findings deduped/verified down to 8 prioritized items + 2 deferred batches.

**Scope ("safe"):** client-only, no backend/RLS/schema change, no new EAS/TestFlight build (no new native modules), low regression risk, and design-system compliant (dark-first Void; Signal Red only for primary CTA + state-negative; numerics in `font-mono`/`tabular-nums` and never red; 4px corners / 8px modal max; no drop shadows; minimal-motion budget; the 4 purpose-bound fonts). **Excludes** FTUE/first-run (owned by epic `jits-r75`) and correctness bugs.

---

## The backlog

| # | Issue | Title | Pri | Effort/Impact | Notes |
|---|---|---|---|---|---|
| 1 | `jits-4zp.1` | Make leaderboard fighter rows tappable to open athlete profiles | P1 | S/High | `fighters-list.tsx:47-55` renders `RankRow` with no `onPress`; the press path + `/athlete/[id]` route already exist |
| 2 | `jits-4zp.2` | Stop the live match timer turning Signal Red at 0:00 | P1 | S/Med | `timer-display.tsx:24-34` paints a number red; convey expiry via an amber/mono-caps label instead. *design-review* |
| 3 | `jits-4zp.3` | Remove dead web leaderboard filter chips + fabricated ELO deltas | P1 | S/High | `leaderboard-content.tsx:33-40,114-123,168` — 5 inert `<button>` chips + a synthesized red/green delta. *design-review* |
| 4 | `jits-4zp.4` | Brand the mobile toast appearance to the Void system | P1 | M/High | `<Toaster/>` mounted with no config -> stock light green/red/blue cards; add a `toastConfig` via `useThemedTokens`. *design-review* |
| 5 | `jits-4zp.5` | Touch-target sweep: hitSlop on sub-44pt icon buttons + Chip | P1 | M/Med | One PR; fixing `chip.tsx` covers every chip consumer; copy the existing `notification-bell` `hitSlop={8}` convention |
| 6 | `jits-4zp.6` | Accessibility-label sweep (Pressables, images, toggles, badge count) | P2 | M/Med | One PR; operationalizes the still-open `research/008` #3; includes the notifications nested-switch fix |
| 7 | `jits-4zp.7` | Fire the already-defined match haptics on result-record + errors | P2 | S/Med | `use-haptics.ts:22-24` defines `resultRecorded`/`error` but never calls them; `expo-haptics` already in the binary |
| 8 | `jits-4zp.8` | Neutral (non-red) rank-number captions (web + mobile) | P2 | S/Med | `profile-hero.tsx:151-152`, `profile-header.tsx:77`, `competitor-header.tsx` paint the rank number Signal Red. *design-review* |

### Deferred batches (kept by the critic, below the top-8 cutline)

- **`jits-4zp.9` Loading + date/time consistency sweep (P3):** spinner -> skeleton on `stats.tsx`, `athlete/[id].tsx`, `notifications.tsx` (reuse the existing `SkeletonProvider`); route raw date/time renders through the existing `formatRelativeTime`/`formatRelativeDate`/`formatTimeUntil` helpers (leave intentional absolute wall-clock labels alone).
- **`jits-4zp.10` Misc design-system + data-placeholder polish (P3):** mobile Badge `rounded-lg`->`rounded-sm` (`badge.tsx:7`); `RankRow` ELO value `tabular-nums` (`rank-row.tsx:66`, real columnar win); gym-card subtitle numerics to mono (`gym-card.tsx:78`); other-athlete zero-match `0%` -> `--`/"No ranked matches" (`competitor-header.tsx:32`, not covered by `jits-r75.2`); hide/relabel the all-em-dash `LastSessionPlate` (`gym-detail-parts.tsx:216-240`); fix pull-to-refresh bound to `isStale` (`home/index.tsx:134`).

### Ship as three PRs (cross-cutting batches)
1. **touch-target-hitslop-sweep** (`jits-4zp.5`)
2. **accessibility-label-sweep** (`jits-4zp.6`)
3. **design-system numeric/color batch** (`jits-4zp.8` + the `jits-4zp.10` numeric fold-ins)

---

## What was deliberately excluded

- **Already owned by FTUE epic `jits-r75`** (not re-filed): disabled head-to-head Challenge CTA + Edit-Profile "coming soon" alert + Video Settings stub (`jits-r75.7`), the Home "Match details coming soon" toast (folds into `jits-r75.7`'s "no no-op surface" scope), the "No Gyms Found" dead-end (`jits-r75.4`), and the own-profile `0%`/zero-state reframe (`jits-r75.2`).
- **Dropped as low-signal noise** (verified, no visible UX effect): `tabular-nums` on the lone 72px hero ELO numerals (only matters in a column; the real win is the columnar `RankRow`, kept in `.10`); wrapping the small header avatars in a `Pressable` (Profile is already one tap away via the tab bar); `tabular-nums` on the W/L/D record line (mixes letters, alignment moot).

## Open questions (need a product call)

- **Web rankings are deliberately non-navigable** (`leaderboard-content.tsx:160-172` renders `RankRow` as a plain `div`, no link), while mobile has the route. Confirm whether non-navigable web rankings is intentional before mirroring the mobile tap-to-open fix (`jits-4zp.1`) to web.
- **Mobile leaderboard delta honesty:** mobile colors `DeltaNumber` from `trendToDelta` (-1/0/1 from a real trend) rather than the web's fabricated `eloDelta`, but a user still reads the colored delta as a real point change. If the web fix (`jits-4zp.3`, `delta={0}`) ships, consider aligning mobile to neutral for cross-platform honesty.
