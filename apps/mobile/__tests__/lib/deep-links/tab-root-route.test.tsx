/**
 * The challenge push deep link (`/arena?challenge=<id>`, AC-A8) opens the
 * existing Arena, never a second one.
 *
 * Drives the REAL expo-router (6.0.23) on an in-memory route tree shaped like
 * the app (the same shape as exit-to.test.tsx): root Stack, `(app)` Stack
 * anchored on `(tabs)` and carrying the real `AppStackTopTracker`, the tab
 * navigator, the Home and Arena tab stacks, and athlete/[id] pushed over the
 * tabs. The Arena screen installs the real opponent-unavailable handler with
 * the identity-safe cleanup, exactly as the Arena tab does.
 *
 * Source: apps/mobile/lib/deep-links/tab-root-route.ts
 */
import * as React from "react";
import { Text } from "react-native";
import { Redirect, Stack, Tabs, router, useLocalSearchParams } from "expo-router";
import { renderRouter, act } from "expo-router/testing-library";

import {
  AppStackTopTracker,
  isAppStackOnTabs,
  isTabRootHref,
  openHref,
} from "@/lib/deep-links/tab-root-route";
import {
  clearOpponentUnavailableHandler,
  notifyOpponentUnavailable,
  setOpponentUnavailableHandler,
} from "@/lib/arena/arena-store";

const mounts: Record<string, number> = {};
const unmounts: Record<string, number> = {};
const mockArenaRefresh = jest.fn();

function useTrackMount(name: string) {
  React.useEffect(() => {
    mounts[name] = (mounts[name] ?? 0) + 1;
    return () => {
      unmounts[name] = (unmounts[name] ?? 0) + 1;
    };
  }, [name]);
}

function ArenaIndex() {
  useTrackMount("arena");
  const { challenge } = useLocalSearchParams<{ challenge?: string }>();
  React.useEffect(() => {
    const handler = (id: string) => mockArenaRefresh(id);
    setOpponentUnavailableHandler(handler);
    return () => clearOpponentUnavailableHandler(handler);
  }, []);
  return <Text testID="arena-challenge">{challenge ?? "none"}</Text>;
}

function HomeIndex() {
  useTrackMount("home");
  return <Text testID="home">home</Text>;
}

function AthleteScreen() {
  useTrackMount("athlete");
  return <Text testID="athlete">athlete</Text>;
}

function appTree() {
  const stack = () => <Stack screenOptions={{ headerShown: false }} />;
  const appLayout = () => (
    <>
      <Stack screenOptions={{ headerShown: false }} />
      <AppStackTopTracker />
    </>
  );
  return {
    _layout: stack,
    index: () => <Redirect href="/(app)/(home)" />,
    "(app)/_layout": { default: appLayout, unstable_settings: { initialRouteName: "(tabs)" } },
    "(app)/(tabs)/_layout": () => <Tabs screenOptions={{ headerShown: false }} />,
    "(app)/(tabs)/(home)/_layout": stack,
    "(app)/(tabs)/(home)/index": HomeIndex,
    "(app)/(tabs)/arena/_layout": {
      default: stack,
      unstable_settings: { initialRouteName: "index" },
    },
    "(app)/(tabs)/arena/index": ArenaIndex,
    "(app)/athlete/[id]": AthleteScreen,
  };
}

interface NavRoute {
  name: string;
  state?: { index?: number; routes: NavRoute[] };
}

function appState(state: unknown): NavRoute | undefined {
  const root = (state as { routes: NavRoute[] }).routes[0];
  return root.state?.routes.find((r) => r.name === "(app)");
}

/** Route names of the `(app)` Stack, bottom to top. */
function appStackNames(state: unknown): string[] {
  return appState(state)?.state?.routes.map((r) => r.name) ?? [];
}

/** Route names of the Arena tab's Stack, bottom to top. */
function arenaStackNames(state: unknown): string[] {
  const tabs = appState(state)?.state?.routes.find((r) => r.name === "(tabs)");
  const arena = tabs?.state?.routes.find((r) => r.name === "arena");
  return arena?.state?.routes.map((r) => r.name) ?? [];
}

function focusedTab(state: unknown): string | undefined {
  const tabs = appState(state)?.state?.routes.find((r) => r.name === "(tabs)");
  const s = tabs?.state;
  return s ? s.routes[s.index ?? 0]?.name : undefined;
}

beforeEach(() => {
  mockArenaRefresh.mockReset();
  for (const k of Object.keys(mounts)) delete mounts[k];
  for (const k of Object.keys(unmounts)) delete unmounts[k];
});

