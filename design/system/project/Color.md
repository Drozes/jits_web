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
| `void` | `#0D0F14` | `#F8FAFC` | `bg-surface` | `bgPrimary` (`darkTokens` / `lightTokens`) | Page background |
| `panel` | `#13151B` | `#E8EBF0` | `bg-surface-2` | `bgSecondary` (`darkTokens` / `lightTokens`) | Header bars, tab bar, Arena strips, modal cards |
| `plate` | `#1E222B` | `#DEE2E9` | `bg-surface-3` | `bgElevated` (`darkTokens` / `lightTokens`) | Plates, cards, toasts, chips, inputs |
| `plate-bright` | `#262A34` | `#D2D7E0` | `bg-surface-4` | `bgElevatedHover` (`darkTokens` / `lightTokens`) | Pressed, focused and selected surfaces |
| `ink` | `#E8EDF2` | `#0D0F14` | `text-ink` | `textPrimary` (`darkTokens` / `lightTokens`) | Default text and all data values |
| `ink-2` | `#9CA3AF` | `#4B5563` | `text-ink-2` | `textSecondary` (`darkTokens` / `lightTokens`) | Secondary copy, header titles |
| `ink-3` | `#8D929D` | `#575C68` | `text-ink-3` | `textTertiary` (`darkTokens` / `lightTokens`) | Meta labels, helper text, inactive tabs |
| `on-signal` | `#0D0F14` | `#0D0F14` | `text-ink-on-cta` | `textOnAccent` (`darkTokens` / `lightTokens`) | Label on a red fill |
| `signal-red` | `#E63946` | `#E63946` | `bg-cta`, `border-cta` | `accentCta` (`darkTokens` / `lightTokens`) | Brand red: CTA fill and rules, never text |
| `signal-red-text` | `#EC6A74` | `#AC2B34` | `text-cta` | `accentCtaText` (`darkTokens` / `lightTokens`) | Red tuned for text |
| `signal-red-lift` | `#F0556B` | `#F0556B` | `bg-cta-hover` | `accentCtaHover` (`darkTokens` / `lightTokens`) | Pressed CTA fill |
| `gain-green` | `#22C55E` | `#116A33` | `text-positive`, `bg-positive` | `statePositive` (`darkTokens` / `lightTokens`) | Gains, wins, live |
| `negative` | `#EC6A74` | `#AC2B34` | `text-negative` | `stateNegative` (`darkTokens` / `lightTokens`) | Losses, errors, destructive |
| `neutral` | `#8D929D` | `#575C68` | (use `text-ink-3`) | `stateNeutral` (`darkTokens` / `lightTokens`) | No change |
| `hairline` | `rgba(107, 114, 128, 0.45)` | `rgba(13, 15, 20, 0.22)` | `border-hairline` | `borderHairline` (`darkTokens` / `lightTokens`) | Standard 1px border |
| `hairline-faint` | `rgba(107, 114, 128, 0.20)` | `rgba(13, 15, 20, 0.11)` | `border-hairline-faint` | `borderHairlineFaint` (`darkTokens` / `lightTokens`) | Faintest divider |
| `hairline-strong` | `rgba(107, 114, 128, 0.62)` | `rgba(13, 15, 20, 0.34)` | `border-hairline-strong` | `borderHairlineStrong` (`darkTokens` / `lightTokens`) | Chips, actions, avatars, selected edge |

The mobile CSS variables behind the classes are the web names (`--bg-primary`, `--text-tertiary`, `--accent-cta-text`, ...), written by `lib/theme/theme-provider.tsx` (`buildVars`, which also writes `--attention`, `--attention-rule`, `--heat-orange` and `--heat-red`). One class is remapped on purpose: `text-cta` resolves to `--accent-cta-text`, while `bg-cta` and `border-cta` stay the brand red (`tailwind.config.js` `theme.extend.textColor.cta`).

## Sub-palettes

### Attention (amber)

| Token | Dark | Light | Source |
|---|---|---|---|
| `attention` | `#F59E0B` | `#92400E` | `lib/tokens.ts` key `attention`; Tailwind `text-attention`, `border-attention`, `bg-attention` |
| `attention-rule` | `rgba(245,158,11,0.7)` | `rgba(146,64,14,0.6)` | `lib/tokens.ts` key `attentionRule`; Tailwind `border-attention-rule` |

Amber marks draws and pressure score, and the states that are waiting on something: pending, processing, paused, disputed (decided 2026-10-02). The CSS vars are `--attention` and `--attention-rule`, written by `theme-provider.tsx` like the core set; `usePalette().amber` / `.amberRule` and `useAmber()` (`components/match-detail/use-amber.ts`, which returns `text-attention` / `border-attention`) read the same token. Light mode uses amber-800 because amber-500 does not reach 4.5:1 on the light plates. Amber is never decoration: the launch splash's gold cap (`splash-reveal.tsx`, the dark `attention` value) is the one sanctioned exception, a brand moment, and is not to be copied.

