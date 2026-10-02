ELO RATED is a ranked-match app for Brazilian jiu-jitsu. Athletes go live in the **Arena**, challenge someone close to their rating and weight, roll, confirm the result, and watch their **ELO** move. Every match is ranked. The product should feel like premium sports tech (think timing screens and broadcast graphics): dark, precise, data-forward, and quiet until something real happens.

This system describes the mobile app (`apps/mobile` in jits_web), which is the source of truth. Web appears only as parity notes. Read this page first, then the sections: Color, Typography, Layout, Motion, Accessibility, Components, Conformance, Legacy.

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
- **Sharp corners.** `radius-tag` 2px for tags, chips and avatars, `radius-button` 3px for buttons, `radius-plate` 4px for everything else, `radius-sheet` 8px for sheets and modals and never more. Only dots are round (live, status and seek-marker dots); every other control, play buttons and check badges included, takes the radius scale.
- **Ink for content.** Text in `ink`, secondary copy in `ink-2`, mono labels 10px and up in `ink-3`. Every number is `ink` unless it is a delta.
- **Signal Red means "act" or "lose".** Fill ONE primary action per surface with `signal-red`, label it in `on-signal` (never white), press it to `signal-red-lift`. Red text uses `negative` (losses, errors) or `signal-red-text`, never `signal-red`. Red never decorates data, spinners, icons, switches or selections.
- **Gain Green means "gain, win, live".** `gain-green` only for rating increases, wins and LIVE. A ready check, a confirmed result or a finished upload is `ink` with a glyph.
- **Amber means "draw" or "waiting".** `attention` for the draw headline (the verdict DRAW and the draw delta), pressure score, and pending, processing, paused or disputed states. The D outcome letter in a list stays neutral.
- **Heat is the Arena's alone.** `heat-orange` and `heat-red` appear only on the Arena tab icon's embers and the challenge afterglow.
- **Selected is a surface, not a color.** A selected option steps to `plate-bright` with a `hairline-strong` edge and an `ink` check. Never a red fill.
- **No decorative color.** If a color does not mean one of the above, it is grey.
- **Over media, use the on-media set.** Chrome over the camera, video or a photo uses the fixed `on-media-*` tokens in both themes, with text on `on-media-badge` or the light `on-media-chip`.

## Typography

- `display` (Bebas Neue): the wordmark and display numerals 40px and up (the countdown, the GO slam). Always caps.
- `heading` (DM Sans 700): buttons, tabs, chips, header titles, in caps with tracking; plate titles in sentence case.
- `body` (Inter): prose and helper copy.
- `mono` (JetBrains Mono): every number, with tabular figures, and caps meta labels at `tracking-caps-l` (1.68px) or wider.
- Sizes come from the type scale, never a literal: text steps `micro` 10, `caption` 11, `small` 12, `body` 13, `callout` 14, `subhead` 16, `title` 18, `title-l` 20, `title-xl` 22, `headline` 24, `headline-l` 26, `headline-xl` 28, `headline-2xl` 30, then pinned `display-<px>` steps (36 to 240). Classes `text-<step>`, style props `typeStep("<step>")` (`typeSize("<step>")`, size only, for TextInputs and line-height-free moments), numbers through `<Mono>`, caps labels through `<Label>`.
- 10px is the floor. The text styles in `tokens.json` are the real top combinations; the most common label is `meta-label` (mono 10px, 1.68px tracking, caps).

## Motion

Motion carries meaning or does not exist. Every animation is **Reactive** (a response to touch), a **Moment** (one shot on a real state change, never on mount) or **Ambient** (a loop only while a state is live), runs on the UI thread, has a still Reduce Motion end state, and is listed in the registry (Motion section). The rhythm: `instant` 100ms, `fast` 240ms, `base` 480ms, `slow` 720ms, `pulse` 1400ms, brand ease-out `cubic-bezier(0.22, 1, 0.36, 1)`, press scale 0.97. Never a haptic on a loss or for ambient motion. Previews show the resting end state.

## Iconography

