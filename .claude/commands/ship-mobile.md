# Ship a mobile change (OTA-first, with TestFlight upgrade)

Decide HOW to ship a pending ELO RATED mobile (`apps/mobile`) change and then do it:
publish an over-the-air EAS Update when the change is OTA-eligible (the default), or cut a
full TestFlight build when it is not. Invoke when the user says "ship this", "deploy the
mobile change", "release this", "push this to the app", or similar, without naming a channel.

This is the front door for mobile deploys. For an unconditional TestFlight build use the
`testflight-release` skill (this skill hands off to it). The OTA-vs-TestFlight rule this skill
encodes is also documented in `jits_web/CLAUDE.md` ("Mobile deploy: OTA vs TestFlight") and,
at policy level, in the parent `~/code/EloRated/CLAUDE.md`. Re-read the live config
(`apps/mobile/app.json`, `app.config.js`, `eas.json`, `package.json`) at the start of a run;
trust the files over anything quoted here.

## The model (say this plainly if the user is unsure)

- **TestFlight build** = a NEW native binary (EAS `production` build + App Store Connect
  submit). Slow (~10-25 min build + Apple processing). Required whenever the change touches
  the compiled app or the runtime version.
- **OTA (EAS Update)** = a new JS bundle pushed to the `expo-updates` runtime inside an
  ALREADY-INSTALLED build. Seconds-to-minutes, no Apple round trip. It **cannot** change
  native code, and it only reaches builds that (a) already embed `expo-updates` and (b) share
  the published `runtimeVersion` (policy `appVersion`, currently `expo.version`). The first
  OTA-capable build was the one that added `expo-updates` (build 19, v0.1.0).

## Step 1: classify the pending change

Determine the diff being shipped (default: current branch vs the last released commit /
`origin/development`; if ambiguous, ask the user what change they mean). Then classify.

**REQUIRES A TESTFLIGHT BUILD when the change touches the native binary or the update chain:**
- a native dependency in `apps/mobile/package.json` added / removed / version-changed
  (`expo-*`, `react-native-*`, anything with native code). A pure-JS dep bump stays OTA-ok.
- `app.json` / `app.config.js` native config: `plugins`, permissions, entitlements, `scheme`,
  bundle id, icons, native `splash`, the `ios`/`android` blocks, `updates`, `runtimeVersion`.
- a marketing `expo.version` bump (runtimeVersion `appVersion`, so bumping the version forks
  the OTA target; the new version needs a fresh build before any OTA can reach it).
- Expo SDK upgrade, `metro.config.js`, `babel.config.js`, `eas.json`, a New-Architecture /
  Hermes change, or a `react-native-reanimated` worklet/babel-plugin change (reads as JS but
  is native-bound).
- build-time / native env (credentials, anything non-`EXPO_PUBLIC_`).
- the FIRST deploy after `expo-updates` was added (a build with the runtime must exist in the
  field before any OTA can land).

**OTA-ELIGIBLE (default) when it is JS/asset-only:** JS/TS/TSX under `apps/mobile`,
`packages/shared`, JS-bundled assets, styles, copy, with NONE of the above touched. The OTA
criticality counter `apps/mobile/update-critical-index.json` and the `extra.updateCriticalIndex`
/ `extra.updateNotice` keys in `app.config.js` are JS config only and OTA-eligible; any OTHER
`app.config.js` change stays TestFlight-required.

If unsure whether a dependency is native, treat it as TestFlight-required and say so.
**Eligibility is bound to the native module set of the build already in the field:** a JS
change that calls a native API/method newer than what the installed build embeds crashes at
runtime even though no native file changed in this diff. When the JS leans on a new native
capability, build.

## Step 2: present the recommendation (ALWAYS offer the TestFlight upgrade)

Use AskUserQuestion to let the user confirm the path:
- **OTA-eligible:** recommend OTA as the default, and ALWAYS offer "Cut a TestFlight build
  instead" as an explicit alternative (the user may want the change baked into the binary or
  bundled with pending native work). State the runtimeVersion caveat: an OTA only reaches
  installed builds on the same app `version`.
- **TestFlight-required:** state that OTA is NOT eligible and WHY (cite the triggering file),
  and that a build is required. Offer "OTA anyway" only with a loud warning that the native
  part will NOT ship.

## Step 3: execute

