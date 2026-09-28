# ELO RATED, Highlight Reels and share funnel production release journal (2026-09-27 to 2026-09-28)

**How to read this.** This is the narrative record of one long orchestrated session that took Highlight Reels (per-athlete highlight videos cut from an uploaded match video, with an Instagram share funnel) from a local alpha to a live production feature, and fixed the production problems the launch exposed. "State at handoff" is what a new session needs. Tracker ids are beads (`bd show <id>`) in the repo named by their prefix (`jr_be-*` in jr_be, `jits-*` in jits_web).

---

## What shipped

| Area | What | Where it lives |
|---|---|---|
| Highlight Reels (backend) | After a match video is analysed, a Gemini **highlight plan** picks the best moments per athlete, and a renderer produces one vertical reel per athlete (1080x1920, name, ELO line for ranked matches, technique chip, outro). Regeneration from athlete feedback, kill switches, reaper, share-funnel RPCs and telemetry. | jr_be spec `specs/015-highlight-reels-alpha/spec.md`; worker `workers/video-slicer/src/highlights/*`; migrations `20260928*`, `20260929000000`. |
| Share funnel (mobile) | Home "new highlight" card, bell entries, reel viewer with Share / Save to Photos / Improve, pre-share caption and collaborator tip, Profile highlights row, match-page highlight card, "reel ready" push routing. | jits_web `apps/mobile/components/highlight-viewer/*`, `components/match-detail/highlight/*`, `lib/highlight/*`, `packages/shared/src/api/highlights.ts`, `highlight-share.ts`. |
| Public legal pages | `/terms` and `/privacy` on the web app (Meta requires them for Instagram Live mode). Published as-is with DRAFT label and TBD placeholders by owner decision. | jits_web `apps/web/app/(legal)/*`, `TERMS.md`, `PRIVACY_POLICY.md`. |
| Production video pipeline | Prod had never run the chunked pipeline: Edge Functions were from May (retired Gemini models), the legacy trio was live, and no Cloud Run services existed. All fixed; prod now slices, analyses, plans and renders. | jr_be `scripts/deploy/highlight-stage2.sh`, `docs/deploy/highlight-reels-stage2-prod-deploy.md`. |
| Pipeline settings in Vault | Hosted Supabase (PG 17.6) refuses `ALTER DATABASE ... SET app.settings.*`. Every pipeline setting is now a Vault secret read through `public.app_setting()` (Vault first, GUC fallback for local). This also fixed prod push, which had never fired. | jr_be migration `20260929006000_pipeline_settings_vault.sql` (jr_be-g78, jits-qokf). |
| Status guard | Uploaders could set `match_videos.status` to anything, which allowed unlimited re-slicing and Gemini spend and bypassed the re-slice ceiling. Client status transitions are now guarded. | jr_be `20260929005000_match_video_status_guard.sql` (jr_be-jv7). |
| Storage cleanup | The orphan sweep deleted `storage.objects` rows but never freed bytes. It now deletes through the Storage API via the `storage-orphan-sweep` Edge Function, with a health-check cron. | jr_be `20260929010000_orphan_sweep_storage_api.sql` (jr_be-7s9). |
| No match detected | A video with no jiu-jitsu is recognised explicitly (`match_detected` false, reason), stored without filler, skips highlight planning, and is recorded in an append-only verdict history (`match_video_match_verdicts`) that re-uploads cannot erase. Admin-only "No-match videos" list as a possible fabrication cue (signal only, no penalties). | jr_be `20260929012000_no_match_detected.sql` (jr_be-0qf); jits_web Film Room no-match state, highlight card, admin list. |
| Match-flow button fix | NativeWind's Pressable wrapper drops function-style `style` props on device, so every match-flow button rendered as bare text (both themes). New `StatePressable` and a source-scan test. | jits_web `apps/mobile/components/ui/state-pressable.tsx`. |
| Disputed verdict | The "highlight on its way" note is hidden on a disputed result. | jits_web `components/match-flow/verdict/verdict-step.tsx`. |

## Key decisions and why

