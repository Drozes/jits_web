# ELO RATED Native Screens: artboard build spec

Goal: a Claude Design canvas that ACCURATELY represents the CURRENT native mobile app
(`apps/mobile` in the jits_web repo, Expo SDK 54, expo-router 6, NativeWind 4; re-check the versions in
`apps/mobile/package.json`).
Canvas: https://claude.ai/artifact/PJWm2WeqsG56HS13jHsd5D ("ELO RATED Native Screens"). This spec governs the
"Current app" page. Keeping it in sync with releases is the `/canvas-sync` command; see `README.md` here.
The code is the only source of truth. Old design files (native-screen-inventory.html, wireframe.html,
Figma) and the Sept design-exploration artifacts are NOT sources; do not copy them. If the code and an
old design disagree, the code wins. Gyms/sessions as routes are retired; only draw gym remnants that
still render in the code (Rankings "Gyms" chip, gym picker in setup, gym name in profile meta).

## Output location and publishing

Work in the scratchpad of whoever is running the sync (the orchestrator gives the exact directory, for
example `<scratchpad>/canvas-sync/project/`), never in a fixed tmp path and never inside the repo.
Write each artboard there as `<FILE>.dc.html` with your file-writing tool (Write). Never edit `canvas.json`
or files assigned to another agent. Do not publish; the orchestrator publishes. Do not edit anything in the
jits_web repo while drawing (it is read only for this job).

How boards reach the canvas (orchestrator only):
- The live canvas is the source for every edit: before changing anything, read `project/canvas.json` and
  each board to be changed with the Artifact tool (`action: "read"`, `url` = the canvas URL, `path` =
  `project/<FILE>.dc.html`). Teammates edit the canvas, so never start from an older local copy.
- Boards are published ONLY through the Artifact tool, to the canvas URL (`url` is mandatory; a publish
  without it creates a new, disconnected artifact), sending only the changed files under `project/`.
- `project/canvas.json` holds each board's `x`, `y`, `w`, `h`, `title` and `page`. Keep every key you are
  not changing. A board's root size and `$preview` must equal its `w`/`h` there.
- Nothing is published before an independent reviewer has checked the changed boards against the code.

## Accuracy process (mandatory, per screen)

1. Open the route file under `apps/mobile/app/...` and every component it renders (follow imports into
   `apps/mobile/components/**` and `components/ui/elo-system/**`).
2. Copy LITERAL strings from the code (labels, captions, button text, casing, tracking, empty states).
   Uppercase text in the design only where the code uppercases it (textTransform / caps classes / literal caps).
3. Use the real sizes: font family per weight, font size, letter-spacing token, padding, gaps, radii,
   border widths, icon names (lucide-react-native) and icon sizes from the className / style props.
4. NativeWind on native resolves rem at 14px (no inlineRem override): p-4=14, gap-2=7, h-11=38.5, text-xs=10.5,
   text-sm=12.25, text-base=14. Arbitrary [..px] values and inline styles stay literal.
   Resolve NativeWind classes via `apps/mobile/tailwind.config.js` and `apps/mobile/lib/tokens.ts`.
5. Placeholder data must be plausible and consistent across screens (see Sample data). No lorem ipsum,
   no invented features. If a piece of UI only appears in some state, draw the state named in your brief.
6. Anything you could not verify from code: leave it out rather than guess, and list it in your report.

## Theme: DARK (the app is dark-first)

Use the dark tokens from `lib/tokens.ts` (verify values there; these are from the inventory):

| Token | Dark |
|---|---|
| surface (bg-primary, "Void") | #0D0F14 |
| surface-2 (bg-secondary; tab bar) | #13151B |
| surface-3 (Plate / elevated) | #1E222B |
| surface-4 (elevated hover) | #262A34 |
| ink | #E8EDF2 |
| ink-2 | #9CA3AF |
| ink-3 | #8D929D |
| Signal Red CTA fill | #E63946 (text on CTA #0D0F14) |
| red for text / negative | #EC6A74 |
| Gain Green (rating increases only) | #22C55E |
| Amber (disputes/warnings) | #F59E0B |
| hairline | rgba(107,114,128,.45); faint .20; strong .62 |
| selected bg | rgba(230,57,70,.16) |
| over-media text / badge / scrim | #E8EDF2 / rgba(0,0,0,.88) / rgba(0,0,0,.55) |

Live-step broadcast HUD tokens: `components/match-flow/live/broadcast-tokens.ts`; face-off tokens:
`components/match-flow/fight/fight-tokens.ts`. Use them where the screen uses them.

Fonts (Google Fonts css2 link in `<helmet>`, exactly this one line):
`<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Bebas+Neue&family=DM+Sans:wght@400;500;700&family=Inter:wght@400;500&family=JetBrains+Mono:wght@400;500;700&display=swap">`
- Display: 'Bebas Neue'. Heading: 'DM Sans' 700/500/400. Body: 'Inter' 400/500. Mono meta labels: 'JetBrains Mono'
  with `font-variant-numeric: tabular-nums` where the code uses TABULAR.
- Letter-spacing (px): tight -0.28, mark -0.07, loose 0.56, caps 1.12, caps-l 1.68, caps-xl 2.52, caps-xxl 3.36.
Radius: xs 2, sm 3 (CTAs, tags), md 4 (plates, cards), lg 8 (sheets/modals only). No shadows. Gradients only as camera scrims.

## Artboard file format (Claude Design `.dc.html`, rules fail silently)

