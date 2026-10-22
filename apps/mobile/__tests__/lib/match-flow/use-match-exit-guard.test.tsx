/**
 * The match screen's remove guard (`useMatchExitGuard`) on the REAL
 * expo-router (6.0.23) and React Navigation, on the same in-memory route
 * shape as `exit-to.test.tsx`: `(app)` Stack anchored on `(tabs)`, the match
 * route pushed over the Arena tab.
 *
 * While guarded (live, end, result, confirm) nothing removes the match
 * screen, except the wizard's exit that asked to pass (`exitMatchTo` with
 * `pastGuard`: a timekeeper-mode no contest, match-loop T6, T7, T16). A
 * two-athlete exit (no `pastGuard`) is held exactly as before, and a request
 * left over from an unguarded exit never opens a later match's guard.
 */
import * as React from "react";
import { Text } from "react-native";
import { Stack, Tabs, router } from "expo-router";
import { renderRouter, act } from "expo-router/testing-library";
import { exitMatchTo, takeGuardedExit } from "@/lib/match-flow/exit-to";
import { useMatchExitGuard } from "@/lib/match-flow/use-match-exit-guard";
import { ARENA_HREF } from "@/lib/arena/constants";

let mockGuarded = true;

function MatchScreen() {
  useMatchExitGuard(mockGuarded);
  return <Text testID="match">match</Text>;
}

function appTree() {
  const stack = () => <Stack screenOptions={{ headerShown: false }} />;
  return {
    _layout: stack,
    "(app)/_layout": { default: stack, unstable_settings: { initialRouteName: "(tabs)" } },
    "(app)/(tabs)/_layout": () => <Tabs screenOptions={{ headerShown: false }} />,
    "(app)/(tabs)/arena/_layout": { default: stack, unstable_settings: { initialRouteName: "index" } },
    "(app)/(tabs)/arena/index": () => <Text testID="arena">arena</Text>,
    "(app)/(tabs)/(home)/_layout": stack,
    "(app)/(tabs)/(home)/index": () => <Text testID="home">home</Text>,
    "(app)/match/[matchId]/index": MatchScreen,
  };
}

interface NavRoute {
  name: string;
  state?: { routes: NavRoute[] };
}

function appStackNames(state: unknown): string[] {
  const root = (state as { routes: NavRoute[] }).routes[0];
  const app = root.state?.routes.find((r) => r.name === "(app)");
  return app?.state?.routes.map((r) => r.name) ?? [];
}

beforeEach(() => {
  mockGuarded = true;
  takeGuardedExit();
});

describe("takeGuardedExit", () => {
  it("is true once per pastGuard exit and never for a plain one", () => {
    const fake = { dismissTo: jest.fn() };
    exitMatchTo(fake, ARENA_HREF);
    expect(takeGuardedExit()).toBe(false);

    exitMatchTo(fake, ARENA_HREF, { pastGuard: true });
    expect(fake.dismissTo).toHaveBeenLastCalledWith(ARENA_HREF);
    expect(takeGuardedExit()).toBe(true);
    expect(takeGuardedExit()).toBe(false);
  });
});

describe("useMatchExitGuard on the real router", () => {
  it("lets a pastGuard exit leave a guarded match screen for the Arena", () => {
    const r = renderRouter(appTree(), { initialUrl: ARENA_HREF });
    act(() => router.push("/match/M1"));
    expect(r.getByTestId("match")).toBeTruthy();

    act(() => exitMatchTo(router, ARENA_HREF, { pastGuard: true }));

    expect(appStackNames(r.getRouterState())).toEqual(["(tabs)"]);
    expect(r.queryByTestId("match")).toBeNull();
    expect(r.getPathname()).toBe("/arena");
    expect(takeGuardedExit()).toBe(false);
  });

  it("holds a two-athlete exit and a back on a guarded screen, as before", () => {
    const r = renderRouter(appTree(), { initialUrl: ARENA_HREF });
    act(() => router.push("/match/M1"));

    act(() => exitMatchTo(router, ARENA_HREF));
    act(() => router.back());

    expect(appStackNames(r.getRouterState())).toEqual(["(tabs)", "match/[matchId]/index"]);
    expect(r.getByTestId("match")).toBeTruthy();
  });

  it("an unguarded screen leaves on any exit (control)", () => {
    mockGuarded = false;
    const r = renderRouter(appTree(), { initialUrl: ARENA_HREF });
    act(() => router.push("/match/M1"));

    act(() => exitMatchTo(router, ARENA_HREF));

    expect(appStackNames(r.getRouterState())).toEqual(["(tabs)"]);
  });

  it("a request left over from an unguarded exit never opens a later match's guard", () => {
    mockGuarded = false;
    const r = renderRouter(appTree(), { initialUrl: ARENA_HREF });
    act(() => router.push("/match/M1"));
    act(() => exitMatchTo(router, ARENA_HREF, { pastGuard: true }));
    expect(appStackNames(r.getRouterState())).toEqual(["(tabs)"]);

    mockGuarded = true;
    act(() => router.push("/match/M2"));
    act(() => router.back());

    expect(appStackNames(r.getRouterState())).toEqual(["(tabs)", "match/[matchId]/index"]);
  });
});
