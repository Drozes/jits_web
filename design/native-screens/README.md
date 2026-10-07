# ELO RATED Native Screens: keeping the design canvas in sync

This folder holds everything that keeps the team's main design artifact in step with the shipped
mobile app. The artifact itself lives on claude.ai, not in this repo:

**Canvas:** "ELO RATED Native Screens", https://claude.ai/artifact/PJWm2WeqsG56HS13jHsd5D
(a Claude Design canvas, created 2026-09-29). Always update it in place; never create a
replacement. The canvas policy lives in `~/code/EloRated/CLAUDE.md` section 5, and the jits_web
`CLAUDE.md` Design System section points here.

## What is on the canvas

The canvas has two pages.

- **Current app** (62 boards, dark mode, 390 px wide). A faithful drawing of the shipped
  `apps/mobile` code and nothing else: literal copy, the real tokens from `apps/mobile/lib/tokens.ts`,
  NativeWind sizes at 14 px per rem, and a fixed set of sample data. Each board is one screen in one
  state (for example "Arena: offline (Go Live)" or "Match 7: verdict summary"); a few boards show an
  overlay on top of Home (the incoming challenge sheet, the notification panel, the offline and update
  banners). This page changes only when shipped code changes. Boards 50 to 61 form the row
  "Invites, friends & location" (added at the 0.5.0 sync on 2026-10-01), drawn with the invite and
  location flags on. Board 38 "Upload states" (added 2026-10-05, owner approved) ends the Film Room
  row: one tall sheet with every state of this phone's match-video upload card (verdict and match
  page), the Film Room card upload badges, and the backgrounded-upload local notification; its
  generator is `generators/upload_states.py`. A new shipped screen may get a new board, but only with the owner's approval
  (`/canvas-sync` asks; it never adds boards silently).
- **Proposed (Sept 30 review)**. Board `00-Triage` lists every review item (accepted, declined with a
  reason, or pending) and links to the `P-*` proposal boards. When an accepted item ships, the matching
  Current app board is redrawn and its triage row is marked SHIPPED. Later review rounds add their own
  proposed page.

On the artifact, each board is a file `project/<name>.dc.html`, and `project/canvas.json` is the index
(board positions and sizes, order, pages, and row title notes).

## The drift model

The canvas follows **releases**, not commits. Redrawing boards on every commit would be slow and would
draw work that has not shipped yet. Instead:

1. **Commits made here are tagged.** The husky `post-commit` hook runs `drift.mjs --tag` in the
   background. If the commit touched a file that feeds a Current app board, or a screen file that no
   board claims, the tagger upserts one open bead labeled `canvas-drift` ("Canvas drift: native screens
   need sync"): it creates the bead the first time and afterwards appends a note with the short sha, the
   commit subject, the boards it touched, and any unmapped screen files. The hook never blocks or fails a
   commit, and it does nothing when `bd` is not installed. The bead is a convenience, not the record:
   report mode (below) is the source of truth, because some commits never reach the hook (see "Tagger
   details").
2. **Every mobile release syncs.** After an OTA update or a TestFlight build ships (`/ship-mobile` Step 4,
   `/testflight-release` Post-submit item 4), `/canvas-sync` redraws only the affected boards from the
   released code, has an independent agent review each one against the code, publishes the changed files
   to the canvas, records the released commit in `last-sync.json`, and closes the `canvas-drift` bead.
3. **A nightly routine reports drift.** A scheduled cloud agent runs `node design/native-screens/drift.mjs`
   in a fresh clone of `github.com/Drozes/jits_web` (git, node and python; no beads, no local files).
   Exit code 2 means there is unsynced drift since the last sync (boards, or changed screens that no
   board claims). It also runs `python3 design/native-screens/build-board-map.py --check`, which exits 2
   with "board map stale" when the committed `board-map.json` no longer matches the code's imports. It
   needs full history (not a shallow clone), because it diffs against the `last-sync.json` commit.

Drift between releases is expected and is not a problem on its own. It only needs action once the code
that caused it has shipped.

## Files in this folder

| File | Role |
|---|---|
| `README.md` | This overview. |
| `BUILD-SPEC.md` | The authoring spec every board follows: accuracy process, dark tokens, fonts, the 14 px rem rule, the `.dc.html` format rules, shared chrome, and the sample data. Implementer and reviewer agents read it. |
| `board-map.json` | Which repo files affect which board. The core of drift detection (see below). Generated. |
| `build-board-map.py` | Regenerates (or, with `--check`, verifies) `board-map.json` from the code's import graph at a git ref. The per-board configuration lives in its `BOARDS` table. |
| `last-sync.json` | The commit the canvas was last synced to (`commit`), when (`synced_at`), and the canvas version id of that publish (`version`). Drift is measured from `commit`. |
| `drift.mjs` | The drift detector (report mode) and the per-commit tagger (`--tag`). Node built-ins only. |
| `generators/` | The scripts that produced the first set of boards on 2026-09-29. Reference only (see below). |

Related files elsewhere in the repo: `.husky/post-commit` (runs the tagger), `.claude/commands/canvas-sync.md`
(the `/canvas-sync` command), and the release commands `.claude/commands/ship-mobile.md` and
`.claude/commands/testflight-release.md` (which call `/canvas-sync` after a release).

## board-map.json

Shape:

```json
{
  "canvas": "https://claude.ai/artifact/PJWm2WeqsG56HS13jHsd5D",
  "generated_by": "design/native-screens/build-board-map.py",
  "ignore": ["**/__tests__/**", "..."],
  "global": ["apps/mobile/lib/tokens.ts", "..."],
  "boards": {
    "12-Arena-Offline.dc.html": { "title": "Arena: offline (Go Live)", "sources": ["apps/mobile/app/(app)/(tabs)/arena/**", "..."] }
  },
  "undrawn": ["apps/mobile/app/(app)/settings/admin/flags.tsx", "..."]
}
```

- `global`: files whose change affects every board: `lib/tokens.ts`, `lib/theme/**`,
  `tailwind.config.js`, `global.css`, the root layout `app/_layout.tsx` (fonts, providers) and
  `lib/cn.ts`, plus everything they import that is drawn (their import closure). Root-layout overlays
  that only show in one state (the JS splash, the offline banner, the OTA update UI, the error boundary,
  toasts) are left out of `global` and mapped to the boards that draw them (01, 48). A global hit marks
  all 62 boards; `/canvas-sync` then checks which boards actually render differently before redrawing.
  The UI kit (`components/ui/**`, including `elo-system`) is not global: each kit file is mapped to the
  boards that import it.
- `boards`: for each of the 57 Current app boards, the repo-relative paths and globs that feed it.
- `ignore`: never counted as drift (tests, snapshots, Markdown).
- `undrawn`: screen and component files that exist but that no board draws (admin subpages, the
  video settings and realtime test screens, redirects, the share-profile sheet, unused match steps).
  Computed when the map is generated. Changes to them are not drift; a new file that no board claims
  still shows up as "unmapped".

How it was derived: each board names the route file(s) it draws (its "seeds", for example
`app/(app)/(tabs)/arena/index.tsx` for the three Arena boards). `build-board-map.py` follows every
relative, `@/` and `@jits/shared` import from the seeds and collects each component and route file
reached. An import from a barrel (an `index.ts` that re-exports, such as `@/components/ui` or
`@jits/shared/utils`) resolves to the files that define the imported names, so `import { toast } from
"@/components/ui"` maps `toast.tsx`, not the whole kit. Type-only imports are ignored. The builder reads
files from a git ref (default `HEAD`), never the working tree, so uncommitted work does not leak in. Boards that show one state of a larger screen exclude the parts they do not draw: each match
board keeps only its own wizard step, Home without the resume card excludes it, the highlight viewer
excludes the share sheet, and the notification panel only counts for board 42. When every file in a
folder is used, the folder is written as `<folder>/**` so new files added there count too.

Deliberate choices, so a reviewer can judge them:
- **Data plumbing is not traversed.** In `lib/`, only files that decide what text or state is drawn are
  kept (copy, formatting, constants, view models such as `header-chip-model.ts` or `step-router.ts`; see
  `LIB_OK` in the script). Supabase queries, stores, hooks and bootstraps are skipped, so a pure data
  change does not ask for a redraw. A data change that alters what a screen shows usually also changes
  a component, which is mapped.
- **`@jits/shared` is mapped through an allowlist.** Most of it is API calls, hooks and types, which are
  skipped, but some shared files hold copy or formatting that is drawn on boards: `utils/tos-content.ts`,
  `utils/shared.ts`, `utils/milestones.ts`, `utils/key-moments.ts`, `utils/highlight-caption.ts`,
  `utils/share.ts`, `utils/match-detection.ts` (`NO_MATCH_COPY`) and `constants/highlights.ts`
  (`SHARED_OK` in the script). Submission names come from the database, so they are not in the repo.
- **`app.json` is not mapped.** The splash board draws the JS splash (`SplashGlowStatement`), and
  `app.json` changes on every version bump.
- **Coarse spots.** `app/(app)/_layout.tsx` (stack screen options) feeds almost every signed-in board, and
  board 41 (practice lobby) maps the whole practice flow it mounts. Both err toward a false alarm rather
  than a missed change.
- **Hooks are not followed.** A string built inside a hook is missed unless listed by hand; board 35 lists
  `utils/highlight-caption.ts` explicitly for that reason (its caption comes from `use-highlight-share`).

Glob rules (`drift.mjs` matches these itself): `**` matches across folders, `*` matches within one path
segment, `?` matches one character, and everything else is literal. Parentheses and square brackets are
literal on purpose, because expo-router paths such as `app/(app)/match/[matchId].tsx` contain them;
this is why `drift.mjs` does not use Node's `path.matchesGlob`.

### Changing the map

- **A board was added, removed, or split on the canvas:** edit the `BOARDS` table in
  `build-board-map.py`, then run
  `python3 design/native-screens/build-board-map.py --canvas <scratchpad>/project/canvas.json`
  with a fresh copy of the canvas index (read with the Artifact tool). The script refuses to run when its
  table does not match the canvas's Current app page.
- **A file moved or a screen gained a component:** the map follows imports, so rerun
  `python3 design/native-screens/build-board-map.py` (titles come from the existing `board-map.json`;
  add `--ref <sha>` to build from a specific commit) and commit the result. `/canvas-sync` does this at
  HEAD, the same commit the nightly `--check` uses, so the two never disagree. `--check` reports a stale map without writing (exit 2). `drift.mjs` lists changed
  screen files that no board claims under "unmapped" and counts them as drift, which is the other signal.
- Do not hand-edit `board-map.json`; a rerun overwrites it. Put hand additions in a board's `extra` list.

## Commands

```bash
# What drifted since the last sync (exit 0 = none, 2 = drift incl. unmapped screens, 1 = error)
node design/native-screens/drift.mjs

# Machine-readable (used by /canvas-sync and the nightly routine)
node design/native-screens/drift.mjs --json

# A specific range, for example up to the commit that was released
node design/native-screens/drift.mjs --since <sha> --to <sha-or-ref>

# The per-commit tagger (the post-commit hook runs this); safe to run by hand
node design/native-screens/drift.mjs --tag

# Show the bd commands the tagger would run, without running them
CANVAS_DRIFT_DRY_RUN=1 node design/native-screens/drift.mjs --tag
CANVAS_DRIFT_DRY_RUN=1 node design/native-screens/drift.mjs --tag --commit <sha>

# Open drift bead, if any
bd list -l canvas-drift

# Regenerate the board map (from HEAD, or from a commit), or check it without writing
python3 design/native-screens/build-board-map.py
python3 design/native-screens/build-board-map.py --ref <sha>
python3 design/native-screens/build-board-map.py --check   # exit 0 up to date, 2 stale, 1 error
```

The report lists each affected board with the changed files that hit it, the global changes (if any),
the commits involved, and changed screen files that no board claims. The JSON has the same content:
`since`, `to`, `drift`, `unmapped_only` (true when no board is hit but unmapped screens changed),
`boards` (each with `file`, `title`, `files`, `via_global`), `global_hits`, `unmapped` and `commits`.

Tagger details: it looks at one commit, the one the hook passes with `--commit` (default HEAD),
compared against its first parent (a root commit is compared against the empty tree). Git only runs
`post-commit` for commits created locally with `git commit`, so some commits are never tagged: a
fast-forward pull, a clean `git merge` (including `--no-ff`, which runs `post-merge` instead), and
commits pulled from other clones. A merge whose conflicts you resolve and then `git commit` is tagged
against its first parent. The hook exits before starting the tagger while a rebase is in progress (it
checks for `rebase-merge` or `rebase-apply` in the git dir), and the tagger also skips when
`GIT_REFLOG_ACTION` mentions a rebase, because replayed commits were tagged when first made. None of
this affects the report, which diffs trees and is the source of truth.

The tagger skips a commit already noted on the bead, does nothing when `bd list` fails (a failure is
never read as "no bead"), and serializes itself with a lock in the common git dir (shared by every
worktree). The lock holds the owner's pid and counts as stale when that process is gone or after 45 s;
each `bd` call times out after 8 s. If two beads still appear, it keeps the oldest and closes the new one
as a duplicate. It swallows every error. Because it runs `bd`, the beads files `.beads/issues.jsonl` and
`.beads/interactions.jsonl` may show as modified after a commit that touched a screen; commit them with
your next beads change as usual. `HUSKY=0 git commit ...` skips the hook like any husky hook.

## Generators (reference only)

`generators/` keeps the scripts used to build the boards on 2026-09-29, so the markup patterns (shared
chrome, tokens as constants, sample data) can be reused. They are not a source of truth: the code is,
and boards have been hand-reviewed since. Run them only in a scratch directory. Output paths are
configurable: `NATIVE_SCREENS_OUT` (default `./project` under the current directory) for
`onboarding.py`, `tabs.py`, `gen_41_48.py`, `triage.py` and `layout_proposed.py`;
`NATIVE_SCREENS_MOCK_OUT` (default the current directory) for `mock/gen_scenes.py` (camera scene SVGs);
`NATIVE_SCREENS_DIR` (default the current directory, expecting `project/` and `shots/` in it) for
`measure.cjs`, which renders boards with Playwright to check heights. `build_p18.py` and `build_p42.py`
derive two proposal boards from their Current app boards and expect to run from a directory containing
`project/`. `triage.py` carries the Sept 30 review items and decisions.
