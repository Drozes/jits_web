# Typography

Four families, each bound to one job. The font tells you what kind of thing you are reading: a brand moment, a label you can act on, prose, or a number.

| Family token | Font | Weights shipped | Job | Mobile classes |
|---|---|---|---|---|
| `display` | Bebas Neue | 400 | The wordmark and display numerals 40px and up | `font-display` |
| `heading` | DM Sans | 700, 500, 400 | Headings, UI labels, buttons, tab labels, chips | `font-heading` (700), `font-heading-medium`, `font-heading-regular` |
| `body` | Inter | 400, 500 | Prose, helper copy, toasts' descriptions | `font-body`, `font-body-medium` |
| `mono` | JetBrains Mono | 400, 500, 700 | ALL numbers (tabular-nums) and caps meta labels | `font-mono`, `font-mono-medium`, `font-mono-bold` |

Sources: `apps/mobile/tailwind.config.js:191-202` (families), `apps/mobile/app/_layout.tsx:65-75` (`useFonts`, nine faces from `@expo-google-fonts/*`: bebas-neue 0.4.1, dm-sans 0.4.2, inter 0.4.2, jetbrains-mono 0.4.1). The kit's `fonts/` folder holds those exact nine TTFs. React Native cannot synthesize weights, so each weight is its own family name (`DMSans_700Bold`, ...) and `font-semibold` / `font-medium` classes do nothing but fall back to the system font: never use them.

## Rules

- Set every number in `mono` with tabular figures: ELO, deltas, ranks, records, weights, timers, counts, step counters ("Step 2 / 3"). Numbers keep tabular figures while they roll.
- The one exception: `display` (Bebas Neue) may set a numeral at 40px and up when it is a brand moment, namely the face-off countdown (240px) and the GO slam (116px). Face-off weights are 36px Bebas today (`faceoff-top.tsx:152,179`), recorded under Open decisions.
- Set labels you act on (buttons, tabs, chips, header titles) in `heading`, uppercase, with tracking.
- Set small metadata in `mono`, uppercase, at `tracking-caps-l` (1.68px) or wider. A caps label with no tracking is a bug (R3 TY-3).
- Set prose in `body`. A number inside a sentence may stay in the sentence ("Profile weight saved: 172.5 lbs, for future matches."), but a number that is the point of the line goes in `mono`.
- Never set text below 10px. The only sanctioned exception is the CountPill digit (9px, capped at 1.3x Dynamic Type).
- Write the wordmark "ELO RATED" as live Bebas Neue text in `ink` with `tracking-mark`; there is no wordmark file.

## Letter-spacing (tracking)

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

## Text styles

The styles in `tokens.json` (`type.groups`) are the real top combinations in the app, by frequency (R1 section 2.4). Mobile has no named size scale yet (TY-1: 464 arbitrary `text-[Npx]` sizes); these styles are the scale WP5 will name.

### Display (`display`)

| Style | Size / line | Tracking | Example | Source |
|---|---|---|---|---|
| `wordmark-hero` | 72 / 72 | -0.07px | ELO RATED | `wordmark.tsx:11-16` |
| `wordmark-lg` | 48 / 48 | -0.07px | ELO RATED | same |
| `wordmark-md` | 22 / 22 | -0.07px | ELO RATED (BrandHeader) | same |
| `countdown-numeral` | 240 / 240 | 0 | 3 | `countdown.tsx:46-48,182` |
| `countdown-go` | 116 | 2px | GO | `countdown.tsx:235-236` |
| `faceoff-weight` | 36 | 0 | 172.5 LBS | `faceoff-top.tsx:152,179` |

### Heading (`heading`, 700)

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

### Body (`body`, 400)

| Style | Size / line | Example | Source |
|---|---|---|---|
| `body-14` | 14 / 21 | Profile weight saved for future matches. | 37 uses; `leading-6` = 21px |
| `body-13` | 13 | Could not save notification settings. Please try again. | 51 uses (the most common) |
| `body-12` | 12 | Could not submit feedback. Please try again. | 45 uses; toast description |
| `body-11` | 11 | Not now | 7 uses |

### Data (`mono`)

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

## Units and casing

- Weight is **lbs**, stored and shown in pounds. Use mono caps `LBS` in data strips ("172.5 LBS", `faceoff-top.tsx:31`) and lowercase `lbs` in prose. The old DESIGN.md "kg" rule is wrong.
- Deltas carry a sign and an arrow, not only a color: "▲ +14" (`formatDeltaChip`, `delta-chip.tsx`). Negative values use the true minus sign (U+2212).
- Initials join with a middle dot: "F·L" (`avatar-32.tsx:12-18`).

## Web parity

Web loads the same four families through `next/font/google` (`apps/web/app/layout.tsx:32-35`), names them `--font-display`, `--font-heading`, `--font-body`, `--font-mono` (`tokens.css:83-86`), and has a named size scale (`--size-*`, `tokens.css:95-126`) that mobile lacks. Web body default is Inter 14px / 1.5.
