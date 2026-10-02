# Layout

Spacing, radius, borders, sizes and safe areas, all in the px the device actually renders.

## The 14px rem rule

On native, NativeWind's rem is **14px**, not 16. `withNativeWind(config, { input })` in `apps/mobile/metro.config.js:18-20` passes no `inlineRem`, so NativeWind's default of 14 applies. Every rem-based Tailwind class renders at 87.5% of its web size:

- One spacing step is 0.25rem = **3.5px**: `p-4` = 14px, `gap-2` = 7px, `h-11` = 38.5px, `h-8` = 28px.
- `text-xs` = 10.5px, `text-sm` = 12.25px, `text-base` = 14px.
- Arbitrary values (`text-[12px]`, `h-[44px]`, `border-l-[3px]`) and inline style numbers stay literal.

Write sizes for the kit, for boards and for previews in these device px. The web app (rem 16) renders the same class 14% larger: web `Plate` padding is 16px where mobile `Plate` is 14px.

## Spacing

The mobile scale is Tailwind's default (no `spacing` extension in `tailwind.config.js`). Tokens are named by NativeWind step, for the steps the app uses:

| Token | Step | px | Padding / margin / gap uses |
|---|---|---|---|
| `space-0.5` | 0.5 | 1.75 | 11 |
| `space-1` | 1 | 3.5 | 70 |
| `space-1.5` | 1.5 | 5.25 | 13 |
| `space-2` | 2 | 7 | 169 |
| `space-2.5` | 2.5 | 8.75 | 4 |
| `space-3` | 3 | 10.5 | 203 (the most used) |
| `space-4` | 4 | 14 | 146 |
| `space-5` | 5 | 17.5 | 34 |
| `space-6` | 6 | 21 | 20 |
| `space-8` | 8 | 28 | 11 |
| `space-10` | 10 | 35 | 1 |
| `space-11` | 11 | 38.5 | 2 |
| `space-12` | 12 | 42 | 3 |
| `space-16` | 16 | 56 | 10 |
| `gutter` | (literal) | 16 | screen side gutter |

In CSS the dotted names are escaped: `var(--space-0\.5)`, `var(--space-1\.5)`, `var(--space-2\.5)`.

- Pad a `Plate` with `space-4` (14px).
- Keep screen content `gutter` (16px) from the screen edges: `PageContainer` (`page-container.tsx:33`) and the header bars (`app-header.tsx:71`) use a literal 16, widened by the safe-area inset in landscape.
- Leave room for the tab bar: `PageContainer` pads the bottom 96px plus the inset (16px plus inset on screens with no tab bar).
- Prefer steps over literals. The match flow still has 106 off-grid inline paddings (R3 MF-6).

## Radius

| Token | Value | Tailwind (mobile) | Use |
|---|---|---|---|
| `radius-tag` | 2px | `rounded-xs` (60 uses) | Tags, chips, MetaTag, Avatar32, OutlineAction, StripShell, CountPill |
| `radius-button` | 3px | `rounded-sm` (38) | Buttons (CtaButton, FightButton, glass buttons) |
| `radius-plate` | 4px | `rounded-md` (47) | THE default: plates, cards, rating tiles, toasts, popovers |
| `radius-sheet` | 8px | `rounded-lg` (5) | Sheets and modals only, the ceiling |
| `radius-round` | 9999px | `rounded-full` (14) | Live dots, status dots and seek markers only (D-6: play buttons and check badges are not dots) |

Sources: `tailwind.config.js:183-190`, `FIGHT_RADIUS` (`fight-tokens.ts:9`), `BROADCAST_RADIUS` (`broadcast-tokens.ts:36`), `PROMPT_RADIUS = 8` (`challenge-prompt-sheet.tsx:89`).

- Corners are sharp. Nothing exceeds `radius-sheet`.
- A bottom sheet takes `radius-sheet` on its top corners only. Today every gorhom sheet renders the library's 15px default (R3 SH-1, WP1).
- Web Tailwind `rounded-sm` is 2px, not 3px; the token is 3px.
- `Avatar32` is a 2px-radius square in code, while the old DESIGN.md says avatars are circular. See Open decisions in the README.

