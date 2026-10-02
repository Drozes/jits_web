# Color

Color in ELO RATED is semantic and scarce. Surfaces carry hierarchy, ink carries content, and three colors carry meaning: Signal Red (act, or lose), Gain Green (gain, win, live) and amber `attention` (a draw, or something waiting). Everything else is grey. There is no decorative color.

Every value below is exact from `apps/mobile/lib/tokens.ts` (the source of truth, guarded by `__tests__/lib/tokens-mirror-drift.test.ts`), `apps/mobile/lib/theme/palette.ts`, and the Arena icon constants. The web file `apps/web/app/design-system/tokens.css` mirrors the 17 core values byte for byte.

## Themes

- **`dark` (Void) is the default and the first theme.** The app paints dark before first paint (`colorScheme.set("dark")`, `app/_layout.tsx:62`), restores a stored preference, and offers Light, Dark and System in Settings.
- **`light` (Paddock)** is fully supported with the same token names.
- In dark, surfaces step **lighter** as they lift; in light they step **darker**. The extreme surface (`plate-bright`) sets the contrast floor for every ink in both themes.

## Core tokens (17)

| Token | Dark | Light | Tailwind class (mobile) | tokens.ts key | Role |
|---|---|---|---|---|---|
| `void` | `#0D0F14` | `#F8FAFC` | `bg-surface` | `bgPrimary` (l.143 / l.96) | Page background |
| `panel` | `#13151B` | `#E8EBF0` | `bg-surface-2` | `bgSecondary` (l.144 / l.97) | Header bars, tab bar, Arena strips, modal cards |
| `plate` | `#1E222B` | `#DEE2E9` | `bg-surface-3` | `bgElevated` (l.145 / l.98) | Plates, cards, toasts, chips, inputs |
| `plate-bright` | `#262A34` | `#D2D7E0` | `bg-surface-4` | `bgElevatedHover` (l.146 / l.99) | Pressed, focused and selected surfaces |
| `ink` | `#E8EDF2` | `#0D0F14` | `text-ink` | `textPrimary` (l.147 / l.100) | Default text and all data values |
| `ink-2` | `#9CA3AF` | `#4B5563` | `text-ink-2` | `textSecondary` (l.148 / l.101) | Secondary copy, header titles |
| `ink-3` | `#8D929D` | `#575C68` | `text-ink-3` | `textTertiary` (l.149 / l.102) | Meta labels, helper text, inactive tabs |
| `on-signal` | `#0D0F14` | `#0D0F14` | `text-ink-on-cta` | `textOnAccent` (l.150 / l.103) | Label on a red fill |
| `signal-red` | `#E63946` | `#E63946` | `bg-cta`, `border-cta` | `accentCta` (l.151 / l.104) | Brand red: CTA fill and rules, never text |
| `signal-red-text` | `#EC6A74` | `#AC2B34` | `text-cta` | `accentCtaText` (l.152 / l.105) | Red tuned for text |
| `signal-red-lift` | `#F0556B` | `#F0556B` | `bg-cta-hover` | `accentCtaHover` (l.153 / l.106) | Pressed CTA fill |
| `gain-green` | `#22C55E` | `#116A33` | `text-positive`, `bg-positive` | `statePositive` (l.154 / l.107) | Gains, wins, live |
| `negative` | `#EC6A74` | `#AC2B34` | `text-negative` | `stateNegative` (l.155 / l.108) | Losses, errors, destructive |
| `neutral` | `#8D929D` | `#575C68` | (use `text-ink-3`) | `stateNeutral` (l.156 / l.109) | No change |
| `hairline` | `rgba(107, 114, 128, 0.45)` | `rgba(13, 15, 20, 0.22)` | `border-hairline` | `borderHairline` (l.157 / l.110) | Standard 1px border |
| `hairline-faint` | `rgba(107, 114, 128, 0.20)` | `rgba(13, 15, 20, 0.11)` | `border-hairline-faint` | `borderHairlineFaint` (l.158 / l.111) | Faintest divider |
| `hairline-strong` | `rgba(107, 114, 128, 0.62)` | `rgba(13, 15, 20, 0.34)` | `border-hairline-strong` | `borderHairlineStrong` (l.159 / l.112) | Chips, actions, avatars, selected edge |

