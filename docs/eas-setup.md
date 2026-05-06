# EAS Build Setup

Step-by-step guide to configure EAS Build for the ELO RATED mobile app.

## Prerequisites

1. **Expo account**: create at https://expo.dev/signup
2. **Apple Developer Program** ($99/year): https://developer.apple.com/programs/
3. **Google Play Console** ($25 one-time): https://play.google.com/console/signup
4. **EAS CLI**: `npm install -g eas-cli`

## Initial Setup

```bash
cd apps/mobile

# Log in to Expo
eas login

# Initialize the EAS project (creates project on Expo servers)
eas init

# This will output a project ID. Update app.json:
# - extra.eas.projectId: <your-project-id>
# - updates.url: https://u.expo.dev/<your-project-id>
```

## Configure EAS Secrets

Set environment variables in the EAS dashboard or via CLI. These are injected at build time.

```bash
# Staging Supabase (for preview builds)
eas secret:create --scope project --name EXPO_PUBLIC_SUPABASE_URL --value <staging-url>
eas secret:create --scope project --name EXPO_PUBLIC_SUPABASE_ANON_KEY --value <staging-anon-key>

# Sentry
eas secret:create --scope project --name EXPO_PUBLIC_SENTRY_DSN --value <sentry-dsn>
```

For production builds, use EAS environment-specific secrets or override via `eas.json` env blocks.

## Build Profiles

| Profile | Purpose | Distribution | Channel |
|---------|---------|-------------|---------|
| `development` | Local dev client with simulator | Internal | development |
| `preview` | Alpha/beta testing via TestFlight + Play Internal | Internal | preview |
| `production` | Store release | Store | production |

## First Preview Build

```bash
# iOS (requires Apple Developer account)
eas build --profile preview --platform ios

# Android (produces APK for internal testing)
eas build --profile preview --platform android

# Both platforms
eas build --profile preview --platform all
```

## iOS Distribution (TestFlight)

1. First build will prompt for Apple credentials and create provisioning profiles automatically.
2. After build completes, submit to TestFlight:
   ```bash
   eas submit --platform ios --profile production
   ```
3. Or use the `ascAppId` in `eas.json` submit config (get from App Store Connect).

## Android Distribution (Internal Testing)

1. First build creates a signing keystore automatically (EAS manages it).
2. After build completes, submit to Play Console:
   ```bash
   eas submit --platform android --profile production
   ```
3. Requires a Google Cloud service account key linked to your Play Console.

## OTA Updates

Preview and production builds support EAS Update for over-the-air JS bundle updates:

```bash
# Push an update to the preview channel
eas update --channel preview --message "fix: lobby sync issue"

# Push to production
eas update --channel production --message "fix: critical rating display bug"
```

OTA updates only apply to JS/assets changes. Native module changes require a full rebuild.

## Sentry Config Plugin

The `@sentry/react-native/expo` plugin in `app.json` needs real values before the first build:

```json
[
  "@sentry/react-native/expo",
  {
    "organization": "your-sentry-org",
    "project": "your-sentry-project"
  }
]
```

Get these from your Sentry dashboard at https://sentry.io.