Quality gate first, both paths (never ship on red): from repo root `npm run typecheck` and
`npm run test`; for OTA also `cd apps/mobile && npx expo export --platform ios --no-bytecode`.

- **OTA path:**
  1. `cd apps/mobile && npx eas whoami` (expect `drozes18`).
  2. Confirm an OTA-capable build is already in the field for the target channel (testers =
     `production`; internal = `preview`/`development`), AND that the channel is mapped to a
     branch (EAS dashboard / `eas channel:view <channel>`), else the update publishes but no
     build receives it. If no OTA-capable build exists yet, OTA cannot land, so route to
     `testflight-release` instead. "In the field" means SUBMITTED to App Store Connect and
     installed by testers on the SAME `expo.version` as the update's runtime, not merely
     FINISHED on EAS: check `npx eas build:view <id> --json` has a submission (or App Store
     Connect TestFlight lists it) and ask the user which version their TestFlight app shows.
     (2026-09-26: build 22, v0.3.0, finished but was never submitted; testers were on 0.2.0
     and the 0.3.0 OTA reached nobody until it was submitted.)
  3. **Criticality (default: NOT critical).** Use AskUserQuestion: "Is this update critical
     (users are blocked by a full-screen Restart prompt until they restart)?" with options
     **No (default, recommended)** / **Yes**. Treat it as critical ONLY when the user
     explicitly says so; never infer it.
     - **No:** once the update has downloaded, users see a soft, dismissible "App updated.
       Restart for the latest experience." banner. Do not touch the counter.
     - **Yes:** users get a full-screen blocking Restart modal (deferred until they leave any
       Arena match). Bump the counter with `npm run ota:critical -w @jits/mobile` (or
       `cd apps/mobile && npm run ota:critical`) and show the printed before/after
       (`updateCriticalIndex: N -> N+1`). Then commit the bumped
       `apps/mobile/update-critical-index.json` (e.g. `chore(mobile): mark OTA critical
       (index N+1)`) and push it to the release branch BEFORE publishing, so every later
       publish keeps the higher index. (A publish from a tree without the bump only loses
       criticality; it never falsely forces a restart.)
     - **Notice (optional, only meaningful when critical; default none):** ask whether to
       replace the modal body copy. If given, prefix it inline on the publish command only:
       `UPDATE_NOTICE="..." npx eas update ...`. Never `export` it into the shell; it must not
       ride later publishes or builds.
     - **Verify before publishing** (with the same `UPDATE_NOTICE` prefix, if any):
       `cd apps/mobile && npx expo config --type public --json | jq '.extra.updateCriticalIndex, .extra.updateNotice'`
       must show the intended index and notice (`null` when no notice).
  4. `npx eas update --channel <channel> --environment <env> --message "<concise change>"`
     (prefixed with `UPDATE_NOTICE="..."` only when step 3 set a notice).
     `EXPO_PUBLIC_*` are re-inlined from the EAS `--environment` (NOT `eas.json`'s
     `build.<profile>.env`), so pass the env matching the target and confirm the resolved
     values. Known trap: `build.production.env` sets `EXPO_PUBLIC_APP_ENV=staging`.
  5. Report the update group ID + EAS dashboard URL + `critical: yes/no (index N)`. Remind the
     user it downloads on the next launch or foreground; the in-app banner/modal then offers
     the restart, otherwise it applies on the next cold start (`fallbackToCacheTimeout: 0`),
     only on builds matching the runtime version.
     **Known limitation:** installs whose RUNNING bundle predates the in-app update handler
     (including the first OTA that carries it) only get the old behavior (the update applies
     on the next cold start, no banner or modal); from the following publish on, the banner and
     modal work. Builds in the field embed no `updateCriticalIndex` and read it as 0.
- **TestFlight path:** hand off to the `testflight-release` skill. Do NOT duplicate its
  pre-flight (it verifies the production Supabase env, credentials, build number, etc.).

## Guardrails

- Default to OTA ONLY when Step 1 is cleanly JS/asset-only; when in doubt, build.
- Never publish an OTA that is supposed to carry a native change; it silently will not.
- An env change does not always need a build: `EXPO_PUBLIC_*` values re-resolve on an OTA
  re-export, but native/build-time secrets do not.
- iOS / TestFlight only (Android submit is not configured). Never paste secrets, env values,
  or the `.p8` key into chat or commits.
