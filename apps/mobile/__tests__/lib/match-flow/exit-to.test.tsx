/**
 * Match exits dismiss back to the existing tabs (jits-tlk3).
 *
 * `router.replace` from `match/[matchId]` swapped the match route in the
 * `(app)` Stack for a SECOND `(tabs)` route, so every match stacked another
 * tab navigator with its screens still mounted. `exitMatchTo` uses
 * `router.dismissTo`, which pops to the existing `(tabs)`.
 *
 * The first block pins the helper itself. The second drives the REAL
 * expo-router (6.0.23) on an in-memory route tree that mirrors the app's
 * navigator shape: root Stack, `(app)` Stack anchored on `(tabs)` via
 * `unstable_settings`, the tab navigator, the Home and Arena tab stacks, and
 * `match/[matchId]` pushed over the tabs. Nothing about routing is mocked,
 * so these tests are what proves:
 *  - the `(app)` Stack keeps exactly one `(tabs)` route after any exit,
 *    however many matches are played;
 *  - the match screen unmounts (useArenaMatchScreen restores live on unmount);
 *  - the Arena tab screen is NOT remounted, yet still receives `?rematch=`,
 *    and the real useRematchPin pins it and clears it off the route;
 *  - Done (`/`) lands on the Home tab, not the root redirect index;
 *  - with no `(tabs)` route beneath the match at all, the exit still lands;
 *  - a match entered on top of athlete/[id] pops that profile too;
 *  - because nothing remounts, the screens that show match-changed data are
 *    told: the real useArenaRoster re-reads, and the real
 *    useRefetchOnRefocus refetches Home inside its 30 s throttle, both keyed
 *    off the arena store's match-exit count (bumped by the real
 *    useArenaMatchScreen on the match screen).
 *
 * Only the data layer under the roster is mocked.
 */
import * as React from "react";
import { Text } from "react-native";
import { Redirect, Stack, Tabs, router, useLocalSearchParams } from "expo-router";
import { renderRouter, act } from "expo-router/testing-library";

const mockGetArenaData = jest.fn();
jest.mock("@jits/shared/api/queries", () => ({
  getArenaData: (...args: unknown[]) => mockGetArenaData(...args),
}));
jest.mock("@/lib/supabase/client", () => ({ supabase: {} }));

import { exitMatchTo } from "@/lib/match-flow/exit-to";
import { useRematchPin } from "@/lib/arena/use-rematch-pin";
import { useArenaRoster } from "@/lib/arena/use-arena-roster";
import { useArenaMatchScreen, useMatchExitCount } from "@/lib/arena/arena-store";
import { useRefetchOnRefocus } from "@/lib/cache/use-refocus-refetch";
import { ARENA_HREF } from "@/lib/arena/constants";

// Same shape as summary-step's rematchHref (pinned in summary-step.test.tsx);
// importing that module here would drag in the Supabase client.
const rematchHref = (id: string) => `${ARENA_HREF}?rematch=${encodeURIComponent(id)}`;

describe("exitMatchTo", () => {
  it("dismisses to the href, never replacing or pushing", () => {
    const fake = { dismissTo: jest.fn(), replace: jest.fn(), push: jest.fn() };

    exitMatchTo(fake, "/arena?rematch=opp-1");

    expect(fake.dismissTo).toHaveBeenCalledTimes(1);
    expect(fake.dismissTo).toHaveBeenCalledWith("/arena?rematch=opp-1");
    expect(fake.replace).not.toHaveBeenCalled();
    expect(fake.push).not.toHaveBeenCalled();
  });
});

// ---- real-router route tree ----

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

const NO_LOBBY = new Set<string>();
const noop = () => {};
const mockHomeRefetch = jest.fn();

function ArenaIndex() {
  useTrackMount("arena");
  const roster = useArenaRoster(1500);
  // The real hook, so the handoff is proven end to end: the param is read,
  // pinned, and cleared off this route with route-scoped setParams.
  const pin = useRematchPin({
    competitors: roster.competitors,
    lobbyIds: NO_LOBBY,
    isLoading: false,
    refresh: noop,
    outgoingOpponentId: null,
  });
  return <Text testID="arena-pin">{pin.pinnedId ?? "none"}</Text>;
}

