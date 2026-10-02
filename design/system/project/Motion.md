# Motion

Motion in ELO RATED carries meaning or it does not exist. This section carries over the Motion Rule as shipped in jits_web (Adding Flare, 2026-10-01; DESIGN.md "Motion", verified against `apps/mobile/lib/motion/tokens.ts` at 69e2e7f). The design-system format has no motion token family, so the exact values live here.

## Token values at a glance

| Token (`@/lib/motion`) | Value | Line | Web twin (`tokens.css`) |
|---|---|---|---|
| `duration.instant` | 100ms | 11 | `--duration-instant` |
| `duration.fast` | 240ms | 13 | `--duration-fast` |
| `duration.base` | 480ms | 15 | `--duration-base` |
| `duration.slow` | 720ms | 17 | `--duration-slow` |
| `duration.pulse` | 1400ms | 19 | `--duration-pulse` |
| `duration.ember` | 2400ms | 21 | (none) |
| `duration.shimmer` | 1400ms | 23 | (none; web Tailwind `shimmer` is 3s) |
| `tempo.quiet` / `normal` / `busy` | 3000 / 1600 / 800ms | 36-40 | (none) |
| `BRAND_EASE_OUT_CURVE`, `easing.brandOut` | `cubic-bezier(0.22, 1, 0.36, 1)` | 50, 55 | `--easing-default` |
| `easing.outCubic` | `Easing.out(Easing.cubic)` | 57 | (none) |
| `spring.press` | damping 18, stiffness 300 | 63 | (none) |
| `spring.select` | damping 14, stiffness 260 | 65 | (none) |
| `PRESS_SCALE` | 0.97 | 69 | web press scale 0.98 (`globals.css:143`) |

Component constants outside the token file: `ROLL_MS` 600 and `ROLL_MAX_SPAN` 30 (`rolling-number.tsx`); blade clash 60ms spread plus 160ms snap, spark 80ms in and 300ms out (`arena-tab-icon.tsx:125-133`); `FIGHT_EASING = BRAND_EASE_OUT_CURVE` (`fight-tokens.ts:14`). Durations still written as literals (countdown 700ms, celebration 1800 / 1200 / 600 / 520 / 300 / 400ms, rating moment 80 / 50ms, offline banner 220ms) are WP6 clean-up (R3 MF-11, SC-1).

In a static preview, draw the Reduce Motion end state: the final number, the cooled edge, the static ember, the filled tally.

The **Motion Rule** (Adding Flare, 2026-10-01) replaces the old "minimal motion" rule. Motion is allowed only when it carries meaning: every animation in the app is either a direct response to touch, a one-shot moment on a real state change, or an ambient loop for a live state. Nothing is decorative, and every animation is listed in the registry below.

## Tokens

Mobile tokens live in `apps/mobile/lib/motion/tokens.ts` and are imported from `@/lib/motion`; `instant`, `fast`, `base`, `slow` and `pulse` mirror the web `--duration-*` tokens in `apps/web/app/design-system/tokens.css`.

- **Durations:** `instant` 100ms (reactive feedback), `fast` 240ms, `base` 480ms (rating tick), `slow` 720ms, `pulse` 1400ms (fixed LIVE pulse cycle), `ember` 2400ms (Arena ember cycle), `shimmer` 1400ms (skeleton sweep).
- **LIVE pulse tempo:** `tempo.quiet` 3000ms, `tempo.normal` 1600ms, `tempo.busy` 800ms, chosen by how many athletes are live in the lobby. One shared clock drives every live dot so they never beat out of step.
- **Easing:** brand ease-out `cubic-bezier(0.22, 1, 0.36, 1)` (`easing.brandOut`, no bounce) by default; `easing.outCubic` for counts.
- **Springs:** `spring.press` (damping 18, stiffness 300) for a pressed control returning to rest; `spring.select` (damping 14, stiffness 260) for the tab select bounce.
- **Press scale:** `PRESS_SCALE` 0.97.

## The three tiers

