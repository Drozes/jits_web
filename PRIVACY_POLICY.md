# JITS Privacy Policy

**Last updated:** 2026-04-27 (DRAFT, requires legal review before publishing)

> **NOTE TO MAINTAINER:** This document is a placeholder. It must be reviewed by qualified legal counsel before being hosted publicly or linked from store listings. The store reviewers (Apple App Store, Google Play) will not accept a privacy policy URL that returns 404 or that does not match the data declared in App Privacy / Data Safety forms.

## 1. Who We Are

JITS ("we," "us," "our") is a mobile and web application that helps Brazilian Jiu-Jitsu practitioners find sparring partners, track skill ratings, and record matches at their gyms.

## 2. What We Collect

We collect the following categories of personal data:

- **Account data:** email address, password (hashed, never stored in plaintext), display name.
- **Profile data:** current weight (lbs), gender, date of birth, primary gym, optional profile photo.
- **Activity data:** matches played, ELO rating history, session check-ins, challenges sent and received.
- **Location data (precise):** used **only** at the moment a user opts in to a session check-in, to verify proximity to the gym. Location is not stored after the proximity check completes.
- **Device data:** Expo push notification token (used to deliver push notifications), device OS and model.
- **Diagnostics:** crash reports and performance traces via Sentry. Crash reports may contain stack traces and the app version; we configure Sentry to **not** link these to user accounts.
- **Match recordings:** when a user opts in to record a match, the resulting MP4 (or WebM, on web) is stored in our private Supabase Storage bucket and is accessible only to the participants of that match.

## 3. How We Use It

- To authenticate the user and gate access to the app.
- To match the user with appropriate sparring partners.
- To compute and display ELO ratings and statistics.
- To deliver notifications about challenges, sessions, and match results (only when the user has opted in).
- To diagnose crashes and improve stability.

## 4. Who We Share It With

- **Supabase:** our database and storage provider. Personal data is stored in their managed infrastructure under their privacy policy.
- **Sentry:** our error monitoring provider. Crash reports include stack traces and runtime data but are not linked to user accounts.
- **Expo:** our build and OTA update provider. Push notification tokens are routed through Expo's push service.

We do not sell personal data. We do not share data with advertising networks.

## 5. Your Rights

Depending on your jurisdiction, you may have the right to:

- Access, correct, or delete your personal data.
- Object to certain processing activities.
- Withdraw consent for optional features (push notifications, location, match recording).

To exercise these rights, email **TBD** (placeholder, fill in before publishing).

## 6. Data Retention

- Account data: retained until the user deletes their account.
- Match recordings: retained until the user or another participant deletes them.
- Crash reports: retained for 90 days by Sentry.
- Location: not retained beyond the proximity check.

## 7. Children

JITS is intended for users 13 and older. We do not knowingly collect data from children under 13. If you become aware that a child under 13 has provided personal data, contact us so we can delete it.

## 8. Changes

We may update this policy. Material changes will be announced in the app and via email if you have provided one.

## 9. Contact

**TBD** (placeholder for legal contact email and physical address before publishing).
