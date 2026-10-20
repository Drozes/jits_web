/**
 * The match route moved into a folder (timekeeper mode M1, review product
 * minor 14): `app/(app)/match/[matchId].tsx` became
 * `app/(app)/match/[matchId]/index.tsx`, next to the new
 * `match/[matchId]/timekeep` (the asked person's sheet, `timekeep_href`).
 * Re-verified here, flag OFF included, on the REAL expo-router (6.0.23) with
 * the app's navigator shape (as `lib/match-flow/exit-to.test.tsx` does for
 * the old file):
 *  - `/match/<id>` still lands on the match screen, pushed over the one
 *    `(tabs)` route, from a push and from a cold deep link;
 *  - every match exit (`exitMatchTo`, `router.dismissTo`) still pops back to
 *    that `(tabs)` route and unmounts the match;
 *  - `/match/<id>/timekeep` is its own pushed screen, never a tab root, so a
 *    push tap is not dropped during a match;
 *  - the system-URL rewrite (`+native-intent`) and the push `match_href`
 *    leave both URLs unchanged;
 *  - the files and the `(app)` Stack entries are the ones described.
 */
import * as React from "react";
import { Text } from "react-native";
import { Redirect, Stack, Tabs, router, useLocalSearchParams } from "expo-router";
import { renderRouter, act } from "expo-router/testing-library";

declare const __dirname: string;
const fs = require("fs") as { existsSync: (p: string) => boolean; readFileSync: (p: string, e: string) => string };
const path = require("path") as { join: (...parts: string[]) => string };

jest.mock("@/lib/supabase/client", () => ({ supabase: {} }));
// Only the pure routing of the push handlers is read here.
jest.mock("expo-notifications", () => ({
  setNotificationHandler: jest.fn(),
  addNotificationResponseReceivedListener: () => ({ remove: jest.fn() }),
  getLastNotificationResponseAsync: async () => null,
  clearLastNotificationResponseAsync: async () => undefined,
}));

import { exitMatchTo } from "@/lib/match-flow/exit-to";
import { ARENA_HREF, arenaMatchHref } from "@/lib/arena/constants";
import { resolveSystemPath } from "@/lib/deep-links/system-path";
import { isTabRootHref } from "@/lib/deep-links/tab-root-route";
import { notificationTarget, dropsDuringMatch } from "@/lib/notifications/handlers";

const APP_DIR = path.join(__dirname, "..", "..", "app", "(app)");

const mounts: Record<string, number> = {};
const unmounts: Record<string, number> = {};

function useTrackMount(name: string) {
  React.useEffect(() => {
    mounts[name] = (mounts[name] ?? 0) + 1;
    return () => {
      unmounts[name] = (unmounts[name] ?? 0) + 1;
    };
  }, [name]);
}

function MatchScreen() {
  useTrackMount("match");
  const { matchId } = useLocalSearchParams<{ matchId: string }>();
  return <Text testID="match">{matchId}</Text>;
}

function TimekeepScreen() {
  useTrackMount("timekeep");
  const { matchId, request } = useLocalSearchParams<{ matchId: string; request?: string }>();
  return <Text testID="timekeep">{`${matchId}:${request ?? ""}`}</Text>;
}

function appTree() {
  const stack = () => <Stack screenOptions={{ headerShown: false }} />;
  // The (app) Stack declares the two match entries exactly as `_layout.tsx` does.
  const appStack = () => (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="(tabs)" />
      <Stack.Screen name="match/[matchId]/index" />
      <Stack.Screen name="match/[matchId]/timekeep" />
    </Stack>
  );
  return {
    _layout: stack,
    index: () => <Redirect href="/(app)/(home)" />,
    "(auth)/login": () => <Text>login</Text>,
    "(app)/_layout": { default: appStack, unstable_settings: { initialRouteName: "(tabs)" } },
    "(app)/(tabs)/_layout": () => <Tabs screenOptions={{ headerShown: false }} />,
    "(app)/(tabs)/(home)/_layout": stack,
    "(app)/(tabs)/(home)/index": () => <Text testID="home">home</Text>,
    "(app)/(tabs)/arena/_layout": { default: stack, unstable_settings: { initialRouteName: "index" } },
    "(app)/(tabs)/arena/index": () => <Text testID="arena">arena</Text>,
    "(app)/match/[matchId]/index": MatchScreen,
    "(app)/match/[matchId]/timekeep": TimekeepScreen,
  };
}

interface NavRoute {
  name: string;
  params?: Record<string, unknown>;
  state?: { index?: number; routes: NavRoute[] };
}

function appStack(state: unknown): NavRoute[] {
  const root = (state as { routes: NavRoute[] }).routes[0];
  const app = root.state?.routes.find((r) => r.name === "(app)");
  return app?.state?.routes ?? [];
}

function focusedTab(state: unknown): string | undefined {
  const tabs = appStack(state).find((r) => r.name === "(tabs)")?.state;
  return tabs ? tabs.routes[tabs.index ?? 0]?.name : undefined;
}