## Borders

| Token | Value | Use |
|---|---|---|
| `stroke-hairline` | 1px | Every border and divider (321 `border` class uses, 50 inline `borderWidth: 1`) |
| `stroke-edge` | 2px | State edges: the active tab top edge in `signal-red`, the challenge afterglow edge, the time-up drain bar |
| `stroke-rail` | 3px | Rails: the Plate accent / live / win / loss left rail, the StripShell rail, the EloTile bottom bar |

"Hairline" means a 1px line in a hairline color (`hairline`, `hairline-faint`, `hairline-strong`), not `StyleSheet.hairlineWidth` (never used). The old "no 2px borders" rule is contradicted by the code; the 2px and 3px widths above are the sanctioned exceptions.

## Shadows

None. There is no shadow token family and there will not be one. Hierarchy comes from surface steps (`void`, `panel`, `plate`, `plate-bright`) and hairlines. The toast zeroes its shadow explicitly (`components/ui/toast.tsx:133`). The single shadow in the app is the launch splash's text halo (`splash-statement.tsx:241-243`), sanctioned for that moment only. No gradients either, except camera scrims.

## Sizes

| Token | Value | Use |
|---|---|---|
| `size-header` | 56px | Header bar height, plus the top inset (`app-header.tsx:69`) |
| `size-button` | 56px | FightButton default height (`fight-ui.tsx:113`) |
| `size-hit` | 44px | Minimum touch target; OutlineAction reaches it with an 8px vertical `hitSlop` |
| `size-action` | 28px | OutlineAction (`h-8`), Avatar32 (`w-8 h-8`; 28px on device despite the name) |
| `size-tab-icon` | 18px | Tab bar icons (`elo-tab-bar.tsx:260`) |
| `size-live-dot` | 7px | LiveDot default (`live-pill.tsx:63`) |
| `safe-top` | 47px | Top safe area for 390px frames (`design/native-screens/BUILD-SPEC.md:123`) |
| `safe-bottom` | 34px | Bottom safe area (`BUILD-SPEC.md:124`) |

Other fixed sizes live with their components: the live broadcast HUD uses `BROADCAST_SIZE` (strip 32, bar 56, slab 104, controls 64, tally 28, max width 480; `broadcast-tokens.ts:38-45`) and `BROADCAST_LANDSCAPE`.

## Opacity

| Token | Value | Use |
|---|---|---|
| `opacity-disabled` | 0.5 | The one disabled style (`button.tsx:100`, FightButton, OutlineAction). Three sites still use 0.6 (R3 BT-7) |
| `opacity-pressed` | 0.7 | Press dip on rows, chips and ghost links that do not scale (`active:opacity-70`) |
| `opacity-reduced-press` | 0.85 | PressableScale's dip under Reduce Motion (`pressable-scale.tsx:45`) |
| `opacity-ember-min` | 0.35 | Countable embers never fade below this (`arena-tab-icon.tsx:143`) |

## Screen frame

- Design at 390px wide (the canvas board width), dark first.
- A tab root is: header bar (`panel`, `size-header` plus inset, `hairline` bottom rule), a scrolling `void` body with a `gutter`, and the tab bar (`panel`, four tabs: Home, Arena, Rankings, Profile).
- Pushed screens use `AppHeader` ([back | title | live dot and actions]); Home and Rankings use `BrandHeader` (the wordmark); Arena and Profile use `TabHeader` (title plus the status chip and the bell, 8px apart).
- Immersive routes (the match flow, profile setup) hide the tab bar.

## Z order

Mobile has no z tokens. In use: splash overlays 9999, the offline banner 1000, the update banner 900. The web ladder (`tokens.css:235-241`: 1 / 10 / 100 / 1000 / 1100 / 1200 / 1300) is web only.