- **lucide** (`lucide-react-native` 1.16 on mobile, `lucide-react` on web): 24-unit grid, no fill, stroke 2, round caps and joins. 52 distinct icons ship; do not mix in another set and do not redraw them.
- **Size:** tab bar icons 18px (`size-tab-icon`), header back chevron 20px, media controls 22 to 28px.
- **Color:** icons take an ink (`ink` active, `ink-3` inactive, `ink-2` for the back chevron), never `signal-red` as decoration. Over media, `on-media-white`.
- **The Arena icon** is lucide `Swords` split into two blade halves so it can carry heat: blade A (polyline `14.5 17.5 3 6 3 3 6 3 17.5 14.5`, lines 13,19 to 19,13; 16,16 to 20,20; 19,21 to 21,19) and blade B (polyline `14.5 6.5 18 3 21 3 21 6 17.5 9.5`, lines 5,14 to 9,18; 7,17 to 4,20; 3,19 to 5,21). At rest it is exactly lucide `Swords`. Live: three 2px embers (two `heat-orange`, one `signal-red`). One to three pending challenges: that many 2.5px `heat-red` embers. More than three: the `CountPill` returns.
- **The logo** is the E·R lettermark: DM Sans Bold letters in `#E8EDF2` with a square Signal Red `#E63946` interpunct, on Void `#0D0F14` (assets/Logos). The wordmark "ELO RATED" has no file: set it live in `display` with `tracking-mark`. The old red-E-with-gold-peak `logo.svg` is retired.

## Consuming this kit

- **Token names** are the kit names in `tokens.json` (`void`, `ink-3`, `signal-red`, `radius-plate`, `space-4`, ...). In a preview or web page they are CSS custom properties of the same name (`var(--void)`, `var(--radius-plate)`, `var(--font-mono)`; dotted steps escape: `var(--space-1\.5)`), and each text style is a class (`.meta-label`).
- **In the RN code** the same values are NativeWind classes (`bg-surface`, `bg-surface-2/3/4`, `text-ink`, `text-ink-2/3`, `text-ink-on-cta`, `bg-cta`, `text-cta`, `text-positive`, `text-negative`, `text-attention`, `border-attention(-rule)`, `bg-heat-orange`, `bg-heat-red`, `border-hairline(-faint|-strong)`, `rounded-xs/sm/md/lg`, `font-display/heading/body/mono`, `text-<step>` (`text-micro` ... `text-display-240`), `tracking-caps(-l|-xl)`, `tracking-code`); Color lists the mapping. JS call sites use `useThemedTokens()`, `usePalette()` or `ON_MEDIA` (= `onMediaTokens`).
- **Units:** every length is device px at **NativeWind rem = 14px** (one spacing step = 3.5px; `p-4` = 14px). Arbitrary `[Npx]` values stay literal. Web renders the same class at rem 16.
- **Where the code lives (jits_web):** colors `apps/mobile/lib/tokens.ts` (the source of truth; web `apps/web/app/design-system/tokens.css` mirrors it), classes `apps/mobile/tailwind.config.js`, match-flow palette `apps/mobile/lib/theme/palette.ts`, motion `apps/mobile/lib/motion/`, primitives `apps/mobile/components/ui/elo-system/`, Arena `apps/mobile/components/arena/`, chrome `apps/mobile/components/layout/`.
- **Screens:** the ELO RATED Native Screens canvas mirrors the shipped app; draw boards from this kit's tokens at 390px wide, dark.

## Component cards

Twenty cards, each a static HTML twin of the RN component with a README (`components/<Name>/`). Cards marked target draw the WP end state; their READMEs show today's code too.

