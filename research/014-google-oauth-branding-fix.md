# Google OAuth consent says "Continue to Jits Arena" (branding fix)

**Status:** external config change, no code change required.

## Symptom

An alpha tester reported that signing in with Google shows a consent screen
reading **"Continue to Jits Arena"** instead of "ELO RATED".

## Root cause

"Jits Arena" is **not** in this codebase. A repo-wide search finds the string
only in a design-doc comment (`apps/web/app/design/wireframe/page.tsx`), never
in any auth code. The name on Google's consent screen ("Continue to X") is
rendered by Google and comes from **external dashboard configuration**, not the
frontend:

- **Primary driver:** the **App name** on the Google Cloud OAuth consent screen,
  for the GCP project that owns the OAuth clients we use
  (`EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID`, `EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID` on
  mobile; the Supabase-managed Google provider on web). That project's app name
  is still "Jits Arena" (the product's former name).
- **Secondary:** the Supabase project's display name / Google provider config,
  which can surface on the Supabase-hosted OAuth flow used by web
  `signInWithOAuth`.

Mobile uses native sign-in (`@react-native-google-signin` ->
`supabase.auth.signInWithIdToken`), so the consent screen there is driven by the
GCP OAuth consent-screen App name directly.

## Fix (dashboards, ~5 min)

1. **Google Cloud Console** -> the project that owns the ELO RATED OAuth clients
   -> **APIs & Services -> OAuth consent screen -> Edit app**:
   - Change **App name** from "Jits Arena" to **ELO RATED**.
   - While there, set the **app logo**, **user support email**, **app domain**
     (`elorated.com`), and **developer contact** to the ELO RATED values.
   - Save. Changes can take a little while to propagate; if the app is in
     "Production"/verified status, a logo/name change may require re-verification.
2. Confirm both OAuth clients (iOS + Web) live under **this same project** so the
   updated consent screen applies to both platforms. The consent screen is
   project-wide, not per-client.
3. **Supabase Dashboard** -> the ELO RATED project:
   - **Project Settings -> General**: ensure the project name reads as expected.
   - **Authentication -> Providers -> Google**: confirm the client ID/secret
     belong to the renamed GCP project and the redirect URLs are correct.

## Verification

Re-run Google sign-in on a device/web after propagation; the consent screen
should read **"Continue to ELO RATED"**. No app rebuild is needed (the name is
fetched live from Google), though caching may delay the change briefly.
