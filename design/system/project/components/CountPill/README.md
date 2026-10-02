# CountPill

CountPill is the red count badge shared by the header bell and the tab bar: a Signal Red box with 2px corners and JetBrains Mono Bold 9px digits in the on-signal ink.

## Props, variants, states

| Prop | Values | Notes |
|---|---|---|
| `text` | string | Usually `formatBadgeCount(n)`: the whole count, `99+` above 99. |
| `className` | string | Positions it (`absolute` by default). Bell: `top-0 right-0` in the 28px bell box. Tab icon: `-top-1.5 -right-2.5` (-5.25px, -8.75px). |
| `testID` | string | |

Size: at least 14x14 (`min-h-4 min-w-4`), 3.5px side padding. Static. Dynamic Type capped at 1.3.

**Tab badges.** A tab can carry one static mark on its icon (`TabBadge` in `lib/navigation/tab-badge.ts`): a count (this pill), a green dot (7px `gain-green` circle, live), or a hollow ring (7px circle, 1.5px `ink-3` border). The Arena tab draws 1 to 3 pending challenges as countable embers inside its icon instead of a pill (see TabBar); above 3 the pill returns. VoiceOver reads the count as the tab's value ("2 challenges, live").

## Tokens used

`signal-red` (fill), `on-signal` (digits, 4.60:1 on `signal-red`), `gain-green` (dot), `ink-3` (ring), `radius-tag` 2px; type `mono` 700 9px, tabular.

## Motion

None: static by design. The Arena icon's countable embers carry the motion for Arena counts.

## Source

`apps/mobile/components/ui/count-pill.tsx`, `apps/mobile/lib/navigation/tab-badge.ts` (`formatBadgeCount`, `countableEmbers`, `MAX_COUNTABLE_EMBERS`), `apps/mobile/components/layout/elo-tab-bar.tsx` (`TabBadgeMark`), `apps/mobile/components/notifications/notification-bell.tsx`.

## Web twin and parity

None as a component; web navigation draws its own badges.

## Do and don't

- Do use it only for counts that want the athlete (unread, pending).
- Do format with `formatBadgeCount` so 100 and more read `99+`.
- Don't use it for totals or stats; numbers that are data go in mono text, not a red badge.
- Don't animate it.
