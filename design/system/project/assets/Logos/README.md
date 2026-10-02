# Logos

The E·R lettermark is the ELO RATED mark: a bold DM Sans Bold "E" and "R" in Terminal White with a square Signal Red interpunct between them. It was adopted on 2026-06-08 and is the app icon, the Android adaptive icon and the native splash mark.

## Inks

Every file here has hard-coded fills (no `currentColor`, no fonts; the letters are glyph outlines as `<path>`), so they render the same in any viewer.

| Part | Color | Kit token |
|---|---|---|
| Letters E and R | `#E8EDF2` Terminal White | `ink` (dark theme) |
| Interpunct square | `#E63946` Signal Red | `signal-red` |
| Ground (icon only) | `#0D0F14` Void | `void` (dark theme) |

The transparent marks (splash, adaptive foreground) are white-on-transparent: place them only on Void or another dark ground. They are not for light surfaces.

## Files

| File | What it is | Size | Canonical source |
|---|---|---|---|
| `er-lettermark-icon.svg` | Full-bleed app icon, opaque Void background rect. The durable source of the iOS app icon. | 1024 x 1024 viewBox, 968 B as stored | `design/icon-options/er-lettermark/icon.svg` |
| `er-lettermark-splash.svg` | Native splash mark, transparent, modest and centered. Also the vector source the animated `ErMark` component copies (`apps/mobile/components/ui/elo-system/er-mark.tsx`). | 1024 x 1024 viewBox, 903 B as stored | `design/icon-options/er-lettermark/splash.svg` |
| `er-lettermark-adaptive-foreground.svg` | Android adaptive icon foreground, transparent, mark pulled into the ~60% safe zone so circular masks do not clip it. Android paints the background from `android.adaptiveIcon.backgroundColor` `#0D0F14`. | 1024 x 1024 viewBox, 903 B as stored | `design/icon-options/er-lettermark/adaptive-foreground.svg` |
| `app-icon-1024.png` | The shipped 1024 px app icon, rendered from `icon.svg` with `rsvg-convert`. Opaque RGB (no alpha), as the App Store requires. | 1024 x 1024 px PNG, 12.9 KB | `apps/mobile/assets/icon.png` |

Source paths are in the jits_web repo (commit 69e2e7f). The SVGs are the durable source; the PNG is a render of `icon.svg`. Regenerate both with `design/icon-options/er-lettermark/finalize.js` and `rsvg-convert` (see that folder's README).

## When to use

- App icon, store listings, avatars for the brand account: `er-lettermark-icon.svg` (or `app-icon-1024.png` where a raster is required).
- Launch and splash screens, loading moments on Void: `er-lettermark-splash.svg`. In the app the splash mark is drawn live by `ErMark`; use this file for static designs.
- Android launcher only: `er-lettermark-adaptive-foreground.svg`.
- The icon is baked at native build time. Changing it needs a new EAS build and TestFlight submission; it cannot ship over the air.

## The wordmark has no file

"ELO RATED" is live text, not an image: Bebas Neue (`display` family), `ink`, wide tracking (`tracking-mark`), at sm 18, md 22, lg 48 or hero 72 px with line height equal to font size. Source: `apps/mobile/components/ui/elo-system/wordmark.tsx` (web twin `apps/web/components/ui/elo-system/wordmark.tsx`). Set it as type; never draw or trace it.

## Retired

The old mark, a white "E" with ascending bars and a gold `#f59e0b` peak on a red `#bf1212` rounded square (`apps/web/public/logo.svg`), is retired. It was superseded by the E·R lettermark on 2026-06-08 and is not part of this kit. Older docs that name it, or a `#bf1212` splash background, are stale: the splash ground is Void `#0D0F14`. The `design/icon-options/batch1` to `batch10` icon concepts are exploration history, not brand assets.