const M1 = "0b7a6f3e-2c1d-4e5f-8a9b-0c1d2e3f4a5b";

beforeEach(() => {
  for (const k of Object.keys(mounts)) delete mounts[k];
  for (const k of Object.keys(unmounts)) delete unmounts[k];
});

describe("the moved match route on the real router", () => {
  it("/match/<id> lands on the folder's index, pushed over the one (tabs) route", () => {
    const r = renderRouter(appTree(), { initialUrl: ARENA_HREF });
    act(() => router.push(arenaMatchHref(M1)));
    expect(appStack(r.getRouterState()).map((x) => x.name)).toEqual(["(tabs)", "match/[matchId]/index"]);
    expect(r.getByTestId("match")).toHaveTextContent(M1);
  });

  it("a cold deep link into /match/<id> anchors the tabs beneath it", () => {
    const r = renderRouter(appTree(), { initialUrl: `/match/${M1}` });
    expect(appStack(r.getRouterState()).map((x) => x.name)).toEqual(["(tabs)", "match/[matchId]/index"]);
    expect(r.getByTestId("match")).toHaveTextContent(M1);
  });

  it("exitMatchTo (router.dismissTo) still pops back to the existing (tabs) and unmounts the match", () => {
    const r = renderRouter(appTree(), { initialUrl: ARENA_HREF });
    act(() => router.push(arenaMatchHref(M1)));
    act(() => exitMatchTo(router, ARENA_HREF));
    expect(appStack(r.getRouterState()).map((x) => x.name)).toEqual(["(tabs)"]);
    expect(focusedTab(r.getRouterState())).toBe("arena");
    expect(unmounts.match).toBe(1);
  });

  it("exits to Home (Done) the same way", () => {
    const r = renderRouter(appTree(), { initialUrl: `/match/${M1}` });
    act(() => exitMatchTo(router, "/"));
    expect(appStack(r.getRouterState()).map((x) => x.name)).toEqual(["(tabs)"]);
    expect(focusedTab(r.getRouterState())).toBe("(home)");
  });

  it("/match/<id>/timekeep is its own pushed screen, with its params", () => {
    const r = renderRouter(appTree(), { initialUrl: ARENA_HREF });
    act(() => router.push(`/match/${M1}/timekeep?request=q1`));
    expect(appStack(r.getRouterState()).map((x) => x.name)).toEqual(["(tabs)", "match/[matchId]/timekeep"]);
    expect(r.getByTestId("timekeep")).toHaveTextContent(`${M1}:q1`);
    expect(mounts.match).toBeUndefined();
  });

  it("the timekeep screen can open over a match without unmounting it", () => {
    const r = renderRouter(appTree(), { initialUrl: `/match/${M1}` });
    act(() => router.push(`/match/${M1}/timekeep`));
    expect(appStack(r.getRouterState()).map((x) => x.name)).toEqual([
      "(tabs)",
      "match/[matchId]/index",
      "match/[matchId]/timekeep",
    ]);
    expect(unmounts.match).toBeUndefined();
  });
});

describe("links into the moved route", () => {
  it("the system-URL rewrite leaves both match URLs unchanged", () => {
    for (const url of [`/match/${M1}`, `elorated://match/${M1}`, `https://elorated.com/match/${M1}`, `/match/${M1}/timekeep?request=q1`]) {
      expect(resolveSystemPath(url)).toBe(url);
    }
  });

  it("the push match_href still opens /match/<id>, and neither URL is a tab root dropped during a match", () => {
    expect(notificationTarget({ match_href: `/match/${M1}` })).toBe(`/match/${M1}`);
    expect(dropsDuringMatch({ match_href: `/match/${M1}` })).toBe(false);
    expect(isTabRootHref(`/match/${M1}`)).toBe(false);
    expect(isTabRootHref(`/match/${M1}/timekeep?request=q1`)).toBe(false);
  });
});

describe("the files", () => {
  it("the match screen is the folder's index, and no file shadows it", () => {
    expect(fs.existsSync(path.join(APP_DIR, "match", "[matchId]", "index.tsx"))).toBe(true);
    expect(fs.existsSync(path.join(APP_DIR, "match", "[matchId]", "timekeep.tsx"))).toBe(true);
    expect(fs.existsSync(path.join(APP_DIR, "match", "[matchId].tsx"))).toBe(false);
  });

  it("the (app) Stack declares the two entries and nothing for the old file", () => {
    const layout = fs.readFileSync(path.join(APP_DIR, "_layout.tsx"), "utf8");
    expect(layout).toMatch(/<Stack\.Screen name="match\/\[matchId\]\/index" \/>/);
    expect(layout).toMatch(/<Stack\.Screen name="match\/\[matchId\]\/timekeep" \/>/);
    expect(layout).not.toMatch(/name="match\/\[matchId\]"/);
  });
});
