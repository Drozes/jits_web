# Typography

Four families, each bound to one job. The font tells you what kind of thing you are reading: a brand moment, a label you can act on, prose, or a number.

| Family token | Font | Weights shipped | Job | Mobile classes |
|---|---|---|---|---|
| `display` | Bebas Neue | 400 | The wordmark and display numerals 40px and up | `font-display` |
| `heading` | DM Sans | 700, 500, 400 | Headings, UI labels, buttons, tab labels, chips | `font-heading` (700), `font-heading-medium`, `font-heading-regular` |
| `body` | Inter | 400, 500 | Prose, helper copy, toasts' descriptions | `font-body`, `font-body-medium` |
| `mono` | JetBrains Mono | 400, 500, 700 | ALL numbers (tabular-nums) and caps meta labels | `font-mono`, `font-mono-medium`, `font-mono-bold` |

Sources: `apps/mobile/tailwind.config.js` `theme.extend.fontFamily` (families), `apps/mobile/app/_layout.tsx:65-75` (`useFonts`, nine faces from `@expo-google-fonts/*`: bebas-neue 0.4.1, dm-sans 0.4.2, inter 0.4.2, jetbrains-mono 0.4.1). The kit's `fonts/` folder holds those exact nine TTFs. React Native cannot synthesize weights, so each weight is its own family name (`DMSans_700Bold`, ...) and `font-semibold` / `font-medium` classes do nothing but fall back to the system font: never use them.

## Rules

