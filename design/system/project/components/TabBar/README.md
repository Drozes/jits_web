# TabBar

TabBar is the custom bottom bar for the four tab roots (Home, Arena, Rankings, Profile): equal columns on the panel surface, an 18px lucide icon over a 10px DM Sans caps label, and a 2px Signal Red top rule on the active tab; the Arena icon carries Arena heat.

## Props, variants, states

| Prop | Values | Notes |
|---|---|---|
| `BottomTabBarProps` | | From expo-router `Tabs`. A route with `href: null` is skipped. |
| `badges` | `Record<route, TabBadge>` | `count` (CountPill at -5.25px top, -8.75px right of the icon), `dot` (7px `gain-green`), `ring` (7px, 1.5px `ink-3`); a count with `inIcon` is drawn by the icon itself. |
| `live` | `Record<route, boolean>` | The Arena's live state; VoiceOver adds "live" to the tab value. |

Each tab: `flex-1`, 10.5px vertical padding, 3.5px icon-to-label gap, `border-t-[2px]` (`signal-red` when active, transparent otherwise). Active icon and label `ink`, inactive `ink-3`. Pressed: `plate` fill (`active:bg-surface-3`). The bar adds the bottom safe-area inset (34 on Face ID phones) as padding. Icons: lucide `House` (imported as `Home`), `Swords` (two halves), `Trophy`, `User`; stroke 2.

**Arena icon states** (`ArenaTabIcon`): idle (plain Swords); live with nothing pending (three 2px embers, two `heat-orange` and one `signal-red`, rise off the blades); 1 to 3 pending incoming challenges (one 2.5px `heat-red` ember per challenge, never below 0.35 opacity, in place of the count pill, and still drawn while the Arena tab is focused); more than 3 (the CountPill returns, no embers). The preview draws the Reduce Motion still frames: one ember 5px above the crossing at 0.8 opacity for live, N embers 7px up for counts.

## Tokens used

`panel` (bar), `hairline` (top border), `signal-red` (active rule, one live ember, CountPill), `ink`, `ink-3`, `plate` (pressed), `heat-orange`, `heat-red` (Arena heat only), `on-signal`, `stroke-edge` 2px, `size-tab-icon` 18px, `safe-bottom` 34px, `opacity-ember-min` 0.35; type `heading` 700 10px, tracking 1.68px.

## Motion

- **Tab select bounce** (Reactive): pressing a tab that is not active squashes the icon to 0.86 over `duration.instant`, then `spring.select` (damping 14, stiffness 260) back; `haptics.select`. Reduce Motion: no scale, haptic kept.
- **Arena ember** (Ambient): while live and nothing is pending, three embers on one 2400ms clock (`duration.ember`), one launching every 800ms. Reduce Motion: one static ember.
- **Countable embers** (Ambient): 1 to 3 pending, on one shared 2400ms clock offset by i/N. Reduce Motion: N static embers.
- **Blade clash** (Moment): going live (by the athlete's own tap) or a pending count increase: the halves spread 4 units in 60ms and snap back (about 220ms, ease-out back) with a small Signal Red spark (in 80ms, out 300ms). `goLive` haptic on going live only. Reduce Motion: none.

Ambient loops pause in the background. The bar never re-renders per frame.

## Source

`apps/mobile/components/layout/elo-tab-bar.tsx`, `apps/mobile/components/layout/arena-tab-icon.tsx` (`SWORDS_BLADE_A/B`, `HEAT_EMBER_RED`), `apps/mobile/lib/navigation/tab-badge.ts`, `apps/mobile/app/(app)/(tabs)/_layout.tsx`.

## Web twin and parity

`apps/web/components/layout/bottom-nav-bar.tsx` (same four tabs). The web Arena icon has no embers or clash.

## Do and don't

- Do keep the bar to the four tab roots.
- Do keep heat colors (`heat-orange`, `heat-red`) inside the Arena icon, the clash spark and the challenge afterglow; nowhere else.
- Don't put a CountPill and embers on the Arena icon at once.
- Don't animate the bar itself or re-render it per frame.
