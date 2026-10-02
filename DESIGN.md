# ELO RATED Design System

> This document is the consolidated ELO RATED brand book. It carries the same text as the live Design System artifact "ELO RATED Design System", https://claude.ai/artifact/NkvxzxKo3R7acP5j6aRTTe (version `1790950472-1c4c`), whose files are mirrored in [design/system/project/](design/system/project/) (see [design/system/README.md](design/system/README.md) for how to update both). Tokens live in [design/system/project/tokens.json](design/system/project/tokens.json); component cards in `design/system/project/components/`. **Code wins:** values come from [apps/mobile/lib/tokens.ts](apps/mobile/lib/tokens.ts) and [apps/mobile/lib/motion/tokens.ts](apps/mobile/lib/motion/tokens.ts); where this document and the code disagree, fix the document. Screens are drawn on the "ELO RATED Native Screens" canvas, https://claude.ai/artifact/PJWm2WeqsG56HS13jHsd5D.

ELO RATED is a ranked-match app for Brazilian jiu-jitsu. Athletes go live in the **Arena**, challenge someone close to their rating and weight, roll, confirm the result, and watch their **ELO** move. Every match is ranked. The product should feel like premium sports tech (think timing screens and broadcast graphics): dark, precise, data-forward, and quiet until something real happens.

