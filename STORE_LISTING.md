# ELO RATED Mobile App, Store Listing Draft

Last updated: 2026-05-06 (Phase 5 B2)

This document captures the metadata required to submit ELO RATED to the Apple App Store and Google Play Store. Items marked **PLACEHOLDER** must be replaced with real values before submission.

---

## App Store Connect (iOS)

- **App Name:** ELO RATED
- **Subtitle:** BJJ Competitor Matchmaking
- **Bundle Identifier:** `com.elorated.mobile` (**PLACEHOLDER**, replace with real Apple Developer account identifier)
- **SKU:** `elorated-mobile-001`
- **Primary Category:** Sports
- **Secondary Category:** Health & Fitness
- **Content Rating:** 12+ (Frequent/Intense Sports themes)
- **Pricing:** Free

### Description (long form, up to 4000 chars)

ELO RATED is the matchmaking app for Brazilian Jiu-Jitsu practitioners. Find sparring partners at your gym, track your skill level over time, and turn open-mat sessions into structured, ranked match lobbies.

**Session-based gym lobbies.** Check in to a session at your gym to see who else is on the mats. ELO RATED pairs you with partners at your size and skill level so you spend less time looking for a roll and more time training.

**ELO-based skill rating.** Every ranked match updates your ELO rating using a weight-aware formula tuned for BJJ. Heavier opponents are weighted appropriately, draws cost both athletes some ELO (the "Pressure Score"), and your full rating history is visible from your profile.

**Built-in match recording.** Record your matches in 16:9 with audio, review them after the session, and share them with training partners. Recording is opt-in per match.

**Private and respectful.** ELO RATED does not share your training data with third parties. Match recordings stay in your account unless you explicitly share them.

### Keywords (max 100 chars total, comma separated)

`BJJ,jiu jitsu,jiu-jitsu,grappling,sparring,training,matchmaking,ELO,gym,sports`

### What's New (release notes for v0.1.0)

> Initial public beta. Find a gym, join a session, get matched with a partner, and start logging your training.

### Promotional Text (170 chars, can be updated without resubmission)

> Find sparring partners at your gym, track your skill with ELO ratings, and record your matches for review. Built for BJJ.

### Screenshots

**TODO**: Capture from a TestFlight build at the resolutions Apple requires.

- 6.7" iPhone (Pro Max, mandatory): 1290x2796
  - Dashboard
  - Gym detail with upcoming sessions
  - Session lobby with participants
  - Live match wizard (timer + camera overlay)
  - Profile with ELO history
  - Leaderboard
- 6.1" iPhone (mandatory if 6.7" is provided): 1179x2556 (same set)
- iPad 12.9": 2048x2732 (only if iPad is officially supported, currently `supportsTablet: true`)

### App Privacy (Data Collection Disclosure)

| Data Type | Used to Track? | Linked to User? | Purpose |
|-----------|----------------|-----------------|---------|
| Email address | No | Yes | Account creation, auth |
| Name (display name) | No | Yes | Athlete identity in lobbies and leaderboards |
| Photos (profile + match recordings) | No | Yes | User-uploaded content |
| Location (precise) | No | Yes | Verifying gym proximity at session check-in |
| Crash data | No | No | Diagnostics (Sentry) |
| Performance data | No | No | Diagnostics (Sentry) |
| Push token | No | Yes | Notifying about challenges and match results |

### Permission Justification (App Review Notes)

- **Camera (NSCameraUsageDescription):** Recording match videos for review.
- **Microphone (NSMicrophoneUsageDescription):** Audio component of match recordings.
- **Photo Library (Image Picker):** Setting profile picture.
- **Location When In Use (NSLocationWhenInUseUsageDescription):** Verifying that the athlete is physically at the gym before joining a session lobby.
- **Notifications:** Alerting athletes about new challenges and match outcomes.

### Privacy Policy URL

**TODO**: Host `PRIVACY_POLICY.md` at a public URL (e.g., `https://elorated.com/privacy`) and put that URL here.

### Terms of Service / EULA URL

**TODO**: Host `TERMS.md` at a public URL (e.g., `https://elorated.com/terms`) and put that URL here. The standard Apple EULA is acceptable as a fallback while a real TOS is drafted.

### App Review Contact

- **First Name:** TBD
- **Last Name:** TBD
- **Phone:** TBD
- **Email:** TBD
- **Demo Account:** Provide a working test account with `display_name`, `current_weight`, `primary_gym_id`, `gender`, and `date_of_birth` set so the reviewer can pass the activation gate and reach the dashboard.

---

## Google Play Console (Android)

- **App Name:** ELO RATED
- **Package Name:** `com.elorated.mobile` (**PLACEHOLDER**)
- **Default Language:** English (US)
- **Category:** Sports
- **Target Audience and Content:** Ages 13+
- **Content Rating:** Everyone 10+ (intense sports themes, no violence depicted)
- **Pricing:** Free, no in-app purchases

### Short Description (80 chars max)

> Find BJJ sparring partners, track ELO, and record matches at your gym.