- **Share ON for all users, consent risk accepted by the owner** (jr_be-17f stays open). Kill switch: `highlight_share_enabled = false` via `admin_set_feature_flag`; the drill was run on prod and passed on a device.
- **Legal pages published with DRAFT/TBD** by owner decision; the direct Instagram Reels handoff still needs a Meta App ID, and until then Share uses the iOS share sheet.
- **Vault over GUCs.** Not a preference: the platform forbids the GUC route. `app_setting()` is SECURITY DEFINER, only answers `app.settings.*` names, and is not executable by anon or authenticated.
- **No-match is a signal, not a penalty.** The owner may later use it to spot fabricated match results; the history table survives re-uploads and hard deletes for that reason. No-match uploads still count toward the daily upload cap.
- **Themes are renders, not plans.** Measured cost: about 3.5 cents per video end to end; each athlete render about 0.4 cents; the Gemini plan is shared. A 9-theme library (including a Cartoon theme) is the next workstream: see `~/code/EloRated/prompts/reel-themes-kickoff.md`.

## How it was built

Workspace policy throughout: implementers in their own worktrees, a different agent reviewing every change (several rounds found real defects: a migration that would have silently reverted a redesign fix, an unreadable light-theme share sheet, a re-upload race in the storage sweep, the client-writable status, an erasable no-match signal), and the full quality gate before every merge. The pgTAP suite was also proven on the exact prod Postgres image (`public.ecr.aws/supabase/postgres:17.6.1.063`). Twice another session shipped to `development`/`main` mid-flight (the match-flow redesign, then in-app OTA update control); both were merged in with conflicts re-homed and re-reviewed.

## Release record (2026-09-28, UTC)

1. **Stage 1.** jr_be and jits_web fast-forwarded to `development`/`main`; five highlight migrations (`20260928000000`..`20260929000000`) applied to prod by the owner after a read-only check that no live poster could be swept. Web deployed from `main` (one transient Vercel font-fetch failure; a redeploy succeeded).
2. **Critical OTA** `51f1f5bc-da5a-4939-955f-4b994a5c2bf1` (runtime 0.4.0, commit `6b9a7f4`, critical index 0 to 1): match-flow button fix and disputed-verdict note. Rollback target: `9287a1e5-f95f-4303-bb1a-2c5d76281b28`.
3. **Stage 2** via `scripts/deploy/highlight-stage2.sh` (state in `~/.local/state/highlight-stage2/`): status guard, Edge secrets and functions, legacy trio deleted, Cloud Run `video-slicer` and `video-highlights` in GCP project `gen-lang-client-0337442229` (EloRated, `northamerica-northeast1`), Vault settings helper, settings written, pipeline wired, push fixed, storage sweep deployed, flags confirmed (the owner had already flipped both flags ON at 15:57 UTC from the admin screen), smoke tests, kill-switch drill. Backfill declined.
4. **First production reels** at 19:50:57 from the owner's match `f776ed52` with sample footage (Martin.MOV) re-uploaded server-side: plan and both reels in about 3.5 minutes.
5. **No match detected** deployed (migration `20260929012000`, three functions redeployed) and verified on prod in both directions (room video false with no plan; real match true with reels). App OTA `47785b67-521b-4eac-a73c-18a1c7bb6022` (commit `6418ea9`, not critical).

## Friction worth knowing

- **Cloud Build and Cloud Run APIs lag after being enabled.** Expect PERMISSION_DENIED / SERVICE_DISABLED for a few minutes; retry.
- **Auto-mode classifier** blocks prod reads and migration pushes from the agent; the owner ran the stage-1 push and a prod check with `!`. Stage 2 ran from the agent once explicitly requested.
- **TestFlight feedback is readable** through the App Store Connect API with the key EAS already uses (`~/.appstoreconnect/private_keys/`).
- **Local PG 15 hides hosted-platform limits.** The GUC permission failure reproduces on the 17.6 image; consider moving `supabase/config.toml` to `major_version = 17`.

## State at handoff (2026-09-28)

- **Production:** jr_be `main` `405e1d4` (prod DB through `20260929012000`); jits_web `main` `6418ea9`; OTA `47785b67` on runtime 0.4.0 (build 23); both highlight flags ON; push live.
- **Open work:**
  - Reel themes library (new session): `~/code/EloRated/prompts/reel-themes-kickoff.md`.
  - jr_be-htn (P2): delete + re-insert resets the per-video re-slice ceiling.
  - jr_be-bv2 (P2): `match_videos.storage_path` not constrained to the uploader's prefix.
  - Film Room `highlight_count` should follow the playable-version model (P2, jr_be).
  - Meta App ID (direct Instagram Reels handoff), legal placeholders, `expo-clipboard` in the next TestFlight build for a Copy caption button.
  - jr_be-15c.8 is done but still blocked in the tracker by jr_be-15c.14 / jr_be-15c.3; close together at the alpha epic review.
