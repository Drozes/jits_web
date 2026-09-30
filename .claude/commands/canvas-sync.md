# Sync the design canvas to shipped mobile code (/canvas-sync)

Redraw the "Current app" boards of the team's main design artifact, the Claude Design canvas
"ELO RATED Native Screens" (https://claude.ai/artifact/PJWm2WeqsG56HS13jHsd5D), so they match
the mobile code that just shipped. Run it after a mobile release (OTA or TestFlight; the
`ship-mobile` Step 4 and `testflight-release` Post-submit item 4 call it), or when the user
asks to sync the canvas. The canvas follows RELEASES, not commits: between releases, the
husky post-commit hook only tags drift onto one open `canvas-drift` bead.

Background and file roles: `design/native-screens/README.md`. Authoring rules for every board:
`design/native-screens/BUILD-SPEC.md` (read it before step 3). Canvas policy:
`~/code/EloRated/CLAUDE.md` section 5. Team process (implementer and reviewer are never the
same agent): `~/code/EloRated/CLAUDE.md` section 2.

## Arguments

`$ARGUMENTS` (all optional, any order):
- a commit sha or ref: the RELEASED commit to sync to. Default: `HEAD`, but confirm with the
  user that HEAD is what shipped; never sync the canvas to unreleased work. For an OTA this is
  the HEAD the update was exported from, which must have been a clean tree; if the tree was
  dirty, sync to HEAD anyway and say in `last-sync.json`'s note that uncommitted changes shipped.
- a board list, e.g. `12-Arena-Offline 29-Verdict` (with or without `.dc.html`), or `all`:
  redraw exactly these boards instead of the drift list (the drift report is still shown
  for context). Use it to repair a board or after changing `board-map.json`.

Below, `<sha>` is the resolved full sha of the target commit and `<scratch>` is your
scratchpad directory (never a fixed tmp path, never inside the repo).

## Step 1: measure drift

From the jits_web repo root:

```
node design/native-screens/drift.mjs --to <sha> --json > <scratch>/canvas-sync/drift.json
```

- Exit 1: an error (for example the `last-sync.json` commit is missing from a shallow clone:
  `git fetch --unshallow`). Fix it and rerun; never guess the board list.
- Exit 0 means no board drift AND no unmapped screens. With no explicit board list, say
  "No canvas drift since <last-sync short sha>; nothing to sync." and STOP. Do not publish,
  do not touch `last-sync.json`.
- Exit 2: `boards` lists each affected board with the changed files that hit it
  (`via_global: true` means a global file changed, such as `lib/tokens.ts`, and every board
  is affected). `commits` lists the commits involved. `unmapped_only: true` means no board
  is affected but some changed screen files have no board (next bullet).
- `unmapped` lists changed screen files that no board claims. For each one decide: part of an
  existing board that `board-map.json` misses (fix the map: edit `BOARDS` in
  `design/native-screens/build-board-map.py` and rerun it), a screen that is deliberately not
  drawn (rerunning the builder records it under `undrawn`, which silences it; confirm with
  the user first), or a NEW screen. A new screen gets a new board only if the user
  agrees; ask, never add boards silently.

Show the user the affected boards and commits before starting work. For a global change,
first check whether it is visible at all (a hook refactor inside `lib/theme/**` often is
not); redraw only boards whose rendering actually changes, and say which you skipped and why.

## Step 2: read the live canvas right before editing

Teammates edit the canvas, so always start from the live copy, never from an older local one.
With the Artifact tool (`action: "read"`, `url` = the canvas URL,
`out_dir: "<scratch>/canvas-sync"`, so each file lands at `<scratch>/canvas-sync/project/...`):
1. `path: "project/canvas.json"`: the index (boards with `x`, `y`, `w`, `h`, `title`, optional
   `page`; `order`; `pages`; `notes`). Keep the whole object; you will change only a few keys.
2. `path: "project/<board>.dc.html"` for every board you will redraw, plus
   `project/00-Triage.dc.html` if Step 5 may apply.

Work only on those copies under `<scratch>/canvas-sync/project/`. Keep a pristine copy of
what you read (for example `cp -R <scratch>/canvas-sync/project <scratch>/canvas-sync-base`)
for the Step 7 comparison, and record the `h` of each board so you can detect height changes.

## Step 3: redraw each affected board (implementer agents)

Spawn one implementer agent per board (or per small group of related boards, for example
the three Arena states), in parallel. Each brief contains:
- the board file to edit (`<scratch>/canvas-sync/project/<board>.dc.html`), its title, and
  its canvas `w`/`h`;
- `design/native-screens/BUILD-SPEC.md` (dark theme, real tokens from
  `apps/mobile/lib/tokens.ts`, NativeWind rem = 14 px on native, literal copy, the `.dc.html`
  format rules, the shared sample data);
- the board's `sources` from `design/native-screens/board-map.json`, the files that changed,
  and the diff (`git diff <last-sync commit> <sha> -- <changed files>`);
- the rule that the code at `<sha>` is the only source of truth. If `<sha>` is not HEAD, read
  files with `git show <sha>:<path>` (or a scratch worktree), not from the working tree.

Implementers redraw what changed and re-verify the rest of the board against the code, keep
the board's state (the one named in its title), keep the sample data, keep prototype links,
edit only their own board files, never edit `canvas.json`, never publish, and report any
height change and anything they could not verify. `design/native-screens/generators/` holds
the scripts that built the boards; use them as reference for markup patterns, not as a
source of truth. `generators/measure.cjs` (Playwright, from the repo root `node_modules`)
renders boards to screenshots and measures content height.

## Step 4: independent review (mandatory)

For every changed board, a reviewer agent that did NOT draw it compares the board against the
code at `<sha>`: literal copy and casing, tokens and colors, sizes at rem = 14 px, icons,
layout order, state shown, sample data, and the format rules (the exact `support.js` line,
root element size equal to the canvas `w`/`h` and to `$preview`, all tags closed, no
script-built UI, no sticky notes or proposals on "Current app"). Findings go back to the
implementer; repeat until the reviewer reports the board clean. Never publish a board that
has not passed review.

## Step 5: triage rows that have now shipped

Open `00-Triage.dc.html` (page "Proposed"). If a change in this sync implements an ACCEPTED
review item (the beads epics `jr_be-ahn` and `jits-02vo` track them; a closed child bead is a
strong hint), mark that row SHIPPED: add a "SHIPPED <short sha>" tag in the row's decision
cell, styled like the board's existing status tags, without reordering or deleting rows.
The matching `P-*` proposal board stays as history. The triage board goes through Step 4 too.

## Step 6: update canvas.json (only if needed)

- If a board's content height changed, set its `h` (and the board root and `$preview` size)
  to the new height.
- Reflow only when a taller board would now overlap the next row on the same page: rows are
  boards sharing a `y`, with a row title note 280 px above. Shift every later row on that
  page (its boards and its note) down by the overlap, keeping the existing gap between rows.
- Keep every other key exactly as read: `order`, `pages`, `notes`, other boards,
  `designSystems`, `attachments`, `launch`, and the `page` assignment of every board.
  Never move a board between pages, never touch `page: "proposed"` entries except the
  triage board file itself.

## Step 7: publish (changed files only, to the existing canvas)

1. Re-read `project/canvas.json` and every board you changed right before publishing, with
   `out_dir: "<scratch>/canvas-sync-live"`. Diff each live file against the Step 2 copy in
   `<scratch>/canvas-sync-base/`. If a teammate changed one since Step 2, merge their change
   into your edited copy in `<scratch>/canvas-sync/project/` (for `canvas.json`, start from
   the live object and re-apply only your own `h`/`y` changes); never overwrite their work.
   A merged board goes back through Step 4.
2. Publish with the Artifact tool: `url` = the canvas URL (never omit it: a publish without
   `url` creates a new, disconnected artifact), `root` = `<scratch>/canvas-sync`, and `files`
   mapping ONLY the changed paths, for example
   `{"project/29-Verdict.dc.html": "project/29-Verdict.dc.html", "project/canvas.json": "project/canvas.json"}`.
   Include `canvas.json` only if Step 6 changed it. Never pass `null` for a board (that
   deletes it), and never pass `force`.
3. Note the version id from the publish result.

## Step 8: record the sync and close the drift bead

1. Rewrite `design/native-screens/last-sync.json`: `commit` = `<sha>` (full), `synced_at` =
   now (ISO 8601 with offset), `version` = the version id from Step 7, `note` = the boards
   redrawn (and any skipped, with the reason). Keep `canvas`.
2. Refresh the board map at HEAD so it describes the current code (drift.mjs already limits
   each comparison to its since..to range): `python3 design/native-screens/build-board-map.py`
   (it reads the HEAD commit, not the working tree). Do not pass `--ref <sha>` here, or the map
   would flip back and forth with the nightly check. Keep `board-map.json` only if it changed; the nightly
   routine runs `python3 design/native-screens/build-board-map.py --check`, which exits 2 when
   the committed map is stale.
3. Commit and push ONLY `design/native-screens/last-sync.json` and, if changed,
   `design/native-screens/board-map.json` (plus a `build-board-map.py` fix from Step 1), on
   `development`:
   `git add design/native-screens/last-sync.json design/native-screens/board-map.json`,
   `git commit -m "chore(design): sync native screens canvas to <short sha>"`, then
   `git pull --rebase && git push`. This commit is a stated exception to the "do not
   commit/push unless the user asks" guardrails in `ship-mobile` and `testflight-release`:
   the user asked for the canvas to update on every release, and these files are that
   record. Never include any other file. The dev-branch auto-commit agent may already have
   swept these files into a commit; if `git status` shows them clean, verify with
   `git log -1 -- design/native-screens/last-sync.json` that the committed content is yours
   and that it is pushed, and do not commit again.
4. Close the drift bead: `bd list -l canvas-drift --status open,in_progress --json` gives its
   id; if `node design/native-screens/drift.mjs` (now measured from the new `last-sync.json`
   to HEAD) exits 0, `bd close <id> --reason "Canvas synced to <short sha>: <boards>"`.
   If it exits 2 (commits after the release are still unsynced), leave the bead open and
   `bd note <id> "Synced to <short sha>; later commits remain for the next release."`.

## Guardrails

- Never publish a board that an independent reviewer has not passed.
- The only commit this command makes is Step 8's `last-sync.json` (and `board-map.json`) on
  `development`, which is a deliberate exception to the release commands' "do not commit/push
  unless the user asks" rule. Never commit anything else from here.
- No drift and no explicit board list: say so and stop.
- Never delete a board, never create a new artifact, never publish without the canvas `url`.
- Never add a board or change a board's page without asking the user.
- "Current app" shows shipped code only: no proposals, no sticky notes, no unreleased work.
- Draw from code, never from the old design files (`native-screen-inventory.html`,
  `wireframe.html`, the Figma, the September exploration artifacts).
- Do not use em dashes in anything written to the canvas or the repo.