function HomeIndex() {
  useTrackMount("home");
  useRefetchOnRefocus(mockHomeRefetch, useMatchExitCount());
  return <Text testID="home">home</Text>;
}

function MatchScreen() {
  useTrackMount("match");
  useArenaMatchScreen();
  const { matchId } = useLocalSearchParams<{ matchId: string }>();
  return <Text testID="match">{matchId}</Text>;
}

function AthleteScreen() {
  useTrackMount("athlete");
  return <Text testID="athlete">athlete</Text>;
}

function appTree({ anchorTabs = true } = {}) {
  const stack = () => <Stack screenOptions={{ headerShown: false }} />;
  return {
    _layout: stack,
    // The real app/index.tsx is an auth redirect; "/" must still resolve to
    // the Home tab, not to this.
    index: () => <Redirect href="/(app)/(home)" />,
    "(auth)/login": () => <Text>login</Text>,
    "(app)/_layout": anchorTabs
      ? { default: stack, unstable_settings: { initialRouteName: "(tabs)" } }
      : stack,
    "(app)/(tabs)/_layout": () => <Tabs screenOptions={{ headerShown: false }} />,
    "(app)/(tabs)/(home)/_layout": stack,
    "(app)/(tabs)/(home)/index": HomeIndex,
    "(app)/(tabs)/arena/_layout": {
      default: stack,
      unstable_settings: { initialRouteName: "index" },
    },
    "(app)/(tabs)/arena/index": ArenaIndex,
    "(app)/match/[matchId]": MatchScreen,
    "(app)/athlete/[id]": AthleteScreen,
  };
}

interface NavRoute {
  name: string;
  state?: { index?: number; routes: NavRoute[] };
}

/** Route names of the `(app)` Stack, bottom to top. */
function appStackNames(state: unknown): string[] {
  const root = (state as { routes: NavRoute[] }).routes[0]; // expo-router's __root
  const app = root.state?.routes.find((r) => r.name === "(app)");
  return app?.state?.routes.map((r) => r.name) ?? [];
}

/** The focused tab of the single `(tabs)` route. */
function focusedTab(state: unknown): string | undefined {
  const root = (state as { routes: NavRoute[] }).routes[0];
  const app = root.state?.routes.find((r) => r.name === "(app)");
  const tabs = app?.state?.routes.find((r) => r.name === "(tabs)");
  const s = tabs?.state;
  return s ? s.routes[s.index ?? 0]?.name : undefined;
}

beforeEach(() => {
  mockGetArenaData.mockReset();
  // Pending forever by default, so routing-only tests never see a late
  // roster state update; the refresh block below resolves it.
  mockGetArenaData.mockReturnValue(new Promise(() => {}));
  mockHomeRefetch.mockReset();
  for (const k of Object.keys(mounts)) delete mounts[k];
  for (const k of Object.keys(unmounts)) delete unmounts[k];
});