- Set every size from the [type scale](#type-scale): a `text-<step>` class or, in a style prop, `typeStep("<step>")`. Never a literal (`text-[13px]`, `fontSize: 13`). The typography guard test fails on any new literal.
- Set every number in `mono` with tabular figures: ELO, deltas, ranks, records, weights, timers, counts, step counters ("Step 2 / 3"). Numbers keep tabular figures while they roll. `<Mono>` does this for you.
- The one exception: `display` (Bebas Neue) may set a numeral at 40px and up when it is a brand moment, namely the face-off countdown (240px) and the GO slam (116px). Face-off weights are 36px Bebas today (`faceoff-top.tsx:152,179`), recorded under Open decisions.
- Set labels you act on (buttons, tabs, chips, header titles) in `heading`, uppercase, with tracking.
- Set small metadata in `mono`, uppercase, at `tracking-caps-l` (1.68px) or wider. A caps label with no tracking is a bug (R3 TY-3); `<Label>` cannot render one.
- 11px mono data lines in strips (a name, a countdown, stakes, a booked time: the Mat Board strip lines, ConfirmStrip, the Closest stakes, the booked strip) stay untracked even when uppercase: caps tracking is for labels, and a data line carries a name or figures that must not truncate (the kit ChallengeStrip card). The 10px section labels and counts beside them keep `tracking-caps-l` or wider.
- Set prose in `body`. A number inside a sentence may stay in the sentence, but a number that is the point of the line goes in `mono`: a nested `font-mono` tabular span keeps the sentence whole ("Profile weight saved: **172.5** lbs, for future matches." in `faceoff-top.tsx`, R3 MF-3; `MonoNumbers` in `components/match-detail/highlight/mono-numbers.tsx` does it for every digit run).
- Never set text below 10px (`micro`, the floor). The only sanctioned exception is the CountPill digit (9px, capped at 1.3x Dynamic Type).
- Write the wordmark "ELO RATED" as live Bebas Neue text in `ink` with `tracking-mark`; there is no wordmark file.

## Type scale

One name per size, the same everywhere: the Tailwind class `text-<step>` (`apps/mobile/tailwind.config.js` `theme.extend.fontSize`), the style-prop exports `typeStep("<step>")` (size and line height) and `typeSize("<step>")` (size only, for TextInputs and line-height-free moments) / `TYPE_SCALE` (`apps/mobile/lib/typography.ts`), and the kit (`tokens.json` type group "Scale", styles `text-<step>`). `typography-drift.test.ts` fails if any of them, this page or DESIGN.md disagree. The steps are the sizes the app already used (R1 section 2.3), so most sites move with no pixel change. Sizes are device px, literal on native (NativeWind rem does not apply).

### Text steps

Copy, labels and inline data, in any family. Line height is about 1.3x up to 16px and 1.2x above; a step brings its line height, and a site that tunes its own (`leading-*`, or `lineHeight` in a style) keeps it.

| Step | Class | Size | Line | Used for |
|---|---|---|---|---|
| `micro` | `text-micro` | 10 | 13 | Caps meta labels, tab labels, chips, strip labels; the 10px floor (text-[10px], 117 uses). |
| `caption` | `text-caption` | 11 | 14 | Small actions (ROLL), small data, captions (text-[11px]). |
| `small` | `text-small` | 12 | 16 | Secondary body, header titles, small buttons, inline data (text-[12px]). |
| `body` | `text-body` | 13 | 17 | Body copy, the most common size; toast titles (text-[13px]). |
| `callout` | `text-callout` | 14 | 18 | Large body, button labels, athlete names (text-[14px]). |
| `subhead` | `text-subhead` | 16 | 21 | Plate titles, subheads, the large delta (text-[16px]). |
| `title` | `text-title` | 18 | 22 | Screen, step and sheet titles (text-[18px]). |
| `title-l` | `text-title-l` | 20 | 24 | Compare-stats figures, the feedback sheet title (text-[20px]). |
| `title-xl` | `text-title-xl` | 22 | 26 | The rating-moment odometer (Adding Flare), stat figures, the BrandHeader wordmark (22px). |
| `headline` | `text-headline` | 24 | 29 | Profile and competitor names and records (24px). |
| `headline-l` | `text-headline-l` | 26 | 31 | The rating-moment delta chip (Adding Flare), the fight delta, the Home greeting (26px). |
| `headline-xl` | `text-headline-xl` | 28 | 34 | Stat figures, the invite code input, practice titles (28px). |
| `headline-2xl` | `text-headline-2xl` | 30 | 36 | Match-flow step headers, the result score input (30px). |

### Display steps

Brand moments and hero numerals, named by their px because each is pinned to its owner (the Adding Flare moments, EloTile, the Wordmark, the verdicts, the live clock). They never move to fit a layout. Line height is 1.1x (Bebas and JetBrains Mono clip at 1.0 on RN); a moment that tunes its own line height keeps it. Bebas sets numerals only at 40px and up (Open decision 5: the face-off weight at 36px).

| Step | Class | Size | Line | Used for |
|---|---|---|---|---|
| `display-36` | `text-display-36` | 36 | 40 | Face-off weights (Bebas, Open decision 5), EloTile small, the share-card ELO, the practice verdict. |
| `display-40` | `text-display-40` | 40 | 44 | The Film Room title, the invite code, the opponent-ended plate; the 40px Bebas threshold. |
| `display-44` | `text-display-44` | 44 | 48 | EloTile medium, the challenge prompt rating. |
| `display-48` | `text-display-48` | 48 | 53 | Wordmark lg, the result-waiting headline. |
| `display-52` | `text-display-52` | 52 | 57 | The match-detail verdict. |
| `display-60` | `text-display-60` | 60 | 66 | The confirm-step result. |
| `display-64` | `text-display-64` | 64 | 70 | EloTile large. |
| `display-72` | `text-display-72` | 72 | 79 | Wordmark hero, the splash statement, the profile and competitor ELO. |
| `display-80` | `text-display-80` | 80 | 88 | The live clock in landscape, the LOSS and DRAW verdict. |
| `display-88` | `text-display-88` | 88 | 97 | The live clock in portrait. |
| `display-96` | `text-display-96` | 96 | 106 | EloTile hero, the WIN verdict, the countdown numeral minimum. |
| `display-116` | `text-display-116` | 116 | 128 | The GO slam (Adding Flare countdown). |
| `display-240` | `text-display-240` | 240 | 264 | The face-off countdown numeral (Adding Flare). |

## Letter-spacing (tracking)

Mobile tracking is a fixed px value computed at a 14px baseline (`tailwind.config.js` `theme.extend.letterSpacing`, `TRACKING` in `lib/typography.ts`, the kit group "Tracking"), so the same step is proportionally wider on small text than the web's em-based tracking (`tracking-caps-l` on a 10px label is 0.168em on mobile, 0.12em on web). WP5 added only `code`.

| Step | Class | Value (mobile) | Web | Job |
|---|---|---|---|---|
| `tight` | `tracking-tight` | -0.28px | -0.02em | Avoid (-0.02em at 14px). |
| `mark` | `tracking-mark` | -0.07px | -0.005em | The wordmark, live Bebas text. |
| `normal` | `tracking-normal` | 0px | 0em | Default; numbers and prose. |
| `loose` | `tracking-loose` | 0.56px | 0.04em | Loose caps on headings 13px and up (0.04em at 14px). |
| `caps` | `tracking-caps` | 1.12px | 0.08em | Buttons, chips, display caps (0.08em at 14px). |
| `caps-l` | `tracking-caps-l` | 1.68px | 0.12em | Section and meta labels, tab labels: the default caps label (0.12em at 14px). |
| `caps-xl` | `tracking-caps-xl` | 2.52px | 0.18em | Strip headers, the LIVE pill (0.18em at 14px). |
| `caps-xxl` | `tracking-caps-xxl` | 3.36px | 0.24em | The smallest caps (0.24em at 14px). |
| `code` | `tracking-code` | 4px | none | One-time code digits, the invite code (added in WP5, R3 ST-4). |

Hero numerals track at -0.04em of their size: `numeralTracking(px)` in `lib/typography.ts` (`tracking="numeral"` on `Mono`), as EloTile (`elo-tile.tsx`), the live clock (-3.52px at 88) and the profile ELO do. It is proportional, so it is a function, not a step.

## Primitives: Mono and Label

Both live in `apps/mobile/components/ui/elo-system/` (exported from its `index.ts`) and take a scale step, never a number.

| Component | Props (default) | Renders |
|---|---|---|
| `Mono` | `size` (`small`), `weight` `regular` / `medium` / `bold` (`regular`), `tracking` a step or `numeral` (`normal`), `caps` (false), `className` (color; default `text-ink`), `style` | JetBrains Mono at the step's size and line height with tabular figures always on (the caller's `style` cannot turn them off) |
| `Label` | `size` a text step (`micro`), `family` `mono` / `heading` (`mono`), `weight` (`regular` for mono, `bold` for heading), `tracking` `caps` / `caps-l` / `caps-xl` / `caps-xxl` (`caps-l`), `className` (color; default `text-ink-3` mono, `text-ink` heading), `style` | A caps label: uppercase by style (write the source in sentence case so VoiceOver reads words), always tracked, tabular figures in mono |