The mobile CSS variables behind the classes are the web names (`--bg-primary`, `--text-tertiary`, `--accent-cta-text`, ...), written by `lib/theme/theme-provider.tsx:46-62`. One class is remapped on purpose: `text-cta` resolves to `--accent-cta-text`, while `bg-cta` and `border-cta` stay the brand red (`tailwind.config.js:176-182`).

## Sub-palettes

### Attention (amber)

| Token | Dark | Light | Source |
|---|---|---|---|
| `attention` | `#F59E0B` | `#92400E` | `lib/theme/palette.ts:74` |
| `attention-rule` | `rgba(245,158,11,0.7)` | `rgba(146,64,14,0.6)` | `lib/theme/palette.ts:75` |

Amber marks draws and pressure score, and the states that are waiting on something: pending, processing, paused, disputed (as the code uses it, `palette.ts:40`). It is not in `tokens.ts` yet; `components/match-detail/use-amber.ts` still reaches it through Tailwind's `text-amber-500` / `text-amber-800`. Light mode uses amber-800 because amber-500 does not reach 4.5:1 on the light plates.

### Heat (Arena only)

| Token | Value (both themes) | Source |
|---|---|---|
| `heat-orange` | `hsl(25, 95%, 53%)` (`#F97415`) | `lib/tokens.ts:92,139` (legacy key `brandOrange`) |
| `heat-red` | `#EC6A74` | `components/layout/arena-tab-icon.tsx:138` (`HEAT_EMBER_RED`) |

Heat colors draw Arena heat and nothing else: the live embers (two `heat-orange`, one `signal-red`), the countable embers (`heat-red`), the blade clash spark (`signal-red`) and the challenge afterglow edge. Both are fixed across themes and both fall below 3:1 on every light surface (see Accessibility).

### On-media (fixed, over camera, video and photos)

Chrome over a camera preview, a video or a photo does not follow the app theme. Two overlapping constant sets exist today and WP7 merges them; the kit tokens are named after `ON_MEDIA` (`lib/theme/palette.ts:95-125`), with the `BROADCAST` equivalent noted (`components/match-flow/live/broadcast-tokens.ts:6-34`).

| Token | Value | ON_MEDIA key | BROADCAST twin |
|---|---|---|---|
| `on-media-white` | `#FFFFFF` | `white` | `white` |
| `on-media-text` | `#E8EDF2` | `text` | `inkDark` |
| `on-media-text2` | `rgba(232,237,242,0.72)` | `text2` | `body72` |
| `on-media-text3` | `rgba(232,237,242,0.55)` | `text3` | (none; `dim62` is 0.62) |
| `on-media-tag-text` | `rgba(255,255,255,0.85)` | `tagText` | `tagText` |
| `on-media-strong` | `rgba(255,255,255,0.40)` | `strong` | `glassBorder` |
| `on-media-cta` | `#E63946` | `cta` | `cta` |
| `on-media-red` | `#F0556B` | `red` | `ctaHover` |
| `on-media-red-rule` | `rgba(240,85,107,0.7)` | `redRule` | (none) |
| `on-media-win` | `#22C55E` | `win` | (none; `live-pill.tsx:41` `ON_DARK_GREEN`) |
| `on-media-amber` | `#F59E0B` | `amber` | `amber` |
| `on-media-amber-rule` | `rgba(245,158,11,0.7)` | `amberRule` | `amberRule` is 0.5 |
| `on-media-track` | `rgba(255,255,255,0.18)` | `track` | `track` is `rgba(13,15,20,0.25)` (different) |
| `on-media-glass` | `rgba(255,255,255,0.08)` | `glass` | (none) |
| `on-media-glass-strong` | `rgba(255,255,255,0.12)` | `glassStrong` | `glassFill` (pressed `rgba(255,255,255,0.20)`) |
| `on-media-tag` | `rgba(0,0,0,0.45)` | `tag` | `tagFill` is 0.40 |
| `on-media-badge` | `rgba(0,0,0,0.88)` | `badge` | (none) |
| `on-media-scrim` | `rgba(0,0,0,0.55)` | `scrim` | `savingDim` |
| `on-media-chip` | `rgba(232,235,240,0.96)` | `chip` | `plate` |
| `on-media-chip-border` | `rgba(13,15,20,0.34)` | `chipBorder` | `plateBorder` |
| `on-media-ink` | `#0D0F14` | `ink` | `ink` |
| `on-media-ink3` | `#575C68` | `ink3` | `ink3` |
| `on-media-ink-red` | `#AC2B34` | `inkRed` | `ctaText` |