This system describes the mobile app (`apps/mobile` in jits_web), which is the source of truth. Web appears only as parity notes. Read this page first, then the sections: [Color](#color), [Typography](#typography-1), [Layout](#layout), [Motion](#motion-1), [Accessibility](#accessibility), [Components](#components), [Conformance](#conformance), [Legacy](#legacy-retiring-wp4).

## Voice and copy

- **Speak like the mat, not like a dashboard.** Short, active, second person, no exclamation marks: "Go live", "Closest match", "Nobody else on the mat", "You are live", "Know someone who'd beat you? Invite them."
- **Labels you act on are verbs in caps,** set by style rather than typed in caps: ROLL, OPEN, CANCEL, CONFIRM, ACCEPT, DECLINE, CONFIRM RESULT, SHARE MATCH, WATCH FILM. Write the source string in sentence case ("Confirm result") and let the `button` or `action-sm` style uppercase it, so VoiceOver reads words, not letters.
- **Moments are loud and short:** "YOU WON", "GO", "ON AIR", "LIVE". The brand line is "WE ARE / ELO RATED / ARE YOU?" with only "ARE YOU?" in red, on the launch splash.
- **Errors say what failed and what to do,** in plain sentence case: "Could not load dashboard", "Could not save notification settings. Please try again." The retry action is "Try again".
- **Dismissals are soft:** "Not now", "Later". Never guilt the athlete.
- **Numbers are exact and unitized:** ELO as a bare integer (1512), deltas with an arrow and a sign ("▲ +14", true minus U+2212 for losses), weight in pounds: "172.5 LBS" in data strips, "lbs" in prose. Never kg.
- **Names are initials when space is short:** "F·L" with a middle dot.
- **No em dashes** in product copy or docs; use a comma, colon, parentheses or a new sentence. No emoji.

## Visual foundations

- **Dark first.** Design in the `dark` theme (Void); `light` (Paddock) must also work with the same token names.
- **Surfaces step, nothing floats.** Paint the page `void`, chrome (headers, tab bar, Arena strips) `panel`, content `plate`, pressed and selected `plate-bright`. In dark the steps get lighter, in light darker. There are no shadows and no gradients (camera scrims excepted).
- **Hairlines, not boxes.** Draw every border 1px in `hairline`, `hairline-faint` or `hairline-strong`. Use a 2px `stroke-edge` only for state edges (the active tab, the challenge afterglow) and a 3px `stroke-rail` only for rails (Plate accent, StripShell, the EloTile bar).
- **Sharp corners.** `radius-tag` 2px for tags, chips and avatars, `radius-button` 3px for buttons, `radius-plate` 4px for everything else, `radius-sheet` 8px for sheets and modals and never more. Only dots are round.
- **Ink for content.** Text in `ink`, secondary copy in `ink-2`, mono labels 10px and up in `ink-3`. Every number is `ink` unless it is a delta.
- **Signal Red means "act" or "lose".** Fill ONE primary action per surface with `signal-red`, label it in `on-signal` (never white), press it to `signal-red-lift`. Red text uses `negative` (losses, errors) or `signal-red-text`, never `signal-red`. Red never decorates data, spinners, icons, switches or selections.
- **Gain Green means "gain, win, live".** `gain-green` only for rating increases, wins and LIVE. A ready check, a confirmed result or a finished upload is `ink` with a glyph.
- **Amber means "draw" or "waiting".** `attention` for draws, pressure score, and pending, processing, paused or disputed states.
- **Heat is the Arena's alone.** `heat-orange` and `heat-red` appear only on the Arena tab icon's embers and the challenge afterglow.
- **Selected is a surface, not a color.** A selected option steps to `plate-bright` with a `hairline-strong` edge and an `ink` check. Never a red fill.
- **No decorative color.** If a color does not mean one of the above, it is grey.
- **Over media, use the on-media set.** Chrome over the camera, video or a photo uses the fixed `on-media-*` tokens in both themes, with text on `on-media-badge` or the light `on-media-chip`.

## Typography

- `display` (Bebas Neue): the wordmark and display numerals 40px and up (the countdown, the GO slam). Always caps.
- `heading` (DM Sans 700): buttons, tabs, chips, header titles, in caps with tracking; plate titles in sentence case.
- `body` (Inter): prose and helper copy.
- `mono` (JetBrains Mono): every number, with tabular figures, and caps meta labels at `tracking-caps-l` (1.68px) or wider.
- 10px is the floor. The text styles in `tokens.json` are the real top combinations; the most common label is `meta-label` (mono 10px, 1.68px tracking, caps).

## Motion

Motion carries meaning or does not exist. Every animation is **Reactive** (a response to touch), a **Moment** (one shot on a real state change, never on mount) or **Ambient** (a loop only while a state is live), runs on the UI thread, has a still Reduce Motion end state, and is listed in the [registry](#registry). The rhythm: `instant` 100ms, `fast` 240ms, `base` 480ms, `slow` 720ms, `pulse` 1400ms, brand ease-out `cubic-bezier(0.22, 1, 0.36, 1)`, press scale 0.97. Never a haptic on a loss or for ambient motion. Previews show the resting end state.

## Iconography

- **lucide** (`lucide-react-native` 1.16 on mobile, `lucide-react` on web): 24-unit grid, no fill, stroke 2, round caps and joins. 52 distinct icons ship; do not mix in another set and do not redraw them.
- **Size:** tab bar icons 18px (`size-tab-icon`), header back chevron 20px, media controls 22 to 28px.
- **Color:** icons take an ink (`ink` active, `ink-3` inactive, `ink-2` for the back chevron), never `signal-red` as decoration. Over media, `on-media-white`.
- **The Arena icon** is lucide `Swords` split into two blade halves so it can carry heat: blade A (polyline `14.5 17.5 3 6 3 3 6 3 17.5 14.5`, lines 13,19 to 19,13; 16,16 to 20,20; 19,21 to 21,19) and blade B (polyline `14.5 6.5 18 3 21 3 21 6 17.5 9.5`, lines 5,14 to 9,18; 7,17 to 4,20; 3,19 to 5,21). At rest it is exactly lucide `Swords`. Live: three 2px embers (two `heat-orange`, one `signal-red`). One to three pending challenges: that many 2.5px `heat-red` embers. More than three: the `CountPill` returns.
- **The logo** is the E·R lettermark: DM Sans Bold letters in `#E8EDF2` with a square Signal Red `#E63946` interpunct, on Void `#0D0F14` (`design/system/project/assets/Logos/`). The wordmark "ELO RATED" has no file: set it live in `display` with `tracking-mark`. The old red-E-with-gold-peak `logo.svg` is retired.

## Consuming this kit

- **Token names** are the kit names in `tokens.json` (`void`, `ink-3`, `signal-red`, `radius-plate`, `space-4`, ...). In a preview or web page they are CSS custom properties of the same name (`var(--void)`, `var(--radius-plate)`, `var(--font-mono)`; dotted steps escape: `var(--space-1\.5)`), and each text style is a class (`.meta-label`).
- **In the RN code** the same values are NativeWind classes (`bg-surface`, `bg-surface-2/3/4`, `text-ink`, `text-ink-2/3`, `text-ink-on-cta`, `bg-cta`, `text-cta`, `text-positive`, `text-negative`, `border-hairline(-faint|-strong)`, `rounded-xs/sm/md/lg`, `font-display/heading/body/mono`, `tracking-caps(-l|-xl)`); [Color](#color) lists the mapping. JS call sites use `useThemedTokens()`, `usePalette()` or `ON_MEDIA`.
- **Units:** every length is device px at **NativeWind rem = 14px** (one spacing step = 3.5px; `p-4` = 14px). Arbitrary `[Npx]` values stay literal. Web renders the same class at rem 16.
- **Where the code lives (jits_web):** colors `apps/mobile/lib/tokens.ts` (the source of truth; web `apps/web/app/design-system/tokens.css` mirrors it), classes `apps/mobile/tailwind.config.js`, match-flow palette `apps/mobile/lib/theme/palette.ts`, motion `apps/mobile/lib/motion/`, primitives `apps/mobile/components/ui/elo-system/`, Arena `apps/mobile/components/arena/`, chrome `apps/mobile/components/layout/`.
- **Screens:** the ELO RATED Native Screens canvas mirrors the shipped app; draw boards from this kit's tokens at 390px wide, dark.

## Component cards

Twenty cards, each a static HTML twin of the RN component with a README (`components/<Name>/`). Cards marked target draw the WP end state; their READMEs show today's code too.

| Family | Cards |
|---|---|
| Actions | Button (target, WP3), OutlineAction |
| Status | MetaTag, LivePill (with LiveDot), CountPill (with tab badges) |
| Data | EloTile, RollingNumber (settled frame), DeltaChip |
| Navigation | TabBar (with the Arena icon's embers), AppHeader (with the header status chip), Chip |
| Surfaces | Plate, Sheet (target, WP1) |
| Feedback | Toast, Skeleton |
| Identity | Avatar |
| Arena | OnAirStrip, ChallengeStrip |
| Match flow | Countdown, RatingMoment |

## Open decisions (decided by default, owner to confirm)

1. **Source of truth:** `apps/mobile/lib/tokens.ts` and `lib/motion/tokens.ts`; web `tokens.css` mirrors them (the old DESIGN.md claimed the reverse; the drift test already treats mobile as the source).
2. **Units:** device px at rem 14.
3. **Theme order:** `dark` first, then `light`.
4. **Color set:** the 17 core tokens plus `attention` (amber, scoped to draws, pressure and pending, processing, paused or disputed states, as the code does), `heat-orange` and `heat-red` (Arena heat only), and the `on-media-*` set (named after `ON_MEDIA`; `BROADCAST` overlaps it and merges in WP7). Legacy shadcn colors are not kit tokens.
5. **Display numerals:** Bebas Neue is allowed for numerals 40px and up as brand moments (countdown 240px, GO 116px, the wordmark); every other number is mono. Face-off weights are 36px Bebas today: either raise them to 40px or accept 36px as the floor.
6. **Radius scale:** 2 tag, 3 button, 4 plate (default), 8 sheets and modals maximum; dots round. Avatars: the code's `Avatar32` is a 2px-radius square, while the old DESIGN.md said avatars stay circular; the kit follows the code (square) until decided.
7. **Shadows:** none; no shadow family.
8. **Weight unit:** lbs (code truth; DESIGN.md's kg is wrong).
9. **Selected state:** `plate-bright` plus a `hairline-strong` edge and an `ink` check, never a red fill (the WP2 target; `hairline-strong` alone is below 3:1, so the surface step and the glyph are required).
10. **Motion values** live in the [Motion](#motion-1) section (the format has no motion family).
11. **Logo:** the E·R lettermark SVGs; the old `apps/web/public/logo.svg` is retired; the wordmark is live Bebas Neue text, no file.
12. **Wizard progress segments** in `signal-red` (MF-8) and the "VS" in red display type (MF-12) are treated as brand chrome until decided.
13. **Destructive button:** an outline in `negative` (border and label; 6.28:1 on `void` dark, 6.37:1 light), proposed by the kit. The code has no ELO destructive button: today's `DestructiveButton` (one use, Delete account) fills with the legacy red under a `#E8EDF2` label at 3.54:1 and reads as a second red CTA.
14. **Chip selected state:** `plate-bright` fill, `hairline-strong` border, `ink` label, no red square (the WP2 target, bead jits-3eeg.3). Today the active chip takes a Signal Red border and a 6px red square.

## Not synced

Not carried into tokens: web-only values (the web `--size-*` type scale, the web z-index ladder, web `--opacity-*`, the shadcn `--chart-*` slots), `BROADCAST` values with no `ON_MEDIA` twin, `palette.ts` match-flow mirrors (`winRule`, `secondaryBg`, `secondaryBgPressed`, `selectedBg`, `track`), the splash gold `#f59e0b`, and the push accent `#ef4444`. Components are static HTML twins hand-written from the RN sources (React Native cannot run in the preview frame); no bundle was built.

## Color

Color in ELO RATED is semantic and scarce. Surfaces carry hierarchy, ink carries content, and three colors carry meaning: Signal Red (act, or lose), Gain Green (gain, win, live) and amber `attention` (a draw, or something waiting). Everything else is grey. There is no decorative color.

Every value below is exact from `apps/mobile/lib/tokens.ts` (the source of truth, guarded by `__tests__/lib/tokens-mirror-drift.test.ts`), `apps/mobile/lib/theme/palette.ts`, and the Arena icon constants. The web file `apps/web/app/design-system/tokens.css` mirrors the 17 core values byte for byte.

### Themes

- **`dark` (Void) is the default and the first theme.** The app paints dark before first paint (`colorScheme.set("dark")`, `app/_layout.tsx:62`), restores a stored preference, and offers Light, Dark and System in Settings.
- **`light` (Paddock)** is fully supported with the same token names.
- In dark, surfaces step **lighter** as they lift; in light they step **darker**. The extreme surface (`plate-bright`) sets the contrast floor for every ink in both themes.

### Core tokens (17)

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

### Sub-palettes

#### Attention (amber)

| Token | Dark | Light | Source |
|---|---|---|---|
| `attention` | `#F59E0B` | `#92400E` | `lib/theme/palette.ts:74` |
| `attention-rule` | `rgba(245,158,11,0.7)` | `rgba(146,64,14,0.6)` | `lib/theme/palette.ts:75` |

Amber marks draws and pressure score, and the states that are waiting on something: pending, processing, paused, disputed (as the code uses it, `palette.ts:40`). It is not in `tokens.ts` yet; `components/match-detail/use-amber.ts` still reaches it through Tailwind's `text-amber-500` / `text-amber-800`. Light mode uses amber-800 because amber-500 does not reach 4.5:1 on the light plates.

#### Heat (Arena only)

| Token | Value (both themes) | Source |
|---|---|---|
| `heat-orange` | `hsl(25, 95%, 53%)` (`#F97415`) | `lib/tokens.ts:92,139` (legacy key `brandOrange`) |
| `heat-red` | `#EC6A74` | `components/layout/arena-tab-icon.tsx:138` (`HEAT_EMBER_RED`) |

Heat colors draw Arena heat and nothing else: the live embers (two `heat-orange`, one `signal-red`), the countable embers (`heat-red`), the blade clash spark (`signal-red`) and the challenge afterglow edge. Both are fixed across themes and both fall below 3:1 on every light surface (see [Accessibility](#accessibility)).

#### On-media (fixed, over camera, video and photos)

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

### Usage rules

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

### Known non-tokens in code (not to copy)

- Push notification accent `#ef4444` (Tailwind red-500) in `app.json:119` and `lib/notifications/register-push.ts:88` is not a brand color (WP7 points it at `signal-red`).
- Splash files hard-code `#0D0F14`, `#E8EDF2`, `#FFFFFF`, `#9CA3AF`, `#E63946` and a gold `#f59e0b` (`splash-reveal.tsx:27-31`); the gold is outside the system.
- `palette.ts` also carries `winRule`, `secondaryBg`, `secondaryBgPressed`, `selectedBg` (`rgba(230,57,70,0.16)`, a red tint that WP2 retires) and `track` for the match flow; they are JS mirrors, not kit tokens.
- Legacy shadcn colors (`primary`, `muted`, `card`, `success` and friends) are retiring; see [Legacy](#legacy-retiring-wp4).

## Typography

Four families, each bound to one job. The font tells you what kind of thing you are reading: a brand moment, a label you can act on, prose, or a number.

| Family token | Font | Weights shipped | Job | Mobile classes |
|---|---|---|---|---|
| `display` | Bebas Neue | 400 | The wordmark and display numerals 40px and up | `font-display` |
| `heading` | DM Sans | 700, 500, 400 | Headings, UI labels, buttons, tab labels, chips | `font-heading` (700), `font-heading-medium`, `font-heading-regular` |
| `body` | Inter | 400, 500 | Prose, helper copy, toasts' descriptions | `font-body`, `font-body-medium` |
| `mono` | JetBrains Mono | 400, 500, 700 | ALL numbers (tabular-nums) and caps meta labels | `font-mono`, `font-mono-medium`, `font-mono-bold` |

Sources: `apps/mobile/tailwind.config.js:191-202` (families), `apps/mobile/app/_layout.tsx:65-75` (`useFonts`, nine faces from `@expo-google-fonts/*`: bebas-neue 0.4.1, dm-sans 0.4.2, inter 0.4.2, jetbrains-mono 0.4.1). The kit's `fonts/` folder holds those exact nine TTFs. React Native cannot synthesize weights, so each weight is its own family name (`DMSans_700Bold`, ...) and `font-semibold` / `font-medium` classes do nothing but fall back to the system font: never use them.

### Rules

- Set every number in `mono` with tabular figures: ELO, deltas, ranks, records, weights, timers, counts, step counters ("Step 2 / 3"). Numbers keep tabular figures while they roll.
- The one exception: `display` (Bebas Neue) may set a numeral at 40px and up when it is a brand moment, namely the face-off countdown (240px) and the GO slam (116px). Face-off weights are 36px Bebas today (`faceoff-top.tsx:152,179`), recorded under [Open decisions](#open-decisions-decided-by-default-owner-to-confirm).
- Set labels you act on (buttons, tabs, chips, header titles) in `heading`, uppercase, with tracking.
- Set small metadata in `mono`, uppercase, at `tracking-caps-l` (1.68px) or wider. A caps label with no tracking is a bug (R3 TY-3).
- Set prose in `body`. A number inside a sentence may stay in the sentence ("Profile weight saved: 172.5 lbs, for future matches."), but a number that is the point of the line goes in `mono`.
- Never set text below 10px. The only sanctioned exception is the CountPill digit (9px, capped at 1.3x Dynamic Type).
- Write the wordmark "ELO RATED" as live Bebas Neue text in `ink` with `tracking-mark`; there is no wordmark file.

### Letter-spacing (tracking)

Mobile tracking is a fixed px value computed at a 14px baseline (`tailwind.config.js:203-214`), so the same class is proportionally wider on small text than the web's em-based tracking (`tracking-caps-l` on a 10px label is 0.168em on mobile, 0.12em on web).

| Class | Value (mobile) | Web | Uses | Job |
|---|---|---|---|---|
| `tracking-tight` | -0.28px | -0.02em | 0 | Avoid |
| `tracking-mark` | -0.07px | -0.005em | 7 | Wordmark |
| `tracking-normal` | 0px | 0em | 0 | Default |
| `tracking-loose` | 0.56px | 0.04em | 0 (inline x3) | Loose caps |
| `tracking-caps` | 1.12px | 0.08em | 59 | Buttons, chips, display caps |
| `tracking-caps-l` | 1.68px | 0.12em | 105 | Section and meta labels, tab labels |
| `tracking-caps-xl` | 2.52px | 0.18em | 38 | Strip headers, LIVE pill |
| `tracking-caps-xxl` | 3.36px | 0.24em | 0 | Smallest caps |

EloTile numbers track at `-fontSize * 0.04` (`elo-tile.tsx:81,145`).

### Text styles

The styles in `tokens.json` (`type.groups`) are the real top combinations in the app, by frequency (R1 section 2.4). Mobile has no named size scale yet (TY-1: 464 arbitrary `text-[Npx]` sizes); these styles are the scale WP5 will name.

#### Display (`display`)

| Style | Size / line | Tracking | Example | Source |
|---|---|---|---|---|
| `wordmark-hero` | 72 / 72 | -0.07px | ELO RATED | `wordmark.tsx:11-16` |
| `wordmark-lg` | 48 / 48 | -0.07px | ELO RATED | same |
| `wordmark-md` | 22 / 22 | -0.07px | ELO RATED (BrandHeader) | same |
| `countdown-numeral` | 240 / 240 | 0 | 3 | `countdown.tsx:46-48,182` |
| `countdown-go` | 116 | 2px | GO | `countdown.tsx:235-236` |
| `faceoff-weight` | 36 | 0 | 172.5 LBS | `faceoff-top.tsx:152,179` |

#### Heading (`heading`, 700)

| Style | Size | Tracking | Case | Example | Source |
|---|---|---|---|---|---|
| `screen-title` | 18 | 0 | caps | LOCATION TO START | `go-live-location-sheet.tsx:51`, 8 uses |
| `heading-16` | 16 | 0 | sentence | Closest match | 6 uses |
| `heading-14` | 14 | 0 | sentence | Uploaded by unknown | athlete names, `match-card.tsx:69`, 11 uses |
| `button` | 14 | 1.68px | caps | CONFIRM RESULT | `auth-buttons.tsx:32` |
| `toast-title` | 13 | 0 | sentence | Could not load dashboard | `toast.tsx:136` |
| `header-title` | 12 | 1.68px | caps, `ink-2` | PROFILE | `app-header.tsx:101` |
| `label-12` | 12 | 1.12px | caps | SIGN OUT | 19 uses |
| `action-sm` | 11 | 1.12px | caps | ROLL | `strip-primitives.tsx:57` |
| `tab-label` | 10 | 1.68px | caps | ARENA | `elo-tab-bar.tsx:287-289` |
| `chip` | 10 | 1.12px | caps | ALL | `chip.tsx:34` |

#### Body (`body`, 400)

| Style | Size / line | Example | Source |
|---|---|---|---|
| `body-14` | 14 / 21 | Profile weight saved for future matches. | 37 uses; `leading-6` = 21px |
| `body-13` | 13 | Could not save notification settings. Please try again. | 51 uses (the most common) |
| `body-12` | 12 | Could not submit feedback. Please try again. | 45 uses; toast description |
| `body-11` | 11 | Not now | 7 uses |

#### Data (`mono`)

| Style | Weight | Size / line | Tracking | Example | Source |
|---|---|---|---|---|---|
| `elo-hero` | 700 | 96 / 105.6 | -3.84px | 1512 | `elo-tile.tsx:13-18` |
| `elo-profile` | 700 | 72 | 0 | 1526 | `profile-header.tsx:70` |
| `elo-large` | 700 | 64 / 70.4 | -2.56px | 1526 | `elo-tile.tsx` |
| `elo-medium` | 700 | 44 / 48.4 | -1.76px | 1512 | `elo-tile.tsx` |
| `elo-small` | 700 | 36 / 39.6 | -1.44px | 1512 | `elo-tile.tsx` |
| `delta-m` | 700 | 16 | 0 | ▲ +14 | `delta-number.tsx:6-8` |
| `delta-s` | 700 | 12 | 0 | ▲ +14 | same |
| `elo-meta` | 700 | 14 / 18 | 1.12px | RATING | `elo-tile.tsx:86-90` |
| `data-12` | 400 | 12 | 0 | 2 / 3 | 14 uses |
| `data-11` | 400 | 11 | 0 | 0:42 | 12 uses |
| `meta-label-11` | 400 | 11 | 1.68px | CLOSEST MATCH | 10 uses |
| `meta-label` | 400 | 10 | 1.68px | LBS | `meta-tag.tsx:19`, 53 uses (the top recipe) |
| `strip-label` | 700 | 10 | 2.52px | LIVE | `elo-tile.tsx:124`, `live-pill.tsx:121` |
| `strip-label-l` | 700 | 10 | 1.68px | ON AIR | 7 uses |
| `count-badge` | 700 | 9 | 0 | 3 | `count-pill.tsx:31` |

### Units and casing

- Weight is **lbs**, stored and shown in pounds. Use mono caps `LBS` in data strips ("172.5 LBS", `faceoff-top.tsx:31`) and lowercase `lbs` in prose. The old DESIGN.md "kg" rule is wrong.
- Deltas carry a sign and an arrow, not only a color: "▲ +14" (`formatDeltaChip`, `delta-chip.tsx`). Negative values use the true minus sign (U+2212).
- Initials join with a middle dot: "F·L" (`avatar-32.tsx:12-18`).

### Web parity

Web loads the same four families through `next/font/google` (`apps/web/app/layout.tsx:32-35`), names them `--font-display`, `--font-heading`, `--font-body`, `--font-mono` (`tokens.css:83-86`), and has a named size scale (`--size-*`, `tokens.css:95-126`) that mobile lacks. Web body default is Inter 14px / 1.5.

## Layout

Spacing, radius, borders, sizes and safe areas, all in the px the device actually renders.

### The 14px rem rule

On native, NativeWind's rem is **14px**, not 16. `withNativeWind(config, { input })` in `apps/mobile/metro.config.js:18-20` passes no `inlineRem`, so NativeWind's default of 14 applies. Every rem-based Tailwind class renders at 87.5% of its web size:

- One spacing step is 0.25rem = **3.5px**: `p-4` = 14px, `gap-2` = 7px, `h-11` = 38.5px, `h-8` = 28px.
- `text-xs` = 10.5px, `text-sm` = 12.25px, `text-base` = 14px.
- Arbitrary values (`text-[12px]`, `h-[44px]`, `border-l-[3px]`) and inline style numbers stay literal.

Write sizes for the kit, for boards and for previews in these device px. The web app (rem 16) renders the same class 14% larger: web `Plate` padding is 16px where mobile `Plate` is 14px.

### Spacing

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

### Radius

| Token | Value | Tailwind (mobile) | Use |
|---|---|---|---|
| `radius-tag` | 2px | `rounded-xs` (60 uses) | Tags, chips, MetaTag, Avatar32, OutlineAction, StripShell, CountPill |
| `radius-button` | 3px | `rounded-sm` (38) | Buttons (CtaButton, FightButton, glass buttons) |
| `radius-plate` | 4px | `rounded-md` (47) | THE default: plates, cards, rating tiles, toasts, popovers |
| `radius-sheet` | 8px | `rounded-lg` (5) | Sheets and modals only, the ceiling |
| `radius-round` | 9999px | `rounded-full` (14) | Live dots and status dots |

Sources: `tailwind.config.js:183-190`, `FIGHT_RADIUS` (`fight-tokens.ts:9`), `BROADCAST_RADIUS` (`broadcast-tokens.ts:36`), `PROMPT_RADIUS = 8` (`challenge-prompt-sheet.tsx:89`).

- Corners are sharp. Nothing exceeds `radius-sheet`.
- A bottom sheet takes `radius-sheet` on its top corners only. Today every gorhom sheet renders the library's 15px default (R3 SH-1, WP1).
- Web Tailwind `rounded-sm` is 2px, not 3px; the token is 3px.
- `Avatar32` is a 2px-radius square in code, while the old DESIGN.md says avatars are circular. See [Open decisions](#open-decisions-decided-by-default-owner-to-confirm).

### Borders

| Token | Value | Use |
|---|---|---|
| `stroke-hairline` | 1px | Every border and divider (321 `border` class uses, 50 inline `borderWidth: 1`) |
| `stroke-edge` | 2px | State edges: the active tab top edge in `signal-red`, the challenge afterglow edge, the time-up drain bar |
| `stroke-rail` | 3px | Rails: the Plate accent / live / win / loss left rail, the StripShell rail, the EloTile bottom bar |

"Hairline" means a 1px line in a hairline color (`hairline`, `hairline-faint`, `hairline-strong`), not `StyleSheet.hairlineWidth` (never used). The old "no 2px borders" rule is contradicted by the code; the 2px and 3px widths above are the sanctioned exceptions.

### Shadows

None. There is no shadow token family and there will not be one. Hierarchy comes from surface steps (`void`, `panel`, `plate`, `plate-bright`) and hairlines. The toast zeroes its shadow explicitly (`components/ui/toast.tsx:133`). The single shadow in the app is the launch splash's text halo (`splash-statement.tsx:241-243`), sanctioned for that moment only. No gradients either, except camera scrims.

### Sizes

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

### Opacity

| Token | Value | Use |
|---|---|---|
| `opacity-disabled` | 0.5 | The one disabled style (`button.tsx:100`, FightButton, OutlineAction). Three sites still use 0.6 (R3 BT-7) |
| `opacity-pressed` | 0.7 | Press dip on rows, chips and ghost links that do not scale (`active:opacity-70`) |
| `opacity-reduced-press` | 0.85 | PressableScale's dip under Reduce Motion (`pressable-scale.tsx:45`) |
| `opacity-ember-min` | 0.35 | Countable embers never fade below this (`arena-tab-icon.tsx:143`) |

### Screen frame

- Design at 390px wide (the canvas board width), dark first.
- A tab root is: header bar (`panel`, `size-header` plus inset, `hairline` bottom rule), a scrolling `void` body with a `gutter`, and the tab bar (`panel`, four tabs: Home, Arena, Rankings, Profile).
- Pushed screens use `AppHeader` ([back | title | live dot and actions]); Home and Rankings use `BrandHeader` (the wordmark); Arena and Profile use `TabHeader` (title plus the status chip and the bell, 8px apart).
- Immersive routes (the match flow, profile setup) hide the tab bar.

### Z order

Mobile has no z tokens. In use: splash overlays 9999, the offline banner 1000, the update banner 900. The web ladder (`tokens.css:235-241`: 1 / 10 / 100 / 1000 / 1100 / 1200 / 1300) is web only.

## Motion

Motion in ELO RATED carries meaning or it does not exist. This section carries over the Motion Rule as shipped in jits_web (Adding Flare, 2026-10-01; the previous DESIGN.md "Motion" section, verified against `apps/mobile/lib/motion/tokens.ts` at 69e2e7f). The design-system format has no motion token family, so the exact values live here.

### Token values at a glance

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

### Tokens

Mobile tokens live in `apps/mobile/lib/motion/tokens.ts` and are imported from `@/lib/motion`; `instant`, `fast`, `base`, `slow` and `pulse` mirror the web `--duration-*` tokens in `apps/web/app/design-system/tokens.css`.

- **Durations:** `instant` 100ms (reactive feedback), `fast` 240ms, `base` 480ms (rating tick), `slow` 720ms, `pulse` 1400ms (fixed LIVE pulse cycle), `ember` 2400ms (Arena ember cycle), `shimmer` 1400ms (skeleton sweep).
- **LIVE pulse tempo:** `tempo.quiet` 3000ms, `tempo.normal` 1600ms, `tempo.busy` 800ms, chosen by how many athletes are live in the lobby. One shared clock drives every live dot so they never beat out of step.
- **Easing:** brand ease-out `cubic-bezier(0.22, 1, 0.36, 1)` (`easing.brandOut`, no bounce) by default; `easing.outCubic` for counts.
- **Springs:** `spring.press` (damping 18, stiffness 300) for a pressed control returning to rest; `spring.select` (damping 14, stiffness 260) for the tab select bounce.
- **Press scale:** `PRESS_SCALE` 0.97.

### The three tiers

| Tier | What it is | Limits |
|---|---|---|
| **Reactive** | A direct response to the user's touch (press scale, tab select bounce). | Starts on the touch, settles in `instant` to `fast` (spring to rest). Never runs without a touch. |
| **Moment** | A one-shot animation on a real state transition (a result landing, a challenge arriving, going live). | Plays once per transition, then rests in its final state. Short: about `fast` to `slow`; a cool-down or celebration may run up to about 2000ms. Never loops. |
| **Ambient** | A loop that shows an ongoing state: live (LIVE pulse, Arena embers, heartbeat trace), loading (skeleton shimmer) or waiting on you (steel sheen). | Mounted only while its state is true. Slow and low contrast, on a shared clock. Never has a haptic. |

### Rules

1. **Real transitions only.** A Moment fires on a state change (false to true, a count that increased, a new id), never on mount, re-render, refetch, tab switch, or app foreground with unchanged data. Track the previous value in a ref, and key once-per-thing moments on the thing's id, not on the component instance.
2. **UI thread.** Animate transform, opacity and color with Reanimated shared values, `useAnimatedStyle` and `useAnimatedProps`. No `setState` or `setInterval` animation loops, and no per-frame re-render of always-mounted chrome such as the tab bar.
3. **Reduce Motion.** Read the OS setting with `useReduceMotion()` (from `@/lib/motion`; correct on the first frame). Every animation has a static end state that still carries the meaning (a cooled edge, a static ember, the final number). Haptics stay on under Reduce Motion.
4. **Ambient lifecycle.** An ambient loop mounts only while its state is true, and pauses (`cancelAnimation`) when the app leaves the foreground and restarts when it returns: gate it on `useAppActive()` from `@/lib/motion`.
5. **Heat colors are reserved for Arena heat.** `brandOrange` through Signal Red as a heat ramp is used only for the Arena ember, the blade clash spark, and the challenge afterglow. Nowhere else.
6. **Brand rules still hold.** No drop shadows, 4px radius, Signal Red for CTAs and negatives, Gain Green for rating increases and live state only, numbers in mono `tabular-nums` (including while they roll).
7. **Pressables on native.** A function `style` on `Pressable` is dropped on device by NativeWind. Use `StatePressable`, or `PressableScale` (an animated Pressable that resolves a function style itself and animates only `transform`, so `className` and `active:` classes keep working); otherwise put animated styles on an inner `Animated.View`.

### Haptics

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

### Registry

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

### Other

- **Wake lock (mobile):** the live match step keeps the screen awake via `expo-keep-awake`.
- **Web:** the web app keeps its reactive transitions and `.stagger-children` / `animate-page-in` (see Interaction Patterns); the Motion Rule's tiers and rules apply to it as well.

### Kit names for the colors the Motion Rule names

`brandOrange` is the kit's `heat-orange`; the countable-ember `#EC6A74` is `heat-red`; Signal Red is `signal-red`; the lifted red of the Accept sweep is `signal-red-lift`; Gain Green is `gain-green`. Heat colors appear only in the Arena ember, countable embers, the blade clash spark and the challenge afterglow.

## Accessibility

Contrast, motion sensitivity, labels and text size. The floors: text 4.5:1 on its ground (3:1 at 24px and up, or bold 19px and up); any border, rule, icon or mark that carries meaning 3:1. Ratios below are WCAG 2 contrast computed from the exact token values in both themes; alpha colors are composited over the ground they sit on. Failing source pairs stay exact and are flagged, never re-tinted.

### Text on surfaces

Every text token passes 4.5:1 on every surface in both themes. `plate-bright` is the worst case in both, by design: it sets the floor the code's comments quote (for example `ink-3` 4.60:1 dark, 4.64:1 light).

#### Dark theme, text (floor 4.5:1)

| Text token | on `void` | on `panel` | on `plate` | on `plate-bright` |
|---|---|---|---|---|
| `ink` | 16.27 | 15.49 | 13.52 | 12.18 |
| `ink-2` | 7.55 | 7.19 | 6.27 | 5.65 |
| `ink-3` | 6.14 | 5.85 | 5.10 | 4.60 |
| `signal-red-text` | 6.28 | 5.98 | 5.22 | 4.70 |
| `negative` | 6.28 | 5.98 | 5.22 | 4.70 |
| `neutral` | 6.14 | 5.85 | 5.10 | 4.60 |
| `gain-green` | 8.41 | 8.01 | 6.99 | 6.30 |
| `attention` | 8.93 | 8.50 | 7.41 | 6.68 |

#### Light theme, text (floor 4.5:1)

| Text token | on `void` | on `panel` | on `plate` | on `plate-bright` |
|---|---|---|---|---|
| `ink` | 18.32 | 16.04 | 14.75 | 13.27 |
| `ink-2` | 7.22 | 6.32 | 5.82 | 5.23 |
| `ink-3` | 6.40 | 5.60 | 5.15 | 4.64 |
| `signal-red-text` | 6.37 | 5.58 | 5.13 | 4.62 |
| `negative` | 6.37 | 5.58 | 5.13 | 4.62 |
| `neutral` | 6.40 | 5.60 | 5.15 | 4.64 |
| `gain-green` | 6.41 | 5.61 | 5.16 | 4.64 |
| `attention` | 6.78 | 5.93 | 5.46 | 4.91 |

#### Labels on the red fill

| Pair | Ratio | Status |
|---|---|---|
| `on-signal` on `signal-red` | 4.60 | Pass (both themes; the same values) |
| `on-signal` on `signal-red-lift` | 5.67 | Pass |
| `ink` (dark, `#E8EDF2`) on `signal-red` | 3.54 | FAIL: the pre-repair pairing. Never put white on the red. The legacy shadcn `Button` default variant still does (`components/ui/button.tsx:15`, WP3/WP4) |

### Fills, rules and marks

#### Dark theme, fills, rules and marks (floor 3:1)

| Mark token | on `void` | on `panel` | on `plate` | on `plate-bright` |
|---|---|---|---|---|
| `signal-red` | 4.60 | 4.38 | 3.82 | 3.44 |
| `signal-red-lift` | 5.67 | 5.40 | 4.71 | 4.25 |
| `heat-orange` | 6.89 | 6.56 | 5.72 | 5.16 |
| `heat-red` | 6.28 | 5.98 | 5.22 | 4.70 |
| `hairline-strong` | 2.24 FAIL | 2.21 FAIL | 2.08 FAIL | 1.97 FAIL |
| `hairline` | 1.72 FAIL | 1.73 FAIL | 1.68 FAIL | 1.63 FAIL |
| `attention-rule` | 4.83 | 4.71 | 4.31 | 4.01 |

#### Light theme, fills, rules and marks (floor 3:1)

| Mark token | on `void` | on `panel` | on `plate` | on `plate-bright` |
|---|---|---|---|---|
| `signal-red` | 3.98 | 3.49 | 3.21 | 2.89 FAIL |
| `signal-red-lift` | 3.23 | 2.83 FAIL | 2.60 FAIL | 2.34 FAIL |
| `heat-orange` | 2.66 FAIL | 2.33 FAIL | 2.14 FAIL | 1.93 FAIL |
| `heat-red` | 2.92 FAIL | 2.55 FAIL | 2.35 FAIL | 2.11 FAIL |
| `hairline-strong` | 2.22 FAIL | 2.19 FAIL | 2.16 FAIL | 2.13 FAIL |
| `hairline` | 1.63 FAIL | 1.62 FAIL | 1.61 FAIL | 1.60 FAIL |
| `attention-rule` | 2.87 FAIL | 2.71 FAIL | 2.62 FAIL | 2.50 FAIL |

#### Flagged source pairs (kept exact)

1. **`signal-red` on light `plate-bright`: 2.89:1.** A red rule or fill on a pressed or selected light surface drops below 3:1. Light `void`, `panel` and `plate` pass (3.21 to 3.98:1).
2. **`signal-red-lift` on light `panel`, `plate`, `plate-bright`: 2.34 to 2.83:1.** The pressed CTA fill against light surfaces, a documented exception in web `tokens.css:284-290`; the label on it still reads 5.67:1.
3. **`heat-orange` and `heat-red` on every light surface: 1.93 to 2.92:1.** Both are fixed across themes. The countable embers carry a count (meaning), so in light mode they rely on VoiceOver's count and the opacity floor; WP7's heat sub-palette is the place to give light mode its own heat values.
4. **`attention-rule` on every light surface: 2.50 to 2.87:1.** The pending StatusPlate's dashed amber edge; the status also carries a word ("pending" state copy), so it is not color-only.
5. **`hairline` and `hairline-strong`: below 3:1 everywhere (1.60 to 2.24:1).** Fine for decorative separation. Not fine as the only signal of a state: a selected option must also step to `plate-bright` and show an `ink` check glyph, and an input's edge is not its only affordance.
6. **Gain and loss are told apart by hue alone at the color level.** `gain-green` against `negative` is 1.34:1 (dark) and 1.01:1 (light). The system already compensates: deltas carry an arrow and a sign ("▲ +14", U+2212 minus), outcome tags carry W / L / D letters, and LIVE carries the word. Keep it that way: never show a gain or loss by color alone.

### On media

On-media chrome sits over camera, video or photos, so its ground is unknown. Worst cases, composited over a white frame (and a black frame):

| Text | on `on-media-badge` (0.88 black) | on `on-media-scrim` (0.55 black) | on `on-media-tag` (0.45 black) |
|---|---|---|---|
| `on-media-text` | 14.06 (17.83) | 4.04 FAIL (17.83) | 2.85 FAIL (17.83) |
| `on-media-text2` | 7.87 (9.06) | 2.91 FAIL (9.06) | 2.20 FAIL (9.06) |
| `on-media-text3` | 5.17 (5.46) | 2.34 FAIL (5.46) | 1.86 FAIL (5.46) |
| `on-media-tag-text` | 12.23 (14.84) | 3.95 FAIL (14.84) | 2.88 FAIL (14.84) |
| `on-media-red` | 4.90 (6.22) | 1.41 FAIL (6.22) | 1.01 FAIL (6.22) |
| `on-media-win` | 7.27 (9.22) | 2.09 FAIL (9.22) | 1.47 FAIL (9.22) |
| `on-media-amber` | 7.71 (9.78) | 2.22 FAIL (9.78) | 1.56 FAIL (9.78) |

| Text on the light chip | over a white frame | over a black frame |
|---|---|---|
| `on-media-ink` on `on-media-chip` | 16.16 | 14.71 |
| `on-media-ink3` on `on-media-chip` | 5.64 | 5.14 |
| `on-media-ink-red` on `on-media-chip` | 5.62 | 5.12 |

Rule: put on-media text on `on-media-badge` or the light `on-media-chip`. The scrim and tag fills are safe only over dark footage; `on-media-text3` belongs on the badge only (R3 CO-5, A1-4).

### Reduce Motion

- Read the OS setting with `useReduceMotion()` from `@/lib/motion`; it is correct on the first frame. The splash files still read it asynchronously (R3 SP-3, WP6).
- Every animation has a still end state that keeps the meaning: the final number, the cooled afterglow edge, one static ember, the filled ON AIR tally, plain skeleton bars (full table in the [registry](#registry)).
- PressableScale dips to `opacity-reduced-press` (0.85) instead of scaling.
- Haptics stay on under Reduce Motion. Never a haptic on a loss, a draw, or ambient motion.
- Modal and sheet transitions (RN `Modal` `animationType`, gorhom slide) are not yet registered or gated (R3 MO-5, WP1).

### Labels and roles

- Every pressable that acts has `accessibilityRole="button"` and a label. Missing today: the error boundary's "Try again" and "Sign out" (`components/error-boundary.tsx:88,98`, R3 A1-1).
- A `Pressable` with a single `Text` child takes its name from the text; icon-only controls need an explicit label ("Go back" on the AppHeader back button).
- Text inputs and switches need `accessibilityLabel` set to the visible label; React Native does not link a sibling `Text`. Seven controls lack one (R3 A1-2).
- Tabs expose `accessibilityState.selected` and an `accessibilityValue` for badges ("2 challenges", "3 NEW"; `elo-tab-bar.tsx:66-75`); the countable embers keep the count readable.
- Moments speak their result once: VoiceOver reads only the final ELO and delta after the odometer roll; the Accept sweep sets the value "Accepted" while the label stays.
- Busy buttons set `accessibilityState.busy` (FightButton); make it the canonical busy pattern.

### Text size and Dynamic Type

- 10px is the floor (`palette.ts:28`: `text3` is for "labels only, mono 10px and up"). Thirteen sites still render 8 or 9px (R3 A1-3, WP5); only the CountPill digit is sanctioned at 9px.
- Fixed-height chrome caps Dynamic Type: `maxFontSizeMultiplier={1.3}` on CountPill, OutlineAction (`MAX_SCALE`) and tab header titles; the BrandHeader wordmark is capped at 1. Everything else scales.
- The smallest tappable text is "Not now" (10px `ink-3` underlined mono, `practice-offer-card.tsx:50-57`); check it at large Dynamic Type sizes (R3 A1-5).

### Touch targets

44px minimum (`size-hit`). Compact controls reach it with `hitSlop` (OutlineAction: 28px tall plus 8px above and below), never with fake margins.

## Components

The family map of the mobile app (`apps/mobile`), which component is canonical in each family, and what is legacy. Each kit card (`components/<Comp>/`) is a static HTML twin of a React Native component, drawn from the code with these tokens; React Native cannot run in the preview frame, so every card README says which RN file it was hand-written from.

Three token channels exist in code, and the kit draws all three from the same tokens: NativeWind ELO classes (most components), `usePalette()` JS colors (the match flow; a mirror of the same values), and the fixed `ON_MEDIA` / `BROADCAST` on-media set (chrome over video). Legacy shadcn classes are a fourth channel that is retiring (see [Legacy](#legacy-retiring-wp4)).

### Which component to use

| I need... | Use | Not |
|---|---|---|
| A destructive action | `Button` destructive: an outline in `negative` (kit proposal) | today's `DestructiveButton` red fill under a 3.54:1 label |
| A primary action | `Button` primary (today: `CtaButton`, `FightButton` primary) | the shadcn `Button` default variant, a hand-rolled `bg-cta` Pressable |
| A secondary or text action | `Button` secondary / ghost (today: `SecondaryButton`, `TertiaryButton`, `FightButton`) | `ViewerButton`, `PracticeButton` (copies) |
| A compact strip action (ROLL, OPEN, CANCEL, CONFIRM) | `OutlineAction` | a small `Button` |
| Anything pressable that commits | `PressableScale` underneath | raw `Pressable` with a function `style` |
| A still pressable (rows, chrome over video) | `StatePressable` | raw `Pressable` with a function `style` |
| A container | `Plate` (variants default, accent, live, win, loss) | shadcn `Card` (dead) |
| An Arena strip | `StripShell` (compact Plate on `panel`, 3px rail) | |
| A caps label tag | `MetaTag` | shadcn `Badge` |
| Win / loss / draw | `OutcomeTag` | |
| A filter or segment | `Chip` (+ a row of chips); selected = `plate-bright` fill, `hairline-strong` border, `ink` label | shadcn `Tabs` (unused) |
| A count badge | `CountPill` | |
| Live state | `LivePill`, `LiveDot` | a green dot drawn by hand |
| A rating | `EloTile` with `RollingNumber` | |
| A rating change | `DeltaNumber` (static) or `DeltaChip` (after a roll) | a third formatter |
| A person | `Avatar32` (square initials or photo) | shadcn `Avatar` (round, unused), `InitialsBlock` outside the match flow |
| A notice | `toast.success / error / info` (`BrandToast`) | a banner for a one-off message |
| Loading | the skeleton set (`SkeletonProvider`, `SkeletonBlock`, `SkeletonPlate`, ...) | a free-floating red `ActivityIndicator` |
| A busy action | `FightButton busy` (the busy-button pattern) | a spinner next to a button |
| A picker | `SearchSelect` (`NativeSelect` wraps it) | shadcn `Select` (dead) |
| A sheet | one bottom-sheet shell with 8px top corners (WP1 target; today `Sheet`, direct `BottomSheetModal`, or RN `Modal`) | gorhom's default 15px radius |

### Families

#### Actions

| Component | Path | Status |
|---|---|---|
| `PressableScale` | `components/ui/pressable-scale.tsx` | Canonical press primitive: 0.97 scale on `duration.instant` brand ease-out, `spring.press` release, optional semantic haptic |
| `StatePressable` | `components/ui/state-pressable.tsx` | Canonical still pressable |
| `FightButton` | `components/match-flow/fight/fight-ui.tsx:105` | The API the unified `Button` takes: primary / secondary / ghost, `busy`, `disabled`, `height` 56, `icon`, `trailing`, `haptic`, `sheen` |
| `CtaButton`, `SecondaryButton`, `TertiaryButton`, `DestructiveButton` | `components/auth/auth-buttons.tsx` | The real app-wide buttons (30 / 16 / 19 / 1 call sites) but on raw `Pressable` with no press scale (R3 BT-1); WP3 aliases them onto `Button` |
| `OutlineAction` | `components/arena/strip-primitives.tsx` | Canonical compact action: 28px tall, `radius-tag`, `hairline-strong`, `action-sm` label, 44px hit area |
| `SteelSheen` | `components/ui/steel-sheen.tsx` | Ambient sweep on a waiting-on-you button (Accept, Confirm result) |
| `ViewerButton`, `PracticeButton` | highlight-viewer, practice | Copies of the three tiers; fold into `Button` |
| shadcn `Button` | `components/ui/button.tsx` | Legacy: admin and the update banner only; white label on red (3.54:1) |

Cards (Actions family): **Button** (target: primary, secondary, ghost, destructive outline in `negative`; states rest, pressed, disabled, busy) and **OutlineAction**.

#### Status and badges

`MetaTag` (21 sites) is the canonical tag: `hairline` border, `radius-tag`, `meta-label` text in `ink-2`. `OutcomeTag` and `LivePill` are semantic wrappers. `CountPill` (`components/ui/count-pill.tsx`) is the filled count: `signal-red` fill, `on-signal` 9px mono bold digits, `radius-tag`, shared by the header bell and the tab bar. `HeaderStatusChip` (`components/layout/header-status-chip.tsx`) sits on every tab root and says live (`gain-green` edge), neutral (`ink-3` edge) or incoming (`signal-red` edge). Overlapping tags (`FilmBadge`, `HudTag`, participant `StatusBadge`, shadcn `Badge`) fold into one tag with tones.

Cards (Status family): **MetaTag**, **LivePill** (with LiveDot), **CountPill** (with tab badges). The header status chip is drawn in the AppHeader card.

#### Data and ELO

| Component | Path | Notes |
|---|---|---|
| `EloTile` | `components/ui/elo-system/elo-tile.tsx` | Sizes hero 96, large 64, medium 44, small 36; before/after; tone positive / negative / amber; optional 3px `signal-red` bottom bar |
| `RollingNumber` | `components/ui/elo-system/rolling-number.tsx` | The odometer roll (600ms, once per result); mobile only |
| `DeltaChip` | `components/ui/elo-system/delta-chip.tsx` | "▲ +14" pop after the roll; mobile only |
| `DeltaNumber` | `components/ui/elo-system/delta-number.tsx` | Static signed delta, s 12 / m 16 / l 28 |
| `RankRow` | `components/ui/elo-system/rank-row.tsx` | Ladder row; leader marked by a `signal-red` left rule. Its rank numeral is red today (R3 RK-1): it should be `ink` |
| `ParticipantRow`, `DataRow` | `components/ui/elo-system/` | `DataRow` is unused on mobile |
| `Mono`, `StakesStrip`, `RatingBlock`, `StatusPlate` | `fight-ui.tsx` | Match-flow building blocks on `usePalette()` |

Cards (Data family): **EloTile**, **RollingNumber** (settled frame), **DeltaChip**.

#### Navigation

`EloTabBar` (`components/layout/elo-tab-bar.tsx`): four tabs (Home, Arena, Rankings, Profile) on `panel`, 18px lucide icons, `tab-label` text (`ink` active, `ink-3` inactive), a 2px `signal-red` top edge on the active tab, tab select bounce. `ArenaTabIcon` (`components/layout/arena-tab-icon.tsx`) draws lucide `Swords` as two blade halves so it can carry heat: live embers, countable embers (1 to 3 pending), blade clash. Headers are one system of three slots on the same 56px `panel` bar: `AppHeader` (pushed screens), `BrandHeader` (wordmark; Home, Rankings), `TabHeader` (Arena, Profile).

Cards (Navigation family): **TabBar** (with the Arena icon's live ember and countable embers), **AppHeader** (with the header status chip) and **Chip**.

#### Surfaces

`Plate` (71 sites, `components/ui/elo-system/plate.tsx`) is the surface: `plate` fill, 1px `hairline` border, `radius-plate`, `space-4` padding, and a left rail (1px default; 3px `signal-red` accent, `gain-green` live and win, `negative` loss). `StripShell` is its compact Arena strip on `panel` with `radius-tag` and a 3px rail (`signal-red` when someone wants you). `AfterglowEdge` cools a new incoming challenge strip's 2px bottom edge from heat to hairline over 2000ms. `OnAirStrip` (`components/arena/on-air-strip.tsx`) is the green ON AIR tally and heartbeat trace in the Arena body.

Cards: **Plate** (Surfaces family); **OnAirStrip** and **ChallengeStrip** (incoming, afterglow edge cooled) form the Arena family.

#### Feedback and loading

`toast` + `BrandToast` (`components/ui/toast.tsx`, 89 calls) is canonical: `plate` fill, `hairline-strong` border, `radius-plate`, a 3px left rule (success `ink`, deliberately not green; error `signal-red`; info `ink-3`), `toast-title` plus `body-12`, no shadow. The skeleton set (`components/ui/skeleton/skeleton.tsx`) runs one shared 1400ms shimmer clock. Known issue: skeleton bars (`SkeletonBlock`, `bg-surface-3`) currently share the surface tier of their host plate (`Plate`, `SkeletonPlate`, the rank and participant rows), so inside a plate they are invisible at rest and under Reduce Motion, and show only while the shimmer band crosses them; tracked in WP6, bead jits-3eeg.7. Banners (offline, update, upload progress, queue status) have no shared shell yet; the offline banner is a legacy red bar (R3 SC-1, WP4).

Cards (Feedback family): **Toast**, **Skeleton**.

#### Inputs and overlays

`SearchSelect` is the canonical picker. Three sheet mechanisms exist (shadcn `Sheet` once, direct `BottomSheetModal` three times, RN `Modal` seven times); the target is one sheet shell with `radius-sheet` top corners, `panel` fill, `hairline` edge, no shadow. The challenge prompt is a centered card by decision (jits-02vo.3) with `radius-sheet` and the `on-media-scrim` backdrop. `AuthFormField` and `EloField` fold into one form field (WP3/WP5 follow-ups). `Switch` still uses the legacy red track (R3 ST-1).

Card (Surfaces family): **Sheet** (target, 8px top corners).

#### Avatars and identity

`Avatar32` (`components/ui/elo-system/avatar-32.tsx`): a 28px square on device, `radius-tag`, `hairline-strong` border, photo or "F·L" initials in mono bold 10px on `plate-bright`. `Wordmark`: "ELO RATED" in Bebas Neue, sm 18 / md 22 / lg 48 / hero 72. `ErMark`: the animated E·R lettermark (same vector as `splash.svg`).

Card (Identity family): **Avatar**.

#### Match flow

Built from `fight-ui.tsx` and `fight-tokens.ts` on `usePalette()` and `ON_MEDIA` / `BROADCAST`. The face-off countdown (`components/match-flow/countdown/countdown.tsx`) slams Bebas numerals over the camera with a `signal-red` bar draining to a red GO. The live HUD (clock slab, athlete bar, HUD tags, hold-to-end) is the over-media layer. The verdict shows the odometer roll, the delta chip and, on a submission win, "the tap": three `signal-red` tick marks.

Cards (Match flow family): **Countdown**, **RatingMoment** (verdict rating card with the tap marks).

### Canonical kit set

The 20 cards in `components/`, by family (the `group` on each card):

| Family | Card | RN source |
|---|---|---|
| Actions | Button (target, WP3: primary, secondary, ghost, destructive outline in `negative`; rest, pressed, disabled, busy) | `fight-ui.tsx` API; today `auth-buttons.tsx` |
| Actions | OutlineAction | `components/arena/strip-primitives.tsx` |
| Status | MetaTag | `components/ui/elo-system/meta-tag.tsx` |
| Status | LivePill (with LiveDot) | `components/ui/elo-system/live-pill.tsx` |
| Status | CountPill (with tab badges) | `components/ui/count-pill.tsx`, `elo-tab-bar.tsx` |
| Data | EloTile | `components/ui/elo-system/elo-tile.tsx` |
| Data | RollingNumber (settled frame) | `components/ui/elo-system/rolling-number.tsx` |
| Data | DeltaChip | `components/ui/elo-system/delta-chip.tsx` |
| Navigation | TabBar (Arena icon live ember and countable embers) | `components/layout/elo-tab-bar.tsx`, `arena-tab-icon.tsx` |
| Navigation | AppHeader (with the header status chip) | `components/layout/app-header.tsx`, `header-status-chip.tsx` |
| Navigation | Chip (selected target: `plate-bright`, `hairline-strong`, `ink`) | `components/ui/elo-system/chip.tsx` |
| Surfaces | Plate | `components/ui/elo-system/plate.tsx` |
| Surfaces | Sheet (target, WP1: 8px top corners) | `components/ui/sheet.tsx` and the direct sheets |
| Feedback | Toast | `components/ui/toast.tsx` |
| Feedback | Skeleton | `components/ui/skeleton/skeleton.tsx` |
| Identity | Avatar | `components/ui/elo-system/avatar-32.tsx` |
| Arena | OnAirStrip | `components/arena/on-air-strip.tsx` |
| Arena | ChallengeStrip (incoming, afterglow edge cooled) | `components/arena/mat-board.tsx`, `afterglow-edge.tsx` |
| Match flow | Countdown | `components/match-flow/countdown/countdown.tsx` |
| Match flow | RatingMoment (verdict rating card and the tap) | `components/match-flow/verdict/rating-moment.tsx` |

### Web parity

`components/ui/elo-system/` exists on both platforms and must stay in parity (jits_web `CLAUDE.md:117`). Web has avatar-32, chip, data-row, delta-number, elo-tile, live-dot, live-pill, meta-tag, outcome-tag, participant-row, plate, rank-row, wordmark. Mobile only: `RollingNumber`, `DeltaChip`, `ErMark`, the splash set, every fight and Arena strip primitive. Gaps: web `EloTile` lacks `tone`, `playKey`, `meta` and the roll; web `LivePill` / `LiveDot` lack `pace`, `onDark` and the shared tempo clock.

## Conformance

How far the shipped mobile app is from this system, and the plan to close the gap. Source: a read-only audit of `apps/mobile` at jits_web 69e2e7f (481 non-test files) against the brand, motion, typography and accessibility rules. **63 distinct findings: 8 high, 25 medium, 30 low.** Each work package is a bead under the kit epic jits-3eeg and changes pixels on the "Current app" boards of the ELO RATED Native Screens canvas, so each ends with a `/canvas-sync` pass after release.

### What already conforms

- The haptics vocabulary is clean: the only direct `expo-haptics` calls are the sanctioned four (the offline-queue Light impact and the three splash lock beats).
- No `LayoutAnimation`; every Reanimated animation maps to a registry row and reads `useReduceMotion`; ambient loops pause in the background.
- No drop shadows or elevation in product UI (the toast zeroes them; the splash halo is the one sanctioned exception).
- `setInterval` is used for data polling and countdown text only, never for animation.

### Findings by category

| Category | High | Medium | Low |
|---|---|---|---|
| Hardcoded colors and literals | 0 | 1 | 9 |
| Color semantics (red, green, amber, heat) | 2 | 6 | 3 |
| Typography | 2 | 5 | 5 |
| Radius, shadow, spacing | 1 | 1 | 3 |
| Motion Rule | 0 | 5 | 4 |
| Press feedback and disabled states | 2 | 3 | 1 |
| Accessibility | 1 | 1 | 3 |
| Legacy shadcn, dead code, stale docs | 0 | 3 | 2 |
| **Total** | **8** | **25** | **30** |

### Top fixes

1. Every gorhom bottom sheet renders a 15px corner radius; the ceiling is `radius-sheet` 8px (high).
2. Signal Red on data: submission and weekly-activity bars and the #1 rank numeral are drawn in `signal-red` (high).
3. Gain Green used as generic success: ready, confirmed, upload done, recording, FINISH tag, a switch track, about 12 sites (high).
4. The primary CTA family has no press scale: `CtaButton` (30 sites), `ViewerButton` (12), `PracticeButton` (10) and 8 hand-rolled red CTAs (high).
5. Legacy `Dialog` and `Sheet` titles render in the system font on user-facing surfaces (Compare Stats, Share Profile) (high).
6. The legacy `Button` sets system-font text on legacy tokens, on the user-facing update banner (high).
7. The error boundary's "Try again" and "Sign out" have no `accessibilityRole` (high).
8. The live match's hold-to-end fill and time-up drain bar animate `width` on the JS thread (medium).
9. The offline banner is a full-width Signal Red bar in a system font (offline is not a loss) (medium).
10. Hero ELO numbers and records are missing `tabular-nums` (medium).
11. Modal and sheet transitions are unregistered and not gated on Reduce Motion (medium).
12. Decorative Signal Red: 17 red spinner and refresh tints, the Switch track, red selection fills, red notification icons (medium).
13. The splash odometer is a `requestAnimationFrame` + `setState` loop and the splash glow loops forever (medium).
14. Amber has no token: three hex copies plus Tailwind amber classes (medium).
15. Text inputs and switches with no accessible name (medium).

### Work packages

| Bead | Package | Covers | What changes |
|---|---|---|---|
| jits-3eeg.2 | WP1 Sheet and modal chrome | SH-1 to SH-5, MO-5, A1-1 backdrops | One shared sheet background and handle with `radius-sheet` top corners; brand type in sheet and dialog titles; one `on-media-scrim` backdrop; a "Sheet / modal present" registry row and a Reduce-Motion-aware modal animation helper |
| jits-3eeg.3 | WP2 Color semantics sweep | CO-1, CO-2, CO-6, CO-7, ST-1 to ST-3, ST-6, MF-5, MF-8, PR-1, PR-2, PR-6, RK-1, SC-6, FR-1, FR-2 | Red only on CTAs and negatives, green only on gains, wins and live; neutral spinners; one selected state (`plate-bright` + `hairline-strong` + check); neutral Switch track; a grep guard test |
| jits-3eeg.4 | WP3 One Button, one press feedback | BT-1 to BT-7, SC-3 | A unified `Button` on `PressableScale` (primary, secondary, ghost, destructive, glass), one disabled style (`opacity-disabled`); auth, practice and viewer buttons migrated; `StatePressable` on 25 rows and toggles without feedback |
| jits-3eeg.5 | WP4 Retire the legacy shadcn layer | LG-1 to LG-3, SC-1, SC-2, ST-8, TY-5, MF-9 | Delete unused primitives; restyle Badge, the offline banner, the update banner and modal; remove the legacy token keys, keeping `brandOrange` as a heat token |
| jits-3eeg.6 | WP5 Type scale and numeric typography | TY-1 to TY-4, TY-6, PR-3, PR-4, MF-3, MF-6, MF-7, FR-7, ST-4, ST-5, AR-1, AR-6, A1-3 | Named size and tracking steps (the Typography styles), a scale-driven mono label, `tabular-nums` on every number, tracking on every caps label, the 10px floor |
| jits-3eeg.7 | WP6 Motion Rule hygiene | MF-2, SP-1 to SP-4, MO-4, MO-6, MF-11, FR-3, FR-4 | Hold-to-end and time-up on Reanimated `scaleX`; the splash odometer via `RollingNumber`; the splash glow plays once; `useReduceMotion()` everywhere; literal durations named; shimmer restored in Film Room and the highlight viewer |
| jits-3eeg.8 | WP7 Tokens, on-media, labels, doc truth | CO-3, CO-4, CO-5, AR-4, SP-5, SC-4, SC-5, FR-6, MF-10, A1-2, A1-4, D-1 to D-7 | An amber `attention` token in `tokens.ts`; the heat sub-palette; one on-media source behind `ON_MEDIA` and `BROADCAST`; labels on 7 inputs and switches; the docs brought in line with this kit |

Order: WP3 lands before WP4, because WP4 deletes what WP3 replaces. The open decisions in the README (amber scope, Bebas numerals, the selected state, circular elements) settle before WP2 and WP5 finalize.

### Finding IDs

Finding IDs (SH, BT, HO, AR, RK, PR, MF, FR, ST, SC, SP, LG, CO, TY, MO, RA, A1, D) are stable and quoted in the beads and in this kit's other sections. The full per-file list lives with the kit's recon (R3).

## Legacy (retiring, WP4)

The pre-redesign shadcn layer still ships in the mobile app as "compatibility shims" (`__tests__/lib/tokens-contrast.test.ts:15-17`). It is NOT part of this system: its colors are not kit tokens, they are not contrast-gated, and new code must not use them. Bead jits-3eeg.5 (WP4) deletes it after WP3 lands the unified Button.

### Legacy colors

Defined in `apps/mobile/lib/tokens.ts` (light l.69-93, dark l.116-140), mirrored as CSS variables in `tailwind.config.js:119-142` (light) and `lib/theme/theme-provider.tsx:21-44` (dark). Hex is computed from the HSL.

| Key | Tailwind | Light | Dark | Use instead |
|---|---|---|---|---|
| `background` | `bg-background` | `hsl(216, 24%, 96%)` (#F2F4F7) | `hsl(223, 21%, 6%)` (#0C0E13) | `void` |
| `foreground` | `text-foreground` | `hsl(223, 21%, 6%)` | `hsl(210, 28%, 93%)` (#E8EDF2) | `ink` |
| `card`, `popover` | `bg-card` | `hsl(218, 20%, 89%)` (#DDE1E9) | `hsl(222, 16%, 12%)` (#1A1D23) | `plate` |
| `cardForeground`, `popoverForeground` | `text-card-foreground` | `hsl(223, 21%, 6%)` | `hsl(210, 28%, 93%)` | `ink` |
| `primary`, `accent`, `destructive`, `ring` | `bg-primary`, `text-primary` | `hsl(355, 78%, 56%)` (#E63746) | same | `signal-red` (fills), `negative` (text) |
| `primaryForeground`, `accentForeground`, `destructiveForeground` | `text-primary-foreground` | `hsl(210, 28%, 93%)` (#E8EDF2) | same | `on-signal` (white on red is 3.54:1) |
| `secondary` | `bg-secondary` | `hsl(217, 21%, 93%)` (#E9ECF1) | `hsl(225, 17%, 9%)` (#13151B) | `panel` |
| `secondaryForeground` | `text-secondary-foreground` | `hsl(223, 21%, 6%)` | `hsl(210, 28%, 93%)` | `ink` |
| `muted` | `bg-muted` | `hsl(219, 18%, 85%)` (#D2D7E0) | `hsl(223, 16%, 17%)` (#242832) | `plate-bright` |
| `mutedForeground` | `text-muted-foreground` | `hsl(215, 14%, 34%)` (#4B5563) | `hsl(218, 11%, 65%)` (#9CA3B0) | `ink-2` or `ink-3` |
| `success` | `bg-success` | `hsl(142, 72%, 29%)` (#157F3C, pre-AA) | `hsl(142, 71%, 45%)` (#21C45D) | `gain-green`, only for gains and live |
| `successForeground` | `text-success-foreground` | `hsl(0, 0%, 100%)` | same | (none) |
| `border` | `border-border` | `hsl(218, 12%, 83%)` (#CED2D9) | `hsl(222, 13%, 18%)` (#282C34) | `hairline` |
| `input` | `border-input` | `hsl(218, 14%, 79%)` (#C2C7D1) | `hsl(222, 13%, 21%)` (#2F333D) | `hairline-strong` |
| `gold` | `bg-gold` | `hsl(38, 92%, 50%)` (#F59F0A) | same | `attention` |
| `brandOrange` | `bg-brand-orange` | `hsl(25, 95%, 53%)` (#F97415) | same | KEPT as `heat-orange` (Arena heat only) |
| `deepRed` | `bg-deep-red` | `hsl(355, 67%, 47%)` (#C82835) | same | `signal-red` |

**Naming trap.** On mobile `text-primary` is the LEGACY brand red (`--primary`), while web's `--text-primary` is the ink. ELO ink on mobile is `text-ink`. Never write `text-primary` for data. The same collision exists in web Tailwind.

### Legacy components

| Component | Path | Real users | Fate |
|---|---|---|---|
| `Card` family | `components/ui/card.tsx` | 0 (also `rounded-lg` on a non-modal) | Delete; use `Plate` |
| `Input` | `components/ui/input.tsx` | 0 (raw `TextInput` is used 13 times) | Re-skin to ELO tokens as the form field input |
| `Label` | `components/ui/label.tsx` | 0 | Delete |
| `Separator` | `components/ui/separator.tsx` | 0 | Delete; a 1px `hairline` view |
| `Avatar` | `components/ui/avatar.tsx` | 0 (round, contradicts the square `Avatar32`) | Delete |
| `Select` | `components/ui/select.tsx` | 0 | Delete; use `SearchSelect` |
| `Tabs` | `components/ui/tabs.tsx` | 0 (the `<Tabs>` hits are expo-router) | Delete; use `Chip` rows |
| `OnlineIndicator` | `components/online-indicator.tsx` | 0 | Delete |
| `Badge` | `components/ui/badge.tsx` | 1 (admin members), `rounded-lg`, system font | Restyle onto `MetaTag` / `OutcomeTag`, keep the `success` variant API |
| `Dialog` | `components/ui/dialog.tsx` | 1 (Compare Stats), system-font title | Brand titles (WP1) |
| `Sheet` | `components/ui/sheet.tsx` | 1 (Share Profile), `tokens.card`, 15px gorhom radius | The one sheet shell (WP1) |
| `Button` | `components/ui/button.tsx` | Admin screens, update banner, critical update modal | Replaced by the unified `Button` (WP3) |
| `Switch` | `components/ui/switch.tsx` | 3 (settings, admin flags), red `primary` track | Neutral track (WP2) |
| `OfflineBanner` | `components/offline-banner.tsx` | Root layout | `panel` + `hairline-strong`, mono caps `ink` (WP4) |
| Update banner and modal | `components/updates/*` | Root layout | ELO surfaces and the unified Button (WP4) |

Weight classes `font-semibold` and `font-medium` appear only in these atoms; React Native cannot synthesize weights from the custom fonts, so they render in the system font.

### Retired brand assets

- The old "E with ascending bars and a gold peak" mark, `apps/web/public/logo.svg` (red `#bf1212` rounded-square ground), is retired. The E·R lettermark replaced it on 2026-06-08.
- The `#bf1212` splash background is retired; the splash is `void` (`#0D0F14`, `app.json:42,97`).
- The app-icon explorations in `design/icon-options/batch1..batch10` are history, not assets.
- The old screen files (`apps/web/public/design/native-screen-inventory.html`, `wireframe.html`) are stale and are not a source.

## Platform notes

Facts carried over from the previous DESIGN.md that are still true and are not part of the kit, checked against the code at the time of this change.

### Product identity

- **App name:** ELO RATED. **Bundle ID / package:** `com.elorated.mobile` (iOS and Android, `apps/mobile/app.json`). **URL scheme:** `elorated://`. **Universal links:** `elorated.com`.
- **Stacks:** `apps/web` is Next.js 16 with Tailwind; `apps/mobile` is Expo SDK 54 with NativeWind v4 and hand-written native primitives.
- **Dark mode is the default** for gym environments; light mode is supported on both platforms through the same semantic tokens.

### Theming mechanics

- **Web:** CSS variables in [apps/web/app/design-system/tokens.css](apps/web/app/design-system/tokens.css), dark on `:root, [data-theme="dark"]`, light overrides on `[data-theme="light"]`; the web layout emits both the class and `data-theme`. Web Tailwind defines no ELO color classes: web components read `var(--bg-*)`, `var(--text-*)` and friends inline. The shadcn HSL slots in `apps/web/app/globals.css` are the legacy layer.
- **Mobile:** two token maps (`lightTokens`, `darkTokens`) in [apps/mobile/lib/tokens.ts](apps/mobile/lib/tokens.ts) share one `ColorTokens` type. [apps/mobile/tailwind.config.js](apps/mobile/tailwind.config.js) maps every semantic class to `var(--token)`, seeds light values on `:root` with an `addBase` plugin, and sets `darkMode: "class"` (needed so NativeWind's `setColorScheme()` works for the in-app Light / Dark / System toggle). `ThemeProvider` (`apps/mobile/lib/theme/theme-provider.tsx`) applies the active map with `vars()` on a root View; the app forces dark before first paint and restores a stored preference. No `dark:` variants are used on components.
- **Non-className APIs** (RN `Switch`, gorhom `BottomSheet`, `ActivityIndicator`) read the runtime map through `useThemedTokens()`; the match flow reads `usePalette()`.

### Layout shell

- **Web** ([apps/web/components/layout/](apps/web/components/layout/)): `AppHeader` is a sticky bar, `--shell-header-h` 56px plus the safe-area inset, on `--bg-secondary` with a `--border-hairline` bottom rule. `BottomNavBar` shows the four tabs from `nav-config.ts` (Home, Arena, Rankings, Profile) with lucide icons and a 2px `--accent-cta` top border on the active tab; desktop uses `sidebar-rail.tsx` (`--shell-rail-w` 232px). `PageContainer` is a `max-w-md` (28rem) column with `px-4` and bottom padding clearing the nav and the safe area. `apps/web/app/(app)/layout.tsx` mounts the global notifications provider and the online-presence, deployment-check, push-registration and Arena bootstraps.
- **Mobile:** the root `apps/mobile/app/_layout.tsx` mounts the error boundary, theme, auth and offline banner; the tab bar lives in `apps/mobile/app/(app)/(tabs)/_layout.tsx`; `athlete/[id]`, `match/[matchId]` and `settings` push on top of the tabs.
- **Wake lock:** the live match step keeps the screen awake via `expo-keep-awake`.

### Web interaction patterns

- Press feedback: tappable elements scale to 98% and drop to 90% opacity on active (`globals.css:143`).
- `.stagger-children` staggers list entries 60ms apart on first mount (`globals.css:147-160`); `animate-page-in` is a 300ms, 6px rise. The Motion Rule's tiers and rules apply to web as well.

### Shadcn primitives

- Web `apps/web/components/ui/` is shadcn/ui, managed by `npx shadcn@latest add <component>` and not edited by hand; the custom `success` variant on `badge` is the one exception and must survive regeneration.
- Mobile `apps/mobile/components/ui/` holds hand-written equivalents that are retiring (see [Legacy](#legacy-retiring-wp4)).

### Domain components

| Component | Web | Mobile |
|---|---|---|
| `MatchCard` (opponent, outcome tag, ELO delta) | `apps/web/components/domain/match-card.tsx` | `apps/mobile/components/match-card.tsx` |
| `ProfileHeader` | `apps/web/components/domain/profile-header.tsx` | `apps/mobile/components/profile/profile-header.tsx` |
| `ProfileQuickStats` | | `apps/mobile/components/profile/profile-quick-stats.tsx` |
| `CompetitorHeader` (athlete page header, 72px mono ELO) | | `apps/mobile/components/athlete/competitor-header.tsx` |
| `HeadToHeadCard` | | `apps/mobile/components/athlete/head-to-head-card.tsx` |
| `StatOverview` (2x2 headline stats) | `apps/web/components/domain/stat-overview.tsx` | |
| `CompareStatsModal` (side by side; weight in lbs) | `apps/web/components/domain/compare-stats-modal.tsx` | `apps/mobile/components/compare-stats-modal.tsx` |
| `RecentActivitySection` (chip filters) | `apps/web/components/domain/recent-activity-section.tsx` | `apps/mobile/components/dashboard/recent-activity-section.tsx` |
| `NotificationBell` + panel | `apps/web/components/domain/notification-bell.tsx` | `apps/mobile/components/notifications/` |
| `ShareProfileSheet` | `apps/web/components/domain/share-profile-sheet.tsx` | `apps/mobile/components/share-profile-sheet.tsx` |
| `SessionCard`, `GymCard`, `LobbyActiveIndicator`, `ChallengeSheet`, `ChallengeResponseSheet` | `apps/web/components/domain/` (web only; sessions and gyms are web-only now) | |
| `ErrorBoundary` (retry and sign out, forwards to Sentry) | | `apps/mobile/components/error-boundary.tsx` |
| Match flow: the wizard, steps (`wait`, `weight`, `ready`, `live`, `end`, `result`, `confirm`, `summary`), `CameraOverlay`, `UploadProgressBanner`, `QueueStatusBanner` | | `apps/mobile/components/match-flow/` |

### In-app design hub (web)

The web app serves `/design` ([apps/web/app/design/](apps/web/app/design/)): `style-guide`, `ui-kit`, `elo-system`, `app-icon-concepts`, `board`, `web-layouts`, `screens`, `screens/native` and `wireframe`. These pages show web concepts and history. For the mobile app, this document and the Native Screens canvas are the design source; the static `apps/web/public/design/native-screen-inventory.html` and `wireframe.html` (served by `/design/screens/native` and `/design/wireframe`) are stale and must not be used as a source. `apps/web/public/design/tokens.css` is a copy of the canonical web tokens file and differs only in its dark selector.

### Where to find things

| Need | Location |
|---|---|
| Token source of truth | [apps/mobile/lib/tokens.ts](apps/mobile/lib/tokens.ts) |
| Kit tokens (this system) | [design/system/project/tokens.json](design/system/project/tokens.json) |
| Web token mirror | [apps/web/app/design-system/tokens.css](apps/web/app/design-system/tokens.css) |
| Mobile class wiring | [apps/mobile/tailwind.config.js](apps/mobile/tailwind.config.js) |
| Match-flow and on-media palettes | `apps/mobile/lib/theme/palette.ts`, `apps/mobile/components/match-flow/live/broadcast-tokens.ts` |
| Motion tokens and haptics | `apps/mobile/lib/motion/` |
| ELO primitives | `apps/mobile/components/ui/elo-system/`, `apps/web/components/ui/elo-system/` |
| Arena components | `apps/mobile/components/arena/` |
| Shells | `apps/mobile/components/layout/`, `apps/web/components/layout/` |
| Font loading | `apps/mobile/app/_layout.tsx` (expo-font), `apps/web/app/layout.tsx` (next/font) |
| Logo sources | `design/icon-options/er-lettermark/` (E·R lettermark SVGs), rendered PNGs in `apps/mobile/assets/` |
| Screens | the "ELO RATED Native Screens" canvas, with `design/native-screens/` for drift tracking |