```html
<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>Arena: live roster</title>
<script src="./support.js"></script>
</head>
<body>
<x-dc>
<helmet>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Bebas+Neue&family=DM+Sans:wght@400;500;700&family=Inter:wght@400;500&family=JetBrains+Mono:wght@400;500;700&display=swap">
<style>
body{margin:0;background:#0D0F14;font-family:'Inter',sans-serif;color:#E8EDF2}
a{color:#EC6A74;text-decoration:none}a:hover{color:#F0556B}
</style>
</helmet>
<div style="width: 390px; height: 844px; box-sizing: border-box; background: #0D0F14; color: #E8EDF2; display: flex; flex-direction: column; overflow: hidden; position: relative">
  ... screen ...
</div>
</x-dc>
<script type="text/x-dc" data-dc-script data-props='{"$preview":{"width":390,"height":844}}'>
class Component extends DCLogic {
  renderVals() { return {}; }
}
</script>
</body>
</html>
```

Hard rules:
- Keep `<script src="./support.js"></script>` EXACTLY. Close every non-void element; quote every attribute.
- Root element has a FIXED width/height equal to the board's w/h (given in your brief) and matching `$preview`.
- All styling inline `style="..."`. `<helmet><style>` only for body basics and a/a:hover.
- Layout with flex/grid + `gap`. Grids: `grid-template-columns: repeat(N, minmax(0, 1fr))`.
- `{{hole}}` is a dotted lookup only, never an expression. Copy is literal markup, not props. No tweaks needed
  (leave data-props as just `$preview`).
- No UI built by script (no innerHTML/appendChild). No emoji. No iframes. No network except the fonts link.
- Icons: inline stroke SVG copied from lucide (24 viewBox, stroke="currentColor", stroke-width per code
  default 2 unless the code sets strokeWidth), sized as in code. Match the real lucide icon names the code imports.
- Accessibility even in mockup: real `<button>`, `<a href>`, `<input>` with `<label>`; `aria-label` on icon-only buttons.
- Photos/video frames/posters: no real images available. Draw them as labelled placeholder blocks
  (e.g. surface-3 block with a mono caption "CAMERA" / "OPENING STILL" / "POSTER"), using the ON_MEDIA scrim
  treatment where the code overlays text on media. Avatars fall back to initials (as the code does).
- No fake iOS status bar. Start with the safe-area inset as padding-top: 47px (iPhone 14/15 inset) where the
  screen uses SafeAreaView / insets.top; bottom inset 34px under the tab bar / bottom CTAs.

## Shared chrome (draw it identically everywhere; verify against code)

- AppHeader (`components/layout/app-header.tsx`): 56pt bar [back | caps title | LIVE pill + right action].
- BrandHeader (`components/layout/brand-header.tsx`): wordmark variant, on Home and Rankings.
- EloTabBar (`components/layout/elo-tab-bar.tsx`): surface-2 bg, hairline top, 4 equal columns Home / Arena /
  Rankings / Profile (lucide Home, Swords, Trophy, User at 18px), labels DM Sans Bold 10 uppercase caps tracking,
  active = ink + 2px #E63946 top border, inactive ink-3. Only on tab screens.
- Tab bar items and flow CTAs are prototype links: style the `<a>` itself as the button/tab
  (never put a `<button>` inside an `<a>`). Link targets (same folder, e.g. `href="13-Arena-Live.dc.html"`):
  Home=`Main.dc.html`, Arena=`12-Arena-Offline.dc.html`, Rankings=`16-Rankings.dc.html`, Profile=`17-Profile.dc.html`.
  Link the obvious next step in each flow using the file list below. Non-navigating controls are `<button>`.

## Canvas file list (for links)

Onboarding: 01-Splash, 02-Login, 03-Signup, 04-Signup-Confirm, 05-Forgot-Password, 06-Setup-Terms, 07-Setup-Who, 08-Setup-Where
Tabs: Main (Home), 11-Home-Resume, 12-Arena-Offline, 13-Arena-Live, 14-Arena-Waiting, 15-Challenge-Sheet, 16-Rankings, 17-Profile, 18-Profile-Stats
Match: 21-Faceoff-Weight, 22-Ready-Check, 23-Countdown, 24-Live-Broadcast, 25-Result-Entry, 26-Result-Waiting, 27-Confirm, 28-Dispute, 29-Verdict
Film: 31-Film-Room, 32-Match-Detail, 33-Video-Player, 34-Highlight-Viewer, 35-Highlight-Share, 36-Athlete, 37-Compare-Stats, 38-Upload-States
Other: 41-Practice, 42-Notifications-Panel, 43-Settings, 44-Settings-Notifications, 45-Feedback, 46-Help, 47-Admin, 48-System-Overlays
(all end in `.dc.html`)

## Sample data (use consistently)

- Me: Marcus Reyes, ELO 1487, 170 LBS, Male, gym "Atos Austin" (free agent is also valid), record 14W · 6L · 1D,
  win streak 3, rank #12.
- Opponents: Dana Okafor (ELO 1512, 168 LBS), Leo Tanaka (1440, 175 LBS), Priya Shah (1395, 135 LBS),
  Sam Whitfield (1620, 185 LBS), Jordan Cruz (1301, 160 LBS).
- Last match: Marcus beat Dana by Armbar at 4:12, ranked, +18 rating. Today is Sept 29 2026.
- Keep this sample data (dates included) when redrawing a board later, so every board stays consistent
  with the ones that did not change.

## Report back (concise)

Per file: written / skipped, the source files you verified against, and anything you left out or could not
verify. No file dumps.