```tsx
<Label>Closest match</Label>                                   // mono 10, caps-l, ink-3 (meta-label)
<Label family="heading" size="small" tracking="caps">Sign out</Label>  // label-12
<Mono size="title-xl" weight="bold">1512</Mono>                // a stat figure
<Mono size="display-72" weight="bold" tracking="numeral">1526</Mono>  // the profile ELO
<Text style={[typeStep("micro"), { letterSpacing: TRACKING["caps-l"], color: p.text3 }, TABULAR]}>
```

`MetaTag` renders its text through `Label`. `TABULAR` (`{ fontVariant: ["tabular-nums"] }`) has one home, `lib/typography.ts`; `lib/theme/palette.ts` and `broadcast-tokens.ts` re-export it (R3 TY-6). Prefer the `tabular-nums` class where `className` is available. `cn()` knows every step and tracking name, so `cn("text-micro", "text-ink")` keeps both.

## How to migrate

The WP5 sweeps (5a: Arena, Rankings, Profile, Home, invites, the className sites; 5b: match flow, Film Room, match detail, the style-prop sites) follow this table. Keep pixels unless the row says otherwise; never move a registered Adding Flare element (odometer, delta chip, tap marks, countdown, verdict, splash) to a different size.

Rules for every site:

- **Size only, no line height (`typeSize`):** every `TextInput`, and every registered Adding Flare or match-flow moment that sets no `lineHeight` today (the GO slam, `countdown.tsx:236`, 116px; the face-off weight, `faceoff-top.tsx`, 36px), takes `typeSize("<step>")` (`{ fontSize }` only). Never `typeStep` or a `text-<step>` class there: a step's line height would move the glyph box, and on iOS a single-line `TextInput` with a line height loses its caret. Known `TextInput` sites: `app/(auth)/invite-code.tsx`, `components/match-flow/steps/result-form.tsx`, `components/match-flow/faceoff/faceoff-weight-check.tsx`, `components/match-flow/faceoff/faceoff-top.tsx`, `components/match-flow/steps/submission-fields.tsx`, `app/(app)/settings/feedback.tsx`, `app/(app)/settings/delete-account.tsx`, `components/match-flow/steps/dispute-form.tsx`, `components/match-detail/highlight/highlight-feedback-text.tsx`, plus `components/auth/auth-form-field.tsx`, `components/profile-setup/elo-form-field.tsx` and `components/ui/search-select.tsx`.
- **`leading-*` goes after the size:** in a `className` or `cn()` string write `text-<step>` first and any `leading-*` after it (`"font-body text-callout leading-6"`), so the site's own line height wins over the step's.
- **Never hide a size in a named constant** (`const NAME_SIZE = 15`, `const LABEL = { fontSize: 10 }`): the guard cannot see it and the scale loses the site. Use the step name at the site, or a constant built from it (`const LABEL = { ...typeStep("micro"), letterSpacing: TRACKING["caps-l"] }`).
- **`Mono` and `Label` take their size only from `size`:** no `fontSize` in their `style`, no size class.