| Family | Cards |
|---|---|
| Actions | Button, OutlineAction |
| Status | MetaTag, LivePill (with LiveDot), CountPill (with tab badges) |
| Data | EloTile, RollingNumber (settled frame), DeltaChip |
| Navigation | TabBar (with the Arena icon's embers), AppHeader (with the header status chip), Chip (shipped, WP2) |
| Surfaces | Plate, Sheet (shipped, WP1) |
| Feedback | Toast, Skeleton |
| Identity | Avatar |
| Arena | OnAirStrip, ChallengeStrip |
| Match flow | Countdown, RatingMoment |

## Open decisions (decided by default, owner to confirm)

1. **Source of truth:** `apps/mobile/lib/tokens.ts` and `lib/motion/tokens.ts`; web `tokens.css` mirrors them (the old DESIGN.md claimed the reverse; the drift test already treats mobile as the source).
2. **Units:** device px at rem 14.
3. **Theme order:** `dark` first, then `light`.
4. **Color set:** the 17 core tokens plus `attention` (amber, scoped to draws, pressure and pending, processing, paused or disputed states, as the code does), `heat-orange` and `heat-red` (Arena heat only), and the `on-media-*` set (one source, `onMediaTokens` in `lib/tokens.ts`, behind both `ON_MEDIA` and `BROADCAST` since WP7). Legacy shadcn colors are not kit tokens.
5. **Display numerals:** Bebas Neue is allowed for numerals 40px and up as brand moments (countdown 240px, GO 116px, the wordmark); every other number is mono. Face-off weights are 36px Bebas today: either raise them to 40px or accept 36px as the floor.
6. **Radius scale:** 2 tag, 3 button, 4 plate (default), 8 sheets and modals maximum; dots round. Avatars: the code's `Avatar32` is a 2px-radius square, while the old DESIGN.md said avatars stay circular; the kit follows the code (square) until decided.
7. **Shadows:** none; no shadow family.
8. **Weight unit:** lbs (code truth; DESIGN.md's kg is wrong).
9. **Selected state:** `plate-bright` plus a `hairline-strong` edge and an `ink` check, never a red fill (shipped in WP2, jits-3eeg.3: `selectionSurface()` and `SelectCheck` in `components/ui/elo-system/selection.tsx`; `hairline-strong` alone is below 3:1, so the surface step and the glyph are required).
10. **Motion values** live in the Motion section (the format has no motion family).
11. **Logo:** the E·R lettermark SVGs; the old `apps/web/public/logo.svg` is retired; the wordmark is live Bebas Neue text, no file.
12. **Wizard progress segments** in `signal-red` (MF-8) and the "VS" in red display type (MF-12) are treated as brand chrome until decided. The same brand chrome covers your-side accent and you-mark next to the VS: the red accent block and dot on your side of the face-off (`faceoff-top.tsx`) and the 4px you-mark beside the broadcast VS on the live screen (`athlete-bar.tsx`, `live-you-mark`). Identity red appears only beside the VS; anywhere else "you" is `ink` (the result form's YOU label is ink since WP2). WP2 kept all of these red under this decision; the color guard test allowlists them by name, so changing the decision is an allowlist edit plus those classes.
13. **Destructive button:** an outline in `negative` (border and label; 6.28:1 on `void` dark, 6.37:1 light), proposed by the kit. The code has no ELO destructive button: today's `DestructiveButton` (one use, Delete account) fills with the legacy red under a `#E8EDF2` label at 3.54:1 and reads as a second red CTA.
14. **Chip selected state:** `plate-bright` fill, `hairline-strong` border, `ink` label, no red square (shipped in WP2, bead jits-3eeg.3). On this compact control the label's step from `ink-2` to `ink` stands in for the check glyph. The result OutcomeToggle (Submission / Draw) is the other compact segmented control under this exception: its icon and label step from `ink-3` to `ink`.
15. **Circular elements (D-6):** only dots are round: live dots, status dots, seek markers. Avatars are square (as code). The round play buttons (`player-controls.tsx`, `match-hero.tsx`), the round seek thumb and the round check badges in the match flow (R3 FR-8) are non-conforming and take `radius-plate` / `radius-tag` when their package touches them.
16. **Centered modals (D-4):** sheets are the default modal. The challenge prompt is a centered card by decision (jits-02vo.3). Compare Stats, the go-live location prompt and the start-blocked notice are centered today and are decided in WP1 (R3 SH-5): move to a sheet or record the exception here.
17. **Contrast on media:** on-media text sits on `on-media-badge` or the light `on-media-chip` only (see Color).
18. **Draws (decided 2026-10-02, WP2):** amber (`attention`) marks the draw headline: the verdict DRAW (the verdict step and the confirm banner), and the draw delta in the rating moment, `DeltaChip`, the `EloTile` draw tone and the stakes strip. The D outcome letter in lists (`OutcomeTag`, Film Room poster cards) stays neutral (`ink-3` / on-media `text`, with a `hairline-strong` edge): a list is not a headline.
19. **Input focus (decided 2026-10-02, WP2):** a focused input takes a neutral `ink-2` edge at the same 1px stroke (6.27:1 on dark `plate`, 5.82:1 on light), never `signal-red`, so focus and error (`negative`) no longer look alike (`AuthFormField`, `EloTextInput`).

## Not synced

Not carried into tokens: web-only values (the web `--size-*` type scale, the web z-index ladder, web `--opacity-*`, the shadcn `--chart-*` slots), `palette.ts` match-flow mirrors (`winRule`, `secondaryBg`, `secondaryBgPressed`, `track`), and the push accent `#ef4444` in `app.json` (native config). Components are static HTML twins hand-written from the RN sources (React Native cannot run in the preview frame); no bundle was built.
