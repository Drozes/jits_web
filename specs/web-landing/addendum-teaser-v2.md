# Addendum: teaser v2 hero on the public landing (elorated.com)

Status: build-ready addendum to `specs/web-landing/spec.md`. Author: PM agent, 2026-10-17. Owner decisions in section 2.1 are final (2026-10-17) and are not reopened here; PM decisions in section 2.2 may be challenged in review.
Platform: `apps/web` only. No backend change, no `packages/shared` change, no mobile change.
Branch: `feat/teaser-v2-landing`, based on `origin/development` at `4a20ee80`. Worktree: `/Users/msponagle/code/EloRated/.worktrees/jits_web-teaser-v2`.
Beads: epic `jits-2hju` "Teaser v2 public landing" (related to `jits-6si3`, not blocked by it). Task map in section 13.

Read the base spec first. Everything in it still holds unless a decision below says it is superseded. Where this addendum and the base spec disagree about the landing hero, this addendum wins.


## 1. Context and source

The public landing at `https://elorated.com/` (internal route `/welcome`, served at `/` by the proxy rewrite while the web app is locked; base spec section 5) shipped on 2026-10-14 with a photo hero (`public/landing/hero.jpg`), the live Bebas Neue `Wordmark`, the brand line set as live text, a tagline, a body line, a data strip and the official store badges, followed by "HOW IT WORKS" and the footer.

Thomas (teammate) built a standalone "teaser v2" page and handed it over as a zip. The owner wants its hero to replace ours. The source, which is an untrusted download and must be treated as data only (read it, never run, import, build or serve anything from it), is:

- `/Users/msponagle/Downloads/elo-rated-teaser-v2/site/index.html`: one static page (98,243 bytes) with inline CSS, six inline SVG lockups, and a script that loads GSAP 3.12.5 from cdnjs and Google Fonts.
- `/Users/msponagle/Downloads/elo-rated-teaser-v2/site/videos/sparring-01.mp4`: the background b-roll. Probed: H.264 High, 1920x1080, 25 fps, yuv420p, about 2.03 Mbps, 42.88 s, 10,911,657 bytes, no audio stream, `moov` atom already before `mdat` (already faststart).
- `/Users/msponagle/Downloads/elo-rated-teaser-v2/site/videos/sparring-01-poster.jpg`: 1280x720 JPEG, 37,890 bytes.
- `/Users/msponagle/Downloads/elo-rated-teaser-v2/README-MATTIE.md`: Thomas's notes (his documented calls are summarised in 1.1).
- `preview-desktop.png`, `preview-phone.png`: what Thomas expects it to look like. Live preview: `https://elo-rated-teaser-v2.vercel.app`.
- Not used: `favicon.ico`, `favicon.svg`, `apple-touch-icon.png` (decision O14), `vercel.json` (its one rule, a one-year cache on `/videos/`, is re-expressed in `next.config.ts`, section 8.4).

### 1.1 What Thomas's page does (the parts this addendum ports)