### Sizes

| Old literal | Step | Change |
|---|---|---|
| `text-[8px]`, `text-[9px]`, `fontSize: 8` / `9` | `micro` | +1 to +2px (the A1-3 floor fix). Not the CountPill digit, which stays. **Verify on device:** `components/film-room/player-controls.tsx:28` (the 8px "10" inside the 28px skip icon) and `components/arena/mat-board.tsx:757`, `:832` (the 9px chips); the bigger glyph may not fit its box. |
| `text-[10px]`, `fontSize: 10`, `text-xs` (10.5) | `micro` | none (`text-xs` -0.5px) |
| `text-[11px]`, `fontSize: 11` | `caption` | none |
| `text-[12px]`, `fontSize: 12`, `text-sm` (12.25) | `small` | none |
| `text-[13px]`, `fontSize: 13` | `body` | none |
| `text-[14px]`, `fontSize: 14`, `text-base` | `callout` | none |
| `text-[15px]`, `fontSize: 15` | `callout` for prose and numbers; `subhead` for heading names and caps labels | -1 / +1px |
| `fontSize: 15` on the splash "WE ARE" line (`splash-statement.tsx:260`, `splash-glow-statement.tsx:346`) and the computed `FITTED_SIZE` "ELO RATED" | keep | none: registered splash moments, sanctioned in the guard |
| `text-[16px]`, `fontSize: 16`, `text-lg` (15.75) | `subhead` | none |
| `text-[18px]`, `fontSize: 18`, `text-xl` (17.5) | `title` | none |
| `text-[20px]` | `title-l` | none |
| `fontSize: 22` | `title-xl` | none |
| `text-[24px]`, `fontSize: 24` | `headline` | none |
| `text-[26px]`, `fontSize: 26`, `text-3xl` (26.25) | `headline-l` | none |
| `text-[28px]`, `fontSize: 28` | `headline-xl` | none |
| `fontSize: 30` | `headline-2xl` | none |
| `text-[36px]` ... `fontSize: 240` | `display-<px>` (36, 40, 44, 48, 52, 60, 64, 72, 80, 88, 96, 116, 240) | none |
| Computed sizes (`SIZE_PX[size]`, `Math.round(size * 0.33)`) | key the size table by step and read `typeStep()` | none |
| Sizes computed from a box (tile initials at `size * 0.33`, the Film Room VS at `tileSize * 0.3`) | `typeSize(nearestStep(px))`: `nearestStep` (`lib/typography.ts`) snaps to the nearest step, a tie to the smaller one, and clamps to `micro` / `display-240`; size only, since the glyph is centered in a fixed box | up to half the gap between steps; the 88px tile initials (`athlete-tile.tsx`, also the match-detail hero) 29 to `headline-2xl` 30 (+1px) |
| `InitialsBlock` `fontSize={32}` (`result-waiting.tsx`, the claimer block) | `headline-2xl` | -2px: sanctioned off-scale snap. Initials in a fixed 96px box; no 32 step, and a step is not added for one block |
| `InitialsBlock` `fontSize={34}` (`verdict-hero.tsx`, the no-still fallback plate; not the SlamIn verdict) | `display-36` | +2px: sanctioned off-scale snap. Initials in a fixed 104px box; no 34 step |

