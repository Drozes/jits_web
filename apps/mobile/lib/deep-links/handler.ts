import * as React from "react";
import * as Linking from "expo-linking";
import { router } from "expo-router";

/**
 * Central deep link handler. Parses incoming `elorated://...` (custom scheme)
 * and `https://elorated.com/...` (universal/app links) URLs and routes them to
 * the appropriate screen via Expo Router.
 *
 * Mounted via `<DeepLinkBootstrap />` in `_layout.tsx`. The bootstrap
 * component listens for both:
 *   1. The URL the app was launched with (`getInitialURL` /
 *      `parseInitialURLAsync`), processed once on mount.
 *   2. URLs received while the app is running (`addEventListener('url', ...)`).
 *
 * Route table (path -> in-app route):
 *   reset-password?token=...   -> /(auth)/login (token forwarded)
 *   athlete/:id                -> /(app)/athlete/:id
 *   session/:id                -> /(app)/session/:id/lobby
 *
 * Universal link host: `elorated.com`. Domain verification (AASA on iOS,
 * `assetlinks.json` on Android) is a B2/DevOps task. The custom `elorated://`
 * scheme works without verification.
 */

type RouteResolution = { path: string; params?: Record<string, string> } | null;

/**
 * Pure URL -> in-app route resolver. Exported for unit testing without
 * needing to spy on `expo-router`'s side-effectful `router`.
 */
export function resolveDeepLink(rawUrl: string): RouteResolution {
  const parsed = Linking.parse(rawUrl);
  // Path comes back without a leading slash, e.g. "athlete/abc-123".
  const path = (parsed.path ?? "").replace(/^\/+/, "");
  const queryParams: Record<string, string> = {};
  for (const [k, v] of Object.entries(parsed.queryParams ?? {})) {
    if (typeof v === "string") queryParams[k] = v;
    else if (Array.isArray(v) && v.length > 0) queryParams[k] = v[0];
  }

  // reset-password?token=...
  if (path === "reset-password") {
    // The dedicated reset-password screen does not exist yet; route to the
    // login screen and forward the token so the screen can pick it up once
    // implemented. Documented as deferred follow-up.
    return {
      path: "/login",
      params: queryParams.token ? { token: queryParams.token } : undefined,
    };
  }

  // athlete/:id
  const athleteMatch = path.match(/^athlete\/([^/]+)/);
  if (athleteMatch) {
    return { path: `/athlete/${athleteMatch[1]}` };
  }

  // session/:id (lobby is the canonical session entry point)
  const sessionMatch = path.match(/^session\/([^/]+)/);
  if (sessionMatch) {
    return { path: `/session/${sessionMatch[1]}/lobby` };
  }

  return null;
}

function navigate(resolution: RouteResolution): void {
  if (!resolution) return;
  const { path, params } = resolution;
  // `router.push` accepts a path string or `{ pathname, params }`.
  if (params) {
    router.push({ pathname: path, params } as never);
  } else {
    router.push(path as never);
  }
}

/**
 * Side-effect bootstrap component (renders nothing). Mount once at the root
 * of the app, sibling to `<Stack>` so it has access to the router.
 */
export function DeepLinkBootstrap() {
  React.useEffect(() => {
    let cancelled = false;

    // Cold-start URL.
    Linking.getInitialURL().then((url) => {
      if (cancelled || !url) return;
      navigate(resolveDeepLink(url));
    });

    // Warm URLs.
    const sub = Linking.addEventListener("url", ({ url }) => {
      navigate(resolveDeepLink(url));
    });

    return () => {
      cancelled = true;
      sub.remove();
    };
  }, []);

  return null;
}