| Tier | What it is | Limits |
|---|---|---|
| **Reactive** | A direct response to the user's touch (press scale, tab select bounce). | Starts on the touch, settles in `instant` to `fast` (spring to rest). Never runs without a touch. |
| **Moment** | A one-shot animation on a real state transition (a result landing, a challenge arriving, going live). | Plays once per transition, then rests in its final state. Short: about `fast` to `slow`; a cool-down or celebration may run up to about 2000ms. Never loops. |
| **Ambient** | A loop that shows an ongoing state: live (LIVE pulse, Arena embers, heartbeat trace), loading (skeleton shimmer) or waiting on you (steel sheen). | Mounted only while its state is true. Slow and low contrast, on a shared clock. Never has a haptic. |

## Rules

1. **Real transitions only.** A Moment fires on a state change (false to true, a count that increased, a new id), never on mount, re-render, refetch, tab switch, or app foreground with unchanged data. Track the previous value in a ref, and key once-per-thing moments on the thing's id, not on the component instance.
2. **UI thread.** Animate transform, opacity and color with Reanimated shared values, `useAnimatedStyle` and `useAnimatedProps`. No `setState` or `setInterval` animation loops, and no per-frame re-render of always-mounted chrome such as the tab bar.
3. **Reduce Motion.** Read the OS setting with `useReduceMotion()` (from `@/lib/motion`; correct on the first frame). Every animation has a static end state that still carries the meaning (a cooled edge, a static ember, the final number). Haptics stay on under Reduce Motion.
4. **Ambient lifecycle.** An ambient loop mounts only while its state is true, and pauses (`cancelAnimation`) when the app leaves the foreground and restarts when it returns: gate it on `useAppActive()` from `@/lib/motion`.
5. **Heat colors are reserved for Arena heat.** `brandOrange` through Signal Red as a heat ramp is used only for the Arena ember, the blade clash spark, and the challenge afterglow. Nowhere else.
6. **Brand rules still hold.** No drop shadows, 4px radius, Signal Red for CTAs and negatives, Gain Green for rating increases and live state only, numbers in mono `tabular-nums` (including while they roll).
7. **Pressables on native.** A function `style` on `Pressable` is dropped on device by NativeWind. Use `StatePressable`, or `PressableScale` (an animated Pressable that resolves a function style itself and animates only `transform`, so `className` and `active:` classes keep working); otherwise put animated styles on an inner `Animated.View`.

## Haptics

Mobile haptics use ONE semantic vocabulary, `haptics` from `@/lib/motion` (`apps/mobile/lib/motion/haptics.ts`; `matchHaptics` in `lib/match-flow/use-haptics.ts` is the same object under its old name). New code calls a semantic event, never `expo-haptics` directly.

| Event | Feedback | When |
|---|---|---|
| `press` | Light impact | A commit action: the Challenge tap (fired by the Arena rows themselves) and a successful Confirm result (fired by the confirm step). Not on Go live, which gets `goLive`. |
| `accept` | Medium impact | Accept on the incoming-challenge prompt (replaces `press` there, never both). |
| `select` | Selection | A tab that was not already active is selected. |
| `goLive` | Light impact | The athlete goes live in the Arena (false to true). |
| `challengeArrived` | Warning notification | A new incoming challenge. The challenge prompt sheet already fires it once per challenge id, so nothing else fires it for the same challenge. |
| `ratingGain` | Success notification | A rating gain lands, once per confirmed result. |
| `tapTick` | Light impact, three times | "The tap" on a submission win, for the winner only. |
| `countdownTick` | Heavy impact | Each numeral of the face-off countdown. |
| `countdownGo` | Success notification | GO at the end of the face-off countdown. |
| `matchStart` | Heavy impact | The match clock starts. |
| `matchEnd` | Success notification | End match confirmed. |
| `resultRecorded` | Success notification | The result is recorded server-side. |
| `timeWarning` | Medium impact | The clock crosses the low-time threshold. |
| `error` | Error notification | A mutation or network error. |

