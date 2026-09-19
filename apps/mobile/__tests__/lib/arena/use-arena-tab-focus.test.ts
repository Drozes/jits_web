/**
 * "Is the Arena tab selected?" versus "is the Arena screen focused?".
 *
 * These are different questions and the difference is the whole point.
 * `athlete/[id]` and `match/[matchId]` are registered in `(app)/_layout.tsx`,
 * so they push OVER the tab navigator: React Navigation computes focus through
 * the tree, the Arena screen blurs, and the Arena tab is still selected. The
 * athlete has not left the Arena, they are inside it, and dropping them out of
 * the lobby for reading a profile or playing the match they just accepted is
 * exactly the behaviour the product rejected.
 */
import { renderHook } from "@testing-library/react-native";

// ---- mocks ----

let mockRootState: unknown = null;
jest.mock("expo-router", () => ({
  useRootNavigationState: () => mockRootState,
}));

import {
  selectedTabName,
  useIsTabSelected,
  type NavigatorState,
} from "@/lib/arena/use-arena-tab-focus";

// ---- fixtures ----

const TAB_ROUTES = [
  { name: "(home)" },
  { name: "arena" },
  { name: "leaderboard" },
  { name: "profile" },
];

/**
 * The real shape: a root stack holding `(app)`, which holds the `(tabs)`
 * navigator plus whatever detail screens are pushed above it.
 */
function tree(tabIndex: number, pushed?: string): NavigatorState {
  const appRoutes: { name: string; state?: NavigatorState }[] = [
    {
      name: "(tabs)",
      state: { type: "tab", index: tabIndex, routes: TAB_ROUTES },
    },
  ];
  if (pushed) appRoutes.push({ name: pushed });

  return {
    type: "stack",
    index: 0,
    routes: [
      {
        name: "(app)",
        state: {
          type: "stack",
          index: pushed ? 1 : 0,
          routes: appRoutes,
        },
      },
    ],
  };
}

describe("selectedTabName", () => {
  it("reads the tab navigator's own selection", () => {
    expect(selectedTabName(tree(1))).toBe("arena");
    expect(selectedTabName(tree(2))).toBe("leaderboard");
  });

  it("still reads Arena when a detail screen is pushed OVER the tabs", () => {
    // The screen is blurred here. The tab is not.
    expect(selectedTabName(tree(1, "athlete/[id]"))).toBe("arena");
    expect(selectedTabName(tree(1, "match/[matchId]"))).toBe("arena");
  });

  it("returns null for a tree with no tab navigator in it", () => {
    expect(selectedTabName(null)).toBeNull();
    expect(selectedTabName(undefined)).toBeNull();
    expect(
      selectedTabName({ type: "stack", index: 0, routes: [{ name: "login" }] }),
    ).toBeNull();
  });

  it("defaults to the first route when the tab state carries no index", () => {
    expect(
      selectedTabName({ type: "tab", routes: TAB_ROUTES }),
    ).toBe("(home)");
  });
});

describe("useIsTabSelected", () => {
  it("is true on the Arena tab, including behind a pushed screen", () => {
    mockRootState = tree(1);
    expect(renderHook(() => useIsTabSelected("arena")).result.current).toBe(true);

    mockRootState = tree(1, "match/[matchId]");
    expect(renderHook(() => useIsTabSelected("arena")).result.current).toBe(true);
  });

  it("is false once another tab is selected", () => {
    mockRootState = tree(2);
    expect(renderHook(() => useIsTabSelected("arena")).result.current).toBe(
      false,
    );
  });

  it("fails OPEN on a tree it does not recognise", () => {
    // A false negative silently drops a live athlete out of the lobby with
    // nothing to notice; a false positive keeps them live slightly longer,
    // which backgrounding and the next visit both correct.
    mockRootState = undefined;
    expect(renderHook(() => useIsTabSelected("arena")).result.current).toBe(true);
  });
});