### Heat (Arena only)

| Token | Value (both themes) | Source |
|---|---|---|
| `heat-orange` | `hsl(25, 95%, 53%)` (`#F97415`) | `lib/tokens.ts` key `heatOrange`; Tailwind `bg-heat-orange` (the legacy `brandOrange` holds the same value until WP4 deletes it) |
| `heat-red` | `#EC6A74` | `lib/tokens.ts` key `heatRed`; Tailwind `bg-heat-red` (`arena-tab-icon.tsx` `HEAT_EMBER_RED` reads it) |

Heat colors draw Arena heat and nothing else: the live embers (two `heat-orange`, one `signal-red`), the countable embers (`heat-red`), the blade clash spark (`signal-red`) and the challenge afterglow edge. Both are fixed across themes and both fall below 3:1 on every light surface (see Accessibility).

### On-media (fixed, over camera, video and photos)

Chrome over a camera preview, a video or a photo does not follow the app theme. ONE source holds it: `onMediaTokens` in `apps/mobile/lib/tokens.ts`. `ON_MEDIA` (`lib/theme/palette.ts`) is that object, and the live screen's `BROADCAST` (`components/match-flow/live/broadcast-tokens.ts`) maps its own key names onto it (merged in WP7, jits-3eeg.8, with every rendered value unchanged). Kit name = `on-media-` plus the kebab-cased key; the drift test locks this table to the code.

| Token | Value | `onMediaTokens` / `ON_MEDIA` key | `BROADCAST` alias |
|---|---|---|---|
| `on-media-white` | `#FFFFFF` | `white` | `white` |
| `on-media-text` | `#E8EDF2` | `text` | `inkDark` |
| `on-media-text2` | `rgba(232,237,242,0.72)` | `text2` | `body72` |
| `on-media-text-dim` | `rgba(232,237,242,0.62)` | `textDim` | `dim62` |
| `on-media-text3` | `rgba(232,237,242,0.55)` | `text3` | (none) |
| `on-media-tag-text` | `rgba(255,255,255,0.85)` | `tagText` | `tagText` |
| `on-media-strong` | `rgba(255,255,255,0.40)` | `strong` | `glassBorder` |
| `on-media-cta` | `#E63946` | `cta` | `cta` |
| `on-media-red` | `#F0556B` | `red` | `ctaHover` |
| `on-media-red-rule` | `rgba(240,85,107,0.7)` | `redRule` | (none) |
| `on-media-win` | `#22C55E` | `win` | (none; `LivePill` `onDark` reads it) |
| `on-media-amber` | `#F59E0B` | `amber` | `amber` |
| `on-media-amber-rule` | `rgba(245,158,11,0.7)` | `amberRule` | (none) |
| `on-media-amber-rule-soft` | `rgba(245,158,11,0.5)` | `amberRuleSoft` | `amberRule` |
| `on-media-amber-soft` | `rgba(245,158,11,0.16)` | `amberSoft` | `amberSoft` |
| `on-media-amber-spent` | `rgba(245,158,11,0.22)` | `amberSpent` | `amberSpent` |
| `on-media-black` | `#000000` | `black` | `black` |
| `on-media-ground` | `#0D0F14` | `ground` | `ground` |
| `on-media-track` | `rgba(255,255,255,0.18)` | `track` | (none) |
| `on-media-glass` | `rgba(255,255,255,0.08)` | `glass` | (none) |
| `on-media-glass-strong` | `rgba(255,255,255,0.12)` | `glassStrong` | `glassFill` |
| `on-media-glass-pressed` | `rgba(255,255,255,0.20)` | `glassPressed` | `glassFillPressed` |
| `on-media-tag` | `rgba(0,0,0,0.45)` | `tag` | (none) |
| `on-media-tag-soft` | `rgba(0,0,0,0.40)` | `tagSoft` | `tagFill` |
| `on-media-badge` | `rgba(0,0,0,0.88)` | `badge` | (none) |
| `on-media-scrim` | `rgba(0,0,0,0.55)` | `scrim` | `savingDim` |
| `on-media-dim` | `rgba(0,0,0,0.35)` | `dim` | `startingDim` |
| `on-media-slab` | `rgba(13,15,20,0.92)` | `slab` | `slab` |
| `on-media-tally-glass` | `rgba(13,15,20,0.72)` | `tallyGlass` | `tallyGlass` |
| `on-media-chip` | `rgba(232,235,240,0.96)` | `chip` | `plate` |
| `on-media-chip-border` | `rgba(13,15,20,0.34)` | `chipBorder` | `plateBorder` |
| `on-media-chip-track` | `rgba(13,15,20,0.25)` | `chipTrack` | `track` |
| `on-media-ink` | `#0D0F14` | `ink` | `ink` |
| `on-media-ink3` | `#575C68` | `ink3` | `ink3` |
| `on-media-ink-red` | `#AC2B34` | `inkRed` | `ctaText` |