describe("match exits on the real router", () => {
  it("documents the bug: router.replace stacks a second (tabs) route", () => {
    // If an expo-router upgrade ever changes this, the premise of jits-tlk3
    // changed too: re-check whether exitMatchTo is still needed.
    const r = renderRouter(appTree(), { initialUrl: ARENA_HREF });
    act(() => router.push("/match/M1"));
    act(() => router.replace(ARENA_HREF));

    expect(appStackNames(r.getRouterState())).toEqual(["(tabs)", "(tabs)"]);
    expect(mounts.arena).toBe(2);
  });

  it("Back to Arena pops to the existing tabs and unmounts the match", () => {
    const r = renderRouter(appTree(), { initialUrl: ARENA_HREF });
    act(() => router.push("/match/M1"));
    expect(r.getByTestId("match")).toBeTruthy();

    act(() => exitMatchTo(router, ARENA_HREF));

    expect(appStackNames(r.getRouterState())).toEqual(["(tabs)"]);
    expect(focusedTab(r.getRouterState())).toBe("arena");
    expect(unmounts.match).toBe(1);
    expect(r.queryByTestId("match")).toBeNull();
    // The Arena under the match is the one we land on, not a fresh copy.
    expect(mounts.arena).toBe(1);
    expect(unmounts.arena).toBeUndefined();
    expect(r.getPathname()).toBe("/arena");
  });

  it("Rematch delivers ?rematch= to the already-mounted Arena, which pins it", () => {
    const r = renderRouter(appTree(), { initialUrl: ARENA_HREF });
    expect(r.getByTestId("arena-pin").props.children).toBe("none");
    act(() => router.push("/match/M1"));

    act(() => exitMatchTo(router, rematchHref("opp-1")));

    expect(appStackNames(r.getRouterState())).toEqual(["(tabs)"]);
    expect(mounts.arena).toBe(1);
    expect(unmounts.match).toBe(1);
    expect(r.getByTestId("arena-pin").props.children).toBe("opp-1");
  });

  it("re-pins a second rematch of the SAME opponent (the param is dropped on blur)", () => {
    // The Arena stays mounted across matches now, so the pin effect only
    // re-fires if the param actually changes. useRematchPin's own immediate
    // setParams loses a race with the navigator applying the dismissTo
    // params; clearing again on blur is what makes the next one land.
    const r = renderRouter(appTree(), { initialUrl: ARENA_HREF });
    act(() => router.push("/match/M1"));
    act(() => exitMatchTo(router, rematchHref("opp-1")));
    expect(r.getByTestId("arena-pin").props.children).toBe("opp-1");

    // The rematch itself: entering its match blurs the Arena, which drops
    // both the pin and the param.
    act(() => router.push("/match/M2"));
    expect(r.getByTestId("arena-pin", { includeHiddenElements: true }).props.children).toBe("none");

    // Straight back into another rematch of the same opponent.
    act(() => exitMatchTo(router, rematchHref("opp-1")));
    expect(r.getByTestId("arena-pin").props.children).toBe("opp-1");
    expect(mounts.arena).toBe(1);
  });

  it("Rematch switches to the Arena tab when the match was entered from Home", () => {
    const r = renderRouter(appTree(), { initialUrl: "/" });
    act(() => router.push("/match/M1"));

    act(() => exitMatchTo(router, rematchHref("opp-2")));

    expect(appStackNames(r.getRouterState())).toEqual(["(tabs)"]);
    expect(focusedTab(r.getRouterState())).toBe("arena");
    expect(r.getByTestId("arena-pin").props.children).toBe("opp-2");
    expect(mounts.home).toBe(1);
    expect(unmounts.home).toBeUndefined();
  });

  it("Done lands on the Home tab of the existing tabs", () => {
    const r = renderRouter(appTree(), { initialUrl: ARENA_HREF });
    act(() => router.push("/match/M1"));

    act(() => exitMatchTo(router, "/"));

    expect(appStackNames(r.getRouterState())).toEqual(["(tabs)"]);
    expect(focusedTab(r.getRouterState())).toBe("(home)");
    expect(r.getPathname()).toBe("/");
    expect(unmounts.match).toBe(1);
    expect(mounts.arena).toBe(1);
    expect(unmounts.arena).toBeUndefined();
  });

  it("keeps a single tabs navigator across many matches", () => {
    const r = renderRouter(appTree(), { initialUrl: ARENA_HREF });
    const exits = [ARENA_HREF, rematchHref("opp-1"), "/", ARENA_HREF];

    exits.forEach((href, i) => {
      act(() => router.push(`/match/M${i}`));
      act(() => exitMatchTo(router, href));
      expect(appStackNames(r.getRouterState())).toEqual(["(tabs)"]);
    });

    expect(mounts.match).toBe(exits.length);
    expect(unmounts.match).toBe(exits.length);
    expect(mounts.arena).toBe(1);
    expect(mounts.home).toBe(1);
  });

  it("still lands on the Arena from a cold deep link into the match", () => {
    // The (tabs) anchor exists in state but was never rendered.
    const r = renderRouter(appTree(), { initialUrl: "/match/M1" });
    expect(appStackNames(r.getRouterState())).toEqual(["(tabs)", "match/[matchId]"]);

    act(() => exitMatchTo(router, rematchHref("opp-1")));

    expect(appStackNames(r.getRouterState())).toEqual(["(tabs)"]);
    expect(unmounts.match).toBe(1);
    expect(r.getByTestId("arena-pin").props.children).toBe("opp-1");
  });

  it("replaces the match when no (tabs) route is beneath it at all", () => {
    const r = renderRouter(appTree({ anchorTabs: false }), { initialUrl: "/match/M1" });
    expect(appStackNames(r.getRouterState())).toEqual(["match/[matchId]"]);

    act(() => exitMatchTo(router, ARENA_HREF));

    expect(appStackNames(r.getRouterState())).toEqual(["(tabs)"]);
    expect(unmounts.match).toBe(1);
    expect(mounts.arena).toBe(1);
    expect(r.getByTestId("arena-pin")).toBeTruthy();
  });

  it("pops an athlete profile the match was entered from, and still delivers the param", () => {
    const r = renderRouter(appTree(), { initialUrl: ARENA_HREF });
    act(() => router.push("/athlete/A1"));
    act(() => router.push("/match/M1"));
    expect(appStackNames(r.getRouterState())).toEqual(["(tabs)", "athlete/[id]", "match/[matchId]"]);

    act(() => exitMatchTo(router, rematchHref("opp-1")));

    expect(appStackNames(r.getRouterState())).toEqual(["(tabs)"]);
    expect(unmounts.athlete).toBe(1);
    expect(unmounts.match).toBe(1);
    expect(mounts.arena).toBe(1);
    expect(r.getByTestId("arena-pin").props.children).toBe("opp-1");
  });
});

