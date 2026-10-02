# AppHeader

AppHeader is the 56pt header family: one panel bar with a hairline bottom edge in three slot layouts (pushed screens, the wordmark tab roots, the titled tab roots), whose tab-root right side is always the HeaderStatusChip and the notification bell.

## Props, variants, states

**AppHeader** (pushed screens: match, practice, settings, athlete, stats, auth)

| Prop | Values | Notes |
|---|---|---|
| `title` | string | Centred, DM Sans 700 12px `ink-2` caps, tracking 1.68px, at most half the bar. |
| `back`, `backFallback` | boolean, href | 28px back button (lucide ChevronLeft 20 `ink-2`, pressed `plate`), 10pt hit slop; the fallback is used when there is no history. |
| `icon`, `rightAction` | node | Before the title; right slot after the live dot. |

While the athlete is live the right slot shows `HeaderLiveDot` (a 7px `gain-green` dot in a 16x28 box, not tappable). Side slots share the leftover width (flex 1, basis 0) so the title stays centred.

**BrandHeader** (Home, Rankings): the Bebas Neue 22px "ELO RATED" wordmark (live text, tracking -0.07px, no Dynamic Type growth) left, `TabHeaderActions` right. **TabHeader** (Arena, Profile): the tab title left in the AppHeader title style, `TabHeaderActions` right. `TabHeaderActions` = HeaderStatusChip then the bell, 8pt apart; nothing else goes on the right.

**HeaderStatusChip**: a 28pt drawn frame (2px corners, 1px border in the tone) centred in a 44pt touch row, at most 160pt wide; mono 700 10px caps tabular text; 8pt side padding, 5pt glyph gap.

| Tone | Border | Text | Glyph | Copy (from `lib/arena/header-chip-model.ts`) |
|---|---|---|---|---|
| neutral | `ink-3` | `ink-3` | ring (6px) or ◌ | GO LIVE · N, GOING LIVE, RECONNECTING, OFFLINE · RETRY |
| live | `gain-green`, plus a 10% `gain-green` fill | `gain-green` | 6px LiveDot | LIVE, LIVE · JUST YOU, LIVE · N, WAITING · NAME · M:SS |
| incoming | `signal-red` | `ink` | ! | N WANT TO ROLL, NAME · M:SS |

A match to confirm adds a "▪ CONFIRM" segment (compact "▪" when narrow). Taps: go live, open the live popover (Open Arena / Go offline), open the Arena, or reopen the incoming prompt. The countdown ticks once a second only on a focused screen.

Bell: 28px box, lucide Bell 18 `ink`, CountPill at its top right, pressed `plate-bright`.

On device the bar adds the top safe-area inset (47 on Face ID phones) above the 56pt row and at least 16pt side padding.

## Tokens used

`panel`, `hairline`, `ink`, `ink-2`, `ink-3`, `gain-green`, `signal-red`, `on-signal`, `plate`, `plate-bright`, `radius-tag`, `size-header` 56px, `size-action` 28px, `size-hit` 44px, `size-live-dot` 7px, `safe-top` 47px; type `heading` 700, `mono` 700, `display` (wordmark).

## Motion

The header itself does not animate. Its dots use **LIVE pulse** on the shared Arena tempo clock (Ambient; static under Reduce Motion). The live popover opens with no animation.

## Source

`apps/mobile/components/layout/app-header.tsx`, `brand-header.tsx`, `tab-header.tsx`, `header-status-chip.tsx`, `header-live-dot.tsx`, `live-menu-popover.tsx`, `apps/mobile/lib/arena/header-chip-model.ts`, `apps/mobile/components/notifications/notification-bell.tsx`, `apps/mobile/components/ui/elo-system/wordmark.tsx`.

## Web twin and parity

`apps/web/components/layout/app-header.tsx` (web shell header is also 56px); the chip's web counterpart is `arena-nav-status.tsx` (approximate, by role).

## Do and don't

- Do use AppHeader on every pushed screen and BrandHeader or TabHeader on the four tab roots.
- Do keep the tab-root right side to exactly the chip then the bell.
- Don't make the pushed-screen live dot tappable; pushed screens never offer a shortcut out of a flow.
- Don't color the chip's text red: the incoming tone uses a red border with `ink` text.