`BROADCAST` also holds values with no `ON_MEDIA` twin: `black #000000`, `ground #0D0F14`, `amberSoft rgba(245,158,11,0.16)`, `amberSpent rgba(245,158,11,0.22)`, `slab rgba(13,15,20,0.92)`, `glassFillPressed rgba(255,255,255,0.20)`, `tallyGlass rgba(13,15,20,0.72)`, `dim62 rgba(232,237,242,0.62)`, `startingDim rgba(0,0,0,0.35)`. They stay in the live broadcast HUD and are not kit tokens.

Rule: on-media text holds 4.5:1 only on `on-media-badge` (or over a frame known to be dark). Over a bare scrim or tag fill a bright frame drops it below the floor.

## Usage rules

- Paint pages `void`, chrome `panel`, content `plate`, pressed and selected `plate-bright`. Never add a shadow to lift something; step the surface instead.
- Set text in `ink`; step down to `ink-2` for secondary copy and `ink-3` for mono labels 10px and up. Every number is `ink` unless it is a delta.
- Fill exactly one primary action per surface with `signal-red`, labelled in `on-signal`. Its pressed fill is `signal-red-lift`.
- Never set text in `signal-red`. Red words use `negative` (losses, errors) or `signal-red-text`.
- Use `signal-red` as a rule only where it means "act" or "the leader": the active tab edge, the accent Plate rail, the EloTile bar, the countdown drain bar, CountPill, the leader rule.
- Use `gain-green` only for rating increases, wins and LIVE. A ready check, a confirmed result, an upload that finished and a recording light are not gains: draw them in `ink` with a glyph.
- Use `attention` for draws, pressure, and pending, processing, paused or disputed states; its rules use `attention-rule`.
- Use `heat-orange` and `heat-red` only on the Arena tab icon and the challenge afterglow.
- Show a selected option with `plate-bright` plus a `hairline-strong` edge and an `ink` check glyph, never a red fill (WP2 target; the code still fills some radios, checkboxes and chips red).
- Draw every border 1px in a hairline color; 2px (`stroke-edge`) and 3px (`stroke-rail`) widths exist only for state edges and rails.
- Over media, use the `on-media-*` set and keep text on `on-media-badge`.

## Known non-tokens in code (not to copy)

- Push notification accent `#ef4444` (Tailwind red-500) in `app.json:119` and `lib/notifications/register-push.ts:88` is not a brand color (WP7 points it at `signal-red`).
- Splash files hard-code `#0D0F14`, `#E8EDF2`, `#FFFFFF`, `#9CA3AF`, `#E63946` and a gold `#f59e0b` (`splash-reveal.tsx:27-31`); the gold is outside the system.
- `palette.ts` also carries `winRule`, `secondaryBg`, `secondaryBgPressed`, `selectedBg` (`rgba(230,57,70,0.16)`, a red tint that WP2 retires) and `track` for the match flow; they are JS mirrors, not kit tokens.
- Legacy shadcn colors (`primary`, `muted`, `card`, `success` and friends) are retiring; see Legacy.