- **Never a haptic on a loss.** There is deliberately no loss event, and a draw is silent too; the loser of a submission sees the tap marks still and silent.
- **Never a haptic for ambient motion** (pulse, embers, heartbeat, shimmer, sheen).
- **One haptic per event.** Check what already buzzes before adding a call, and replace rather than stack.
- **Existing direct calls.** Only two surfaces still call `expo-haptics` directly: the Light impact on a result queued offline (`lib/match-flow/use-record-result.ts`) and the Heavy impact at the lock beat of the launch splash (`SplashReveal`, `SplashStatement`, `SplashGlowStatement`). Everything else, including the Challenge tap, Confirm result, the challenge prompt and the rating landing, uses the vocabulary. A surface that is touched should move to the semantic event, and a new opt-in on an action that already buzzes replaces the direct call instead of adding a second haptic.

## Registry

Every approved animation in the mobile app. **Adding a new animation means adding it to this registry** (with its tier, trigger and Reduce Motion state) in the same change.

| Animation | Tier | Where | Trigger | Haptic | Reduce Motion |
|---|---|---|---|---|---|
| Odometer ELO roll | Moment | `RollingNumber` (`apps/mobile/components/ui/elo-system/rolling-number.tsx`) in `EloTile` and the verdict celebration; replaces the old count-up rating tick | A confirmed rating change: only the digits that change roll, 600ms on the brand ease-out (also handles 999 to 1003 and losses). Plays once per result: the played key is persisted and a result counts as fresh only if this athlete just confirmed it or it completed within the last 5 minutes, so no replay on re-render, remount or navigating back. VoiceOver reads only the final value and delta | `ratingGain` on a gain only; silent on a loss or draw | Final value shown at once |
| ELO delta chip | Moment | `DeltaChip` (`apps/mobile/components/ui/elo-system/delta-chip.tsx`), result and verdict | After the roll lands: pops in from about 0.6 on a short spring with opacity; carries a sign and an arrow glyph, not only color | none | Shown in place |
| The tap | Moment | Submission result card | A submission win: three Signal Red tick marks fill (180ms apart) with micro-nudges, then the delta rises | `tapTick` x3, winner only | Ticks shown filled (winner haptics kept); the loser sees them filled, still and silent |
| LIVE pulse | Ambient | `LiveDot` / `LivePill`, header live dot | While live. Arena and header live dots pulse on the ONE shared Arena tempo clock (`lib/arena/arena-tempo.ts`), in phase. The match LIVE pill and the "Sent" pill keep the fixed `duration.pulse` (1400ms) pace | none | Static dot |
| LIVE pulse tempo | Ambient | Every tempo-clock dot and the ON AIR heartbeat | Lobby activity (others live in `lobby:online`) picks `tempo` quiet / normal / busy; the period eases between buckets instead of restarting | none | Static dots |
| ON AIR strip | Moment + Ambient | Arena screen body (`components/arena/on-air-strip.tsx`), never the header | Live false to true: the green ON AIR tally sweeps in (shown filled on a remount while already live). While live: a dim heartbeat trace brightens once per tempo-clock cycle; paused in background | none | Tally filled, full trace static |
| Countdown slam | Moment | Face-off countdown (`components/match-flow/countdown/countdown.tsx`), replaces the plain match countdown | Each numeral drops from 1.6x and lands (about 140ms, ease-out back); a Signal Red bar drains linearly over the whole countdown to a red GO; total length and match start unchanged | `countdownTick` per numeral, `countdownGo` on GO | Numbers crossfade; the bar still drains linearly; haptics kept |
| Verdict confetti / SlamIn / RiseIn | Moment | Verdict step | Confetti and the SlamIn of "YOU WON" on a win verdict only; RiseIn (the rank strip) on every verdict; each once | none | None (static verdict) |
| Arena ember | Ambient | Arena tab icon (`components/layout/arena-tab-icon.tsx`) | While live and no challenge is pending: three 2px embers (two `brandOrange`, one Signal Red) rise off the blade tips, one at a time, 2400ms cycle | none | One static ember above the crossing |
| Countable embers | Ambient | Arena tab icon | 1 to 3 pending incoming challenges: one 2.5px heat-red (`#EC6A74`) ember per challenge on one shared 2400ms clock, never fading below 0.35 opacity so they stay countable, in place of the red count pill (the pill returns above 3); they replace the live embers while showing and stop while the Arena tab is focused; VoiceOver keeps reading the count | none | N static embers |
| Blade clash | Moment | Arena tab icon | Live false to true, or the pending incoming count increases: the Swords halves spread and snap together with a tiny Signal Red spark (about 220ms) | `goLive` on going live; none for a challenge (the prompt sheet already fires `challengeArrived`) | No clash, no spark |
| Tab select bounce | Reactive | All four tabs | Pressing a tab that is not active: squash to 0.86, `select` spring back | `select` | No scale |
| Press scale | Reactive | `PressableScale` (`apps/mobile/components/ui/pressable-scale.tsx`): every `Button`, every `FightButton`, the Arena Challenge CTAs (`OutlineAction` ROLL, the Closest Match CTA, the competitor row), every Go live control (go-live plate, Mat Board live/offline segments, offer and row Go live), and Decline / Accept on the challenge prompt | Press-in to 0.97 (`instant`), release on the `press` spring; disabled controls do not move | Opt-in `haptic` prop, used nowhere yet: Challenge already fires `press` itself, Go live gets `goLive` from the tab icon, Confirm result fires `press` after a successful confirm | 0.85 opacity dip while held, haptic kept |
| Accept sweep | Moment | Accept on the incoming-challenge prompt | Tapping Accept: the lifted Signal Red fill sweeps left to right (260ms), one glint, label becomes "Accepted" (VoiceOver value "Accepted", label unchanged); the accept call goes out first and is never delayed; a failed accept returns the button to Accept | `accept` (never `press` as well) | Instant fill and label swap |
| Steel sheen | Ambient | `SteelSheen` (`apps/mobile/components/ui/steel-sheen.tsx`) via the `sheen` prop of `Button` / `FightButton`: Accept on the challenge prompt and Confirm result in the match-flow confirm step only (one per screen) | While the action waits on this user and the button is enabled: an 800ms sweep with about 2s rest; paused in background | none | No sheen |
| Challenge afterglow | Moment | Incoming challenge strips (`components/arena/afterglow-edge.tsx`) | A new challenge: the 2px bottom edge cools from hot to the hairline over 2000ms, timed from the earlier of the challenge's `created_at` and the first time this app run drew it, so a re-render, remount or old challenge shows it cooled | none | Cooled at once |
| List enter stagger | Moment | `useFirstLoadEntering` (`@/lib/motion`): Rankings, Arena roster, Profile recent matches | FIRST load only: rows rise 8px and fade, 60ms apart, first 8 rows; never on refetch, refresh, pagination or recycling | none | None |
| Rank-up swap flare | Moment | Rankings | First open after the athlete's last-seen rank improved: the old order swaps to the new (450ms layout transition) and a skewed Signal Red flare sweeps the row (500ms); once per climb | none | New order, no transition |
| Skeleton shimmer | Ambient | Skeletons | While loading: one module-level 1400ms clock drives a faint band across every bar, in phase; only `translateX` animates (replaces the old opacity breath) | none | Plain static bars |
| Launch splash reveal | Moment | `SplashReveal` / `SplashStatement` / `SplashGlowStatement` with `ErMark` | Once per cold start, handing off from the native splash (the one sanctioned on-mount moment) | Heavy impact at the lock beat | Resting frame, still dismisses |
| Hold-to-end fill | Reactive | Live match, End match button | While the finger holds; retracts on release | `matchEnd` when the hold completes | Unchanged (it tracks the touch) |
| Time-up drain bar | Moment | Live match state strip | Time is up: a 2px bar empties over the auto-end delay | none | Unchanged (it is a timer, not decoration) |
| Offline banner | Moment | Root layout, challenge prompt | Connectivity changes: slides in when offline, out when back (220ms) | none | Unchanged |

## Other

- **Wake lock (mobile):** the live match step keeps the screen awake via `expo-keep-awake`.
- **Web:** the web app keeps its reactive transitions and `.stagger-children` / `animate-page-in` (see Interaction Patterns); the Motion Rule's tiers and rules apply to it as well.

## Kit names for the colors the Motion Rule names

`brandOrange` is the kit's `heat-orange`; the countable-ember `#EC6A74` is `heat-red`; Signal Red is `signal-red`; the lifted red of the Accept sweep is `signal-red-lift`; Gain Green is `gain-green`. Heat colors appear only in the Arena ember, countable embers, the blade clash spark and the challenge afterglow.
