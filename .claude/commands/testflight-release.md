# Promote the mobile app to TestFlight (build + submit)

Cut a new production iOS build of the ELO RATED mobile app on EAS and submit it to
App Store Connect / TestFlight. Invoke this when the user says anything like "promote
to TestFlight", "ship a TestFlight build", "release the iOS build", or "push a new beta".

This is iOS / TestFlight only. Android submit is not configured (the `submit.production.android`
service-account path in `eas.json` is still a placeholder), so do NOT attempt an Android submit.

## Ground truth (read the config, never hardcode)

The numbers below were true when this skill was written. **Always re-read the live config**
(`apps/mobile/eas.json`, `apps/mobile/app.json`) at the start of a run; if any of these have
drifted, trust the file and tell the user what changed.

- Working directory for all `eas` commands: `apps/mobile/`.
- EAS project: `extra.eas.projectId` in `app.json`, owner `drozes18`. `eas init` has already been run.
- Build profile: **`production`** (in `eas.json`). It sets `channel: production`, `autoIncrement: true`.
- **Build number is managed REMOTELY.** `eas.json` has `cli.appVersionSource: "remote"` and the
  production profile has `autoIncrement: true`. EAS owns the iOS build number and bumps it on every
  production build. **Do NOT edit `ios.buildNumber` in `app.json`** — it is ignored for production and
  hand-editing it just creates confusing drift. The only version field a human bumps is the marketing
  `version` (`app.json` `expo.version`, currently 0.1.0), and only when shipping a new user-facing version.
- Submit config: `submit.production.ios` already has real ASC credentials (`ascAppId`, `ascApiKeyPath`,
  `ascApiKeyId`, `ascApiKeyIssuerId`). Submit should "just work" as long as that `.p8` key file still
  exists at the path in `eas.json`.

## Pre-flight (do all of these before building)

1. **Confirm EAS auth:** `cd apps/mobile && npx eas whoami`. Expect `drozes18` (or a member of that
   account). If it errors / says logged out, stop and tell the user to run `! npx eas login` themselves.
2. **Confirm the Supabase env is set on EAS.** This is the #1 historical cause of launch-crashing
   TestFlight builds — see the comment block in `apps/mobile/app.config.js`. The production build embeds
   `EXPO_PUBLIC_SUPABASE_URL` and `EXPO_PUBLIC_SUPABASE_ANON_KEY` into the binary, and `app.config.js`
   will hard-fail the EAS build if they are missing. Verify they exist on EAS before spending a build:
   ```
   npx eas env:list --environment production
   ```
   Both keys must be present (and pointed at the PRODUCTION Supabase, not local/staging). If either is
   missing or stale, stop and have the user set it (`eas env:create` / `eas env:update`) before building.
   This is the check the user is really asking about when they ask "if we update the backend/cloud, will
   a plain 'promote to TestFlight' break?" — yes it can, if these env values weren't updated too. Always
   verify, never assume.
3. **Clean working tree on the right branch.** `git status` should be clean (or only the intended
   release changes). Builds ship whatever is committed/working; a dirty tree ships surprises. Confirm
   the branch with the user if it isn't `main`/`development` as expected.
4. **OTA criticality counter: leave it alone.** A TestFlight build embeds the current
   `extra.updateCriticalIndex` from `apps/mobile/update-critical-index.json`. Do NOT bump it for
   a build (`npm run ota:critical` is only for a critical OTA via `ship-mobile`), and do NOT set
   `UPDATE_NOTICE` in the shell or EAS env when building.
5. **Decide version vs build number.** Ask the user (or infer from their request) whether this is just a
   new build of the same version (the normal case — do nothing, EAS auto-increments the build number) or
   a new marketing version (then bump `expo.version` in `app.json` first). Default: same version, new build.

## Quality gate (mandatory — never ship on red)

Per project policy, a production mobile build runs the full gate first. From the repo root:

1. `npm run typecheck` (all workspaces).
2. `npm run test` (all workspaces).
3. `cd apps/mobile && npx expo export --platform ios --no-bytecode` — catches Metro/resolution errors
   that `tsc` misses and that would otherwise only surface as a failed (wasted) cloud build.

If any of these fail, STOP. Report the failure and do not build.

## Build + submit

Run from `apps/mobile/`. Default path is build-then-submit in one shot:

```
npx eas build --platform ios --profile production --auto-submit
```

- `--auto-submit` chains the App Store Connect submission using `submit.production.ios` once the build
  finishes, so a successful build lands in TestFlight without a second command.
- This is a cloud build; it can take 10–25 min. Don't block on it silently. Either stream/poll its
  status, or hand the user the EAS build URL that the CLI prints and check back.
- If you prefer to gate submission on a manual look at the build, split it:
  `npx eas build --platform ios --profile production` then, after it succeeds,
  `npx eas submit --platform ios --profile production --latest`.

## Post-submit

1. **Confirm it landed.** TestFlight does an automatic "Processing" pass (a few minutes to ~an hour) and
   an export-compliance check (already declared via `ITSAppUsesNonExemptEncryption: false` in `app.json`,
   so no manual compliance prompt). Tell the user it's submitted and will appear in TestFlight after
   processing; you can verify via `npx eas build:list --platform ios --limit 1` for build status.
   A FINISHED build is not a submitted one: confirm `npx eas build:view <id> --json` lists a
   submission, and if not, run `npx eas submit -p ios --id <build id> --profile production`.
   (2026-09-26: build 22 finished with no submission and sat unused while testers stayed on 0.2.0.)
   A new marketing `expo.version` also needs Beta App Review before EXTERNAL testers see it;
   internal testers get it right after processing.
2. **Update `CHANGELOG.md`** under `## [Unreleased]` (e.g. a `**Changed**` or release note line for the
   mobile area) describing the build that went out.
3. **"What to Test" notes:** EAS submit does not set TestFlight tester notes. If the user wants tester-
   facing notes, they set those in App Store Connect (or via the `--what-to-test` workflow); offer to
   draft the copy, but don't claim you pushed notes you didn't.
4. **Sync the design canvas.** Skip if this run was handed off from `ship-mobile`; its Step 4 does it.
   Otherwise run `/canvas-sync <sha>` for the commit this build was cut from, so the "Current app" page
   of the ELO RATED Native Screens canvas matches what testers now have. It is a no-op when
   `node design/native-screens/drift.mjs --to <sha>` exits 0 (no board drift AND no unmapped screens).
   `/canvas-sync` commits and pushes `design/native-screens/last-sync.json` (and `board-map.json` if it
   changed) on `development`; that is the stated exception to the commit guardrail below.

## Failure recovery

- **`app.config` missing-env error on the builder:** pre-flight step 2 was skipped or the env is stale.
  Set the production Supabase env on EAS and rebuild.
- **Submit auth failure:** the `.p8` key at `submit.production.ios.ascApiKeyPath` is missing/expired, or
  the ASC API key was revoked. Re-check the path and the key in App Store Connect; do not edit credentials
  blindly.
- **Build fails in cloud but `expo export` passed locally:** read the EAS build log (the CLI prints a URL);
  common causes are native module / pod issues that only appear in a release build.
- Never paste secrets (the `.p8`, API keys, env values) into the chat or commits.

## Guardrails

- iOS/TestFlight only; do not run Android submit until its `eas.json` service-account path is real.
- Do not hand-edit `ios.buildNumber` — EAS owns it (remote + autoIncrement).
- Do not commit/push unless the user asks (one stated exception: the `/canvas-sync` commit of
  `design/native-screens/last-sync.json` and, if changed, `board-map.json` on `development`, because the
  user asked for the canvas to update on release; only those files). If you bump `expo.version` or touch
  `CHANGELOG.md`, surface the diff and let the user decide.
