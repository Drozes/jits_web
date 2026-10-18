# Web landing page and web app lockdown (elorated.com)

> **Superseded in part by `addendum-teaser-v2.md` (landing hero, 2026-10-17).**

> **Superseded in part by jits-77yf (store badges, 2026-10-14, owner decision).** Every App Store CTA in this spec (D4, P3, P4, section 7.1 and 7.2, the `lib/app-store.ts` / `AppStoreCta` modules and the review rule that `appStoreUrl()` is the only reader) is replaced by the official App Store and Google Play badges: `apps/web/lib/app-links.ts` (`APP_STORE_URL`, `PLAY_STORE_URL`, `APP_STORE_ID`, `smartAppBanner()`) and `apps/web/components/app-links/store-badges.tsx`. The section 1 non-goal "No Android / Google Play CTA. No App Store badge artwork" no longer applies. A badge is never the red CTA: on invites "Open in app" takes the red fill (P3's swap rule is retired), and the landing hero has no red CTA. Read the rest of this spec as written.

Status: build-ready spec. Author: PM agent, 2026-10-14. Owner decisions in section 3 are final and are not reopened here.
Platform: `apps/web` (Next.js 16), plus `packages/shared` constants, four repo-root legal documents, mobile unit tests and docs. No backend change. No mobile runtime code change (the shared constant change reaches mobile later by OTA).
Branch: `feat/web-landing`, based on `origin/development` at `cc771d9c`. Every implementer reads code at that base, not a stale local `development`.
Beads: epic `jits-6si3`; children `jits-6si3.1` (T1), `jits-6si3.2` (T5), `jits-6si3.3` (T2), `jits-6si3.4` (T3), `jits-xmx6` (T4, re-parented), `jits-6si3.5` (T6), `jits-6si3.6` (T7), `jits-6si3.7` (T8). Map in section 14. Each bead references this file.


## 1. Goal

`elorated.com` went live on the Vercel project `jits_web` on 2026-10-14. The owner wants the website to be a single public landing page that sends people to the mobile app, not a working web app. This change:

1. Serves a branded, dark, full-bleed landing page at `/` for every visitor, signed in or not.
2. Locks the live web experience (login, signup, every `(app)` route) behind one environment switch, `NEXT_PUBLIC_WEB_APP_ENABLED`. Unset means locked. The string `"true"` restores today's web app exactly.
3. Adds a public `/support` page (the App Store Support URL).
4. Keeps the pages the outside world depends on: legal pages, invite landing `/c/<token>`, universal-link files, invite telemetry, and the password-reset and auth plumbing.
5. Moves every remaining `jitsweb.vercel.app` host fact in code, tests, legal documents and `CLAUDE.md` to `https://elorated.com`.

## 2. Non-goals

- No change to the mobile app's runtime code. The `WEB_APP_URL` change in `packages/shared` reaches installed apps through a later OTA (section 12).
- No Android / Google Play CTA. No App Store badge artwork (Apple's official badge needs licensing review); the CTA is a styled text button.
- No French version of the landing or support page. Only the footer links to the French legal pages.
- No change to email, SMTP, Gmail, or any Supabase Auth setting. Nothing in this work touches Supabase configuration.
- No change to `apps/mobile/store.config.json` (untracked in the main checkout, not on this branch). The owner updates the App Store Support URL by hand (section 12).
- No redesign of the `(app)` dashboard, auth pages, or legal page layout. No change to `app/manifest.ts` (its name still contains an em dash; out of scope) or the root viewport `themeColor` (the landing overrides it locally, section 7.2).
- No sitemap. No analytics or tracking on the landing page.
- No legal change other than host and URL facts. Effective and "Last updated" dates stay as they are (see open question Q1 in section 15).
- Shared links already in the wild (`elorated.com/athlete/<id>`, `/matches/<id>`) redirect to the landing page. Accepted for now; no special handling.

## 3. Decisions (owner, final)

- D1. `elorated.com` points at Vercel project `jits_web` (`apps/web`). Live 2026-10-14. `www` redirects to the apex. `jitsweb.vercel.app` still serves the same deployment.
- D2. Supabase Auth prod (`rzowigdcdojlovlwwpkx`): Site URL `https://elorated.com`; redirect allow-list `https://elorated.com/**`, `elorated://**`, `https://jitsweb.vercel.app/auth/callback`, `https://www.jitsarena.com/auth/callback`. Email, SMTP and Gmail setup must not be touched.
- D3. The website becomes a single public landing page. Login is hidden. The live web experience is blocked for everyone, including signed-in users. The web app must be restorable later by flipping one switch.
- D4. The app is TestFlight-only (App Store app id `6774629438`, not public yet). The download CTA reads the env var `NEXT_PUBLIC_APP_STORE_URL` (target value later: `https://apps.apple.com/app/id6774629438`). While it is unset the button renders as a non-link "Coming soon to the App Store" state. One helper serves both the landing and the invite pages.
- D5. Hero photo: `apps/web/public/landing/hero.jpg` (already in the worktree, untracked; 1024x1024 dark photo, two no-gi grapplers in a dark warehouse under one overhead light, red EXIT sign). Rendered with `next/image`, dark overlay, full-bleed. The implementer of task T2 commits this file.
- D6. Brand: dark first (Void `#0D0F14`), Signal Red `#E63946` for the single CTA only, Bebas Neue display, the `Wordmark` component (`apps/web/components/ui/elo-system/wordmark.tsx`), brand line "WE ARE / ELO RATED / ARE YOU?" with only "ARE YOU?" in red, tagline "What's your number?", submission-only no-gi. No em dashes in any copy. Short, data-forward copy. Footer: Terms, Privacy, Support, plus small French links.
- D7. New public `/support`: contact `info@elorated.com` (mailto), how to delete an account (in app: Settings > Delete account, or email, per `PRIVACY_POLICY.md` section 12), links to Terms and Privacy.
- D8. Lock flag `NEXT_PUBLIC_WEB_APP_ENABLED`: the exact string `"true"` enables the full web app; anything else, including unset, is locked. Implemented in the proxy (`apps/web/proxy.ts` calling `lib/supabase/proxy.ts` `updateSession`) and the public-paths module.
- D9. Locked allow-list (exact): `/` (landing for everyone, never the `(app)` shell), `/terms`, `/privacy` and their `/fr` subpaths, `/support`, `/c` and `/c/<token>/**`, `/.well-known/**`, `/api/invite-events`, `/forgot-password`, `/update-password`, `/confirm`, `/auth/callback`, `/error`. Static assets are unaffected. Everything else, including `/login`, `/signup`, `/eua`, every `(app)` route, `/design/**` and `/api/version`, redirects (307) to `/`. Unlocked behaviour is exactly today's.
- D10. Invite landing when locked: web CTAs to `/signup`, `/eua`, `/login` are replaced by "Get the app" (App Store helper) and "Open in app" (`elorated://c/<token>`). Accept-on-web actions never redirect into blocked routes.
- D11. `/forgot-password` and `/update-password` must not link to `/login` when locked.
- D12. Domain fixes in this PR: `WEB_APP_URL`, `DEFAULT_PUBLIC_ORIGIN`, the four legal documents (then `npm run legal:sync`), tests asserting `jitsweb.vercel.app`, and the stale `CLAUDE.md` production facts.
- D13. Root robots and metadata: landing title "ELO RATED: Ranked Jiu-Jitsu", description from the store listing subtitle "BJJ matches, filmed and rated". `metadataBase` resolves to `https://elorated.com` in production (`NEXT_PUBLIC_SITE_URL` will be set in Vercel).
- D14. Mobile `WEB_APP_URL` change ships later via OTA (JS-only).

### 3.1 PM decisions taken in this spec

- P1. **Routing: proxy rewrite to an internal route `/welcome`** (section 5). Chosen over a route-group restructure.
- P2. **The lock gate runs first in `updateSession`, before `hasEnvVars` and before any Supabase call.** Blocked requests and the landing rewrite never create a Supabase client. This makes the lock independent of Supabase env vars (e2e and misconfigured previews stay locked) and costs no auth round trip on the landing page.
- P3. **The coming-soon App Store state is neutral, not red.** Signal Red means "act"; a non-link cannot be acted on. On the invite page, whenever the App Store CTA would have been the red primary and the store URL is unset, "Open in app" takes the red primary styling instead, so the surface keeps exactly one actionable red CTA. On the landing page, while the store URL is unset, there is no red fill at all (only the red "ARE YOU?" brand text).
- P4. **One App Store label everywhere: "Get it on the App Store"** (the invite page's existing label, kept to avoid churn in tests and copy).
- P5. **`appStoreUrl()` accepts only an `https:` URL**; any other value (empty, whitespace, malformed, `http:`) reads as unset. The old fallback to an App Store search URL is deleted.
- P6. **Active athletes may still accept a challenge or join invite on the web** (the button is a server action on `/c/<token>`, an allowed path). Only the redirects into blocked routes change: when locked, the actions return an outcome that sends the athlete to the app instead.
- P7. **`/error` is also fixed** (it is on the allow-list and links to `/login`): when locked its button reads "Back to ELO RATED" and links to `/`.
- P8. **robots.txt must not disallow `/c/`.** Twitterbot obeys robots.txt when fetching card images, so a `/c/` disallow would kill invite link previews. `/c/<token>` already sends `X-Robots-Tag: noindex`.
- P9. **Two parsing tests keep a legacy-host case.** `invite-codes.test.ts` and `invite-link-chain.test.tsx` check that links on the old host still parse, which stays true and useful (old links exist). Their primary assertion moves to `elorated.com`, and the old-host case is kept and relabelled "legacy host". Tests that assert the output of `WEB_APP_URL` or `DEFAULT_PUBLIC_ORIGIN` move to `elorated.com` outright.
- P10. **The `/support` page lives in the `(legal)` route group** so it reuses the legal layout (wordmark header linking to `/`, Terms and Privacy nav, public `metadataBase`).

## 4. Glossary

- **Locked**: `process.env.NEXT_PUBLIC_WEB_APP_ENABLED !== "true"`. This is the default and the production state after rollout.
- **Unlocked**: `process.env.NEXT_PUBLIC_WEB_APP_ENABLED === "true"`.
- **Internal landing route**: `/welcome`, the page that renders the landing. It is never served at its own URL; the proxy rewrites `/` to it when locked and redirects direct requests for it to `/`.

## 5. Routing design: how `/` serves the landing when locked

Today `/` is `apps/web/app/(app)/page.tsx` (the dashboard) inside the gated `(app)` layout, which mounts the sidebar, bottom nav, presence, push, Arena and deployment-check bootstraps.

### 5.1 Chosen option: proxy rewrite of `/` to `/welcome`

- New route `apps/web/app/welcome/page.tsx` (outside every route group, so it gets only the root layout, never the `(app)` shell).
- When locked, `updateSession` answers a request for exactly `/` with `NextResponse.rewrite()` to `/welcome`, keeping the query string. The browser URL stays `/`. The proxy is not re-run for a rewrite target.
- A direct request for `/welcome` (or anything below it) is redirected (307) to `/` in both states, so the landing has one public URL. When locked this falls out of the allow-list (it is not on it); when unlocked an explicit rule handles it.
- When unlocked nothing about `/` changes: the request falls through to today's code and `(app)/page.tsx` renders.

### 5.2 Why not a route-group restructure

The alternative is to move the dashboard off `/` (or make a root `app/page.tsx` that renders either the landing or the dashboard) and change `(app)` so the shell is conditional. That touches the `(app)` layout, the dashboard page, every `href="/"` home link and the bottom-nav and sidebar active-state logic, and it changes what "unlocked" means. The rewrite keeps the `(app)` tree byte-for-byte unchanged, puts the whole switch in one function, and makes "unlocked" provably identical to today (the gate is skipped). It also keeps the landing page static (no cookies, no headers), so it prerenders under `cacheComponents`.

### 5.3 Why `/welcome` and not `/landing`

`/landing/hero.jpg` is a public static file. A page route at `/landing` would share a prefix with it; the proxy matcher excludes `.jpg` so it would work, but the name collision invites mistakes. `/welcome` is unused anywhere in the repo.

## 6. Route table

"Locked" is the default. "307 to /" means a redirect whose `Location` path is `/` with the query string dropped. "Today" means the current behaviour on `cc771d9c`, unchanged.

| Path | Locked | Unlocked |
|---|---|---|
| `/` (signed out) | 200, landing (rewrite to `/welcome`), no Supabase call | Today: 307 to `/login` (via `requireAthlete`; `/` is in `PUBLIC_PATHS`, the guard redirects) |
| `/` (signed in) | 200, landing, no `(app)` shell, no invite-cookie redirect | Today: dashboard |
| `/welcome`, `/welcome/**` | 307 to `/` | 307 to `/` |
| `/login`, `/signup`, `/eua` | 307 to `/` | Today |
| `(app)` routes: `/arena/**`, `/athlete/**`, `/matches/**`, `/match/**`, `/settings/**`, `/profile/**`, `/leaderboard/**`, `/gyms/**`, `/session/**`, `/messages/**`, `/notifications/**` | 307 to `/` | Today |
| `/design/**` (app route) | 307 to `/` | Today (login-gated) |
| `/api/version` | 307 to `/` | Today |
| `/terms`, `/terms/fr`, `/privacy`, `/privacy/fr` | 200, today's legal page | Today |
| `/support` (new) | 200, support page | 200, support page (added to `PUBLIC_PATHS`) |
| `/c/<token>` | 200, invite landing with locked CTAs (section 8.3) | Today's invite landing |
| `/c/<token>/opengraph-image` | 200 | Today |
| `/.well-known/**` | 200 | Today |
| `/api/invite-events` | Today (POST telemetry) | Today |
| `/forgot-password` | 200, form, no link to `/login` | Today (links to `/login`) |
| `/update-password` | 200, form; success pushes `/` (landing) | Today |
| `/confirm` | Today (verifies OTP, redirects to `next`; a blocked `next` then lands on `/`) | Today |
| `/auth/callback` | Today (code exchange; target `/` or `/c/<token>`; a blocked `next` then lands on `/`) | Today |
| `/error` | 200; button "Back to ELO RATED" to `/` | Today ("Back to sign in" to `/login`) |
| `/robots.txt` (new) | 200 | 200 |
| `/sw.js`, `/manifest.webmanifest`, `/favicon.ico`, `/icon.png`, `/apple-icon.png` | 200 (allowed explicitly) | Today |
| `/_next/**`, images (`.svg .png .jpg .jpeg .gif .webp`), `.html` files in `public/` | Untouched (excluded by the proxy matcher or allowed by prefix) | Today |
| `/__nextjs*` (dev server internals) | Allowed by prefix | Today |
| Any other path (including unknown ones) | 307 to `/` | Today (signed out: 307 to `/login`; signed in: 404) |

Note on `public/design/*.html`: these stale static design files are excluded by the proxy matcher (`.html`), so they stay publicly reachable, exactly as today. Not changed here.

## 7. Component and file plan

Paths are relative to the repo root. "New" files must follow repo conventions: kebab-case files, components under 80 lines (split if over), no em dashes in comments or copy, every async server data fetch inside `<Suspense>`, no `export const dynamic`.

### 7.1 Lock flag, allow-list, proxy, App Store helper (task T1)

**New `apps/web/lib/web-app-lock.ts`**

```ts
/** Internal route that renders the landing page; only ever served at "/". */
export const LANDING_INTERNAL_PATH = "/welcome";

/**
 * The live web app is enabled only when NEXT_PUBLIC_WEB_APP_ENABLED is the
 * exact string "true". Unset or anything else means locked (spec
 * specs/web-landing/spec.md). Read as a literal member expression so Next
 * inlines it in client bundles; changing it needs a redeploy.
 */
export function isWebAppEnabled(): boolean {
  return process.env.NEXT_PUBLIC_WEB_APP_ENABLED === "true";
}
```

The function must read `process.env.NEXT_PUBLIC_WEB_APP_ENABLED` literally (no destructuring, no `env` parameter), because Next.js only inlines literal `process.env.NEXT_PUBLIC_*` member expressions into client bundles. Tests use `vi.stubEnv`.

**Edit `apps/web/lib/supabase/public-paths.ts`**

- Add `"/support"` to `PUBLIC_PATHS` (signed-out access when unlocked). Update the header comment to mention it (App Store Support URL).
- Add:

```ts
/**
 * Paths served while the web app is locked (NEXT_PUBLIC_WEB_APP_ENABLED is
 * not "true"); every other path is redirected to "/" by the proxy. A listed
 * path also covers everything below it. "/" itself is exact and is rewritten
 * to the landing page.
 */
export const LOCKED_ALLOWED_PATHS = [
  "/terms",
  "/privacy",
  "/support",
  "/c",
  "/.well-known",
  "/api/invite-events",
  "/forgot-password",
  "/update-password",
  "/confirm",
  "/auth/callback",
  "/error",
] as const;

/** Root files the proxy matcher does not already exclude, matched exactly. */
export const LOCKED_ALLOWED_FILES = [
  "/robots.txt",
  "/sw.js",
  "/manifest.webmanifest",
  "/favicon.ico",
  "/icon.png",
  "/apple-icon.png",
] as const;

export function isLockedAllowedPath(pathname: string): boolean;
```

`isLockedAllowedPath` returns true when: `pathname === "/"`; or `pathname` is in `LOCKED_ALLOWED_FILES`; or `pathname` equals or starts with `<p>/` for a `p` in `LOCKED_ALLOWED_PATHS`; or `pathname` starts with `/_next/` or `/__nextjs`. Everything else is false. The `/fr` subpaths are covered by the prefix rule (do not list them separately in this list).

**Edit `apps/web/lib/supabase/proxy.ts` `updateSession`**: insert the gate as the first statements of the function, before the `hasEnvVars` early return:

```ts
const { pathname } = request.nextUrl;
const isLandingRoute =
  pathname === LANDING_INTERNAL_PATH || pathname.startsWith(LANDING_INTERNAL_PATH + "/");
if (isLandingRoute) return redirectHome(request);
if (!isWebAppEnabled()) {
  if (pathname === "/") {
    const url = request.nextUrl.clone();
    url.pathname = LANDING_INTERNAL_PATH; // query string kept
    return NextResponse.rewrite(url);
  }
  if (!isLockedAllowedPath(pathname)) return redirectHome(request);
}
// ...existing code unchanged from here (hasEnvVars, createServerClient, getClaims, ...)
```

`redirectHome(request)` clones `request.nextUrl`, sets `pathname = "/"` and `search = ""`, and returns `NextResponse.redirect(url)` (status 307, the default). The existing `const { pathname } = request.nextUrl;` further down must be removed or reused so there is no duplicate declaration. Nothing else in `updateSession` changes. Add a one-line comment above the gate pointing at this spec.

**Edit `apps/web/proxy.ts`**: no logic change. Update the matcher comment only if needed; the matcher itself is unchanged.

**New `apps/web/lib/app-store.ts`**

```ts
export const APP_STORE_LABEL = "Get it on the App Store";
export const APP_STORE_COMING_SOON_LABEL = "Coming soon to the App Store";

/**
 * The public App Store listing, or null while the app is not public
 * (NEXT_PUBLIC_APP_STORE_URL unset). Only an https URL counts.
 * Target value once live: https://apps.apple.com/app/id6774629438
 */
export function appStoreUrl(): string | null;
```

Reads `process.env.NEXT_PUBLIC_APP_STORE_URL` literally, trims it, returns it only if `new URL(value).protocol === "https:"` (inside try/catch), else `null`.

**New `apps/web/components/app-store/app-store-cta.tsx`** (no `"use client"` directive; usable from server and client components):

```ts
interface AppStoreCtaProps {
  /** Red Signal CTA fill when this is the surface's one primary action. */
  primary: boolean;
  /** Optional tap handler (invite telemetry). Only passed from client components. */
  onClick?: () => void;
}
export function AppStoreCta({ primary, onClick }: AppStoreCtaProps): JSX.Element;
```

- When `appStoreUrl()` returns a URL: `<a href={url} data-testid="app-store-link" onClick={onClick} style={primary ? PRIMARY_CTA : SECONDARY_CTA}>Get it on the App Store</a>`. Same tab, no `target`.
- When it returns `null`: `<span data-testid="app-store-coming-soon" style={COMING_SOON}>Coming soon to the App Store</span>`, where `COMING_SOON` is `SECONDARY_CTA` with `cursor: "default"` and `color: "var(--text-secondary)"`. It is never an `<a>` or `<button>`, never red, and has no click handler.
- Styles are imported from `apps/web/components/invites/styles.ts` (`PRIMARY_CTA`, `SECONDARY_CTA`). Do not duplicate them.

Also export `export function isAppStoreLive(): boolean { return appStoreUrl() !== null; }` from `lib/app-store.ts` for the primary-swap rule (P3).

### 7.2 Landing page (task T2)

**New `apps/web/app/welcome/page.tsx`**: a synchronous, static server component. It must not read cookies, headers, `searchParams` or the current date (so it prerenders under `cacheComponents`). It exports:

```ts
export const metadata: Metadata = {
  title: { absolute: "ELO RATED: Ranked Jiu-Jitsu" },
  description: "BJJ matches, filmed and rated. Ranked no-gi jiu-jitsu on your phone.",
  alternates: { canonical: "/" },
  openGraph: {
    title: "ELO RATED: Ranked Jiu-Jitsu",
    description: "BJJ matches, filmed and rated.",
    url: "/",
    siteName: "ELO RATED",
    type: "website",
    images: [{ url: "/landing/hero.jpg", width: 1024, height: 1024, alt: "Two grapplers on the mat under one light" }],
  },
  twitter: { card: "summary_large_image", title: "ELO RATED: Ranked Jiu-Jitsu", description: "BJJ matches, filmed and rated." },
};
export const viewport: Viewport = { themeColor: "#0D0F14" };
```

The page renders `<LandingPage />`.

**New `apps/web/components/landing/`** (split to stay under 80 lines per component):

- `landing-page.tsx`: the page root. `<main data-theme="dark" data-testid="landing">` with `background: var(--bg-primary)`, `color: var(--text-primary)`, `min-height: 100svh`. The `data-theme="dark"` island forces the brand dark tokens even if a visitor has a stored light theme (the tokens in `app/design-system/tokens.css` bind to `[data-theme="dark"]`). Composes `LandingHero`, `LandingSteps`, `LandingFooter`. Uses brand CSS variables only (no shadcn classes such as `bg-background`).
- `landing-hero.tsx`: full-bleed hero, `position: relative`, `min-height: 100svh`, `overflow: hidden`.
  - Image: `next/image` with `src="/landing/hero.jpg"`, `alt=""` (decorative; the text carries the meaning), `fill`, `priority`, `sizes="100vw"`, `style={{ objectFit: "cover", objectPosition: "center" }}`. Default quality (do not set `quality`).
  - Overlay: an absolutely positioned `div` (`aria-hidden`) over the image with `background: linear-gradient(180deg, color-mix(in srgb, var(--color-void) 45%, transparent) 0%, color-mix(in srgb, var(--color-void) 70%, transparent) 50%, var(--color-void) 100%)`. Text must meet WCAG AA contrast against the darkest-to-lightest part of the photo it sits on; the bottom-anchored content sits on the near-solid Void end.
  - Content column above the overlay (`position: relative`, `z-index: 1`), padded `max(var(--space-5), env(safe-area-inset-top))` top and `var(--space-4)` sides (16px gutter at phone width), max width 560px, left-aligned, laid out top to bottom: the `Wordmark` (`size="md"`) at the top; then, pushed to the bottom of the hero, the brand line, tagline, body, data strip and CTA.
  - Brand line: one `<h1 aria-label="We are ELO RATED. Are you?">` in `font-family: var(--font-display)` (Bebas Neue), `font-size: clamp(56px, 16vw, 112px)`, `line-height: var(--lh-display)`, three lines separated by `<br />`: "WE ARE", "ELO RATED", then "ARE YOU?" in a `<span>` with `color: var(--accent-cta-text)`. The other two lines are `var(--text-primary)`. No drop shadow.
  - Tagline `<p>`: "What's your number?" in `var(--font-heading)` 700, `var(--size-heading-m)`, `var(--text-primary)`.
  - Body `<p>`: copy L4 (section 9) in `var(--font-body)`, `var(--size-body-l)`, `var(--text-secondary)`.
  - Data strip `<p>`: copy L5 in `var(--font-mono)`, `var(--size-num-xs)`, uppercase, `letter-spacing: var(--ls-caps-l)`, `var(--text-tertiary)`.
  - CTA: `<AppStoreCta primary />`, max width 360px.
- `landing-steps.tsx`: a `<section aria-labelledby="how-it-works">` on `var(--bg-primary)`, same column and gutters. Heading `<h2 id="how-it-works">` copy L7 in mono caps `var(--text-tertiary)`. An ordered list `<ol>` of three items; each item shows the number (mono, `tabular-nums`, `var(--text-tertiary)`), a heading (`var(--font-heading)` 700, caps via style, `var(--text-primary)`) and one line of body (`var(--text-secondary)`). Items separated by a `1px solid var(--border-hairline)` rule. No icons, no images, no red.
- `landing-footer.tsx`: `<footer>` on `var(--bg-primary)`, top border `1px solid var(--border-hairline)`. Contents: `Wordmark size="sm"`; a `<nav aria-label="Legal and support">` with `next/link` links Terms (`/terms`), Privacy (`/privacy`), Support (`/support`); a small line `<p lang="fr">` "Français :" followed by links "Conditions" (`/terms/fr`) and "Confidentialité" (`/privacy/fr`); then "© 2026 ELO RATED" (a static string; never `new Date()`, which breaks prerender under `cacheComponents`). Link text `var(--text-secondary)`, underline on hover. Minimum tap target 44px tall for each link (padding).

Brand rules that apply to every landing element: no drop shadows, corners from the radius tokens (`--radius-sm` for the CTA), one red fill at most (the CTA, only when the store URL is set), red text only for "ARE YOU?", no motion (nothing animates, so no Reduce Motion work), 10px minimum text size, no horizontal scroll at 320px width.

**New `apps/web/app/robots.ts`**

```ts
export default function robots(): MetadataRoute.Robots {
  return {
    rules: { userAgent: "*", allow: "/", disallow: ["/api/", "/auth/"] },
  };
}
```

Never disallow `/c/` (P8). No `sitemap` key.

**Edit `apps/web/app/layout.tsx`** (root metadata only):

- `metadataBase: new URL(publicSiteOrigin())` (import from `@/lib/invites/site-origin`), replacing the `VERCEL_URL` / localhost `defaultUrl` logic, which is deleted. Rationale: `VERCEL_URL` is the per-deployment host behind Deployment Protection.
- `description: "BJJ matches, filmed and rated."` (replaces "Track your jiu-jitsu journey").
- Title stays `"ELO RATED"`. `viewport` stays unchanged (the landing overrides `themeColor` locally).

**Commit `apps/web/public/landing/hero.jpg`** (currently untracked in the worktree).

### 7.3 Invite landing when locked (task T3)

**Edit `apps/web/lib/invites/constants.ts`**: delete `APP_STORE_URL` and its TODO comment. Every former use goes through `AppStoreCta` / `appStoreUrl()`.

**Edit `apps/web/components/invites/app-links.tsx`**: `AppStoreButton` renders `<AppStoreCta primary={primary} onClick={() => sendLandingEvent(token, "app_store_tapped", inAppBrowser, kind)} />`. The telemetry fires only on the link (the coming-soon span has no handler). The visible label is unchanged ("Get it on the App Store").

**Edit `apps/web/components/invites/invite-landing.tsx`** (server component): read `const webAppEnabled = isWebAppEnabled()` and pass it to `InviteActions` as a new prop. In `Unavailable`, when the viewer is signed out and `!isAppStoreLive()`, render `OpenInAppButton primary` above the coming-soon state (so the section keeps an actionable red CTA); otherwise unchanged.

**Edit `apps/web/components/invites/invite-actions.tsx`**: new required prop `webAppEnabled: boolean`. Compute `const storeLive = isAppStoreLive()`. Primary-swap rule (P3): in every stack where `AppStoreButton` is `primary`, pass `primary={!storeLive}` to the `OpenInAppButton` in the same stack, and order the stack so the red element comes first (when `storeLive` is false, render `OpenInAppButton` before `AppStoreButton`). This rule applies in both lock states. Branch changes when locked (`webAppEnabled === false`):

| Viewer / state | Unlocked (today) | Locked |
|---|---|---|
| `active` | Accept button (red), Open in app, App Store | Unchanged |
| `pending` | "Finish setup to accept/join" link to `/eua?next=...` (red), Open in app, App Store | App Store (primary per swap rule), Open in app. No link to `/eua`. |
| `no_athlete` | "Finish setup" link to `/signup?next=...` (red), Open in app, App Store | Same as locked `pending`. No link to `/signup`. |
| `signed_out` | App Store (red), Open in app, Copy link, row "Sign up on web" / "Log in" | App Store (primary per swap rule), Open in app, Copy link. No "Sign up on web", no "Log in". |
| Outcome cards (`booked`, `friends`, `error`, `ready`, `retry`, `dob`) | Today | Today, plus the swap rule |

No element on the locked invite page may link to `/login`, `/signup` or `/eua`.

**Edit `apps/web/lib/invites/outcome-copy.ts`**: add

```ts
/** Locked web app: setup happens in the app, never on /eua. */
export const APP_SETUP_OUTCOME: InviteOutcome = {
  kind: "error",
  title: "Finish in the app",
  body: "Finish setting up your profile in the ELO RATED app, then open this invite there.",
};

/** Locked web app: a signed-out accept is finished in the app, never on /login. */
export const APP_SIGN_IN_OUTCOME: InviteOutcome = {
  kind: "error",
  title: "Accept in the app",
  body: "You're signed out. Open this invite in the ELO RATED app to accept.",
};
```

**Edit `apps/web/app/c/[token]/actions.ts`**:

- `finish()`: when `outcome.kind === "setup"`: if `isWebAppEnabled()` keep `redirect(withNext("/eua", invitePath(token)))`, else return `APP_SETUP_OUTCOME`.
- `claimWith()` and `acceptJoinAction()`: on `error?.hint === "not_authenticated"`: if enabled keep `redirect(withNext("/login", ...))`, else return `APP_SIGN_IN_OUTCOME`.
- `confirmDobAndClaimAction()`: on `!user`: if enabled keep the redirect, else `return APP_SIGN_IN_OUTCOME`. (Make the early return explicit so TypeScript narrowing on `user` still holds.)
- `signOutKeepInviteAction()` is unchanged (it redirects to `/c/<token>`, an allowed path).

Since `APP_SETUP_OUTCOME` and `APP_SIGN_IN_OUTCOME` are `kind: "error"`, `InviteActions` renders them through the existing outcome branch (outcome card, App Store, Open in app), with the swap rule.

### 7.4 Support page and auth link fixes (task T4)

**New `apps/web/app/(legal)/support/page.tsx`**: static server component (no cookies, headers or dates) inside the `(legal)` group, so it inherits the legal layout and its public `metadataBase`.

```ts
export const metadata: Metadata = {
  title: "Support | ELO RATED",
  description: "Contact ELO RATED, delete your account, and read our Terms and Privacy Policy.",
  alternates: { canonical: "/support" },
};
```

Body: copy S1 to S12 (section 10), structured as an `<h1>` and four `<section>`s each with an `<h2>`. Use the same typography classes as the legal documents (`components/legal/legal-document.tsx`) so the page matches the Terms and Privacy pages. The email is `<a href="mailto:info@elorated.com">info@elorated.com</a>` every time it appears. Legal links use `next/link`. If the component grows past 80 lines, split sections into `apps/web/components/support/` files.

**Edit `apps/web/components/forgot-password-form.tsx`**: render the "Already have an account? Login" block only when `isWebAppEnabled()`. When locked, nothing replaces it.

**Edit `apps/web/components/update-password-form.tsx`**: no change required (it has no `/login` link; on success it pushes `/`, which serves the landing when locked). The implementer confirms this with a grep and notes it in the PR.

**Edit `apps/web/app/(auth)/error/page.tsx`**: when locked, the button reads "Back to ELO RATED" and links to `/`; when unlocked, today's "Back to sign in" to `/login`. The two other strings that say "Please try signing in again." (`access_denied` and `DEFAULT_MESSAGE`) become "Please try again." when locked only. Extract a tiny pure helper `errorPageCopy(webAppEnabled: boolean, code?: string)` returning `{ message, backHref, backLabel }` in the same folder (`app/(auth)/error/error-copy.ts`) so it is unit-testable.

### 7.5 Domain fixes (task T5)

- `packages/shared/src/constants.ts`: `WEB_APP_URL = "https://elorated.com"`. Replace its comment with: "The public website, for links shared out of the mobile app (a match page). elorated.com serves the web deployment since 2026-10-14. While the web app is locked (NEXT_PUBLIC_WEB_APP_ENABLED not "true"), these links open the landing page."
- `packages/shared/src/utils/share.ts`: no change (both bases are now `https://elorated.com`; keep the constants).
- `packages/shared/src/api/match-flow-f1.test.ts:146`: expect `https://elorated.com/matches/M1`.
- `apps/mobile/__tests__/components/match-flow/verdict-step.test.tsx:311` and `:323`: expect `https://elorated.com/matches/M1` in both messages.
- `packages/shared/src/utils/invite-codes.test.ts:44`: assert `extractInviteFromText("https://elorated.com/c/<TOKEN>?x=1")` returns `{ token }`, and keep a second assertion, labelled legacy host, for `https://jitsweb.vercel.app/c/<TOKEN>?x=1` (P9).
- `apps/mobile/__tests__/app/invite-link-chain.test.tsx:72`: rename the case label from "interim host QR link" to "legacy host QR link" and keep its URL; add a case `["QR link", "https://elorated.com/c/${TOKEN}?src=qr", "qr"]` (P9).
- `apps/web/lib/invites/site-origin.ts`: `DEFAULT_PUBLIC_ORIGIN = "https://elorated.com"`; comment becomes "Public host fallback on a Vercel deploy with no site URL configured." Update the `publicSiteOrigin` doc comment (no "interim", no "after the domain cutover").
- `apps/web/lib/invites/site-origin.test.ts`: the "falls back to the Vercel production domain" case uses `VERCEL_PROJECT_PRODUCTION_URL: "elorated.com"` and expects `https://elorated.com`; the two `DEFAULT_PUBLIC_ORIGIN` cases keep comparing to the constant; rename "interim public host" to "default public host".
- `apps/web/app/(legal)/layout.test.ts`: the fallback case expects `https://elorated.com/` and is renamed "falls back to the default public host ...".
- Legal documents (host and URL facts only; every other character unchanged, dates unchanged):

| File:line | Replace | With |
|---|---|---|
| `TERMS.md:57` | `the ELO RATED web app (currently at jitsweb.vercel.app), the website at elorated.com,` | `the ELO RATED website and web app at elorated.com,` |
| `TERMS.md:67` | `https://jitsweb.vercel.app/privacy` | `https://elorated.com/privacy` |
| `TERMS.md:378` | `https://jitsweb.vercel.app/privacy` | `https://elorated.com/privacy` |
| `TERMS.fr.md:9` | `https://jitsweb.vercel.app/terms` | `https://elorated.com/terms` |
| `TERMS.fr.md:59` | `à l'application Web ELO RATED (actuellement à l'adresse jitsweb.vercel.app), au site Web elorated.com et` | `au site Web et à l'application Web ELO RATED à l'adresse elorated.com, et` |
| `TERMS.fr.md:69` | `https://jitsweb.vercel.app/privacy/fr` | `https://elorated.com/privacy/fr` |
| `TERMS.fr.md:380` | `https://jitsweb.vercel.app/privacy/fr` | `https://elorated.com/privacy/fr` |
| `PRIVACY_POLICY.md:7` | `https://jitsweb.vercel.app/terms` | `https://elorated.com/terms` |
| `PRIVACY_POLICY.md:34` | `- the ELO RATED web app (currently at jitsweb.vercel.app) and our website at elorated.com, including invite link pages;` | `- the ELO RATED website and web app at elorated.com, including invite link pages;` |
| `PRIVACY_POLICY.fr.md:7` | `https://jitsweb.vercel.app/privacy` | `https://elorated.com/privacy` |
| `PRIVACY_POLICY.fr.md:9` | `https://jitsweb.vercel.app/terms/fr` | `https://elorated.com/terms/fr` |
| `PRIVACY_POLICY.fr.md:36` | `- l'application Web ELO RATED (actuellement à jitsweb.vercel.app) et notre site Web à elorated.com, y compris les pages de liens d'invitation;` | `- le site Web et l'application Web ELO RATED à elorated.com, y compris les pages de liens d'invitation;` |

  Then run `npm run legal:sync` from the repo root and commit the regenerated `packages/shared/src/legal/documents.generated.ts`. After the edits, `grep -rn "jitsweb.vercel.app" TERMS*.md PRIVACY*.md packages/shared/src/legal` must return nothing.

### 7.6 End-to-end tests (task T6)

See section 11.3. Files: `apps/web/playwright.config.ts`, `apps/web/e2e/smoke.spec.ts`, `apps/web/e2e/invite-landing.spec.ts`, new `apps/web/e2e/landing-lock.spec.ts`.

### 7.7 Docs (task T7)

- `CLAUDE.md` (jits_web), "Production environment facts": replace the bullet starting "**Web prod URL is `https://jitsweb.vercel.app`**" with: web prod URL is `https://elorated.com` (live 2026-10-14; `www` redirects to the apex; `https://jitsweb.vercel.app` still serves the same deployment); Vercel team `matthew-sponagles-projects`, project `jits_web`, deploys from `main`; the site is a public landing page while `NEXT_PUBLIC_WEB_APP_ENABLED` is unset (spec `specs/web-landing/spec.md`); to restore the web app set it to `true` in Vercel Production and redeploy. Replace the Supabase bullet's "Redirect allow-list ... unverified" with the D2 facts (Site URL and allow-list as of 2026-10-14; SMTP and Google client IDs still unverified, jits-wn5g). In the invites prerequisites bullet, mark "`elorated.com` DNS to Vercel (jits-x1t2)" done (2026-10-14). In "Pre-launch blockers", the universal-link files now serve on `https://elorated.com/.well-known/`.
- `CLAUDE.md` "Routes": replace the sentence "...`apps/web/proxy.ts`, which refreshes the Supabase session and holds a public-path allowlist, but issues no hiding redirects" with a statement that `apps/web/proxy.ts` refreshes the session, holds the public-path allowlist, and, while the web app is locked (`NEXT_PUBLIC_WEB_APP_ENABLED` not `"true"`), rewrites `/` to the landing (`/welcome`) and redirects every path outside `LOCKED_ALLOWED_PATHS` to `/`. Add one bullet: "Web lockdown (2026-10-14): see `specs/web-landing/spec.md`; the App Store CTA reads `NEXT_PUBLIC_APP_STORE_URL` through `apps/web/lib/app-store.ts` and shows 'Coming soon to the App Store' while it is unset."
- `CHANGELOG.md` under `## [Unreleased]`, area **Web**: **Added** landing page (`apps/web/app/welcome/page.tsx`, `apps/web/components/landing/`), `/support` (`apps/web/app/(legal)/support/page.tsx`), `apps/web/app/robots.ts`, `apps/web/lib/web-app-lock.ts`, `apps/web/lib/app-store.ts`, `apps/web/components/app-store/app-store-cta.tsx`; **Changed** proxy lock gate and allow-list, invite landing CTAs when locked, root `metadataBase` and description, `WEB_APP_URL` and `DEFAULT_PUBLIC_ORIGIN` to `https://elorated.com`, legal documents' host facts; **Removed** `APP_STORE_URL` and its App Store search fallback. No em dashes.
- No other doc is edited. `jits_web/AGENTS.md` is unchanged.

## 8. Behaviour details

### 8.1 Flag reading

- The flag and the store URL are `NEXT_PUBLIC_*` values, inlined at build time into client bundles and read at runtime by the proxy and server code. Treat a change as effective only after a redeploy. "Flipping the switch" means: set or unset the Vercel env var for Production, then redeploy.
- Every reader goes through `isWebAppEnabled()` and `appStoreUrl()`. No other file reads `process.env.NEXT_PUBLIC_WEB_APP_ENABLED` or `process.env.NEXT_PUBLIC_APP_STORE_URL` (a grep in review must confirm this).

### 8.2 Proxy order (locked)

1. `/welcome` or below: 307 to `/`.
2. `/`: rewrite to `/welcome` (query kept). No Supabase client, no `getClaims`, no invite-cookie handling.
3. Not in the allow-list: 307 to `/` (query dropped). No Supabase call.
4. Allowed: today's code runs unchanged (session refresh, signed-out redirect to `/login` for non-public paths, which cannot trigger because every allowed path is also in `PUBLIC_PATHS`; invite landing side effects on `/c/<token>`; invite-cookie attribution on allowed pages).

Invariant to test: every entry of `LOCKED_ALLOWED_PATHS` is also public under `isPublicPath` (otherwise a signed-out visitor would be sent to `/login` and bounce to `/`).

### 8.3 Invite page, locked

- Signed-out visitors and athletes without a finished profile are sent to the app. Active athletes can still accept on the web (P6).
- A signed-in athlete with a pending `er_invite` cookie who visits an allowed page (for example `/terms`) is still redirected to `/c/<token>` by the existing cookie plan. That path is allowed, so this keeps working.

### 8.4 Auth plumbing, locked

- Password reset from the web: `/forgot-password` sends the Supabase email with `redirectTo` `<origin>/update-password` (allowed); `/update-password` saves and pushes `/` (landing). Mobile password reset uses `elorated://reset-password` and is unaffected.
- `/auth/callback` and `/confirm` keep working; if their `next` points at a blocked path, the follow-up request is redirected to `/` by the gate.

## 9. Copy deck: landing page (final strings)

Write each string exactly as shown. No em dashes, no exclamation marks, no emoji. The `·` is a middle dot (U+00B7).

| Id | Element | String |
|---|---|---|
| L1 | `<title>` and og/twitter title | `ELO RATED: Ranked Jiu-Jitsu` |
| L2 | meta description | `BJJ matches, filmed and rated. Ranked no-gi jiu-jitsu on your phone.` |
| L2b | og/twitter description, root layout description | `BJJ matches, filmed and rated.` |
| L3a | Brand line, line 1 | `WE ARE` |
| L3b | Brand line, line 2 | `ELO RATED` |
| L3c | Brand line, line 3 (red text) | `ARE YOU?` |
| L3d | Brand line `aria-label` | `We are ELO RATED. Are you?` |
| L3e | Tagline | `What's your number?` |
| L4 | Body | `BJJ matches, filmed and rated. Go live, roll, confirm the result. Your ELO moves.` |
| L5 | Data strip | `NO-GI · SUBMISSION ONLY · EVERY MATCH RANKED` |
| L6a | CTA, store URL set (link) | `Get it on the App Store` |
| L6b | CTA, store URL unset (non-link) | `Coming soon to the App Store` |
| L7 | Steps heading | `HOW IT WORKS` |
| L8a | Step 1 number / heading / body | `01` / `Go live` / `Show the room you're ready to roll.` |
| L8b | Step 2 number / heading / body | `02` / `Roll` / `Challenge someone on the mat. Your phone films the match.` |
| L8c | Step 3 number / heading / body | `03` / `Get rated` / `You both confirm the result. Beat someone bigger, earn more.` |
| L9a | Footer links | `Terms` / `Privacy` / `Support` |
| L9b | Footer French line | `Français :` then `Conditions` / `Confidentialité` |
| L9c | Footer copyright | `© 2026 ELO RATED` |
| L10 | Footer nav `aria-label` | `Legal and support` |

Copy notes: no "AI" wording anywhere on the page (owner decision 2026-10-07 hides AI wording until move labels are accurate). "Beat someone bigger, earn more" reflects the weight-aware rating (the heavier athlete carries +50 phantom ELO per IBJJF division gap). Step headings are written in sentence case and uppercased by style.

## 10. Copy deck: `/support` (final strings)

| Id | Element | String |
|---|---|---|
| S0 | `<title>` | `Support | ELO RATED` |
| S0b | meta description | `Contact ELO RATED, delete your account, and read our Terms and Privacy Policy.` |
| S1 | `<h1>` | `Support` |
| S2 | Intro | `Questions about ELO RATED, your account or a match? Email us.` |
| S3 | `<h2>` | `Contact` |
| S4 | Body | `Email info@elorated.com. Write from the email address on your account if you can, so we can find it.` (the address is a mailto link) |
| S5 | `<h2>` | `Delete your account` |
| S6 | Body | `In the app, go to Settings > Delete account. Deletion cannot be undone, and you cannot delete your account in the middle of a live match.` |
| S7 | Body | `No app, or can't sign in? Email info@elorated.com from the email address on your account. We will verify the request and delete the account for you.` (mailto link) |
| S8 | Body | `Your match results stay on a de-identified "Deleted athlete" record so your opponents' ratings stay accurate. Section 12 of our Privacy Policy explains what is deleted and what is kept.` ("Privacy Policy" links to `/privacy#section-12`; the legal renderer emits `h2#section-<n>` anchors, as the `/terms#section-5` e2e test proves) |
| S9 | `<h2>` | `Report a problem` |
| S10 | Body | `To report content or an athlete, email info@elorated.com with the display name, the match and what happened. If anyone is in immediate danger, contact local emergency services first.` (mailto link) |
| S11 | `<h2>` | `Legal` |
| S12 | Links list | `Terms of Service` (`/terms`), `Privacy Policy` (`/privacy`), `Conditions d'utilisation` (`/terms/fr`, `lang="fr"`), `Politique de confidentialité` (`/privacy/fr`, `lang="fr"`) |

Sources: S6 and S7 paraphrase `PRIVACY_POLICY.md` section 12 and `TERMS.md` 21.1; S8 paraphrases `TERMS.md` 21.3; S10 paraphrases `TERMS.md` 11.1. The support page makes no promise about response times.

### 10.1 Other copy changed by this spec

| Id | Where | String |
|---|---|---|
| I1 | `APP_SETUP_OUTCOME` title / body | `Finish in the app` / `Finish setting up your profile in the ELO RATED app, then open this invite there.` |
| I2 | `APP_SIGN_IN_OUTCOME` title / body | `Accept in the app` / `You're signed out. Open this invite in the ELO RATED app to accept.` |
| E1 | `/error` button, locked | `Back to ELO RATED` |
| E2 | `/error` messages, locked | `access_denied`: `Access was denied. Please try again.`; default: `Something unexpected happened. Please try again.` |

## 11. Test plan

The full quality gate must pass before any commit is called done: root `npm run typecheck`, root `npm run test`, root `npm run build:web`, and `cd apps/web && npm run test:e2e`. The Husky pre-commit hook runs typecheck and tests.

### 11.1 Unit tests (vitest, `apps/web`)

Every test that depends on the flag sets it explicitly with `vi.stubEnv("NEXT_PUBLIC_WEB_APP_ENABLED", ...)` and restores with `vi.unstubAllEnvs()` in `afterEach`. Same for `NEXT_PUBLIC_APP_STORE_URL`.

1. `lib/web-app-lock.test.ts`: `isWebAppEnabled()` is true only for `"true"`; false for unset, `""`, `"false"`, `"1"`, `"TRUE"`, `" true"`.
2. `lib/app-store.test.ts`: `appStoreUrl()` returns null for unset, `""`, `"   "`, `"not a url"`, `"http://apps.apple.com/app/id6774629438"`; returns the trimmed value for `" https://apps.apple.com/app/id6774629438 "`. `isAppStoreLive()` mirrors it.
3. `lib/supabase/public-paths.test.ts` (extend):
   - `isLockedAllowedPath` true for: `/`, `/terms`, `/terms/fr`, `/privacy`, `/privacy/fr`, `/support`, `/c/abc`, `/c/abc/opengraph-image`, `/.well-known/apple-app-site-association`, `/api/invite-events`, `/forgot-password`, `/update-password`, `/confirm`, `/auth/callback`, `/error`, `/robots.txt`, `/sw.js`, `/manifest.webmanifest`, `/_next/static/x.js`, `/__nextjs_original-stack-frame`.
   - false for: `/login`, `/signup`, `/eua`, `/arena`, `/athlete/1`, `/matches/1`, `/settings`, `/profile`, `/design`, `/design/board`, `/api/version`, `/welcome`, `/termsx`, `/supportx`, `/cx`, `/auth`, `/auth/other`, `/robots.txt/x`.
   - Invariant: every `LOCKED_ALLOWED_PATHS` entry and `/` satisfy `isPublicPath`.
   - `isPublicPath("/support")` is true.
4. `lib/supabase/proxy.test.ts` (extend):
   - Existing describe blocks (invite cookie branch, which request `/`, `/eua`, `/signup`) stub the flag to `"true"` in `beforeEach`, so they keep testing today's behaviour.
   - New describe "web app locked (flag unset)":
     - `/` signed out and `/` signed in: response carries `x-middleware-rewrite` whose pathname is `/welcome`; `getClaims` is not called; no `Location` header.
     - `/?utm_source=x`: the rewrite URL keeps `?utm_source=x`.
     - Each of `/login`, `/signup`, `/eua`, `/arena`, `/athlete/a1`, `/matches/m1`, `/settings`, `/design/board`, `/api/version`, `/welcome`, `/unknown`: status 307, `Location` pathname `/`, empty search (test with `?next=/arena`), `getClaims` not called.
     - `/c/<TOKEN>`: `applyLandingSideEffects` is called (falls through to today's code).
     - `/terms`, `/support`, `/forgot-password` signed out: no `Location` header.
     - A signed-in GET of `/terms` with an `er_invite` cookie for an open challenge still redirects to `/c/<TOKEN>` (cookie plan unchanged).
   - New describe "web app unlocked (flag "true")":
     - `/` signed out: 307 to `/login` is NOT asserted here (that redirect comes from `requireAthlete` in the page, not the proxy); assert no rewrite header and that `getClaims` is called.
     - `/arena` signed in: no `Location`, no rewrite.
     - `/arena` signed out: 307 to `/login`.
     - `/welcome`: 307 to `/`.
     - `/support` signed out: no `Location`.
5. `components/app-store/app-store-cta.test.tsx`: with the URL set, renders a link with the URL and label and red primary style when `primary`; calls `onClick` on click. With the URL unset, renders `data-testid="app-store-coming-soon"` with the coming-soon label, no `a` or `button` element, and never the red fill even when `primary`.
6. `components/invites/invite-actions.test.tsx` (extend; keep the dob tests, which now pass `webAppEnabled`):
   - Locked, each of `signed_out`, `no_athlete`, `pending`: no link whose `href` starts with `/login`, `/signup` or `/eua`; an Open in app link to `elorated://c/<token>` exists.
   - Unlocked: `signed_out` shows "Sign up on web" (`/signup?next=...`) and "Log in"; `pending` shows the `/eua?next=...` link; `no_athlete` the `/signup?next=...` link.
   - Swap rule: store URL unset, `signed_out`: the Open in app link has the red primary style and comes before the coming-soon element; store URL set: the App Store link is red and Open in app is not.
7. `app/c/[token]/actions.test.ts` (extend; existing redirect cases stub the flag `"true"`):
   - Locked: `claimInviteAction` with `not_authenticated` returns `APP_SIGN_IN_OUTCOME` and does not call `redirect`; a claim whose outcome is `setup` returns `APP_SETUP_OUTCOME`; `acceptJoinAction` with `not_authenticated` returns `APP_SIGN_IN_OUTCOME`; `confirmDobAndClaimAction` with no user returns `APP_SIGN_IN_OUTCOME`.
   - Unlocked: the existing redirect expectations still hold.
8. `components/landing/landing-page.test.tsx`: renders the `h1` with accessible name "We are ELO RATED. Are you?", the strings L3e, L4, L5, L7, L8a to L8c; the hero image has `alt=""`; footer links have hrefs `/terms`, `/privacy`, `/support`, `/terms/fr`, `/privacy/fr`; no element has an `href` containing `/login` or `/signup`; coming-soon element when the store URL is unset, link when set. `next/image` may be mocked to a plain `img`.
9. `app/(legal)/support/page.test.tsx`: renders S1, a `mailto:info@elorated.com` link, the text "Settings > Delete account", and links to `/terms`, `/privacy`, `/terms/fr`, `/privacy/fr`.
10. `components/forgot-password-form.test.tsx`: locked, no link to `/login`; unlocked, the "Login" link to `/login` exists.
11. `app/(auth)/error/error-copy.test.ts`: locked returns `{ backHref: "/", backLabel: "Back to ELO RATED" }` and the E2 messages; unlocked returns today's values.
12. `app/robots.test.ts`: `rules.disallow` does not include any `/c` entry and includes `/api/` and `/auth/`.
13. Updated host tests from section 7.5 (shared, mobile, site-origin, `(legal)` layout). `packages/shared/src/legal/documents.test.ts` must pass after `legal:sync` (it fails while the generated file is stale).

### 11.2 Mobile and shared

Root `npm run test` runs them. No mobile runtime file changes; only the two mobile test files in section 7.5.

### 11.3 End-to-end (Playwright, `apps/web`)

**Config (`playwright.config.ts`)**: pass the flag and store URL through to the dev server so the server and the tests agree:

```ts
env: {
  E2E_INVITE_FIXTURES: "1",
  NEXT_PUBLIC_WEB_APP_ENABLED: process.env.NEXT_PUBLIC_WEB_APP_ENABLED ?? "",
  NEXT_PUBLIC_APP_STORE_URL: process.env.NEXT_PUBLIC_APP_STORE_URL ?? "",
},
```

Add a comment that `reuseExistingServer` reuses a running dev server with whatever env it was started with: stop any running dev server before switching flag states. Each spec file computes `const WEB_APP_ENABLED = process.env.NEXT_PUBLIC_WEB_APP_ENABLED === "true"` and `const STORE_LIVE = !!process.env.NEXT_PUBLIC_APP_STORE_URL`.

**`e2e/smoke.spec.ts`**: wrap the existing "Public pages" login/signup tests and the whole "Auth redirects" describe in `test.skip(!WEB_APP_ENABLED, "web app locked: see specs/web-landing/spec.md")`. Keep the "forgot password page renders" test running in both states. Keep "Public legal pages" running in both states.

**New `e2e/landing-lock.spec.ts`** (whole file skipped when `WEB_APP_ENABLED`):

1. `/` returns 200, `page.url()` pathname stays `/`, title is `ELO RATED: Ranked Jiu-Jitsu`, the `h1` named "We are ELO RATED. Are you?" is visible, "What's your number?" is visible, the coming-soon element is visible (when `!STORE_LIVE`), no link on the page points to `/login` or `/signup`, footer links have the expected hrefs.
2. Phone width (390x844): no horizontal overflow (`scrollWidth - clientWidth <= 0`), as in the Instagram test; save a full-page screenshot to `test-results/landing-390.png`.
3. Desktop project: the hero image is loaded (`img` inside the hero has `naturalWidth > 0`).
4. Blocked matrix with `request.get(path, { maxRedirects: 0 })`: `/login`, `/signup`, `/eua`, `/arena`, `/profile`, `/settings`, `/athlete/00000000-0000-4000-8000-000000000000`, `/matches/00000000-0000-4000-8000-000000000000`, `/design`, `/api/version`, `/welcome`, `/unknown-page`: status 307 and `new URL(location, baseURL).pathname === "/"`.
5. Allowed pages render without redirect (status 200, pathname unchanged): `/terms`, `/terms/fr`, `/privacy`, `/privacy/fr`, `/support`, `/forgot-password`, `/update-password`, `/error`.
6. `/robots.txt` is 200 and contains `User-agent: *`; `/manifest.webmanifest` and `/sw.js` are 200 with `maxRedirects: 0`.
7. `/forgot-password` has no link to `/login`. `/error` has a link "Back to ELO RATED" to `/`.
8. `/support` shows a `mailto:info@elorated.com` link and "Settings > Delete account".
9. `/confirm` (no params) ends on `/error`; `/auth/callback` (no code) ends on `/error` (both allowed, both today's behaviour).

**`e2e/invite-landing.spec.ts`**:

- Challenge test: when `WEB_APP_ENABLED`, keep the "Sign up on web" assertion; when locked, assert no link with name "Sign up on web" or "Log in" exists. Replace the "get it on the app store" link assertions with a helper: when `STORE_LIVE`, the link is visible; else `getByTestId("app-store-coming-soon")` is visible.
- Unavailable test: same helper.
- "signup on the invite path shows the banner..." test: `test.skip(!WEB_APP_ENABLED, ...)` (it loads `/signup`, which is blocked when locked).
- All other invite tests (OG image, AASA, invite-events, Instagram) run in both states unchanged.

**Runs required before merge**:

1. Mandatory (the gate): `cd apps/web && npm run test:e2e` with both env vars unset (locked, coming soon).
2. Recommended, record the result in the PR: `NEXT_PUBLIC_WEB_APP_ENABLED=true npm run test:e2e` after stopping any running dev server, to prove the restore path. Today's auth-redirect tests need Supabase env vars in `apps/web/.env.local`; if absent, note that in the PR rather than skipping silently.

### 11.4 Manual production-build check (before merge to `main`)

`npm run build:web`, then `cd apps/web && npx next start --port 4983` with the flag unset, and check with curl: `curl -sI localhost:4983/` (200, no `Location`), `curl -sI localhost:4983/login` (307, `location: /`), `curl -sI localhost:4983/welcome` (307), `curl -s localhost:4983/ | grep -c "ARE YOU?"` (at least 1), `curl -sI localhost:4983/c/<any token>` (200). This proves the rewrite works on a production build, not only on `next dev`. Record the output in the PR.

## 12. Rollout

1. Implement, review and pass the gate on `feat/web-landing`; open a PR into `development` (do not push to `main` directly).
2. Vercel project `jits_web`, Production environment, before the `main` deploy:
   - Set `NEXT_PUBLIC_SITE_URL=https://elorated.com`.
   - Confirm `NEXT_PUBLIC_WEB_APP_ENABLED` is NOT set (Production and Preview).
   - Check `NEXT_PUBLIC_APP_STORE_URL`. It may already be set from the invites work (CLAUDE.md lists it as an invites prerequisite). If it holds anything other than the real public listing, remove it so the page shows "Coming soon to the App Store". When the listing is public, set it to `https://apps.apple.com/app/id6774629438` and redeploy.
3. Merge `development` into `main`; Vercel deploys production. Any later env change needs a redeploy to take effect (`NEXT_PUBLIC_*` is build-time).
4. Verify production: `https://elorated.com/` shows the landing (signed out, and signed in from a browser that has a web session); `/login` and `/arena` 307 to `/`; `/support`, `/terms`, `/privacy`, `/terms/fr`, `/privacy/fr` render; `/.well-known/apple-app-site-association` is JSON; a real `/c/<token>` renders with no web sign-up links; `https://www.elorated.com/` redirects to the apex; `https://jitsweb.vercel.app/` shows the same landing.
5. App Store Connect: the owner sets the Support URL to `https://elorated.com/support` (and the Marketing URL to `https://elorated.com/` if wanted). Update `apps/mobile/store.config.json` in the main checkout by hand; it is not part of this branch.
6. Mobile: ship the `WEB_APP_URL` change by OTA (JS-only) through the `ship-mobile` skill: production channel, runtime 0.5.0, non-critical. Shared links then use `elorated.com`. After the OTA, run `node design/native-screens/drift.mjs` as usual (no drawn screen changes are expected).
7. Close `jits-x1t2` if the owner confirms the domain move is complete (AASA now serves on `elorated.com`).
8. Restore path (later): set `NEXT_PUBLIC_WEB_APP_ENABLED=true` in Vercel Production and redeploy. No code change. Unset and redeploy to lock again.

## 13. Risks

- R1. **The switch is build-time.** Changing the Vercel env var does nothing until a redeploy. Mitigation: rollout and `CLAUDE.md` both say "set, then redeploy".
- R2. **Signed-in web users lose the web app at once.** Open tabs keep their loaded page; their next navigation lands on the landing page; `/api/version` polling now gets the landing HTML and fails silently (the hook catches the JSON error), so no "new version" toast appears. Accepted by D3.
- R3. **Shared links and push targets land on the landing page.** `/athlete/<id>` and `/matches/<id>` links in the wild, mobile-shared match links until the OTA (they point at `jitsweb.vercel.app`, the same deployment), and web push `notificationclick` URLs all redirect to `/`. Accepted. Web push does not fire on prod anyway (jits-qokf).
- R4. **Installed PWAs** (manifest `start_url: "/"`) now open the landing page. Accepted.
- R5. **Next.js rewrite under `cacheComponents`.** A rewrite to a static page is standard, but it is the one novel mechanism here. Mitigation: proxy unit tests, the locked e2e run, and the manual production-build check in section 11.4.
- R6. **e2e flag mismatch.** `reuseExistingServer: true` can reuse a dev server started with a different flag, producing confusing failures. Mitigation: env passthrough in the config and the comment; stop the dev server before switching states.
- R7. **Legal document version hashes change.** `legal:sync` derives `version` from the text, so the host edits produce new versions for all four documents. No re-acceptance gate reads the version today (jits-rog5.2, the versioned acceptance screen, is still open); when it ships, these versions are the ones users accept. "Last updated" dates are deliberately not changed (open question Q1).
- R8. **The invite page loses web sign-up.** Signed-out invitees can no longer create an account on the web; with the store URL unset, the only working path is "Open in app" (TestFlight testers) or the TestFlight link the inviter shares. Accepted by D3 and D4.
- R9. **Robots.** Disallowing `/c/` would break invite previews on X/Twitter; the spec forbids it (P8).
- R10. **Forced dark island.** The landing forces `data-theme="dark"` on its own root; the shadcn `.dark` class still follows the visitor's theme. The landing uses brand variables only, so this is safe; a reviewer must reject any shadcn class on the landing.
- R11. **Proxy matcher gaps.** Paths not excluded by the matcher (for example `/robots.txt`, `/sw.js`, `/manifest.webmanifest`, dev internals) are listed explicitly. A future root file served by an app route (for example a `sitemap.xml`) must be added to `LOCKED_ALLOWED_FILES`, or it will redirect to `/`.
- R12. **Stale static design HTML** under `apps/web/public/design/` remains publicly reachable (excluded from the matcher), as today. Out of scope.

## 14. Work breakdown (beads)

Epic `jits-6si3`: "Web landing page and web app lockdown (elorated.com)". Children:

| Task | Title | Depends on | Files (disjoint, for parallel worktrees) |
|---|---|---|---|
| T1 `jits-6si3.1` | Lock flag, proxy gate, allow-list, App Store helper and CTA | none | `lib/web-app-lock.ts`, `lib/app-store.ts`, `lib/supabase/public-paths.ts`, `lib/supabase/proxy.ts`, `components/app-store/`, their tests |
| T2 `jits-6si3.3` | Landing page at `/` (internal `/welcome`), robots, root metadata | T1 | `app/welcome/`, `components/landing/`, `app/robots.ts`, `app/layout.tsx`, `public/landing/hero.jpg`, tests |
| T3 `jits-6si3.4` | Invite landing CTAs and actions when locked; unify App Store helper | T1 | `components/invites/*`, `app/c/[token]/actions.ts`, `lib/invites/constants.ts`, `lib/invites/outcome-copy.ts`, tests |
| T4 `jits-xmx6` | Public `/support` page and auth link fixes (existing bead `jits-xmx6`, re-parented) | T1 | `app/(legal)/support/`, `components/support/` (if split), `components/forgot-password-form.tsx`, `app/(auth)/error/`, tests |
| T5 `jits-6si3.2` | Domain fixes: `WEB_APP_URL`, `DEFAULT_PUBLIC_ORIGIN`, tests, legal docs, `legal:sync` | none | `packages/shared/src/constants.ts`, shared and mobile tests, `lib/invites/site-origin.ts` (+ test), `app/(legal)/layout.test.ts`, four legal `.md` files, `documents.generated.ts` |
| T6 `jits-6si3.5` | e2e: locked default plus flag-aware smoke and invite specs | T1 to T4 | `playwright.config.ts`, `e2e/*` |
| T7 `jits-6si3.6` | Docs: `CLAUDE.md` production facts and routes, `CHANGELOG.md` | T1 to T5 | `CLAUDE.md`, `CHANGELOG.md` |
| T8 `jits-6si3.7` | Rollout: Vercel env, merge, production verify, App Store Support URL, mobile OTA | T1 to T7 merged | none (ops) |

T1 and T5 can start at once. T2, T3 and T4 run in parallel after T1, each in its own worktree. Only T7 edits `CHANGELOG.md`, to avoid merge conflicts. Every task gets an independent reviewer before merge (workspace policy).

### 14.1 Acceptance criteria per task

**T1**
- `isWebAppEnabled()`, `LANDING_INTERNAL_PATH`, `appStoreUrl()`, `isAppStoreLive()`, `APP_STORE_LABEL`, `APP_STORE_COMING_SOON_LABEL`, `LOCKED_ALLOWED_PATHS`, `LOCKED_ALLOWED_FILES`, `isLockedAllowedPath()` and `AppStoreCta` exist exactly as specified in 7.1.
- `/support` is in `PUBLIC_PATHS`.
- The gate is the first logic in `updateSession`; blocked requests and the `/` rewrite never call `createServerClient` or `getClaims`.
- With the flag unset: `/` rewrites to `/welcome` (query kept) for signed-in and signed-out visitors; every non-allowed path 307s to `/` with no query; allowed paths run today's code.
- With the flag `"true"`: behaviour is identical to `cc771d9c` except `/welcome` 307s to `/` and `/support` is public.
- Unit tests 1 to 5 of section 11.1 pass; existing proxy tests pass with the flag stubbed `"true"`.
- No other file reads the two env vars directly.

**T2**
- `/welcome` page and `components/landing/*` match section 7.2 and copy deck section 9 exactly; each component under 80 lines.
- The page is static (no cookies, headers, search params or dates) and `npm run build:web` prerenders it.
- `hero.jpg` is committed and rendered with `next/image` (`fill`, `priority`, `sizes="100vw"`, `alt=""`) under the Void gradient overlay.
- At most one red fill (the CTA, only when the store URL is set); "ARE YOU?" uses `--accent-cta-text`; no shadow; no shadcn classes; forced `data-theme="dark"`.
- No horizontal scroll at 320px and 390px; 16px side gutter at phone width.
- `app/robots.ts` matches 7.2 and never disallows `/c/`.
- Root layout `metadataBase` uses `publicSiteOrigin()`; description updated; title and viewport unchanged.
- Unit tests 8 and 12 pass.

**T3**
- `APP_STORE_URL` is deleted; `AppStoreButton` wraps `AppStoreCta` and fires `app_store_tapped` only on the link.
- `InviteActions` takes `webAppEnabled`; the locked branches match the table in 7.3; no locked element links to `/login`, `/signup` or `/eua`.
- The primary-swap rule holds in both lock states, including the signed-out `Unavailable` section.
- Locked actions return `APP_SETUP_OUTCOME` / `APP_SIGN_IN_OUTCOME` instead of redirecting; unlocked actions are unchanged.
- Copy I1 and I2 exact. Unit tests 6 and 7 pass, including the existing dob tests.

**T4**
- `/support` renders copy S0 to S12 exactly inside the `(legal)` layout, with mailto links and the four legal links; it is public in both lock states.
- `/forgot-password` shows no `/login` link when locked and today's link when unlocked.
- `/error` uses `errorPageCopy()`; locked shows E1 and E2; unlocked unchanged.
- `/update-password` confirmed to need no change (noted in the PR).
- `jits-xmx6` is closed by this task (its old description named `support@elorated.com`; the owner's decision is `info@elorated.com`).
- Unit tests 9 to 11 pass.

**T5**
- `WEB_APP_URL` and `DEFAULT_PUBLIC_ORIGIN` are `https://elorated.com` with the new comments.
- The tests in 7.5 are updated as specified, keeping the two legacy-host parsing cases.
- The twelve legal replacements are applied exactly; no other character in the four documents changes (verify with `git diff --word-diff`); dates unchanged.
- `npm run legal:sync` output is committed; `documents.test.ts` passes.
- `grep -rn "jitsweb.vercel.app" --exclude-dir=node_modules --exclude-dir=.next --exclude-dir=.beads .` returns only: the two legacy-host test cases, `CHANGELOG.md` history, `research/` journals, and the `CLAUDE.md` line that states `jitsweb.vercel.app` still serves the deployment (after T7).

**T6**
- Config passthrough and comment as in 11.3.
- `landing-lock.spec.ts` covers items 1 to 9 of 11.3.
- Smoke and invite specs are flag-aware as specified; nothing is deleted, only skipped by state.
- `npm run test:e2e` passes locked (both env vars unset), on both the chromium and mobile-chrome projects.
- The unlocked run result is recorded in the PR.

**T7**
- `CLAUDE.md` edits from 7.7 applied; no stale "elorated.com is NOT attached" statement remains.
- `CHANGELOG.md` `[Unreleased]` entry as in 7.7.
- No em dashes in any added text.

**T8**
- Vercel Production: `NEXT_PUBLIC_SITE_URL=https://elorated.com`; `NEXT_PUBLIC_WEB_APP_ENABLED` unset; `NEXT_PUBLIC_APP_STORE_URL` unset unless the listing is public.
- `development` merged into `main`; production checks in section 12 step 4 pass and are recorded on the bead.
- App Store Connect Support URL is `https://elorated.com/support`.
- Mobile OTA with the `WEB_APP_URL` change published on production, runtime 0.5.0, non-critical; group id recorded on the bead and in `CLAUDE.md` release facts.

## 15. Open questions (do not block the build)

- Q1. Should the four legal documents get a new "Last updated" date for the host edits? This spec leaves dates unchanged (owner: host facts only).
- Q2. Should the landing page also offer an "Open in app" link for TestFlight testers? Not in this spec.
- Q3. Should the App Store Marketing URL point at `https://elorated.com/`? Owner's call in App Store Connect.