Line height: a site with no line height gets the step's (within a pixel or two of the font's natural line); a site with its own `lineHeight` keeps it in `style` after the step (`style={[typeStep("micro"), { lineHeight: 12 }]}`).

### Tracking

| Old literal | Step |
|---|---|
| `0.4`, `0.52`, `0.6`, `0.64`, `0.72` (0.04em of the size) | `loose` (0.56) |
| `0.8` | `caps` on caps labels up to 14px; `loose` on display 40px and up |
| `1`, `1.2` | `caps` (1.12) |
| `1.6` | `caps-l` (1.68) |
| `2.2` | `caps-xl` (2.52) |
| `tracking-[4px]`, `tracking-[6px]` (invite codes, R3 ST-4) | `code` (4) |
| `-2.8`, `-3.2`, `-3.52`, `-fontSize * 0.04` | `numeralTracking(px)` / `tracking="numeral"` |
| `-0.6`, `-0.18` | `tight` (-0.28) |
| `2` on the GO slam, `3` on the splash reveal, `3.6`, `6.3` on the splash statement | keep: registered Adding Flare moments, sanctioned in the guard |
| `1` on the verdict SlamIn (WIN / LOSS / DRAW, `verdict-step.tsx`) | keep: the registered verdict moment, kept identical, sanctioned in the guard |

### Recipes

| Old recipe | New |
|---|---|
| `font-mono text-[10px] text-ink-3 uppercase tracking-caps-l` | `<Label>` |
| `font-mono-bold text-[10px] uppercase tracking-caps-xl` | `<Label weight="bold" tracking="caps-xl">` |
| `font-mono-bold text-[10px] uppercase` (no tracking, R3 AR-1) | `<Label weight="bold">` |
| `font-heading text-[12px] uppercase tracking-caps` | `<Label family="heading" size="small" tracking="caps">` |
| `font-heading text-[18px] uppercase` (no tracking, R3 AR-6) | `<Label family="heading" size="title" tracking="caps">` |
| `font-mono text-[12px]` holding a number | `<Mono>` |
| `text-sm` (12.25), `text-xs` (10.5), `text-base`, `text-lg`, `text-xl` | `small`, `micro`, `callout`, `subhead`, `title` (see Sizes) |
| `font-mono-bold text-[24px] tracking-caps` (a record) | `<Mono size="headline" weight="bold" tracking="caps">` |
| `font-mono-bold` + `style={{ fontSize: 72, letterSpacing: -2.8 }}` (R3 PR-3) | `<Mono size="display-72" weight="bold" tracking="numeral">` |
| `style={{ fontSize: 10, letterSpacing: 1.68, color: p.text3 }}` | `<Label style={{ color: p.text3 }}>` or `style={[typeStep("micro"), { letterSpacing: TRACKING["caps-l"], color: p.text3 }]}` |
| a local `const TABULAR = ...` | `import { TABULAR } from "@/lib/typography"` |