describe("isTabRootHref", () => {
  it.each(["/", "/arena", "/arena?challenge=c-1", "/arena/", "/leaderboard", "/profile#x"])(
    "%s is a tab root",
    (href) => expect(isTabRootHref(href)).toBe(true),
  );
  it.each(["/athlete/a-1", "/match/m-1", "/profile/stats", "/highlight/h-1?source=push", "arena"])(
    "%s is not",
    (href) => expect(isTabRootHref(href)).toBe(false),
  );
});

describe("openHref (unit)", () => {
  const fake = () => ({ push: jest.fn(), navigate: jest.fn(), dismissTo: jest.fn() });

  it("pushes a detail href", () => {
    const r = fake();
    openHref(r, "/athlete/a-1", false);
    expect(r.push).toHaveBeenCalledWith("/athlete/a-1");
  });

  it("navigates to a tab root from the tabs and dismisses to it from a pushed screen", () => {
    const onTabs = fake();
    openHref(onTabs, "/arena?challenge=c", true);
    expect(onTabs.navigate).toHaveBeenCalledWith("/arena?challenge=c");
    const pushed = fake();
    openHref(pushed, "/arena?challenge=c", false);
    expect(pushed.dismissTo).toHaveBeenCalledWith("/arena?challenge=c");
  });
});

describe("the challenge deep link on the real router", () => {
  it("documents the bug: router.push on the Arena mounts a second Arena", () => {
    // If an expo-router upgrade changes this, re-check whether openHref is needed.
    const r = renderRouter(appTree(), { initialUrl: "/arena" });
    act(() => router.push("/arena?challenge=c-1"));
    expect(arenaStackNames(r.getRouterState())).toEqual(["index", "index"]);
    expect(mounts.arena).toBe(2);
  });

  it("on the Arena: one Arena, the new param, and a handler that survives", () => {
    const r = renderRouter(appTree(), { initialUrl: "/arena" });
    expect(isAppStackOnTabs()).toBe(true);

    act(() => openHref(router, "/arena?challenge=c-1"));

    expect(arenaStackNames(r.getRouterState())).toEqual(["index"]);
    expect(mounts.arena).toBe(1);
    expect(unmounts.arena).toBeUndefined();
    expect(r.getByTestId("arena-challenge").props.children).toBe("c-1");

    // A second tap stacks nothing either.
    act(() => openHref(router, "/arena?challenge=c-2"));
    expect(arenaStackNames(r.getRouterState())).toEqual(["index"]);
    expect(mounts.arena).toBe(1);
    expect(r.getByTestId("arena-challenge").props.children).toBe("c-2");

    notifyOpponentUnavailable("opp-1");
    expect(mockArenaRefresh).toHaveBeenCalledWith("opp-1");
  });

  it("from another tab: switches to the Arena tab", () => {
    const r = renderRouter(appTree(), { initialUrl: "/" });
    expect(r.getByTestId("home")).toBeTruthy();

    act(() => openHref(router, "/arena?challenge=c-3"));

    expect(focusedTab(r.getRouterState())).toBe("arena");
    expect(appStackNames(r.getRouterState())).toEqual(["(tabs)"]);
    expect(r.getByTestId("arena-challenge").props.children).toBe("c-3");
    expect(mounts.arena).toBe(1);
  });

  it("from a pushed athlete profile: pops back to the one (tabs), no second tab bar", () => {
    const r = renderRouter(appTree(), { initialUrl: "/arena" });
    act(() => router.push("/athlete/a-1"));
    expect(appStackNames(r.getRouterState())).toEqual(["(tabs)", "athlete/[id]"]);
    expect(isAppStackOnTabs()).toBe(false);

    act(() => openHref(router, "/arena?challenge=c-4"));

    expect(appStackNames(r.getRouterState())).toEqual(["(tabs)"]);
    expect(focusedTab(r.getRouterState())).toBe("arena");
    expect(unmounts.athlete).toBe(1);
    expect(mounts.arena).toBe(1);
    expect(unmounts.arena).toBeUndefined();
    expect(r.getByTestId("arena-challenge").props.children).toBe("c-4");
    expect(isAppStackOnTabs()).toBe(true);

    notifyOpponentUnavailable("opp-2");
    expect(mockArenaRefresh).toHaveBeenCalledWith("opp-2");
  });

  it("from a profile pushed over the Home tab: lands on the Arena tab", () => {
    const r = renderRouter(appTree(), { initialUrl: "/" });
    act(() => router.push("/athlete/a-1"));

    act(() => openHref(router, "/arena?challenge=c-5"));

    expect(appStackNames(r.getRouterState())).toEqual(["(tabs)"]);
    expect(focusedTab(r.getRouterState())).toBe("arena");
    expect(r.getByTestId("arena-challenge").props.children).toBe("c-5");
  });
});
