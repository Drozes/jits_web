# Universal Links Setup

ELO RATED uses universal links (iOS) and App Links (Android) so that URLs on `elorated.com` open directly in the mobile app when installed.

## Overview

Two verification files live in `public/.well-known/`:

- `apple-app-site-association` (AASA) for iOS
- `assetlinks.json` for Android

These must be hosted at `https://elorated.com/.well-known/` and served over HTTPS with no redirects.

## Hosting Requirements

- Both files must be accessible at their exact paths:
  - `https://elorated.com/.well-known/apple-app-site-association`
  - `https://elorated.com/.well-known/assetlinks.json`
- The AASA file **must** be served with `Content-Type: application/json` (no file extension, so your server or CDN may need explicit configuration).
- `assetlinks.json` is served as `application/json` by default due to the `.json` extension.
- Both files must be served without any HTTP redirects.

## Replacing Placeholders

### Apple Team ID (iOS)

The AASA file contains `TEAM_ID.com.elorated.mobile`. Replace `TEAM_ID` with your actual Apple Developer Team ID.

To find your Team ID:

1. Sign in to [Apple Developer Portal](https://developer.apple.com/account).
2. Go to **Membership Details** (or **Account > Membership**).
3. Your Team ID is a 10-character alphanumeric string (e.g., `A1B2C3D4E5`).

The final `appID` value should look like: `A1B2C3D4E5.com.elorated.mobile`

### Android SHA256 Fingerprint

The `assetlinks.json` file contains `PLACEHOLDER_SHA256_FINGERPRINT`. Replace it with your app's signing certificate fingerprint.

**From a local keystore:**

```bash
keytool -list -v -keystore your-release-key.keystore -alias your-alias
```

Look for the `SHA256:` line in the output. The fingerprint looks like:
`14:6D:E9:83:C5:73:06:50:D8:EE:B9:95:2F:34:FC:64:16:A0:83:42:E6:1D:BE:A8:8A:04:96:B2:3F:CF:44:E5`

**From Google Play Console (if using Play App Signing):**

1. Go to [Play Console](https://play.google.com/console).
2. Select your app.
3. Navigate to **Setup > App signing**.
4. Copy the **SHA-256 certificate fingerprint** from the "App signing key certificate" section.

**From an EAS build:**

```bash
eas credentials -p android
```

Select the keystore and look for the SHA-256 fingerprint.

## Testing

### iOS

After deploying the AASA file, Apple's CDN caches it. You can verify with:

```bash
# Check that the file is accessible
curl -I https://elorated.com/.well-known/apple-app-site-association

# Validate via Apple's CDN (may take up to 24 hours to propagate)
curl https://app-site-association.cdn-apple.com/a/v1/elorated.com

# On a Mac with Xcode, validate the association
swcutil verify -d elorated.com -j
```

On a physical iOS device:

1. Install the app via TestFlight or a dev build.
2. Open Safari and navigate to `https://elorated.com/athlete/some-id`.
3. A banner should appear offering to open in ELO RATED.
4. Alternatively, long-press the link; "Open in ELO RATED" should appear in the context menu.

Note: universal links do not work in the iOS Simulator. You need a physical device.

### Android

```bash
# Verify the assetlinks file is accessible
curl https://elorated.com/.well-known/assetlinks.json

# On a connected device or emulator, test a link
adb shell am start -a android.intent.action.VIEW \
  -d "https://elorated.com/athlete/test-id" \
  com.elorated.mobile

# Verify Digital Asset Links (requires the app to be installed)
adb shell pm get-app-links com.elorated.mobile
```

## Supported Paths

The following URL patterns open in the mobile app:

| Pattern | Description |
|---------|-------------|
| `/athlete/*` | Athlete profile pages |
| `/session/*` | Session join, lobby, and match pages |
| `/gyms/*` | Gym detail pages |

These match the paths declared in `apps/mobile/app.json` under `ios.associatedDomains` and `android.intentFilters`.

## Troubleshooting

- **iOS links not working:** Apple caches AASA files aggressively. Changes can take up to 24 hours to propagate through Apple's CDN. Reinstalling the app forces a re-check.
- **Android links not working:** Ensure the SHA-256 fingerprint matches exactly. If using Play App Signing, use the fingerprint from the Play Console (not your local upload key).
- **Content-Type issues:** If your hosting provider does not serve the AASA file as `application/json`, configure it explicitly. For Vercel, add a `vercel.json` header rule. For Nginx, add a `location` block for the file.