### The guard

`apps/mobile/__tests__/components/ui/typography-guard.test.ts` counts, per file: `text-[Npx]` classes, `fontSize` literals, sizes under 10px, rem-named sizes (`text-xs`, `text-sm`, `text-base`, `text-lg`, `text-xl` to `text-9xl`; 10.5 / 12.25 / 14 / 15.75 / 17.5px at rem 14), off-scale tracking and `font-mono` `<Text>` tags with no tabular figures. The registered moments that keep a literal on purpose (the CountPill 9px digit, the splash 15px line and its 6.3 / 3.6 / 3 tracking, the GO slam's 2px tracking, the verdict SlamIn's 1px tracking) are a named sanctioned list pinned to exact counts, outside the ratchet. The baseline (`__tests__/fixtures/typography-baseline.json`, WP5-core: 445 `text-[Npx]` / 172 `fontSize` / 12 under 10px / 8 rem-named / 53 off-scale tracking / 192 untabular mono, across 189 files) only goes down: a count above it fails, and a count below it fails until you lower it with `UPDATE_TYPOGRAPHY_BASELINE=1 npx jest __tests__/components/ui/typography-guard` (it never raises a count). `Mono`, `Label` and `MetaTag` are held at zero.

## Text styles

The styles in `tokens.json` (`type.groups`) are the real top combinations in the app, by frequency (R1 section 2.4). Each names its [type scale](#type-scale) step (`step` in `tokens.json`) and, where it is tracked, its tracking step (`tracking`; `numeral` is -0.04em of the size). `typography-drift.test.ts` checks every style's size and tracking against the scale.

### Display (`display`)

| Style | Step | Size / line | Tracking | Example | Source |
|---|---|---|---|---|---|
| `wordmark-hero` | `display-72` | 72 / 72 | -0.07px | ELO RATED | `wordmark.tsx:11-16` |
| `wordmark-lg` | `display-48` | 48 / 48 | -0.07px | ELO RATED | same |
| `wordmark-md` | `title-xl` | 22 / 22 | -0.07px | ELO RATED (BrandHeader) | same |
| `countdown-numeral` | `display-240` | 240 / 240 | 0 | 3 | `countdown.tsx:46-48,182` |
| `countdown-go` | `display-116` | 116 | 2px | GO | `countdown.tsx:235-236` |
| `faceoff-weight` | `display-36` | 36 | 0 | 172.5 LBS | `faceoff-top.tsx:152,179` |

### Heading (`heading`, 700)

| Style | Step | Size | Tracking | Case | Example | Source |
|---|---|---|---|---|---|---|
| `screen-title` | `title` | 18 | 0 | caps | LOCATION TO START | `go-live-location-sheet.tsx:51`, 8 uses |
| `heading-16` | `subhead` | 16 | 0 | sentence | Closest match | 6 uses |
| `heading-14` | `callout` | 14 | 0 | sentence | Uploaded by unknown | athlete names, `match-card.tsx:69`, 11 uses |
| `button` | `callout` | 14 | 1.68px | caps | CONFIRM RESULT | `auth-buttons.tsx:32` |
| `toast-title` | `body` | 13 | 0 | sentence | Could not load dashboard | `toast.tsx:136` |
| `header-title` | `small` | 12 | 1.68px | caps, `ink-2` | PROFILE | `app-header.tsx:101` |
| `label-12` | `small` | 12 | 1.12px | caps | SIGN OUT | 19 uses |
| `action-sm` | `caption` | 11 | 1.12px | caps | ROLL | `strip-primitives.tsx:57` |
| `tab-label` | `micro` | 10 | 1.68px | caps | ARENA | `elo-tab-bar.tsx:287-289` |
| `chip` | `micro` | 10 | 1.12px | caps | ALL | `chip.tsx:34` |

### Body (`body`, 400)

| Style | Step | Size / line | Example | Source |
|---|---|---|---|---|
| `body-14` | `callout` | 14 / 21 | Profile weight saved for future matches. | 37 uses; `leading-6` = 21px |
| `body-13` | `body` | 13 | Could not save notification settings. Please try again. | 51 uses (the most common) |
| `body-12` | `small` | 12 | Could not submit feedback. Please try again. | 45 uses; toast description |
| `body-11` | `caption` | 11 | Not now | 7 uses |

### Data (`mono`)

| Style | Step | Weight | Size / line | Tracking | Example | Source |
|---|---|---|---|---|---|---|
| `elo-hero` | `display-96` | 700 | 96 / 105.6 | -3.84px | 1512 | `elo-tile.tsx:13-18` |
| `elo-profile` | `display-72` | 700 | 72 | 0 | 1526 | `profile-header.tsx:70` |
| `elo-large` | `display-64` | 700 | 64 / 70.4 | -2.56px | 1526 | `elo-tile.tsx` |
| `elo-medium` | `display-44` | 700 | 44 / 48.4 | -1.76px | 1512 | `elo-tile.tsx` |
| `elo-small` | `display-36` | 700 | 36 / 39.6 | -1.44px | 1512 | `elo-tile.tsx` |
| `delta-m` | `subhead` | 700 | 16 | 0 | ▲ +14 | `delta-number.tsx:6-8` |
| `delta-s` | `small` | 700 | 12 | 0 | ▲ +14 | same |
| `elo-meta` | `callout` | 700 | 14 / 18 | 1.12px | RATING | `elo-tile.tsx:86-90` |
| `data-12` | `small` | 400 | 12 | 0 | 2 / 3 | 14 uses |
| `data-11` | `caption` | 400 | 11 | 0 | 0:42 | 12 uses |
| `meta-label-11` | `caption` | 400 | 11 | 1.68px | CLOSEST MATCH | 10 uses |
| `meta-label` | `micro` | 400 | 10 | 1.68px | LBS | `meta-tag.tsx` (through `Label`), 53 uses (the top recipe) |
| `strip-label` | `micro` | 700 | 10 | 2.52px | LIVE | `elo-tile.tsx:124`, `live-pill.tsx:121` |
| `strip-label-l` | `micro` | 700 | 10 | 1.68px | ON AIR | 7 uses |
| `count-badge` | none (sanctioned 9px) | 700 | 9 | 0 | 3 | `count-pill.tsx:31` |

## Units and casing

- Weight is **lbs**, stored and shown in pounds. Use mono caps `LBS` in data strips ("172.5 LBS", `faceoff-top.tsx:31`) and lowercase `lbs` in prose. The old DESIGN.md "kg" rule is wrong.
- Deltas carry a sign and an arrow, not only a color: "▲ +14" (`formatDeltaChip`, `delta-chip.tsx`). Negative values use the true minus sign (U+2212).
- Initials join with a middle dot: "F·L" (`avatar-32.tsx:12-18`).

## Web parity

Web loads the same four families through `next/font/google` (`apps/web/app/layout.tsx:32-35`), names them `--font-display`, `--font-heading`, `--font-body`, `--font-mono` (`tokens.css:83-86`), and has its own named size scale (`--size-*`, `tokens.css:95-126`); mobile's scale (above, WP5) is named for the app's real sizes and does not mirror it. Web body default is Inter 14px / 1.5.