### Full Description

(Same long-form copy as iOS App Store description above; Play Store accepts up to 4000 chars.)

### Screenshots

**TODO**: Same set as iOS, captured from an APK or AAB build.

- Phone screenshots: minimum 320px, max 3840px on the longest side, 16:9 or 9:16
- Tablet screenshots: only required if Tablet support is officially enabled
- Feature graphic: 1024x500 (required)

### Permissions Justifications (for Play Console listing)

- **CAMERA:** Recording match videos for review.
- **RECORD_AUDIO:** Audio component of match recordings.
- **ACCESS_FINE_LOCATION:** Verifying gym proximity for session check-in.
- **POST_NOTIFICATIONS** (Android 13+): Challenge and match notifications.

### Data Safety Form

Mirror the iOS privacy disclosure. Declare:
- Personal info (name, email): collected, linked to account, not sold, not shared.
- Location (approximate or precise): collected, linked to account, used only for proximity gating.
- Photos and videos: collected (profile pic + match recordings), linked to account, user-controlled sharing.
- App activity (matches, sessions, ELO): collected, linked to account.
- Crash logs and diagnostics: collected, **not** linked to account (Sentry).

### Privacy Policy URL

**TODO**: Same as iOS.

---

## Beta Distribution Plan

### TestFlight (iOS)

1. EAS Build profile: `preview` (configured in `apps/mobile/eas.json`).
2. Build command (after `eas init`): `eas build --profile preview --platform ios`.
3. Auto-submit to TestFlight: `eas submit --profile production --platform ios` (note: TestFlight uses the same App Store Connect entry; `submit` uploads the build).
4. Add internal testers (up to 100) via App Store Connect, or external testers (up to 10,000) via TestFlight Public Link after beta review.
5. EAS Update channel for OTA: `preview`.

### Play Store Internal Testing (Android)

1. EAS Build profile: `preview` (APK) or `production` (AAB for Play Store).
2. Build command: `eas build --profile preview --platform android` for internal sharing, or `eas build --profile production --platform android` for Play Store upload.
3. Submit to Internal Testing track: `eas submit --profile production --platform android`.
4. Add up to 100 internal testers by email via Play Console.
5. EAS Update channel for OTA: `preview`.

---

## Pre-launch checklist

Items the maintainer must complete before submitting to either store. Order matches the recommended completion order.

- [ ] Replace placeholder bundle ID `com.elorated.mobile` with the real Apple developer account bundle ID in `apps/mobile/app.json` (`ios.bundleIdentifier`)
- [ ] Replace placeholder Android package `com.elorated.mobile` with the real Play Console package name in `apps/mobile/app.json` (`android.package`)
- [ ] Run `eas init` from `apps/mobile/` to create the EAS project; copy the resulting project ID into `apps/mobile/app.json` at `extra.eas.projectId` (currently `PLACEHOLDER_PROJECT_ID`)
- [ ] Replace `https://u.expo.dev/PLACEHOLDER_PROJECT_ID` in `apps/mobile/app.json` (`updates.url`) with the real EAS Update URL after `eas init`
- [ ] Replace placeholder app icon (`apps/mobile/assets/icon.png`) with the production-grade branded asset (App Store: 1024x1024 RGBA, no transparency on iOS; Play Store: 512x512 PNG)
- [ ] Replace splash screen image (`apps/mobile/assets/splash-icon.png`) with the production splash artwork; verify the splash `backgroundColor` (`#bf1212`) matches brand red
- [ ] Replace the favicon (`apps/mobile/assets/favicon.png`)
- [ ] Replace the Android adaptive icon (`apps/mobile/assets/adaptive-icon.png`); verify the foreground asset has the correct safe zone (the inner 66% must hold the logo)
- [ ] Host AASA file at `https://elorated.com/.well-known/apple-app-site-association` (required for `applinks:elorated.com` Universal Links)
- [ ] Host `assetlinks.json` at `https://elorated.com/.well-known/assetlinks.json` (required for Android App Links `autoVerify`)
- [ ] Set `EXPO_PUBLIC_SENTRY_DSN` in EAS secrets (`eas secret:create --scope project --name EXPO_PUBLIC_SENTRY_DSN --value <DSN>`)
- [ ] Set `EXPO_PUBLIC_SUPABASE_URL` and `EXPO_PUBLIC_SUPABASE_ANON_KEY` in EAS secrets
- [ ] Host `PRIVACY_POLICY.md` content at a public URL and update both store listings with the link
- [ ] Host `TERMS.md` content at a public URL and update both store listings with the link
- [ ] Capture screenshots at the required resolutions for both stores (see Screenshots sections above)
- [ ] Populate the App Store Connect listing (description, keywords, support URL, marketing URL, copyright)
- [ ] Populate the Play Console listing (full description, short description, feature graphic, data safety form)
- [ ] Run `eas build --profile preview --platform all` and validate on a physical device before submitting to TestFlight or Internal Testing
- [ ] Run `eas submit --profile production --platform ios` and `eas submit --profile production --platform android` after physical-device validation