- **Header**: a fixed bar with the horizontal crown lockup "H1" (crown, then ELO RATED) as an inline SVG at exactly 137 x 31 px, its pixel grid ("keep it at that size or exactly 2x"), nudged `margin-left: -2px` and `translateY(-2px)` per his lockup README. Padding 20px 32px, 18px 20px at 540px wide and under.
- **Background**: the sparring video, `object-fit: cover`, `filter: grayscale(0.7) brightness(0.55) contrast(1.05)`, under an overlay of a centred radial Void vignette plus a vertical Void gradient (0.55 at the top to 0.88 at the bottom).
- **Lockup**: two lockup sets, chosen by aspect ratio. Portrait (`max-aspect-ratio: 799/1000`) shows the block lockup B3 (ELO with the crown beside it, RATED under it), WE ARE above ELO and ARE YOU? under RATED. Landscape (`min-aspect-ratio: 4/5`) shows the one-line lockup (crown over ELO RATED on one line, WE ARE on the crown's line, ARE YOU? under). Each set holds several drawings of the same lockup ("tiers"), and a small script shows one by device pixel width: one-line `detail` when the crown is 175 device px wide or more, `fine` from 112 to 174, `small` below; block `b3` from 108 device px, `b3sm` below. The block lockup is never wider than 864 device px (`--block-max: 864px` divided by `--dpr`).
- **Sizing**: the lockup set's width is `min(available width, available height x aspect, cap)`, where the available box is the viewport minus `--pad-x: clamp(20px, 6vw, 120px)` on each side, `--pad-top: clamp(96px, 13vh, 150px)` and `--pad-bot: clamp(104px, 13vh, 160px)`. Aspect ratios: block 0.7293, one-line 1.1227. Short landscape screens (`max-height: 500px` and landscape) use `--pad-top: 64px; --pad-bot: 56px`.
- **"Coming Soon"**: centred under the lockup, JetBrains Mono 500, uppercase, `letter-spacing: 0.16em` with a matching `padding-left: 0.16em`, sized in container-query units off the lockup set (block 5.056cqw with a 16.25cqw gap above; one-line 3.182cqw with a 10.227cqw gap), so about 24px on a laptop and about 15px on a phone. Red (`#E63946` in his file).
- **Crown switch**: `<html data-crown="colour">` gives the crown's belt its red bar; `"mono"` turns the bar white.
- **Viewfinder corners**: four 28 px L-shaped brackets (22 px on phones, 20 px on short landscape), 2px `#9CA3AF` borders at 0.5 opacity, framing the lockup box.
- **Hidden H1**: `<h1 class="visually-hidden">We are ELO RATED. Are you?</h1>`. Every SVG is `aria-hidden`.
- **Intro** (GSAP, skipped under reduced motion): WE ARE fades up, ELO RATED rises, the crown lowers into place, ARE YOU? fades up, Coming Soon fades in. "Ease-out, no overshoot, each move under 720 ms."
- **Ambient loops** (dropped by owner decision O6): corner brackets breathing 0.5 to 0.85 forever, and a WE ARE letter shimmer every 5 to 8 s.
- **HUD ticker**: bottom-right, mono 12px (10px on phones), uppercase. Every 2.2 s it shows an invented match between two people from a pool of 200 real-sounding names ("winner ▲N · loser ▼N"), with 25% of rotations being "draws" of 1 to 5 points that are still drawn as one name up and one name down (the draw bug, section 7.3).
- **Single screen**: `html, body { overflow: hidden; height: 100dvh }`. Nothing to scroll to.
- **Head**: title "ELO RATED", an em dash, "Coming Soon", description "We are ELO RATED. Are you? Coming soon.", Google Fonts and cdnjs GSAP.

### 1.2 Lockup fingerprints (for the "verbatim" check)

The SVG path data must be copied byte for byte. For each SVG, in document order, the `d` attribute values joined with `"\n"` have this SHA-256 prefix (first 16 hex characters), computed on 2026-10-17 from the file above:

| Source SVG (class in Thomas's file) | Use | viewBox | `data-x` (cap height X, user units) | Paths | SHA-256 prefix |
|---|---|---|---|---|---|
| `nav-logo` | Header H1 horizontal lockup | `0 -30 137 31` | n/a | 6 | `6bf21115fe141c0d` |
| `lk t-b3` | Portrait block B3 | `0 -136.53 144 165.78` | 52 | 13 | `36f3914aea973dd9` |
| `lk t-b3sm` | Portrait block B3-sm | `0 -68.76 72 83.39` | 26 | 13 | `f2548ba9c0ce9f3d` |
| `lk t-detail` | Landscape one-line, detail cut | `0 0 440 331.96` | 100 | 10 | `2fdbfeb1f66bc229` |
| `lk t-fine` | Landscape one-line, fine cut | `0 0 440 332.91` | 100 | 10 | `4aaf77d0676481a0` |
| `lk t-small` | Landscape one-line, small cut | `0 0 440 331.05` | 100 | 12 | `302e30c91c7b84ec` |

Every fill inside these SVGs is kept as written: `#E8EDF2` (letters, crown linework), `#050609` (the belt), `#E63946` (the belt bar and the ARE YOU? artwork), `#9CA3AF` (the WE ARE artwork). Also keep every `data-part`, `fill-rule` and the group structure (`lk-we`, `lk-word` holding `lk-w1` and, in the block lockups, `lk-w2`, `lk-crown`, `lk-you`). How these become code is in section 5.2.


## 2. Decisions

Numbering: `O` = owner decision (2026-10-17, final), `P` = PM decision taken in this addendum. "Supersedes" names the base spec item (section 3 decisions `D*`, PM decisions `P*`, or a section) that no longer applies to the landing hero.

### 2.1 Owner decisions (final)

The owner's framing: Thomas is not a designer, so small shifts to match the style kit are fine, but his documented calls are respected.

Kept verbatim from Thomas:

- **O1. Lockup artwork.** Thomas's SVG lockup paths are used exactly as drawn: the portrait block B3 and B3-sm and the three landscape one-line cuts, chosen by the 4:5 aspect-ratio media query and his device-pixel size picker. Supersedes base D6 and section 7.2 for the hero only ("the `Wordmark` component" and the brand line set in live Bebas Neue). The footer keeps the live `Wordmark` (section 5.1).
- **O2. Header lockup.** The horizontal crown lockup in the header at exactly 137 x 31 CSS px (or exactly 2x), never scaled to any other size.
- **O3. Red belt bar.** `data-crown="colour"`: the crown's belt bar is red in the header and the hero.
- **O4. No glitch effect** anywhere.
- **O5. Kept elements.** "Coming Soon" in red under the lockup; the greyscale, dimmed sparring video background with its poster; the visually hidden H1 "We are ELO RATED. Are you?"; the four decorative corner brackets (static); and the one-time intro sequence (WE ARE fades in, ELO RATED rises, the crown lowers, ARE YOU? appears, Coming Soon appears).

Style-kit shifts:

- **O6. Red text token.** Small red text ("Coming Soon", and "Get the app" after launch) uses `signal-red-text` (`--accent-cta-text`, `#EC6A74` dark), not `#E63946`. Red inside the SVG logo artwork stays `#E63946`, because it is a logo fill, not text.
- **O7. Greys and tokens.** The retired grey `#6B7280` becomes `ink-3` (`--text-tertiary`, `#8D929D`). Every colour comes from the existing tokens in `apps/web/app/design-system/tokens.css`. No new raw hex in components, except the verbatim SVG path fills listed in 1.2 (including the `#050609` belt).
- **O8. Fonts** come from the existing `next/font` setup in `apps/web/app/layout.tsx` (Bebas Neue, JetBrains Mono, already loaded with weights 400, 500 and 700). No Google Fonts CDN.
- **O9. Animation library.** GSAP as an npm dependency, or a faithful CSS / WAAPI port if that is simpler and equal; never a CDN script. (Resolved by P3: CSS.)
- **O10. No em dashes anywhere.** Thomas's title (ELO RATED, an em dash, Coming Soon) is not used. Choose between "ELO RATED: Coming Soon" and keeping "ELO RATED: Ranked Jiu-Jitsu", and record the pick. (Resolved by P1: keep.)

Compromises:

- **O11. Motion.** Keep the one-time intro, because it reveals the brand and so carries meaning. Drop the endless loops (corner pulse, WE ARE letter shimmer). Under `prefers-reduced-motion: reduce`: no intro (the end state renders immediately), the video stays paused on its poster, and the ticker does not move (P11: it is hidden). This **supersedes base section 7.2's brand rule "no motion (nothing animates, so no Reduce Motion work)"** for the landing hero only, and base D6 where it is read as "no motion". The rest of the landing (intro section, steps, footer) still has no motion.
- **O12. Ticker.** No invented personal names. Each tick shows a belt, a weight class and a rating change (owner example "PURPLE · 77KG ▲14"), with a small "SAMPLE" label so it is not read as live activity. Fix the draw bug (a draw must not read as winner up and loser down). Check whether draws exist and set realistic ranges; drop draws if they are not a real outcome. Keep the ticker `aria-hidden`. Show it only after the intro; hide it under reduced motion. (Findings and the resulting format: section 7 and P8 to P11; the belt is dropped by O18.)
- **O13. Scrolling page.** Thomas's `overflow: hidden` is dropped; the page scrolls. The first viewport is Thomas's hero. The existing `StoreBadges` sit directly under "Coming Soon" in the hero. Below the fold the existing `LandingSteps` ("HOW IT WORKS") and `LandingFooter` (Terms, Privacy, Support, French links, copyright) stay.
- **O14. "Coming Soon" switches itself off.** When `NEXT_PUBLIC_APP_STORE_URL` is set (the same signal that makes the App Store badge live, read through `APP_STORE_URL` in `apps/web/lib/app-links.ts`), the hero line reads "Get the app" instead. No code change on launch day. The app is not live yet (it is in App Store review), so "Coming Soon" is correct today. No TestFlight or beta button.
- **O15. Video weight.** A mobile rendition (about 720p, H.264, faststart, target 2 to 3 MB) plus the 1080p for wide screens, the poster shown first, `preload="metadata"` or `"none"`, muted, looping, `playsinline`. Self-hosted under `apps/web/public`. The proxy must let the video path through (it is redirected to `/` today), with a test.
- **O16. Icons.** Keep the current site favicon and app icons (`app/favicon.ico`, `app/icon.png`, `app/apple-icon.png`, `public/icon-192.png`, `public/icon-512.png`; all present). Thomas's favicon is not used.
- **O17. Social metadata.** Keep the current landing's OpenGraph, Twitter and canonical metadata (OG image `/landing/hero.jpg`) unless a better still exists; record the choice. (Resolved by P2: keep.)

### 2.1a Owner and lead resolutions (2026-10-17, during the build)

These close open items Q4 and Q5 and settle two build questions. Where they conflict with an earlier item in this addendum, they win.

- **O18. No belts in the ticker (closes Q4).** The app has no belt field, so the ticker shows a weight class and an outcome only. Format: `{LBS} LBS · {WIN|LOSS|DRAW} {▲|▼}{N}`, for example `170 LBS · WIN ▲14`, `155 LBS · DRAW ▲2`, `185 LBS · LOSS ▼9`, with the `SAMPLE` tag kept visible. Weight is in pounds (P10 stands). Draws stay, labelled `DRAW`, in the neutral tone (P8 and P11 stand). Supersedes the belt half of O12, P9's `{BELT}` field and `TICKER_BELTS` in section 7.2.
- **O19. Weight classes are the rating's no-gi divisions.** The ticker draws its weight from the upper limits (in lbs) of the IBJJF no-gi divisions the rating uses, as jr_be `get_weight_division()` defines them (migration `20260217000000_weight_aware_elo.sql`): 122.5 (Rooster), 136 (Light Feather), 149 (Feather), 162 (Light), 175.5 (Middle), 188.5 (Medium Heavy), 202 (Heavy), 215 (Super Heavy). Ultra Heavy has no upper limit and is left out. Not chosen: the web stats chart's `WEIGHT_DIVISIONS` in `packages/shared/src/api/queries.ts` (127 to 221), which are IBJJF gi limits and disagree with the backend (a separate finding, not changed here); a uniform 130 to 230 lbs draw, which is not a weight class. Supersedes the `lbs` rule in section 7.2.
- **O20. Brand book conflict stays open as a follow-up (closes Q5 for this epic).** The hero keeps Thomas's crown lockups and the footer keeps the live `Wordmark`; the conflict with DESIGN.md is tracked by `jits-2hju.8` (F1), with no change in this epic.
- **O21. Video files in git.** Committing the renditions to plain git (about 8.8 MB in total; the repo has no LFS) is accepted (R3).

### 2.2 PM decisions taken in this addendum

- **P1. Title: keep "ELO RATED: Ranked Jiu-Jitsu".** The `<title>`, OG and Twitter titles stay exactly as in base D13 and copy L1. Reasons: "Coming Soon" in a title would go stale on launch day unless it too were env-driven, and O14 asks for no launch-day code change; the existing title describes the product for search and link previews, which "Coming Soon" does not; and it keeps the e2e title assertion unchanged. The description (L2, L2b) is also kept. Nothing in `app/welcome/page.tsx` changes.
- **P2. OG image: keep `/landing/hero.jpg`.** No better still exists today: Thomas's poster is a 1280x720 dimmed, colour frame with no lockup on it, and is a worse share card than the current photo. `public/landing/hero.jpg` stays in the repo (it is still the OG image) even though the hero no longer shows it. A purpose-made 1200x630 card (poster plus lockup) is a possible follow-up, not in scope.
- **P3. The intro is a CSS port, not GSAP.** Keyframe animations in a CSS module, with `animation-fill-mode: both`, wrapped in `@media (prefers-reduced-motion: no-preference)`. Reasons: the intro then needs no JavaScript at all, so it starts on first paint of the prerendered HTML, before hydration, with no flash of the hidden start state (Thomas needed a blocking head script to add an `.intro` class for this); reduced motion is honoured on the very first frame by the media query itself; no runtime dependency (GSAP core is about 70 KB minified) is added to a page whose only other script is React; and every tween in the intro is a plain opacity plus translateY with a delay, which CSS expresses exactly. GSAP is not added to `package.json`.
- **P4. Timeline normalised to Thomas's intent.** Thomas's GSAP timeline staggers `.lk-w` across every lockup in the document, including the four hidden ones, so on his live page the visible wordmark rises later than he wrote (on landscape screens the one-line wordmark starts about 1.03 s in and the crown about 1.67 s in, instead of about 0.55 s and 1.07 s). This addendum uses the timeline per visible lockup, as his comments and README describe it (section 6.1). Durations snap to the brand motion tokens (`--duration-base` 480ms for his 500ms moves, `--duration-slow` 720ms for his 700ms moves) and the easing is the brand ease-out `--easing-default` (`cubic-bezier(0.22, 1, 0.36, 1)`) in place of GSAP's `power3.out` / `power2.out`. Both are ease-out with no overshoot, as Thomas specified; the difference is under 20 ms per move. Thomas confirms the feel on the preview deploy (rollout step 2).
- **P5. Header, corners and ticker live inside the hero, not `position: fixed`.** Thomas fixed them to the viewport because his page never scrolled. On a scrolling page, fixed corners and a fixed ticker would float over "HOW IT WORKS" and the footer. They become `position: absolute` children of the hero section, so they scroll away with it.
- **P6. Hero height uses `svh`.** The hero is `min-height: 100svh` (as today) and Thomas's `--vh` becomes `100svh`, not `100dvh`. On a scrolling page `dvh` resizes the hero, and so relays out the lockup, every time the mobile URL bar collapses or expands. `svh` is the stable small viewport. The hero may grow taller than the viewport (it is `min-height`) when the lockup, the line and the badges do not fit, instead of clipping.
- **P7. Badges in the hero: `size="sm"`, centred, no heading.** `StoreBadges` renders with `size="sm"` (40px, Apple's on-screen minimum) and `align="center"` directly under the "Coming Soon" / "Get the app" line. At 320px wide two `md` badges (about 143 + 161 px plus clear space) do not fit in one row inside the 280 px column and would wrap; `sm` (about 120 + 134 px) fits. No `heading`: the red line above already names the moment, and "Get the app" would otherwise appear twice after launch. The `StoreBadges` component itself does not change, so its "Coming soon" behaviour (non-interactive badge with a caption until each listing is set) is untouched. The footer keeps its own `StoreBadges size="sm"` block, so the page still has exactly two badge blocks.
- **P8. Draws are real and stay in the ticker, labelled.** In ELO RATED a win is by submission only; every other finish is a draw (`apps/mobile/app/(app)/settings/help.tsx:50` and jr_be spec 019 section 7.3). Under the Glicko V9 rating (jr_be `specs/019-glicko-v9-ratings/spec.md` section 2.3), a draw between equals moves nobody, and otherwise the favourite gives up a few points to the underdog: for established athletes (RD 60) a draw moves about 0.9 to 3.4 points (spec 019 parity table). So a draw really does move one athlete up and one down; the bug in Thomas's ticker is that it labels the two sides winner and loser. The fix: each tick names its outcome (`WIN`, `LOSS` or `DRAW`) and shows one athlete only, so a draw can never read as a win.
- **P9. One athlete per tick, with an outcome word.** Format (as amended by O18): `{WEIGHT} LBS · {OUTCOME} {▲|▼}{N}`, for example `170 LBS · WIN ▲14`. One athlete per tick follows the owner's example and avoids showing a winner and loser with the same magnitude, which V9 does not produce (Glicko exchanges are not symmetric when the two RDs differ). The outcome word is added to the owner's example so draws are unambiguous (P8).
- **P10. Weight in pounds, not kilograms.** The app stores and shows weight in pounds everywhere (`apps/mobile/components/profile/profile-header.tsx:29`, `components/arena/competitor-row.tsx:62`, `components/match-flow/faceoff/faceoff-top.tsx:33` "LBS"). The ticker uses `LBS` so the teaser matches the app. This deviates from the owner's example "77KG"; confirmed by O18.
- **P11. Ticker ranges, colours and visibility.** Ranges follow V9 for established athletes (section 7.2): WIN ▲3 to ▲20, LOSS ▼3 to ▼18, DRAW ▲1 to ▲3 or ▼1 to ▼3, never 0. First-match swings for brand-new athletes (up to about ±162 at RD 350) are left out on purpose: they are real but would read as noise in a teaser. Colours: a rise uses `--state-positive` (Gain Green), a loss `--state-negative`, and a draw `--state-neutral` whatever its sign (the web tokens have no amber `attention` token, and a draw is not a loss; the mobile rule from spec 019 AC17, gain colour for a positive draw and amber for a negative one, would need a new web token, which O7 rules out). Under reduced motion the ticker is not shown at all (it is `aria-hidden` and carries no information a still page needs).
- **P12. Video is started by script, not the `autoplay` attribute.** The `<video>` element is rendered with `muted`, `loop`, `playsInline`, `preload="none"`, `poster`, `aria-hidden` and no `autoplay`. A small client component calls `play()` after mount only when motion is allowed and the visitor has not asked to save data (`navigator.connection?.saveData`), and pauses it if reduced motion is switched on later. Reason: an `autoplay` attribute starts the video before any script can check `prefers-reduced-motion`, which O11 forbids; with `preload="none"` a reduced-motion or save-data visitor downloads no video bytes at all. If `play()` is refused (iOS Low Power Mode, an autoplay policy), the poster stays, which is the designed fallback.
- **P13. The proxy matcher excludes `.mp4`** rather than adding the video path to `LOCKED_ALLOWED_PATHS`. Reasons: an allow-list entry would also have to be public under `isPublicPath` (the base spec 8.2 invariant, pinned by `public-paths.test.ts`), or signed-out visitors in unlocked mode would be sent to `/login` for a background video; and a static video needs no session refresh (excluding it saves a Supabase `getClaims` round trip on every range request in unlocked mode). The defense-in-depth guard `redirectHomeWhenLocked()` (`apps/web/lib/web-app-lock-guard.ts`), which the `(app)` and `/design` layouts call, already covers paths that the matcher skips by extension (for example `/arena/x.mp4`), exactly as it does today for images and `.html`.
- **P14. Versioned video file names and a one-year immutable cache.** Files are named `sparring-01-v1-720.mp4`, `sparring-01-v1-1080.mp4` and `sparring-01-v1-poster.jpg`, served from `/landing/videos/`, with `Cache-Control: public, max-age=31536000, immutable` set in `next.config.ts` (Thomas's `vercel.json` rule, moved). A recut gets a new version in its name (`-v2-`), never the same name.
- **P15. Mobile rendition first in the markup.** `<source media="(max-width: 1023px)" src=".../sparring-01-v1-720.mp4" type="video/mp4">` comes before `<source src=".../sparring-01-v1-1080.mp4" type="video/mp4">`. A browser that ignores `media` on `<source>` (older than Chrome 120 / Firefox 120; Safari has always honoured it) picks the first source, so the fallback is the light file, never the heavy one on a phone.
- **P16. Tagline, body and data strip move below the fold.** Thomas's hero has no product copy, but "What's your number?", the body line (L4) and the data strip (L5) are the only words on the page that say what ELO RATED is (for visitors and for search). They move, unchanged, into a new short section, `LandingIntro`, between the hero and "HOW IT WORKS". This supersedes base section 7.2's placement of L3e, L4 and L5 in the hero; the strings themselves are unchanged.
- **P17. Lockup tier picker: a client hook, SSR defaults `b3` and `detail`.** The server renders `data-tier="b3"` on the block set and `data-tier="detail"` on the one-line set (Thomas's defaults). A client component re-picks the tier on mount (layout effect) and on resize, with Thomas's thresholds. On every realistic screen the defaults are already right (one-line `fine` needs the crown under 175 device px, which only happens in a desktop window under about 500 px tall or narrow; `b3sm` needs the block lockup under 108 device px), so the late pick almost never changes anything. Not chosen: a blocking inline `<script>` (Thomas's approach) because React warns about script elements in components and it adds an inline script to the page for a rare case.
- **P18. "Intro done" stops any replay.** A CSS animation restarts when an element goes from `display: none` to shown, so a tier change on resize would replay the intro on the newly shown drawing. The hero root carries `data-intro="playing"` from the server; the client sets `data-intro="done"` when the "Coming Soon" line's animation ends (or 2,700 ms after mount, whichever comes first), and the CSS turns every intro animation off under `[data-intro="done"]`. A tier change during the first 2.7 s may restart that drawing's intro from its start; accepted (rare, and it still ends in the right state).
- **P19. Hero gutters follow Thomas.** The hero keeps his `--pad-x: clamp(20px, 6vw, 120px)` (20 px on phones) and his header padding (18px 20px on phones). The base spec's 16px phone gutter is a minimum for the content column; 20px satisfies it. The intro section, steps and footer keep `LANDING_COLUMN` (16px).
- **P20. Colours a test must read are inline styles.** The repo's landing uses inline style objects, and jsdom does not apply CSS modules. So the token colours that unit tests assert (the red line, ticker tones) are inline `style` values (`color: "var(--accent-cta-text)"`), while layout, media queries, container queries, keyframes and the tier selectors live in one CSS module. Every SVG hook is a data attribute (`data-lk`, `data-part`, `data-tier`, `data-lockup-set`), never a class name, because CSS modules rename classes.
- **P21. The landing root carries `data-crown="colour"`.** Thomas's mono switch is ported as a CSS rule keyed on that attribute (`[data-crown="mono"] [data-part="crown-belt-bar"] { fill: var(--text-primary) }`), so the owner can still try the one-red version with a one-attribute change. Default and shipped value: `colour` (O3).
- **P22. Overlay and filter values.** The video filter is kept verbatim (`grayscale(0.7) brightness(0.55) contrast(1.05)`). Thomas's overlay `rgba(13, 15, 20, a)` stops are rewritten as `color-mix(in srgb, var(--color-void) <a as %>, transparent)` with the same alphas (35% radial centre; 55%, 78%, 88% vertical), so no raw colour is added (O7).

- **P23. `--dpr` is right on the first paint.** A ladder of `min-resolution` media queries (1.25, 1.5, 1.75, 2, 2.25, 2.5, 2.625, 2.75, 3, 3.5 and 4 dppx) sets `--dpr` in CSS, so the block lockup's 864 device px ceiling applies before hydration; `LockupTierSync` only refines it to the exact `devicePixelRatio`. Without it the server's `--dpr: 1` let the block lockup render wider during the intro and shrink at hydration (about 343 to 288 px on a 390 px phone at DPR 3). Review M1, 2026-10-17.
- **P24. Exactly one lockup set shows.** The block set is the default and the one-line set replaces it only inside `@media (min-aspect-ratio: 4/5)`. Thomas's two queries (`max-aspect-ratio: 799/1000` and `min-aspect-ratio: 4/5`) left aspect ratios between 0.799 and 0.8 with neither. Review m1.
- **P25. The video and ticker respect a hidden tab and an off-screen hero.** The video pauses while the tab is hidden or the hero is out of the viewport (an `IntersectionObserver`) and resumes when both hold again, under the same motion and save-data gates (`use-hero-video-playback.ts`). The ticker schedules its first tick only in a visible tab; a tab opened in the background starts it on its first `visibilitychange`. Review m5, m6.
- **P26. The ticker arrow is never under 10 px** (`font-size: max(10px, 0.7em)`). Review m2.
- **Follow-up (not now):** a live App Store badge in the hero is a 40 px tap target (`size="sm"`, P7), under 44 px. `StoreBadges` is not changed here; tracked as `jits-2hju.9` "Hero store badge tap target 44px after launch". Review m4.

## 3. Scope and non-goals

In scope:

- The landing hero (`components/landing/landing-hero.tsx` and new files beside it), the new `LandingIntro` section, the video assets, the proxy matcher, `next.config.ts` cache headers, tests, docs (`CHANGELOG.md`, `CLAUDE.md` lockdown bullet, a supersession note at the top of `specs/web-landing/spec.md`), and the rollout.

Non-goals:

- No change to any other route, the invite landing `/c/<token>`, `StoreBadges`, `lib/app-links.ts`, the lock flag, `LOCKED_ALLOWED_PATHS`, `PUBLIC_PATHS`, robots, the root layout, `app/manifest.ts`, icons or favicons.
- No change to `app/welcome/page.tsx` metadata (P1, P2). The page component stays a synchronous static server component rendering `<LandingPage />`.
- No GSAP, no Google Fonts, no CDN scripts, no analytics.
- No change to the mobile app, the "ELO RATED Native Screens" canvas (the landing is not a native screen) or the jr_be backend.
- No update to the brand book (`DESIGN.md`) or the "ELO RATED Design System" artifact in this epic. The crown lockups are not in either today; recording them is a follow-up for the owner and Thomas (open item Q5, bead in section 13).
- No TestFlight or beta link, no "Open in app" on the landing (base open question Q2 stays open).
- Thomas's standalone preview deploy is not changed by us (open item Q2).


## 4. Layout of the new page

Top to bottom inside `<main data-theme="dark" data-crown="colour" data-testid="landing">` (as today, plus `data-crown`):

1. **Hero** (`<section data-testid="landing-hero" data-intro="playing">`, `position: relative`, `min-height: 100svh`, `overflow: hidden`, Void background):
   - `HeroVideo` (absolute, inset 0, z 0) and the overlay `div` (absolute, inset 0, z 1, `aria-hidden`).
   - `HeroHeaderLogo` (absolute, top-left, z 3): the H1 horizontal lockup, 137 x 31, Thomas's offsets and padding.
   - Visually hidden `<h1>`: "We are ELO RATED. Are you?" (accessible name unchanged from today, so tests keep working).
   - The lockup column (z 2), centred in the box inside Thomas's `--pad-*`: the block set and the one-line set (one shows, by aspect ratio), each holding its tier drawings and, inside the set (container-query sizing), the red hero line ("Coming Soon" or "Get the app"); then the `StoreBadges` block (P7) directly under the set.
   - Four corner brackets (absolute, z 2, `aria-hidden`), static.
   - `HeroTicker` (absolute, bottom-right, z 3, `aria-hidden`).
2. **`LandingIntro`** (new, P16): "What's your number?", L4, L5 in today's styles, in `LANDING_COLUMN`.
3. **`LandingSteps`**: unchanged.
4. **`LandingFooter`**: unchanged.

Vertical budget in the hero: the badge block (40px badges, their "Coming soon" captions and gaps, about 72px) is reserved inside the lockup box by adding a `--badges-h` term to Thomas's `--avail-h` (`calc(var(--vh) - var(--pad-top) - var(--pad-bot) - var(--badges-h))`, floored at 160px with `max()`). The ticker sits below the bottom corner brackets, inside `--pad-bot`. The implementer measures `--badges-h` from the rendered block; acceptance is "no overlap" at the viewports in AC5, not a number.


## 5. File plan

All paths are under `apps/web/` unless stated. Every new file is kebab-case; every component stays under 80 lines (split if over; data modules and CSS are not components). No `export const dynamic`, no cookies, headers, `searchParams` or `new Date()` in the render path. Client components are marked `"use client"` and render deterministic markup on the server (no `Math.random()` or `matchMedia` during render).

### 5.1 Changed files

| File | Change | Task |
|---|---|---|
| `components/landing/landing-hero.tsx` | Rewritten: composes the section, `HeroVideo`, overlay, `HeroHeaderLogo`, hidden H1, `HeroLockup`, `StoreBadges size="sm" align="center"`, corners, `HeroTicker`, `LockupTier`. No `next/image`, no `Wordmark`, no tagline / body / data strip (moved, P16). | TV1 |
| `components/landing/landing-page.tsx` | Adds `data-crown="colour"` on `<main>`; renders `LandingHero`, `LandingIntro`, `LandingSteps`, `LandingFooter`. | TV1 |
| `components/landing/landing-page.test.tsx` | Updated (section 11.1). | TV6 |
| `proxy.ts` | Matcher extension list gains `mp4`: `"/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|html|mp4)$).*)"`; comment updated ("images, .html and .mp4 files"). | TV4 |
| `next.config.ts` | `headers()` gains `{ source: "/landing/videos/:file*", headers: [{ key: "Cache-Control", value: "public, max-age=31536000, immutable" }] }` with a comment pointing here (P14). Existing entries unchanged. | TV4 |
| `e2e/landing-lock.spec.ts` | Updated and extended (section 11.2). | TV6 |
| `lib/supabase/public-paths.test.ts` | One added assertion (section 11.1). | TV6 |
| `CHANGELOG.md` (repo root), `CLAUDE.md` (repo root) | Section 12, step 0. | TV5 |
| `specs/web-landing/spec.md` | One-line note at the top: "Superseded in part by `addendum-teaser-v2.md` (landing hero, 2026-10-17)". | TV5 |

### 5.2 New files

| File | What | Task |
|---|---|---|
| `components/landing/lockups/types.ts` | `LockupPath { d: string; fill?: string; part?: string; fillRule?: "evenodd" \| "nonzero"; lk?: "w1" \| "w2" }`, `LockupGroup { lk: "we" \| "word" \| "crown" \| "you"; fill?: string; paths: LockupPath[] }`, `LockupArt { id: string; viewBox: string; x: number \| null; groups: LockupGroup[]; paths?: LockupPath[] }` (the header H1 has ungrouped paths). The implementer may adjust the shape if the source needs it, as long as element order, fills, `data-part` and `fill-rule` survive exactly. | TV1 |
| `components/landing/lockups/horizontal-h1.ts`, `block-b3.ts`, `block-b3-sm.ts`, `oneline-detail.ts`, `oneline-fine.ts`, `oneline-small.ts` | One exported `LockupArt` constant each, the path data copied verbatim from Thomas's file (1.2). Extraction: the implementer may write a throwaway script (kept in their scratchpad, not committed, and not placed in the download folder) that reads `index.html` as text; nothing from the download is executed. Each file starts with a comment naming its source (`horizontal/elo-rated-horizontal-h1-dark.svg` etc., as in Thomas's comments) and "copied verbatim from Thomas's teaser v2, 2026-10-17; do not edit by hand". Thomas's `we-g` letter indexes (`data-i`) are dropped (they only served the shimmer, O11). | TV1 |
| `components/landing/lockup-svg.tsx` | `LockupSvg({ art, tier? })`: renders one `<svg viewBox aria-hidden focusable="false" data-tier-art={tier} style={{ "--x": art.x }}>` with `<g data-lk=...>` groups and `<path data-part data-lk fill fill-rule d>` in source order. Used for every lockup. | TV1 |
| `components/landing/hero-header-logo.tsx` | The 137 x 31 header lockup: `<svg role="img" aria-label="ELO RATED" width={137} height={31}>`, inside a non-link wrapper (the page is `/` itself; a link to itself adds nothing). | TV1 |
| `components/landing/hero-lockup.tsx` | The two sets (`data-lockup-set="block"` with `data-tier="b3"`, `data-tiers` `[[108,"b3"],[0,"b3sm"]]`, `data-frac="1.0000"`; `data-lockup-set="oneline"` with `data-tier="detail"`, `data-tiers` `[[175,"detail"],[112,"fine"],[0,"small"]]`, `data-frac="0.3477"`), each with its drawings and the hero line `<p data-lk="soon" style={{ color: "var(--accent-cta-text)" }}>{heroLine()}</p>`. | TV1 |
| `components/landing/hero-copy.ts` | `export const HERO_LINE_SOON = "Coming Soon"; export const HERO_LINE_LIVE = "Get the app"; export function heroLine(appStoreUrl: string \| null = APP_STORE_URL): string` returns the live line when the URL is non-null. Imports `APP_STORE_URL` from `@/lib/app-links` (no new env read; base 8.1's single-reader rule holds). | TV1 |
| `components/landing/landing-hero.module.css` | Thomas's hero CSS ported to tokens: hero box variables (`--vh: 100svh`, `--pad-*`, `--avail-*`, `--badges-h`, `--ar-*`, `--block-max`, `--dpr`), set widths, `container-type: inline-size`, aspect-ratio media queries, tier selectors (`[data-lockup-set][data-tier="fine"] [data-tier-art="fine"] { display: block }` and so on), the hero line's size and tracking, overlay, video filter, corners, header placement, short-landscape rules, the intro keyframes (section 6) and the reduced-motion and `data-intro="done"` rules. Colours only as `var(--...)`. | TV1 (layout), TV2 (intro) |
| `components/landing/landing-intro.tsx` | P16: tagline, L4, L5 in `LANDING_COLUMN`, today's styles moved from the old hero. | TV1 |
| `components/landing/lockup-tier.ts` | Pure `pickTier(setWidthCss: number, frac: number, dpr: number, tiers: ReadonlyArray<readonly [number, string]>): string` (first tier whose minimum is at most `setWidthCss * frac * dpr`). | TV2 |
| `components/landing/lockup-tier-sync.tsx` | `"use client"`. Renders `null`. On mount (`useLayoutEffect`) and on `resize` (one `requestAnimationFrame` per burst): sets `--dpr` on the hero root, finds the shown `[data-lockup-set]` (computed `display` not `none`), and writes `data-tier` from `pickTier`. Also owns P18: listens for `animationend` of `[data-lk="soon"]` and sets `data-intro="done"`, with a 2,700 ms timeout fallback; cleans up listeners and timers on unmount. | TV2 |
| `components/landing/use-prefers-reduced-motion.ts` | `"use client"` hook: `false` on the server and first render, then the `matchMedia("(prefers-reduced-motion: reduce)")` value, updated on `change`. Used by `HeroVideo` and `HeroTicker` (the intro itself needs no hook, P3). | TV3 or TV4, whichever lands first; the other imports it |
| `components/landing/hero-video.tsx` | `"use client"`. The `<video>` per section 8.3 and P12. | TV4 |
| `components/landing/ticker-samples.ts` | Pure sample generator and formatter (section 7), taking an injectable `random: () => number`. | TV3 |
| `components/landing/hero-ticker.tsx` | `"use client"`. Section 7.4. | TV3 |
| `components/landing/hero-ticker.module.css` | Ticker placement, type and the enter / exit transitions (kept apart from the hero module so TV3 does not touch TV1's file). | TV3 |
| `public/landing/videos/sparring-01-v1-720.mp4`, `sparring-01-v1-1080.mp4`, `sparring-01-v1-poster.jpg` | Section 8. | TV4 |
| Tests listed in section 11.1. | | TV6 (TV2 to TV4 add the tests for their own pure modules) |

### 5.3 Files that must not change

`components/app-links/store-badges.tsx`, `lib/app-links.ts`, `lib/web-app-lock.ts`, `lib/web-app-lock-guard.ts`, `lib/supabase/public-paths.ts`, `lib/supabase/proxy.ts`, `app/layout.tsx`, `app/robots.ts`, `app/manifest.ts`, `app/welcome/page.tsx`, `components/landing/landing-steps.tsx`, `components/landing/landing-footer.tsx`, `components/landing/styles.ts`, everything under `app/c/`, `components/invites/`, `app/(legal)/`, `app/(auth)/`, `app/.well-known/` and `public/badges/`. A reviewer rejects a diff that touches them, unless the change is a test-only adjustment listed in section 11.


## 6. Motion spec

### 6.1 Intro timeline

The intro plays once per page load, on first paint, from CSS only. Times are from animation start (first paint). `X` is the drawing's cap height in its own user units (`--x`, from 1.2: 52 for B3, 26 for B3-sm, 100 for every one-line cut); a CSS translate on an SVG element is in user units, so `translateY(calc(var(--x) * 0.14px))` reproduces Thomas's `y: 0.14 X`.

| Step | Element (`data-lk`) | From | To | Starts | Duration | Easing |
|---|---|---|---|---|---|---|
| 1 | `we` (WE ARE) | opacity 0, translateY(+0.14 X) | opacity 1, none | 200 ms | 480 ms (`--duration-base`) | `--easing-default` |
| 2 | `w1` (ELO in the block lockup; ELO RATED in the one-line lockup) | opacity 0, translateY(+0.40 X) | opacity 1, none | 550 ms | 720 ms (`--duration-slow`) | `--easing-default` |
| 3 | `w2` (RATED, block lockup only) | opacity 0, translateY(+0.40 X) | opacity 1, none | 670 ms | 720 ms | `--easing-default` |
| 4 | `crown` | opacity 0, translateY(-0.70 X) (it lowers into place) | opacity 1, none | 1,070 ms | 720 ms | `--easing-default` |
| 5 | `you` (ARE YOU?) | opacity 0, translateY(+0.14 X) | opacity 1, none | 1,590 ms | 480 ms | `--easing-default` |
| 6 | `soon` (the hero line) | opacity 0 | opacity 1 | 2,170 ms | 480 ms | `--easing-default` |
| 7 | ticker (section 7.4) | opacity 0 | opacity 1 | 4,000 ms after mount | 480 ms | `--easing-default` |

The intro ends at 2,650 ms. Every step uses `animation-fill-mode: both`, so before its delay the element sits in its "From" state and after it rests in its "To" state. Nothing else on the page animates (no header, corner, badge, video or section entrance). The header lockup is not part of the intro (Thomas's is not either).

Use the duration and easing tokens by name (`animation: lk-rise var(--duration-slow) var(--easing-default) 550ms both`). Literal millisecond delays are fine (they are a sequence, not tokens); put them in one place (CSS custom properties at the top of the module, `--intro-we: 200ms` and so on) with a comment pointing at this table.

Do not use the global `.animate-page-in` or `.stagger-children` classes on the landing.

### 6.2 Reduced motion and the end state

- All intro rules live inside `@media (prefers-reduced-motion: no-preference)`. Under `reduce` no intro rule applies, so every lockup part, the hero line and the badges render in their final state (opacity 1, no transform) on the first frame. Note that `tokens.css` sets `--duration-slow` and `--duration-fast` to `0ms` under reduced motion; the landing does not rely on that, because its rules are not applied at all.
- After the intro (or immediately under reduced motion) the page is fully static except the ticker (motion allowed only) and the video (motion allowed only).
- `[data-intro="done"] [data-lk] { animation: none }` (P18): after the intro, a resize that changes the shown drawing shows it in its end state.
- The video under reduced motion: never played, so the poster shows (P12). If the setting changes to `reduce` while playing, the video pauses on its current frame (acceptable) and the ticker unmounts.
- The ticker under reduced motion: not rendered (P11).
- No JavaScript is needed for the end state: with scripts disabled the page shows the intro (CSS) and then a still page with the poster and no ticker.

### 6.3 Dropped motion (O11)

Thomas's corner "breathe" loop and the WE ARE letter shimmer are not ported. The corners are static at opacity 0.5. No `setInterval` other than the ticker's exists on the page.


## 7. Ticker spec

### 7.1 Research findings (what the rating system really does)

- Draws exist and are common: a win is by submission only, everything else is a draw (`help.tsx:50`; jr_be spec 019 section 7.3).
- jr_be spec 019 (Glicko V9) parity table, established athletes at RD 60: equals, a win moves about +9.9 and a loss about -9.9; a favourite 300 points up wins +3.1 or loses -16.9; an underdog's upset can reach about +19.9; a rating gap of 700 or more hits the floors (+1 / -1). A win always shows at least +1 and a loss at most -1.
- Draws: exactly 0 between equals; otherwise the favourite loses and the underdog gains about 0.9 to 3.4 points (gap 100 to 1000, RD 60); a brand-new athlete drawing a veteran can gain about +34.
- Brand-new athletes (RD 350) swing about ±162 on a first win or loss.
- Winner and loser deltas are not equal in general (they differ when the RDs differ), which is why a pair with one shared magnitude is not used (P9).

### 7.2 Data

`ticker-samples.ts` exports:

```ts
export type TickOutcome = "WIN" | "LOSS" | "DRAW";
export interface TickSample { lbs: number; outcome: TickOutcome; delta: number } // delta is signed, never 0
export const TICKER_WEIGHTS = [122.5, 136, 149, 162, 175.5, 188.5, 202, 215] as const; // O19
export function sampleTick(random: () => number = Math.random): TickSample;
export function formatTick(s: TickSample): string;
export function nextTick(prev: TickSample | null, random?: () => number): TickSample; // never equal (formatted) to prev
```

Rules:

- `lbs`: uniform over `TICKER_WEIGHTS` (O19). No belt (O18).
- `outcome`: `WIN` 40%, `LOSS` 40%, `DRAW` 20%.
- `delta`: `WIN` integer uniform +3 to +20; `LOSS` integer uniform -3 to -18; `DRAW` integer uniform 1 to 3 in size with a random sign (50/50). Never 0.
- No names, initials, belts, gyms, places or anything else that reads as a real person. No other fields.

`formatTick` returns exactly `` `${lbs} LBS · ${outcome} ${delta > 0 ? "▲" : "▼"}${Math.abs(delta)}` `` (the separator is a space, U+00B7 middle dot, space; the triangles are U+25B2 and U+25BC). Examples: `175.5 LBS · WIN ▲14`, `149 LBS · LOSS ▼9`, `188.5 LBS · DRAW ▲2`, `202 LBS · DRAW ▼1`.

### 7.3 The draw bug, and why it is fixed

Thomas's `randomMatch()` picks `isDraw` 25% of the time but renders every result as "winner ▲N · loser ▼N" with the same `N`, so a draw reads as a win and a loss. With P8 and P9 each tick carries its outcome word and only one athlete, and a draw's colour is neutral (P11), so a draw can never be read as a win.

### 7.4 Rendering and timing

- Container: `<div aria-hidden="true" data-testid="hero-ticker">`, absolute, bottom-right inside the hero (`bottom: 24px; right: 32px`; at 540 px wide and under `bottom: 16px; right: 16px`; short landscape `bottom: 12px`). `pointer-events: none`.
- Type: `var(--font-mono)`, 12 px (10 px at 540 px wide and under, and on short landscape), uppercase, `letter-spacing: 0.10em`, `white-space: nowrap`, `font-variant-numeric: tabular-nums`. Never under 10 px.
- Content: a `SAMPLE` tag, then the tick. The tag: mono, `var(--size-num-xs)` (10 px), `var(--text-tertiary)`, a `1px solid var(--border-hairline-strong)` border, `var(--radius-sm)` corners, a little horizontal padding, `margin-right: 10px`. The tick: the weight in `var(--text-secondary)`, the ` · ` separators in `var(--text-tertiary)`, the outcome word in `var(--text-tertiary)`, the arrow and number in bold with the tone colour: `WIN` `var(--state-positive)`, `LOSS` `var(--state-negative)`, `DRAW` `var(--state-neutral)`. Tones are inline styles (P20). No belt colour chips (a white, black or red chip would break the colour rules).
- Server render and first client render: the empty container (no sample), so there is no hydration mismatch from randomness.
- Motion allowed: at 4,000 ms after mount the first sample appears and the container fades in (480 ms). Every 2,200 ms from 7,200 ms on, the tick changes: the outgoing line moves 20 px up and fades out over 240 ms (`--duration-fast`), then the new line enters from 20 px below and fades in over 240 ms, brand easing. (Thomas slid winner and loser in opposite directions; one athlete per tick needs one direction.) Use CSS transitions toggled by state, or WAAPI; no library.
- The timers pause while `document.visibilityState` is `hidden` and resume on return (Motion Rule ambient lifecycle). All timers and listeners are cleared on unmount.
- Reduced motion: the component renders the empty container and starts no timers; if reduced motion turns on later it clears its timers and empties.
- The ticker never overlaps the badges, the hero line or the corner brackets (AC5).


## 8. Video spec

### 8.1 Renditions

Produced once by the implementer of TV4 with `/opt/homebrew/bin/ffmpeg`, reading Thomas's file as input data (ffmpeg is our tool, not his code). Run the commands from a working directory outside the download folder, writing into `apps/web/public/landing/videos/`. Commit the outputs (they are small enough for plain git; the repo has no LFS).

```bash
SRC=/Users/msponagle/Downloads/elo-rated-teaser-v2/site/videos/sparring-01.mp4
OUT=/Users/msponagle/code/EloRated/.worktrees/jits_web-teaser-v2/apps/web/public/landing/videos
mkdir -p "$OUT"

# Phones and tablets (served below 1024 CSS px wide): 1280x720, about 0.5 Mbps
/opt/homebrew/bin/ffmpeg -i "$SRC" -an -map_metadata -1 -vf "scale=-2:720" \
  -c:v libx264 -profile:v high -preset slow -crf 28 -maxrate 500k -bufsize 1000k \
  -pix_fmt yuv420p -movflags +faststart "$OUT/sparring-01-v1-720.mp4"

# Wide screens: 1920x1080, about 1.2 Mbps
/opt/homebrew/bin/ffmpeg -i "$SRC" -an -map_metadata -1 \
  -c:v libx264 -profile:v high -preset slow -crf 27 -maxrate 1200k -bufsize 2400k \
  -pix_fmt yuv420p -movflags +faststart "$OUT/sparring-01-v1-1080.mp4"

# Poster: Thomas's still, unchanged bytes
cp /Users/msponagle/Downloads/elo-rated-teaser-v2/site/videos/sparring-01-poster.jpg "$OUT/sparring-01-v1-poster.jpg"
```

Expected results (trial encodes by the PM on 2026-10-17 with the same settings, without `-map_metadata -1`, which changes size by bytes only): 720p about 2.63 MB (2,629,041 bytes), 1080p about 6.15 MB (6,150,457 bytes), both with `moov` before `mdat`. The source is 10.9 MB. Acceptance: the 720p file is 2.0 to 3.0 MB and the 1080p file at most 7 MB; if a run lands outside, adjust `-crf` by one step and note it in the PR. Verify each output with `ffprobe` (H.264 High, yuv420p, no audio stream, 42.88 s, `moov` first: `ffprobe -v trace FILE 2>&1 | grep -m2 -E "type:'(moov|mdat)'"`) and record the output in the PR. The video is shown greyscale and at 55% brightness behind an overlay, so these bitrates are far above what is visible.

### 8.2 Markup (`HeroVideo`)

```tsx
<video
  data-testid="hero-video"
  aria-hidden="true"
  muted
  loop
  playsInline
  preload="none"
  poster="/landing/videos/sparring-01-v1-poster.jpg"
  disablePictureInPicture
  disableRemotePlayback
  className={styles.video}
>
  <source media="(max-width: 1023px)" src="/landing/videos/sparring-01-v1-720.mp4" type="video/mp4" />
  <source src="/landing/videos/sparring-01-v1-1080.mp4" type="video/mp4" />
</video>
```

No `autoplay`, no `controls`, no `tabIndex`. Style: absolute, inset 0, 100% by 100%, `object-fit: cover`, `filter: grayscale(0.7) brightness(0.55) contrast(1.05)`, `pointer-events: none`, z 0. React renders `muted` as a property, not always as an attribute; because `play()` is called only after mount, set `ref.current.muted = true` before calling it (Safari refuses unmuted autoplay).

### 8.3 Behaviour

- After mount, if `usePrefersReducedMotion()` is false and `navigator.connection?.saveData !== true`: set `muted = true` and call `play()`; ignore a rejected promise (the poster stays).
- When reduced motion becomes true: `pause()`.
- No play on hover, no controls, no sound ever.

### 8.4 Serving, proxy and caching

- Paths: `/landing/videos/sparring-01-v1-720.mp4`, `/landing/videos/sparring-01-v1-1080.mp4`, `/landing/videos/sparring-01-v1-poster.jpg`.
- The poster is a `.jpg`, which the proxy matcher already skips. The `.mp4` files are redirected to `/` today while locked (307), because the matcher only skips image and `.html` extensions; P13 adds `mp4` to the matcher's skip list. Required tests: section 11.1 (matcher unit test) and 11.2 (status, content type, range request).
- `next.config.ts` `headers()`: `Cache-Control: public, max-age=31536000, immutable` on `/landing/videos/:file*` (P14). Verified on the Vercel preview with `curl -sI` (rollout step 2), not in `next dev` (which may send its own `Cache-Control` for public files).
- Range requests must work (Safari will not play an MP4 without HTTP 206 range responses). Vercel's static file serving and `next start` both support them; the e2e test pins it on the dev server.


## 9. Copy deck (literal strings)

No em dashes, no exclamation marks, no emoji anywhere. `·` is U+00B7.

| Id | Element | String |
|---|---|---|
| T1 | `<title>`, OG title, Twitter title | `ELO RATED: Ranked Jiu-Jitsu` (unchanged, P1) |
| T2 | meta description | `BJJ matches, filmed and rated. Ranked no-gi jiu-jitsu on your phone.` (unchanged) |
| T3 | OG / Twitter description | `BJJ matches, filmed and rated.` (unchanged) |
| T4 | Visually hidden `<h1>` (its accessible name) | `We are ELO RATED. Are you?` |
| T5 | Header lockup `aria-label` (`role="img"`) | `ELO RATED` |
| T6a | Hero line, `NEXT_PUBLIC_APP_STORE_URL` unset or invalid | `Coming Soon` (uppercased by style) |
| T6b | Hero line, App Store listing set | `Get the app` (uppercased by style) |
| T7 | Store badges | Unchanged from `store-badges.tsx` (`App Store: coming soon`, `Google Play: coming soon`, `Coming soon`, `Download ELO RATED on the App Store`, `Get ELO RATED on Google Play`) |
| T8 | Ticker tag | `SAMPLE` |
| T9 | Ticker line | `{LBS} LBS · {WIN\|LOSS\|DRAW} {▲\|▼}{N}` per section 7.2 (O18, O19) |
| L3e | Intro section heading line (moved, P16) | `What's your number?` |
| L4 | Intro section body (moved) | `BJJ matches, filmed and rated. Go live, roll, confirm the result. Your ELO moves.` |
| L5 | Intro section data strip (moved) | `NO-GI · SUBMISSION ONLY · EVERY MATCH RANKED` |
| L7 to L10 | Steps and footer | Unchanged from base section 9 |

"WE ARE", "ELO RATED" and "ARE YOU?" are artwork inside the SVGs, not text. The tagline element in `LandingIntro` stays a `<p>` (as today), so the page keeps exactly one `<h1>` (T4), the `HOW IT WORKS` `<h2>` and the step `<h3>`s. No "AI" wording anywhere (owner decision 2026-10-07, base section 9).


## 10. Route and regression table

"Today" means `origin/development` at `4a20ee80`. Every row must be identical before and after this change, except the two rows marked "changed".

| Path or behaviour | Locked (default, prod) | Unlocked (`NEXT_PUBLIC_WEB_APP_ENABLED=true`) | Verified by |
|---|---|---|---|
| `/` | 200, landing with the teaser hero (changed: hero content only), rewrite to `/welcome`, URL stays `/` | Today: dashboard / `/login` redirect | e2e landing-lock 1; unlocked smoke run; proxy unit tests unchanged |
| `/welcome`, `/welcome/**` | 307 to `/` | 307 to `/` | e2e landing-lock "Locked routes"; proxy unit tests |
| `/landing/videos/*.mp4` | 200 `video/mp4`, 206 for a range (changed: was 307 to `/`) | 200 (static), no proxy run | new e2e; new matcher unit test |
| `/landing/videos/*.jpg`, `/landing/hero.jpg` | 200 | 200 | new e2e (poster); OG check in rollout |
| `/c/<token>` | Today: invite page, OG image, `er_invite` cookie, Open in app, store badges, `X-Robots-Tag: noindex`, Smart App Banner only when the store URL is set | Today | e2e `invite-landing.spec.ts` (unchanged) in both runs; `app/c/[token]/page.test.ts` |
| `/c/<token>/opengraph-image` | 200 image | Today | e2e invite-landing (unchanged) |
| `/api/invite-events` | Today (POST telemetry, rejects bad input) | Today | e2e invite-landing (unchanged) |
| `/.well-known/apple-app-site-association` | 200, `application/json` | Today | e2e invite-landing (unchanged) |
| `/.well-known/assetlinks.json` | 200 JSON array | Today | e2e landing-lock (unchanged) |
| `/support`, `/terms`, `/privacy`, `/terms/fr`, `/privacy/fr` | 200, no redirect | Today | e2e landing-lock (unchanged); smoke "Public legal pages" |
| `/robots.txt`, `/manifest.webmanifest`, `/sw.js` | 200 | Today | e2e landing-lock (unchanged); `app/robots.test.ts` |
| `/favicon.ico`, `/icon.png`, `/apple-icon.png`, `/icon-192.png`, `/icon-512.png` | 200, today's icons | Today | new e2e icon check (section 11.2 item 9) |
| `/forgot-password`, `/update-password`, `/error` | 200; no `/login` link; "Back to ELO RATED" | Today | e2e landing-lock (unchanged) |
| `/confirm`, `/auth/callback` (no params) | End on `/error` | Today | e2e landing-lock (unchanged) |
| `/login`, `/signup`, `/eua`, `/arena`, `/profile`, `/settings`, `/athlete/<id>`, `/matches/<id>`, `/design`, `/api/version`, unknown paths | 307 to `/` | Today | e2e landing-lock "Locked routes" (unchanged) |
| Smart App Banner (`apple-itunes-app`) | On `/` and `/c/<token>` only when the App Store URL is set | Same | `app/layout.test.ts`, `app/c/[token]/page.test.ts` (unchanged) |
| Store badges | "Coming soon" non-links until each URL is set; never red; two blocks on the landing | n/a on `/` | `landing-page.test.tsx`, e2e via `store-badges.ts` (unchanged helper) |
| Horizontal scroll | None at 320 px and up | n/a | e2e AC5 |
| Static prerender | `/welcome` prerendered (`○` in the build output) | Same | `npm run build:web` output |


## 11. Test plan

### 11.1 Unit tests (vitest, `apps/web`)

Env-dependent tests stub with `vi.stubEnv` and restore with `vi.unstubAllEnvs()`. `APP_STORE_URL` is read at module load, so tests of the "Get the app" line use `vi.resetModules()` and a dynamic import, as `landing-page.test.tsx` already does in `renderWith`.

Changed:

1. `components/landing/landing-page.test.tsx` (update):
   - Keep: the `h1` with accessible name "We are ELO RATED. Are you?"; `data-theme="dark"` on `landing`; the footer link checks; no `href` containing `/login` or `/signup`; steps (L7, L8a to L8c) and the copyright; the two store-badge tests (both blocks "coming soon" while unset; both live and never red-filled when set) with the hero heading assertion changed as below.
   - Change: "ARE YOU?" is no longer a text node (it is artwork): remove `getByText("ARE YOU?")`. L3e, L4 and L5 are now asserted inside `LandingIntro` (still on the page). The hero has no `img` with `src="/landing/hero.jpg"`: replace that test with the video checks below. `getByText("Get the app")` while unset is replaced by: the hero line reads "Coming Soon" and has inline `color: var(--accent-cta-text)`; with the App Store URL set (re-import), it reads "Get the app".
   - Add: `<main>` has `data-crown="colour"`; exactly one `h1`; the header logo `svg` has `width="137"`, `height="31"`, `role="img"` and name "ELO RATED"; at least one `path[data-part="crown-belt-bar"]` with `fill="#E63946"` and one `path[data-part="crown-belt"]` with `fill="#050609"`; every lockup `svg` other than the header is `aria-hidden="true"`; the video has `poster` `/landing/videos/sparring-01-v1-poster.jpg`, `preload="none"`, `playsinline` (or the `playsInline` property), `loop`, `muted` property true, `aria-hidden`, no `autoplay` attribute, and two `source` children in the P15 order with the right `media`; the ticker container exists, is `aria-hidden`, and is empty on first render; no element text contains a name from a small fixture list taken from Thomas's pool (for example "Hiroshi Tanaka", "Maria Cruz") and no text contains an em dash (U+2014).
2. `lib/supabase/public-paths.test.ts`: add `expect(isLockedAllowedPath("/landing/videos/sparring-01-v1-720.mp4")).toBe(false)` with a comment that the proxy matcher, not the allow-list, lets videos through (P13). No other change.
3. `lib/supabase/proxy.test.ts`: no change required (updateSession is untouched). It must still pass.
4. `app/layout.test.ts`, `app/robots.test.ts`: no change required. They must still pass.

New:

5. `proxy.test.ts` (next to `proxy.ts`, `// @vitest-environment node`): build `new RegExp("^" + config.matcher[0] + "$")` and assert it does NOT match `/landing/videos/sparring-01-v1-720.mp4`, `/landing/videos/sparring-01-v1-poster.jpg`, `/landing/hero.jpg`, `/badges/app-store-badge-en-us.svg`; and DOES match `/`, `/welcome`, `/arena`, `/c/abc`, `/api/invite-events`, `/robots.txt`, `/.well-known/apple-app-site-association`, `/landing/videos` (no extension). Mock `@/lib/supabase/proxy` if importing `proxy.ts` pulls in server-only modules.
6. `next-config.test.ts` (`// @vitest-environment node`, next to `next.config.ts`): `await nextConfig.headers()` contains the `/landing/videos/:file*` rule with `public, max-age=31536000, immutable`, and the two existing rules (`/c/:token`, AASA) are still present and unchanged.
7. `components/landing/hero-copy.test.ts`: `heroLine(null)` is "Coming Soon"; `heroLine("https://apps.apple.com/app/id6774629438")` is "Get the app"; with `NEXT_PUBLIC_APP_STORE_URL` stubbed to an invalid value (`https://example.com/app`) and modules reset, the default argument yields "Coming Soon" (the signal is `APP_STORE_URL`'s parsing, not the raw env).
8. `components/landing/lockups/lockups.test.ts` (`// @vitest-environment node`, `node:crypto`): for each of the six `LockupArt` constants, the `viewBox`, `x` and path count equal section 1.2, and `sha256(paths.map(p => p.d).join("\n"))` (all paths in document order) starts with the section 1.2 prefix. This is the "verbatim" proof; it must pass without the download being present.
9. `components/landing/lockup-tier.test.ts`: one-line thresholds (`pickTier(w, 0.3477, dpr, ONELINE)` returns `detail` at exactly 175 device px of crown, `fine` at 174 and at 112, `small` at 111); block thresholds (`b3` at 108, `b3sm` at 107); dpr scaling (the same CSS width flips tier between dpr 1 and 3).
10. `components/landing/ticker-samples.test.ts`: with a seeded PRNG over 10,000 draws: every formatted tick matches `^(122\.5|136|149|162|175\.5|188\.5|202|215) LBS · (WIN ▲([3-9]|1\d|20)|LOSS ▼([3-9]|1[0-8])|DRAW [▲▼][1-3])$` (O18, O19); WIN never has ▼ and LOSS never ▲; delta is never 0; outcome shares within ±2 points of 40/40/20; `nextTick` never repeats the previous formatted string; edge values of `random` (0 and 0.999999) stay in range.
11. `components/landing/hero-ticker.test.tsx` (fake timers, a `matchMedia` mock): motion allowed, nothing at 3,999 ms, `SAMPLE` and one tick matching the regex at 4,000 ms, a different tick after 7,200 ms; tone colours by outcome (inline style); reduced motion: still empty at 10,000 ms and no timers pending; unmount clears all timers (`vi.getTimerCount() === 0`); `visibilitychange` to hidden stops rotation.
12. `components/landing/hero-video.test.tsx`: stub `HTMLMediaElement.prototype.play` (resolved promise) and `pause`; motion allowed: `play` called once after mount and `muted` is true at that time; reduced motion: `play` never called; `navigator.connection.saveData = true`: never called; a `change` to reduce after play: `pause` called; a rejected `play()` does not throw.
13. `components/landing/lockup-tier-sync.test.tsx`: after mount, `data-intro` becomes `done` on an `animationend` event from the `soon` element, or after 2,700 ms with fake timers; listeners removed on unmount. (jsdom has no layout, so the tier pick itself is covered by test 9 and the e2e.)

### 11.2 End-to-end (Playwright, `apps/web`)

Update `e2e/landing-lock.spec.ts` (whole file still skipped when unlocked). Import `APP_STORE_LIVE` from `./store-badges` for the hero line. Leave `e2e/smoke.spec.ts`, `e2e/invite-landing.spec.ts` and `e2e/store-badges.ts` unchanged; they must pass in both runs.

1. Test "renders the landing at /": keep everything (status 200, pathname `/`, title, `h1`, two badge blocks via `expectStoreBadges`, no `--accent-cta)` styles, no login / signup links, footer hrefs). Keep `What's your number?` visible (now in `LandingIntro`). Add: `getByText(APP_STORE_LIVE ? "Get the app" : "Coming Soon")` visible inside `landing-hero`.
2. Phone width 390x844: keep the no-overflow check and the screenshot (`test-results/landing-390.png`).
3. Replace "loads the hero image" (desktop project): the poster loads (`GET /landing/videos/sparring-01-v1-poster.jpg` is 200 `image/jpeg`), and the `hero-video` element exists with the poster attribute. In Chromium with motion allowed, `expect.poll` that `video.paused` becomes false within 10 s (Playwright Chromium allows muted autoplay; if CI headless refuses, assert `currentSrc` ends with `-1080.mp4` on desktop and `-720.mp4` on the mobile-chrome project instead, and note it).
4. New, video assets: for both MP4s, `request.get(path, { maxRedirects: 0 })` is 200 with `content-type` containing `video/mp4`; with header `Range: bytes=0-1023` the status is 206 and `content-range` starts with `bytes 0-1023/`.
5. New, intro end state: after `page.goto("/")` and 3,500 ms, every visible `[data-lk]` element has computed opacity `1` and the hero line is visible; `data-intro` on `landing-hero` is `done`.
6. New, reduced motion (`test.use({ reducedMotion: "reduce" })`): immediately after load (no wait), visible `[data-lk]` elements have opacity `1`; `video.paused` stays true for 2 s; after 6 s `hero-ticker` has no text.
7. New, ticker: with motion allowed, within 6 s `hero-ticker` text contains `SAMPLE` and matches the section 11.1 test 10 regex; it has `aria-hidden="true"`.
8. New, layout matrix (AC5), for viewports 320x568, 375x667, 390x844, 844x390, 768x1024, 1280x800 and 1920x1080: no horizontal overflow; the header logo's bounding box is 137 x 31; the bounding boxes of the hero line, the hero badge block, the header logo and (after it appears, motion allowed) the ticker do not intersect each other; all of them lie inside `landing-hero`; the hero line's computed font size is at least 10 px. Save screenshots `test-results/landing-<w>x<h>.png` for Thomas's review.
9. New, icons: `/favicon.ico`, `/icon.png`, `/apple-icon.png`, `/icon-192.png`, `/icon-512.png` are 200 with `maxRedirects: 0`.
10. New, console: loading `/` logs no console errors and no React hydration warnings (listen to `page.on("console")` for `error` and to `pageerror`).

Unlocked run (`npm run test:e2e:unlocked`): `landing-lock.spec.ts` is skipped as today; smoke and invite specs pass; add nothing that runs only unlocked. The video MP4 check (item 4) can also run in the unlocked state, since the files are static in both; put it in a small `describe` outside the file-level skip, or accept that the unlocked state is covered by the matcher unit test.

### 11.3 Quality gate (all must pass before any commit is called done)

From the repo root of the worktree:

```bash
npm run typecheck
npm run test
npm run build:web          # confirm /welcome is prerendered (○) in the route list
cd apps/web
npm run test:e2e           # locked (both store URLs unset)
# stop the dev server Playwright started or reused (port 4983) before switching states
npm run test:e2e:unlocked  # NEXT_PUBLIC_WEB_APP_ENABLED=true
```

Then the production-build check from base section 11.4, extended:

```bash
npm run build:web && cd apps/web && npx next start --port 4983
curl -sI localhost:4983/                                              # 200, no Location
curl -s  localhost:4983/ | grep -c "Coming Soon"                      # at least 1
curl -s  localhost:4983/ | grep -c "We are ELO RATED. Are you?"       # at least 1
curl -sI localhost:4983/landing/videos/sparring-01-v1-720.mp4         # 200, video/mp4, no Location
curl -sI -H "Range: bytes=0-1023" localhost:4983/landing/videos/sparring-01-v1-1080.mp4   # 206
curl -sI localhost:4983/login                                         # 307, location: /
curl -sI localhost:4983/welcome                                       # 307
curl -sI localhost:4983/c/e2eChallengeTokenAAAAA                      # 200 (with E2E fixtures) or today's response
```

Record the output in the PR. Also record: `ffprobe` output for both renditions, file sizes, and `grep -rn $'\u2014' apps/web/components/landing specs/web-landing/addendum-teaser-v2.md` (zsh or bash; it searches for U+2014, the em dash) returning nothing.


## 12. Rollout

0. **Docs (TV5)**: `CHANGELOG.md` `[Unreleased]`, area Web: Changed "landing hero replaced by Thomas's teaser v2 (crown lockups, sparring video, one-time intro, sample ticker); tagline and body moved below the hero; videos under `/landing/videos/` with a one-year cache; the proxy matcher skips `.mp4`". `CLAUDE.md` "Web lockdown (2026-10-14)" bullet: append one sentence: "The landing hero is Thomas's teaser v2 (`specs/web-landing/addendum-teaser-v2.md`): its line reads 'Coming Soon' until `NEXT_PUBLIC_APP_STORE_URL` is set, then 'Get the app'; the proxy matcher skips `.mp4` so `/landing/videos/` serves while locked." The supersession note at the top of `specs/web-landing/spec.md`. No em dashes.
1. **Build and review** on `feat/teaser-v2-landing`: each task gets an independent reviewer (workspace policy). The reviewer checks the lockup fingerprints test, the token-only colours (`grep -nE "#[0-9A-Fa-f]{3,8}" apps/web/components/landing --include=*.tsx --include=*.css` returns only lockup data files, if any), the 80-line limit, and the "must not change" list in 5.3. Full gate green (11.3).
2. **Preview for Thomas**: push the branch and open a PR into `development`; Vercel builds a preview deployment. Confirm the preview is reachable for Thomas (Vercel Deployment Protection may require a shareable link or a bypass; the owner decides). Thomas and the owner check on a phone (portrait and landscape) and a laptop: lockup drawings and tiers, header logo size, intro feel (P4), Coming Soon colour (O6), badges under the line, ticker format, video load and greyscale, reduced motion (iOS Settings > Accessibility > Motion > Reduce Motion; macOS System Settings > Accessibility > Display > Reduce motion). On the preview also run `curl -sI <preview>/landing/videos/sparring-01-v1-720.mp4` and confirm `cache-control: public, max-age=31536000, immutable`, `content-type: video/mp4`, and no redirect. Fix feedback on the branch (re-review, re-gate).
3. **Merge**: PR into `development`, then `development` into `main` (Vercel deploys production from `main`). Vercel env is unchanged: `NEXT_PUBLIC_WEB_APP_ENABLED` unset, `NEXT_PUBLIC_APP_STORE_URL` unset (the app is in review).
4. **Production verification** (record on the rollout bead):
   - `https://elorated.com/` shows the teaser hero with "Coming Soon", both badges "Coming soon", the video playing (motion allowed) or the poster (reduced motion), the ticker with `SAMPLE`, and below the fold the intro section, HOW IT WORKS and the footer. Check signed out, and in a browser with a web session.
   - `curl -sI https://elorated.com/landing/videos/sparring-01-v1-720.mp4`: 200, `video/mp4`, immutable cache; same for the 1080p file; a range request returns 206.
   - `https://elorated.com/login` and `/arena`: 307 to `/`. `/support`, `/terms`, `/privacy`, `/terms/fr`, `/privacy/fr`: 200. `/.well-known/apple-app-site-association`: JSON content type; `/.well-known/assetlinks.json`: JSON. `/robots.txt`, `/manifest.webmanifest`, `/sw.js`, `/favicon.ico`: 200. A real `/c/<token>`: renders, OG image loads, `X-Robots-Tag: noindex`, no web sign-up links.
   - A link preview of `https://elorated.com/` (for example the X card validator or pasting into iMessage) still shows `hero.jpg` and the title "ELO RATED: Ranked Jiu-Jitsu".
   - `https://www.elorated.com/` redirects to the apex; `https://jitsweb.vercel.app/` shows the same landing.
5. **Launch day** (when the App Store listing is public): set `NEXT_PUBLIC_APP_STORE_URL=https://apps.apple.com/app/id6774629438` in Vercel Production and redeploy (`NEXT_PUBLIC_*` is build-time; nothing changes until the redeploy). Verify: the hero line reads "Get the app", the App Store badges on `/` and `/c/<token>` are links to the listing, the Smart App Banner meta (`apple-itunes-app`) appears on `/` and `/c/<token>`, and the Google Play badge stays "Coming soon" until `NEXT_PUBLIC_PLAY_STORE_URL` is set. No code change.
6. **Rollback**: revert the merge commit on `main` (the previous landing returns); no env or data to undo.


## 13. Work breakdown (beads)

Epic `jits-2hju` "Teaser v2 public landing", related to `jits-6si3`. Children:

| Task | Bead | Title | Depends on | Files (disjoint where possible) |
|---|---|---|---|---|
| TV1 | `jits-2hju.1` | Hero port: lockup data, static hero layout, header logo, hero line, badges, corners, LandingIntro | none | `components/landing/lockups/*`, `lockup-svg.tsx`, `hero-header-logo.tsx`, `hero-lockup.tsx`, `hero-copy.ts`, `landing-intro.tsx`, `landing-hero.tsx`, `landing-page.tsx`, `landing-hero.module.css` (layout part) |
| TV2 | `jits-2hju.2` | Motion: CSS intro, reduced-motion end state, tier picker, intro-done guard | TV1 | `landing-hero.module.css` (intro part), `lockup-tier.ts`, `lockup-tier-sync.tsx` |
| TV3 | `jits-2hju.3` | Sample ticker: no names, weight + outcome + delta (no belt, O18), SAMPLE tag | none (wired by TV1) | `ticker-samples.ts`, `hero-ticker.tsx`, `hero-ticker.module.css`, `use-prefers-reduced-motion.ts` |
| TV4 | `jits-2hju.4` | Video renditions, HeroVideo, proxy matcher allows .mp4, cache headers | none (wired by TV1) | `public/landing/videos/*`, `hero-video.tsx`, `proxy.ts`, `next.config.ts`, `use-prefers-reduced-motion.ts` (if first) |
| TV5 | `jits-2hju.5` | Metadata and copy: title and OG kept, copy deck, docs (CHANGELOG, CLAUDE.md, spec note) | TV1 to TV4 | `CHANGELOG.md`, `CLAUDE.md`, `specs/web-landing/spec.md` (header note only) |
| TV6 | `jits-2hju.6` | Tests: unit and e2e updates, full gate locked and unlocked | TV1 to TV4 | tests in 11.1 and `e2e/landing-lock.spec.ts` |
| TV7 | `jits-2hju.7` | Rollout: preview for Thomas, merge to main, prod verify, launch-day env | TV1 to TV6 | none (ops) |
| F1 | `jits-2hju.8` | Follow-up (owner and Thomas): record the crown lockups and the landing intro in the brand book and design system | none (not blocking) | `DESIGN.md`, design system artifact (out of this epic's build) |

TV1, TV3 and TV4 can start at once in separate worktrees (`isolation: "worktree"`): TV1 imports `HeroTicker` and `HeroVideo` by those names from `./hero-ticker` and `./hero-video` (no props), so whichever lands second wires cleanly; until then TV1 may render a placeholder `null`. TV2 follows TV1 (they share the hero CSS module). TV3 and TV4 both need `use-prefers-reduced-motion.ts`; whichever starts first writes it, as specified in 5.2, and the other rebases. Each implementer adds the unit tests for their own modules; TV6 owns the landing page test, the e2e changes and the final gate.

### 13.1 Acceptance criteria

- **AC1. Verbatim lockups (O1, O2, O3).** The six lockup data modules pass the fingerprint test (11.1 test 8). The header lockup renders at exactly 137 x 31 CSS px at every viewport (e2e 8). The belt bar is `#E63946` and the belt `#050609` (unit 1). The portrait block shows below aspect 4:5 and the one-line lockup at 4:5 and above (e2e screenshots at 390x844 and 1280x800 show each).
- **AC2. Tokens only (O6, O7, O8).** The hero line uses `var(--accent-cta-text)`; no `#6B7280` anywhere in the landing; no raw hex in `components/landing` outside `components/landing/lockups/*.ts`; fonts come from `next/font` (no request to `fonts.googleapis.com` or `cdnjs` in the e2e network log).
- **AC3. Intro and reduced motion (O5, O11, P3, P4, P18).** The intro follows 6.1 and ends at 2.65 s; under reduced motion the end state shows on the first frame, the video never plays and no ticker shows (e2e 5, 6; unit 11, 12, 13). No corner pulse, no letter shimmer, no other loop (code review: no `infinite` animation and no `setInterval` other than the ticker's in `components/landing`).
- **AC4. Ticker (O12, P8 to P11).** Format and ranges per 7.2 (unit 10); no personal names (unit 1); `SAMPLE` shown; draws labelled `DRAW` in the neutral tone; `aria-hidden`; starts at 4 s; hidden under reduced motion (unit 11, e2e 6, 7).
- **AC5. Layout (O13, P5 to P7, P19).** At 320x568, 375x667, 390x844, 844x390, 768x1024, 1280x800 and 1920x1080: no horizontal scroll; header logo, hero line, badges and ticker do not overlap and stay inside the hero; text at least 10 px; the page scrolls to the intro section, HOW IT WORKS and the footer (e2e 1, 2, 8).
- **AC6. Coming Soon switch (O14).** "Coming Soon" while `NEXT_PUBLIC_APP_STORE_URL` is unset or invalid; "Get the app" when it parses as the listing (unit 1, 7; e2e 1). No other file reads the env var (base 8.1 grep).
- **AC7. Video (O15, P12 to P15).** Two renditions within the size bounds of 8.1, faststart, no audio; poster first; `preload="none"`; no `autoplay` attribute; mobile source first with `media`; the MP4s serve 200 / 206 while locked (e2e 4; unit 5); the one-year immutable cache header is configured (unit 6) and present on the preview (rollout 2).
- **AC8. Metadata (O10, O16, O17, P1, P2).** Title, description, canonical, OG and Twitter metadata, viewport `themeColor`, icons and favicons unchanged; no em dash in any added string, comment or doc.
- **AC9. Nothing else breaks.** Every row of section 10 holds; `smoke.spec.ts`, `invite-landing.spec.ts`, `store-badges.ts`, `app/layout.test.ts`, `app/robots.test.ts`, `lib/supabase/proxy.test.ts` pass unchanged; the files in 5.3 are untouched.
- **AC10. Conventions.** Components under 80 lines, kebab-case files, `/welcome` prerendered static under `cacheComponents` (no cookies, headers, search params, dates or randomness in the server render).
- **AC11. Gate.** Section 11.3 green locked and unlocked, with the production-build curl output in the PR.


### 13.2 Build notes (implementer, 2026-10-17)

- Renditions from the section 8.1 commands, unchanged: `sparring-01-v1-720.mp4` 2,618,601 bytes (1280x720, about 0.49 Mbps) and `sparring-01-v1-1080.mp4` 6,146,281 bytes (1920x1080, about 1.15 Mbps), both H.264 High, yuv420p, 25 fps, 42.88 s, no audio, `moov` before `mdat`; the poster is Thomas's file byte for byte (37,890 bytes).
- Lockup data: `LockupGroup` gained `innerTransform`, because the one-line crowns sit in an inner `<g transform>` that must stay apart from the animated group (a CSS transform on the same element would replace the SVG transform attribute). Order, fills, `data-part` and `fill-rule` are unchanged; the fingerprints match section 1.2.
- The hero line is floored at 10 px (`font-size: max(10px, var(--soon-size))`), because on short landscape phones (844x390) Thomas's container-query size falls under 10 px (AC5).
- `--badges-h` is 57 px (measured) plus the 20 px gap above the badges.
- Test helpers live in `components/landing/landing.test-utils.ts` (imports vitest; test-only by name, not matched as a test file).
- `pickTier` allows a 1e-6 float tolerance so a width computed to land exactly on a threshold counts as reaching it.
- Under reduced motion `LockupTierSync` marks the intro done at once (no animation would end it).
- e2e: the reduced-motion test uses `page.emulateMedia({ reducedMotion: "reduce" })`, because `test.use({ reducedMotion })` was not applied by this config's projects (matchMedia still read no-preference). Layout matrix screenshots are named `landing-<w>x<h>-<project>.png` so the two projects do not overwrite each other. The video test asserts the chosen rendition (`currentSrc`) and, only where the browser reports H.264 support, that the video plays.
- The invite e2e specs need `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` in the dev server's environment (a fresh worktree has no `.env.local`); pass them as environment variables, never the lock or store URL values.

## 14. Risks

- **R1. Container-query and `media`-on-`source` support.** `cqw` needs Safari 16+, Chrome 105+; `<source media>` for video needs Chrome 120+ / Firefox 120+. Older browsers get a larger "Coming Soon" fallback (set a `font-size` fallback before the `cqw` value) and the 720p video everywhere (P15). Accepted.
- **R2. Autoplay refused.** iOS Low Power Mode and some browsers block even muted autoplay; the poster shows. Accepted (P12).
- **R3. Repo weight.** About 8.8 MB of video is added to git. Accepted; a recut adds another version. If the repo grows a media policy (LFS), move them then.
- **R4. Tier change during the intro.** Rare (P17); restarts one drawing's intro; ends correctly (P18).
- **R5. Two lockup systems on one page.** The header and hero use the crown lockups; the footer uses the live `Wordmark` (the brand book's wordmark rule). Visible to a careful eye; resolved by F1 if the owner wants one system.
- **R6. Footage.** The video shows real people sparring; see Q1. Do not merge to `main` before Q1 is answered.


## 15. Open items for the owner

- **Q1. Sparring footage consent (blocks the `main` merge).** Who is in `sparring-01.mp4`, did they consent to appear on the public site, and does Thomas hold the rights to the clip (it predates this zip; the file is dated 2026-05-19)? The base spec's hero photo had the same question implicitly; this one is moving video of identifiable athletes.
- **Q2. Thomas's standalone preview.** `https://elo-rated-teaser-v2.vercel.app` is a public, indexable copy of the brand with the invented-name ticker and the em-dash title. Recommend Thomas adds `noindex` (a `<meta name="robots" content="noindex">` or an `X-Robots-Tag` header) or takes it down once our preview exists.
- **Q3. Temporary URL.** Should Thomas's preview URL keep serving as the review link until our Vercel preview is approved, or should review move to the `jits_web` preview at once (and is Deployment Protection on previews a problem for Thomas)?
- **Q4. Ticker fields: belts and units. CLOSED 2026-10-17 by O18 and O19 (no belts, pounds, the rating's no-gi weight classes).** The app has no belt field at all (help copy "No belt seeding"; no belt column in the schema), so a ticker that shows belts suggests a feature the app does not have. And the app shows pounds, not kilograms (P10). Confirm "belt + weight" (as specified), or switch to weight only, or to a rating (for example `1512 · 170 LBS · WIN ▲14`, the app's own athlete meta line format). The format is one function (`formatTick`), so the change is small.
- **Q5. Brand book conflicts (F1). CLOSED for this epic 2026-10-17 by O20 (keep the crown lockups in the hero and the live Wordmark in the footer; follow-up `jits-2hju.8`).** DESIGN.md says the logo is the E·R lettermark and the wordmark is live Bebas Neue text with no file; the crown lockups are in neither the brand book nor the "ELO RATED Design System" artifact. The Motion Rule says a Moment never plays on mount (the launch splash is the only sanctioned on-mount moment), and `tokens.css` says the only auto-animated brand moment is the rating tick; this intro is a second on-mount moment, sanctioned for this page by O11. Recommend F1 records both (lockups as a brand asset with Thomas's size rules; the landing intro as a web Motion registry row).