describe("match exits refresh the screens that stayed mounted", () => {
  beforeEach(() => {
    mockGetArenaData.mockResolvedValue({ looking_athletes: [], challenged_opponent_ids: [] });
  });
  // Flush the roster's awaited read so its state lands inside act.
  const settle = () => act(async () => {});

  it("re-reads the Arena roster after every exit", async () => {
    renderRouter(appTree(), { initialUrl: ARENA_HREF });
    await settle();
    expect(mockGetArenaData).toHaveBeenCalledTimes(1);

    act(() => router.push("/match/M1"));
    await settle();
    expect(mockGetArenaData).toHaveBeenCalledTimes(1);

    act(() => exitMatchTo(router, ARENA_HREF));
    await settle();
    expect(mockGetArenaData).toHaveBeenCalledTimes(2);
    expect(mounts.arena).toBe(1);

    act(() => router.push("/match/M2"));
    act(() => exitMatchTo(router, rematchHref("opp-1")));
    await settle();
    expect(mockGetArenaData).toHaveBeenCalledTimes(3);
  });

  it("refetches Home on Done even inside the refocus throttle", async () => {
    renderRouter(appTree(), { initialUrl: "/" });
    await settle();
    expect(mockHomeRefetch).not.toHaveBeenCalled();

    // A plain push and back inside 30 s stays throttled...
    act(() => router.push("/athlete/A1"));
    act(() => router.back());
    expect(mockHomeRefetch).not.toHaveBeenCalled();

    // ...but leaving a match does not, and refetches exactly once.
    act(() => router.push("/match/M1"));
    act(() => exitMatchTo(router, "/"));
    await settle();
    expect(mockHomeRefetch).toHaveBeenCalledTimes(1);
    expect(mounts.home).toBe(1);
  });

  it("refetches Home on its next focus after a match exited to the Arena", async () => {
    renderRouter(appTree(), { initialUrl: "/" });
    await settle();
    act(() => router.navigate(ARENA_HREF));
    act(() => router.push("/match/M1"));
    act(() => exitMatchTo(router, ARENA_HREF));
    await settle();
    expect(mockHomeRefetch).not.toHaveBeenCalled();

    act(() => router.navigate("/"));
    await settle();
    expect(mockHomeRefetch).toHaveBeenCalledTimes(1);
  });
});
