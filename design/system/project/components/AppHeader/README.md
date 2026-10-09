# AppHeader

AppHeader is the 56pt header family: one panel bar with a hairline bottom edge in two slot layouts (pushed screens, and the one tab-root header with the wordmark and the athlete's rating), whose tab-root right side is always the HeaderStatusChip and the notification bell.

## Props, variants, states

**AppHeader** (pushed screens: match, practice, settings, athlete, stats, auth)

| Prop | Values | Notes |
|---|---|---|
| `title` | string | Centred, DM Sans 700 12px `ink-2` caps, tracking 1.68px, at most half the bar. |
| `back`, `backFallback` | boolean, href | 28px back button (lucide ChevronLeft 20 `ink-2`, pressed `plate`), 10pt hit slop; the fallback is used when there is no history. |
| `icon`, `rightAction` | node | Before the title; right slot after the live dot. |

While the athlete is live the right slot shows `HeaderLiveDot` (a 7px `gain-green` dot in a 16x28 box, not tappable). Side slots share the leftover width (flex 1, basis 0) so the title stays centred.

**BrandHeader** (every tab root: Home, Arena, Matches, Rankings, Profile; jits-1ez5): left, the Bebas Neue 22px "ELO RATED" wordmark (live text, tracking -0.07px, no Dynamic Type growth, not a VoiceOver stop), 10pt, a 1px x 16pt `hairline-strong` rule, 10pt, then **HeaderElo**: the athlete's `current_elo` in JetBrains Mono 700 16px `ink`, tabular, on the wordmark's baseline, sized from the system text scale up to 1.3x (the chip's cap; OS scaling off, like the chip). The rating is a button in a 44pt tall row (pressed: a `plate` fill reaching 6pt past the digits), label "Your rating 1512", hint "Opens your numbers"; it opens the **Your numbers** sheet (shared sheet chrome): the rating at 44px with the last match's delta, the rating line over the last 20 matches with the peak as a dashed `hairline-strong` line, global rank "#37 of 412" with "Top 9%" (rounded up), the record, peak and this month (from the rating history; "Unavailable" when it fails), "Unranked" before a first match, and View full stats. The sheet stops below the top safe area and scrolls at large text sizes. No streak. Right, `TabHeaderActions` = HeaderStatusChip then the bell, 8pt apart; nothing else goes on the right. No tab title is drawn; the tab keeps an accessibility-only heading. The left side never yields: the chip takes the rest of the row (up to 160pt) and runs its own fit.

**HeaderStatusChip**: a 28pt drawn frame (2px corners, 1px border in the tone) centred in a 44pt touch row, at most 160pt wide; mono 700 10px caps tabular text; 8pt side padding, 5pt glyph gap.

| Tone | Border | Text | Glyph | Copy (from `lib/arena/header-chip-model.ts`) |
|---|---|---|---|---|
| neutral | `ink-3` | `ink-3` | ring (6px) or ◌ | GO LIVE · N, GOING LIVE, RECONNECTING, OFFLINE · RETRY |
| live | `gain-green`, plus a 10% `gain-green` fill | `gain-green` | 6px LiveDot | LIVE, LIVE · JUST YOU, LIVE · N, WAITING · NAME · M:SS |
| incoming | `signal-red` | `ink` | ! | N WANT TO ROLL, NAME · M:SS |

A match to confirm adds a "▪ CONFIRM" segment (compact "▪" when narrow). Taps: go live, open the live popover (Open Arena / Go offline), open the Arena, or reopen the incoming prompt. The countdown ticks once a second only on a focused screen.

Bell: 28px box, lucide Bell 18 `ink`, CountPill at its top right, pressed `plate-bright`.

On device the bar adds the top safe-area inset (47 on Face ID phones) above the 56pt row and 16pt side padding (or the side safe area, when wider).

## Tokens used

`panel`, `hairline`, `ink`, `ink-2`, `ink-3`, `gain-green`, `signal-red`, `on-signal`, `plate`, `plate-bright`, `radius-tag`, `size-header` 56px, `size-action` 28px, `size-hit` 44px, `size-live-dot` 7px, `safe-top` 47px; type `heading` 700, `mono` 700, `display` (wordmark).

## Motion

The bar itself does not animate. **Header ELO roll** (Moment): when a result changes the rating on the focused tab root, the rating rolls once (RollingNumber) and the delta (DeltaChip, mono 700 10px) holds beside it about 4s, then fades out; only when it fits beside the chip; amber for a negative delta after a draw. Reduce Motion: the landed value at once, the delta shown then removed in place. No haptic. Its dots use **LIVE pulse** on the shared Arena tempo clock (Ambient; static under Reduce Motion). The live popover opens with no animation.

## Source

`apps/mobile/components/layout/app-header.tsx`, `brand-header.tsx`, `header-elo.tsx`, `your-numbers-sheet.tsx`, `header-status-chip.tsx`, `header-live-dot.tsx`, `live-menu-popover.tsx`, `apps/mobile/lib/arena/header-chip-model.ts`, `apps/mobile/components/notifications/notification-bell.tsx`, `apps/mobile/components/ui/elo-system/wordmark.tsx`.

## Web twin and parity

`apps/web/components/layout/app-header.tsx` (web shell header is also 56px); the chip's web counterpart is `arena-nav-status.tsx` (approximate, by role).

## Do and don't

- Do use AppHeader on every pushed screen (no wordmark or rating there) and BrandHeader on all five tab roots.
- Do keep the tab-root right side to exactly the chip then the bell.
- Don't draw a tab title in a tab-root bar, and don't let the wordmark or the rating shrink or truncate; the chip yields.
- Don't put rank, record or a streak in the bar; they live in Your numbers.
- Don't make the pushed-screen live dot tappable; pushed screens never offer a shortcut out of a flow.
- Don't color the chip's text red: the incoming tone uses a red border with `ink` text.