**The on-media contrast rule:** on-media TEXT sits only on `on-media-badge` (the light inks: white, text, text2, text-dim, text3, tag-text, red, win, amber) or on the light `on-media-chip` (the dark inks: ink, ink3, ink-red). Those two grounds hold 4.5:1 whatever frame is under them. `on-media-tag`, `tag-soft`, `scrim`, `dim` and the glass fills are grounds for marks and controls; text on them depends on the frame (tag text over a white frame is about 2.9:1). `on-media-text3` is a label and mark tint: as text it belongs on the badge only. See Accessibility for the numbers.

## Usage rules

- Paint pages `void`, chrome `panel`, content `plate`, pressed and selected `plate-bright`. Never add a shadow to lift something; step the surface instead.
- Set text in `ink`; step down to `ink-2` for secondary copy and `ink-3` for mono labels 10px and up. Every number is `ink` unless it is a delta.
- Fill exactly one primary action per surface with `signal-red`, labelled in `on-signal`. Its pressed fill is `signal-red-lift`.
- Never set text in `signal-red`. Red words use `negative` (losses, errors) or `signal-red-text`.
- Use `signal-red` as a rule only where it means "act" or "the leader": the active tab edge, the accent Plate rail, the EloTile bar, the countdown drain bar, CountPill, the leader rule.
- Use `gain-green` only for rating increases, wins and LIVE. A ready check, a confirmed result, an upload that finished and a recording light are not gains: draw them in `ink` with a glyph.
- Use `attention` for draws, pressure, and pending, processing, paused or disputed states; its rules use `attention-rule`.
- Use `heat-orange` and `heat-red` only on the Arena tab icon and the challenge afterglow.
- Show a selected option with `plate-bright` plus a `hairline-strong` edge and an `ink` check glyph, never a red fill, edge, dot or check: `selectionSurface(selected)` and `SelectCheck` in `components/ui/elo-system/selection.tsx` (shipped in WP2). The Chip uses the surface step and an `ink` label without the glyph; the match flow uses `usePalette().panel` (the same `plate-bright`) and an `ink` check.
- Tint spinners and pull-to-refresh `ink-3` (`textTertiary`) or `ink-2`, never red. Draw data bars (submission breakdown, weekly activity) in `ink-2` and the leader's rank numeral in `ink`: data is ink, the leader is marked by its red rule.
- Draw a switch with the one neutral look, `switchColors()` in `components/ui/switch.tsx`: `ink` track when on, `ink-3` when off, a `void` thumb. Never a red or green track.
- Tint icons with ink steps (`ink-2`, `ink-3`); a notification or section icon is never red or green.
- `__tests__/components/ui/color-semantics-guard.test.ts` holds every file that still draws Signal Red or Gain Green, with its line count and the reason (a CTA fill, an "act" or leader rule, a negative, a gain, a win, LIVE, Arena heat, brand chrome under Open decision 12). A new red or green line fails until it is reviewed and listed.
- Draw every border 1px in a hairline color; 2px (`stroke-edge`) and 3px (`stroke-rail`) widths exist only for state edges and rails.
- Over media, use the `on-media-*` set (`ON_MEDIA` or `onMediaTokens`, never a new literal) and keep text on `on-media-badge` or the light `on-media-chip`.

## Known non-tokens in code (not to copy)

- Push notification accent `#ef4444` (Tailwind red-500) in `app.json:119` is not a brand color. The Android channel light in `lib/notifications/register-push.ts` now uses `signal-red` (WP7); the `app.json` value is native config and changes only with the next store build.
- The splash files read the dark tokens (`darkTokens`, `onMediaTokens.white`) instead of hard-coding them (WP7). Their gold cap is the dark `attention` value, a sanctioned one-off for the launch moment, not a pattern.
- `palette.ts` also carries `winRule`, `secondaryBg`, `secondaryBgPressed` and `track` for the match flow; they are JS mirrors, not kit tokens. Its old `selectedBg` (`rgba(230,57,70,0.16)`, a red selection tint) was retired in WP2.
- Legacy shadcn colors (`primary`, `muted`, `card`, `success` and friends) are retiring; see Legacy.
