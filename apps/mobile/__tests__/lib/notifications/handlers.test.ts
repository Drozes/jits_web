/**
 * Push-tap routing.
 *
 * - After the session and gym routes were removed from mobile (jits-gewv), a
 *   payload route into a removed family must go Home, never to an unmatched
 *   screen; every other route is pushed unchanged.
 * - Highlight Reels phase 2 (jr_be spec 015 section 16.6.4): a
 *   `highlight_ready` push opens `/highlight/<id>?source=push`, both warm and
 *   from a cold start (`getLastNotificationResponseAsync`), exactly once: a
 *   tap seen by both the listener and the cold-start read never navigates
 *   twice, and nothing is pushed before the router is ready.
 *
 * Source: apps/mobile/lib/notifications/handlers.ts
 */
type ResponseListener = (response: unknown) => void;
let mockListener: ResponseListener | null = null;
const mockGetLast = jest.fn();
const mockClearLast = jest.fn();

const mockSetHandler = jest.fn();
// The sync cold-start API (expo-notifications >= 0.32): off by default so the
// async suites keep covering the fallback; one describe turns it on.
// eslint-disable-next-line no-var
var mockSync: { on: boolean } = { on: false };
const mockGetLastSync = jest.fn();
const mockClearLastSync = jest.fn();

jest.mock("expo-notifications", () => ({
  setNotificationHandler: (...a: unknown[]) => mockSetHandler(...a),
  get getLastNotificationResponse() {
    return mockSync.on ? mockGetLastSync : undefined;
  },
  get clearLastNotificationResponse() {
    return mockSync.on ? mockClearLastSync : undefined;
  },
  addNotificationResponseReceivedListener: (fn: ResponseListener) => {
    mockListener = fn;
    return { remove: jest.fn() };
  },
  getLastNotificationResponseAsync: (...a: unknown[]) => mockGetLast(...a),
  clearLastNotificationResponseAsync: (...a: unknown[]) => mockClearLast(...a),
}));

const mockPush = jest.fn();
const mockNavigate = jest.fn();
const mockDismissTo = jest.fn();
jest.mock("expo-router", () => ({
  router: {
    push: (...a: unknown[]) => mockPush(...a),
    navigate: (...a: unknown[]) => mockNavigate(...a),
    dismissTo: (...a: unknown[]) => mockDismissTo(...a),
  },
  useSegments: () => [],
}));

import * as React from "react";
import { render, renderHook } from "@testing-library/react-native";
import {
  markNotificationRouterReady,
  notificationTarget,
  resetNotificationRouterReady,
  resetNotificationRoutingForTests,
  setupNotificationHandlers,
  teardownNotificationHandlers,
} from "@/lib/notifications/handlers";
import { __resetArenaStoreForTests, useArenaMatchScreen } from "@/lib/arena/arena-store";
import {
  __resetTimekeepSheetStoreForTests,
  useTimekeepSheetScreen,
  useTimekeepTapHold,
} from "@/lib/match-flow/timekeep-sheet-store";
import { resolveSystemPath } from "@/lib/deep-links/system-path";
import { exitMatchTo } from "@/lib/match-flow/exit-to";
import { ARENA_HREF } from "@/lib/arena/constants";
import { __setAppStackOnTabsForTests } from "@/lib/deep-links/tab-root-route";
import { dropsDuringMatch, holdsDuringMatch } from "@/lib/notifications/handlers";

let seq = 0;
function response(data: unknown, identifier = `n-${++seq}`) {
  return { notification: { request: { identifier, content: { data } } } };
}

function tap(data: unknown, identifier?: string) {
  mockListener?.(response(data, identifier));
}

/** The held-tap flush runs on the next tick after a match exit. */
function tick() {
  return new Promise((r) => setTimeout(r, 0));
}

/** Let the cold-start read (a resolved promise chain) settle. */
async function flush() {
  for (let i = 0; i < 5; i++) await Promise.resolve();
}

const HIGHLIGHT_PUSH = {
  type: "highlight_ready",
  id: "h-1",
  route: "/highlight/h-1?source=push",
};

/** Mount a match screen (the in-match bit) until the returned unmount runs. */
function enterMatch(): () => void {
  const { unmount } = renderHook(() => useArenaMatchScreen());
  return unmount;
}

beforeEach(() => {
  __resetArenaStoreForTests();
  mockSync.on = false;
  mockGetLastSync.mockReset().mockReturnValue(null);
  mockClearLastSync.mockReset();
  mockSetHandler.mockClear();
  mockPush.mockClear();
  mockNavigate.mockClear();
  mockDismissTo.mockClear();
  __setAppStackOnTabsForTests(true);
  mockGetLast.mockReset().mockResolvedValue(null);
  mockClearLast.mockReset().mockResolvedValue(undefined);
  teardownNotificationHandlers();
  resetNotificationRoutingForTests();
  setupNotificationHandlers();
});

describe("notification tap routing (warm, router ready)", () => {
  beforeEach(async () => {
    markNotificationRouterReady();
    await flush();
  });

  it.each(["/athlete/a-1", "/match/m-1"])("pushes %s unchanged", (route) => {
    tap({ route });
    expect(mockPush).toHaveBeenCalledWith(route);
  });

  it("opens a tab root in place from the tabs (navigate, never push)", () => {
    tap({ route: "/arena?challenge=c-1" });
    expect(mockNavigate).toHaveBeenCalledWith("/arena?challenge=c-1");
    expect(mockPush).not.toHaveBeenCalled();
    expect(mockDismissTo).not.toHaveBeenCalled();
  });

  it("opens a challenge push's arena_href in place (the jr_be key old builds ignore)", () => {
    tap({ type: "challenge", id: "c-1", arena_href: "/arena?challenge=c-1" });
    expect(mockNavigate).toHaveBeenCalledWith("/arena?challenge=c-1");
    expect(mockPush).not.toHaveBeenCalled();
  });

  it("honours only an Arena href from arena_href", () => {
    expect(notificationTarget({ arena_href: "/arena" })).toBe("/arena");
    expect(notificationTarget({ arena_href: " /arena?challenge=c-2 " })).toBe("/arena?challenge=c-2");
    expect(notificationTarget({ arena_href: "/athlete/a-1" })).toBeNull();
    expect(notificationTarget({ arena_href: "/arenas" })).toBeNull();
    expect(notificationTarget({ arena_href: 42 })).toBeNull();
    // An explicit route still wins.
    expect(notificationTarget({ route: "/match/m-1", arena_href: "/arena" })).toBe("/match/m-1");
  });

  it("drops an arena_href challenge tap during a match, like a routed one", () => {
    expect(dropsDuringMatch({ type: "challenge", arena_href: "/arena?challenge=c-3" })).toBe(true);
  });

  it("opens a tab root from a pushed detail screen by dismissing back to the tabs", () => {
    __setAppStackOnTabsForTests(false);
    tap({ route: "/arena?challenge=c-1" });
    expect(mockDismissTo).toHaveBeenCalledWith("/arena?challenge=c-1");
    expect(mockPush).not.toHaveBeenCalled();
    expect(mockNavigate).not.toHaveBeenCalled();
  });

  it.each([
    "/session/s-1/lobby",
    "/(app)/session/s-1/join",
    "/gyms/g-1",
    "/gym-manager/roster",
  ])("sends removed route %s Home", (route) => {
    tap({ route });
    expect(mockNavigate).toHaveBeenCalledTimes(1);
    expect(mockNavigate).toHaveBeenCalledWith("/");
    expect(mockPush).not.toHaveBeenCalled();
  });

  it.each([undefined, {}, { route: "" }, { route: 42 }])(
    "does nothing without a usable route (%p)",
    (data) => {
      tap(data);
      expect(mockPush).not.toHaveBeenCalled();
    },
  );

  it("opens the highlight viewer from a highlight_ready push", () => {
    tap(HIGHLIGHT_PUSH);
    expect(mockPush).toHaveBeenCalledTimes(1);
    expect(mockPush).toHaveBeenCalledWith("/highlight/h-1?source=push");
  });

  it("builds the viewer route from the id when a highlight_ready push has no route", () => {
    tap({ type: "highlight_ready", id: "h-2" });
    expect(mockPush).toHaveBeenCalledWith("/highlight/h-2?source=push");
  });

  it("routes the same notification only once", () => {
    tap(HIGHLIGHT_PUSH, "same");
    tap(HIGHLIGHT_PUSH, "same");
    expect(mockPush).toHaveBeenCalledTimes(1);
  });

  it("routes two different taps", () => {
    tap({ route: "/arena" });
    tap(HIGHLIGHT_PUSH);
    expect(mockNavigate).toHaveBeenCalledTimes(1);
    expect(mockPush).toHaveBeenCalledTimes(1);
  });
});

describe("cold start", () => {
  it("routes the launching tap once the router is ready, exactly once", async () => {
    mockGetLast.mockResolvedValue(response(HIGHLIGHT_PUSH, "launch"));
    expect(mockPush).not.toHaveBeenCalled();

    markNotificationRouterReady();
    await flush();
    expect(mockPush).toHaveBeenCalledTimes(1);
    expect(mockPush).toHaveBeenCalledWith("/highlight/h-1?source=push");
    expect(mockClearLast).toHaveBeenCalledTimes(1);

    // Home re-mounting (or a second ready call) never re-reads or re-routes.
    markNotificationRouterReady();
    await flush();
    expect(mockGetLast).toHaveBeenCalledTimes(1);
    expect(mockPush).toHaveBeenCalledTimes(1);
  });

  it("holds a tap the listener delivers before the router is ready, then routes it once", async () => {
    // expo-notifications may hand the launching tap to the listener AND report
    // it from getLastNotificationResponseAsync: no double navigation.
    mockGetLast.mockResolvedValue(response(HIGHLIGHT_PUSH, "launch"));
    tap(HIGHLIGHT_PUSH, "launch");
    expect(mockPush).not.toHaveBeenCalled();

    markNotificationRouterReady();
    await flush();
    expect(mockPush).toHaveBeenCalledTimes(1);
    expect(mockPush).toHaveBeenCalledWith("/highlight/h-1?source=push");
  });

  it("a warm tap already routed is not routed again by the cold-start read", async () => {
    markNotificationRouterReady();
    tap(HIGHLIGHT_PUSH, "warm");
    mockGetLast.mockResolvedValue(response(HIGHLIGHT_PUSH, "warm"));
    await flush();
    expect(mockPush).toHaveBeenCalledTimes(1);
  });

  it("does nothing when the app was not launched from a notification", async () => {
    markNotificationRouterReady();
    await flush();
    expect(mockGetLast).toHaveBeenCalledTimes(1);
    expect(mockPush).not.toHaveBeenCalled();
    expect(mockClearLast).not.toHaveBeenCalled();
  });

  it("sends a retired cold-start route Home", async () => {
    mockGetLast.mockResolvedValue(response({ route: "/session/s-1" }, "old"));
    markNotificationRouterReady();
    await flush();
    expect(mockNavigate).toHaveBeenCalledWith("/");
  });

  it("survives a failing cold-start read", async () => {
    const warn = jest.spyOn(console, "warn").mockImplementation(() => undefined);
    mockGetLast.mockRejectedValue(new Error("boom"));
    markNotificationRouterReady();
    await flush();
    expect(mockPush).not.toHaveBeenCalled();
    warn.mockRestore();
  });
});

describe("highlight route", () => {
  it("passes the system-path rewrite unchanged (not a retired route)", () => {
    expect(resolveSystemPath("/highlight/x")).toBe("/highlight/x");
    expect(resolveSystemPath("/highlight/x?source=push")).toBe("/highlight/x?source=push");
    expect(notificationTarget({ route: "/highlight/x?source=push" })).toBe("/highlight/x?source=push");
  });
});


describe("highlight taps during a match (discovery M1)", () => {
  beforeEach(async () => {
    markNotificationRouterReady();
    await flush();
  });

  it("holds a highlight tap while a match screen is mounted and routes it on exit, once", async () => {
    const leave = enterMatch();
    tap(HIGHLIGHT_PUSH, "hl-a");
    expect(mockPush).not.toHaveBeenCalled();
    tap(HIGHLIGHT_PUSH, "hl-a"); // the same tap again: still held once
    leave();
    await tick();
    expect(mockPush).toHaveBeenCalledTimes(1);
    expect(mockPush).toHaveBeenCalledWith("/highlight/h-1?source=push");
  });

  it("keeps only the latest held highlight tap", async () => {
    const leave = enterMatch();
    tap({ type: "highlight_ready", id: "h-old" }, "a");
    tap({ type: "highlight_ready", id: "h-new" }, "b");
    leave();
    await tick();
    expect(mockPush.mock.calls).toEqual([["/highlight/h-new?source=push"]]);
  });

  it("a highlight route without the type is held too", async () => {
    const leave = enterMatch();
    tap({ route: "/highlight/h-9?source=push" });
    expect(mockPush).not.toHaveBeenCalled();
    leave();
    await tick();
    expect(mockPush).toHaveBeenCalledWith("/highlight/h-9?source=push");
  });

  it("a match that mounts in the same tick as the exit re-holds the tap", async () => {
    const leaveA = enterMatch();
    tap(HIGHLIGHT_PUSH, "same-tick");
    leaveA();
    const leaveB = enterMatch(); // e.g. the next match pushed from the summary
    await tick();
    expect(mockPush).not.toHaveBeenCalled();
    leaveB();
    await tick();
    expect(mockPush).toHaveBeenCalledTimes(1);
  });

  it("drops a challenge push tapped during a match: entering it declined that challenge", async () => {
    const leave = enterMatch();
    __setAppStackOnTabsForTests(false);
    tap({ route: "/arena?challenge=c-7" }, "challenge-7");
    expect(mockDismissTo).not.toHaveBeenCalled();
    expect(mockNavigate).not.toHaveBeenCalled();
    leave();
    __setAppStackOnTabsForTests(true); // the exit landed on the tabs
    await tick();
    expect(mockNavigate).not.toHaveBeenCalled();
    expect(mockDismissTo).not.toHaveBeenCalled();
    // Dropped for good.
    tap({ route: "/arena?challenge=c-7" }, "challenge-7");
    expect(mockNavigate).not.toHaveBeenCalled();
  });

  it("a challenge tap after a highlight tap in the same match never displaces the held highlight", async () => {
    const leave = enterMatch();
    tap(HIGHLIGHT_PUSH, "reel-1");
    tap({ route: "/arena?challenge=c-8" }, "challenge-8");
    leave();
    await tick();
    expect(mockPush).toHaveBeenCalledTimes(1);
    expect(mockNavigate).not.toHaveBeenCalledWith("/arena?challenge=c-8");
  });

  it("drops a status push's plain /arena tapped during a match: it never navigates after the exit", async () => {
    // e.g. 'Challenge Accepted' arriving as the challenger enters that match.
    const leave = enterMatch();
    tap({ type: "challenge_accepted", route: "/arena" }, "status-1");
    expect(mockNavigate).not.toHaveBeenCalled();
    leave();
    await tick();
    expect(mockNavigate).not.toHaveBeenCalled();
    expect(mockDismissTo).not.toHaveBeenCalled();
    expect(mockPush).not.toHaveBeenCalled();
    // Dropped for good, not re-routed by a later delivery of the same tap.
    tap({ type: "challenge_accepted", route: "/arena" }, "status-1");
    expect(mockNavigate).not.toHaveBeenCalled();
  });

  it("a status push's /arena outside a match still opens the Arena in place", () => {
    tap({ type: "challenge_declined", route: "/arena" });
    expect(mockNavigate).toHaveBeenCalledWith("/arena");
  });

  it("classifies which taps wait for the match", () => {
    expect(holdsDuringMatch(HIGHLIGHT_PUSH)).toBe(true);
    expect(holdsDuringMatch({ route: "/arena?challenge=c-1" })).toBe(false);
    expect(holdsDuringMatch({ route: "/" })).toBe(false);
    expect(holdsDuringMatch({ route: "/arena" })).toBe(false);
    expect(dropsDuringMatch({ route: "/arena" })).toBe(true);
    expect(dropsDuringMatch({ route: "/" })).toBe(true);
    expect(dropsDuringMatch({ route: "/arena?challenge=c-1" })).toBe(true);
    expect(dropsDuringMatch(HIGHLIGHT_PUSH)).toBe(false);
    expect(dropsDuringMatch({ route: "/athlete/a-1" })).toBe(false);
    expect(holdsDuringMatch({ route: "/athlete/a-1" })).toBe(false);
    expect(holdsDuringMatch({ route: "/match/m-1" })).toBe(false);
  });

  it("does not hold other taps during a match", async () => {
    const leave = enterMatch();
    tap({ route: "/athlete/a-1" });
    expect(mockPush).toHaveBeenCalledWith("/athlete/a-1");
    leave();
  });

  it("a nested match (the next match mounts before the old one unmounts) keeps holding", async () => {
    const leaveA = enterMatch();
    tap(HIGHLIGHT_PUSH);
    const leaveB = enterMatch();
    leaveA();
    expect(mockPush).not.toHaveBeenCalled();
    leaveB();
    await tick();
    expect(mockPush).toHaveBeenCalledTimes(1);
  });

  it("suppresses the foreground banner for highlight_ready only while in a match", async () => {
    const handler = mockSetHandler.mock.calls[0][0].handleNotification as (n: unknown) => Promise<Record<string, boolean>>;
    const note = (data: unknown) => ({ request: { content: { data } } });
    expect((await handler(note(HIGHLIGHT_PUSH))).shouldShowBanner).toBe(true);
    const leave = enterMatch();
    const inMatch = await handler(note(HIGHLIGHT_PUSH));
    expect(inMatch.shouldShowBanner).toBe(false);
    expect(inMatch.shouldShowList).toBe(true);
    expect((await handler(note({ route: "/athlete/a-1" }))).shouldShowBanner).toBe(true);
    leave();
    await tick();
    expect((await handler(note(HIGHLIGHT_PUSH))).shouldShowBanner).toBe(true);
  });
});

describe("a held highlight tap after the match exits", () => {
  const dismissTo = jest.fn();

  beforeEach(async () => {
    markNotificationRouterReady();
    await flush();
  });

  // The verdict's Rematch auto-send (and the guard that dropped a held tap
  // for it) is gone (jits-02vo.8): every exit routes the held tap.
  it("routes the held tap after any exit, including an Arena exit with params", async () => {
    for (const href of [ARENA_HREF, `${ARENA_HREF}?rematch=opp-1&send=1`, "/"]) {
      mockPush.mockClear();
      const leave = enterMatch();
      tap(HIGHLIGHT_PUSH);
      exitMatchTo({ dismissTo }, href);
      leave();
      await tick();
      expect(mockPush).toHaveBeenCalledTimes(1);
    }
  });
});

describe("cold start during a match (rejoinStartedMatch ordering)", () => {
  it("the accepter rejoin mounted the match first: the launching highlight tap waits for the exit", async () => {
    mockGetLast.mockResolvedValue(response(HIGHLIGHT_PUSH, "cold-1"));
    const leave = enterMatch(); // rejoinStartedMatch put the athlete into the match
    markNotificationRouterReady();
    await flush();
    expect(mockPush).not.toHaveBeenCalled();
    leave();
    await tick();
    expect(mockPush).toHaveBeenCalledTimes(1);
    expect(mockPush).toHaveBeenCalledWith("/highlight/h-1?source=push");
  });

  it("the highlight tap routed first: a later rejoin simply pushes the match on top (no re-route)", async () => {
    mockGetLast.mockResolvedValue(response(HIGHLIGHT_PUSH, "cold-2"));
    markNotificationRouterReady();
    await flush();
    expect(mockPush).toHaveBeenCalledTimes(1);
    const leave = enterMatch();
    leave();
    await tick();
    expect(mockPush).toHaveBeenCalledTimes(1);
  });
});

describe("sign-out (discovery M2)", () => {
  it("resetNotificationRouterReady holds taps again until the next sign-in marks ready", async () => {
    markNotificationRouterReady();
    await flush();
    resetNotificationRouterReady();
    tap({ route: "/athlete/a-1" }, "after-signout");
    expect(mockPush).not.toHaveBeenCalled();
    markNotificationRouterReady();
    expect(mockPush).toHaveBeenCalledWith("/athlete/a-1");
  });

  it("drops a tap held before sign-out (the previous account's)", async () => {
    tap({ route: "/athlete/prev" }, "prev-tap");
    resetNotificationRouterReady();
    markNotificationRouterReady();
    await flush();
    expect(mockPush).not.toHaveBeenCalled();
  });

  it("drops a highlight tap held during a match across sign-out", async () => {
    markNotificationRouterReady();
    await flush();
    const leave = enterMatch();
    tap(HIGHLIGHT_PUSH, "held-hl");
    resetNotificationRouterReady();
    leave();
    markNotificationRouterReady();
    await tick();
    expect(mockPush).not.toHaveBeenCalled();
  });

  it("does not re-read the cold-start response after a sign-out / sign-in", async () => {
    mockGetLast.mockResolvedValue(response({ route: "/arena" }, "cold-x"));
    markNotificationRouterReady();
    await flush();
    resetNotificationRouterReady();
    markNotificationRouterReady();
    await flush();
    expect(mockGetLast).toHaveBeenCalledTimes(1);
    expect(mockNavigate).toHaveBeenCalledTimes(1);
  });
});

describe("sync cold-start API (NIT)", () => {
  it("uses getLastNotificationResponse / clearLastNotificationResponse when available", () => {
    mockSync.on = true;
    mockGetLastSync.mockReturnValue(response(HIGHLIGHT_PUSH, "sync-1"));
    markNotificationRouterReady();
    expect(mockPush).toHaveBeenCalledWith("/highlight/h-1?source=push");
    expect(mockClearLastSync).toHaveBeenCalledTimes(1);
    expect(mockGetLast).not.toHaveBeenCalled();
  });
});

describe("invite and friend pushes (jr_be spec 016, contract 5)", () => {
  const M = "/match/0b7a6f3e-2c1d-4e5f-8a9b-0c1d2e3f4a5b";
  const P = "/athlete/0b7a6f3e-2c1d-4e5f-8a9b-0c1d2e3f4a5b";
  it("match_href beats profile_href beats arena_href", () => {
    expect(notificationTarget({ type: "invite", match_href: M, arena_href: "/arena" })).toBe(M);
    expect(notificationTarget({ type: "invite", profile_href: P, arena_href: "/arena" })).toBe(P);
    expect(notificationTarget({ type: "friend", arena_href: "/arena?athlete=a1" })).toBe("/arena?athlete=a1");
    expect(notificationTarget({ type: "invite", arena_href: "/arena?booking=c1" })).toBe("/arena?booking=c1");
  });
  it("ignores hrefs that do not match their exact shape", () => {
    expect(notificationTarget({ match_href: "/match/../settings", arena_href: "/arena" })).toBe("/arena");
    expect(notificationTarget({ profile_href: "https://evil.example/athlete/x" })).toBeNull();
  });
});

describe("match video pushes land on the Film status plate (jits-n2im.13)", () => {
  const MATCH = "11111111-1111-4111-8111-111111111111";
  const kinds = ["film_ready", "no_film", "timekeeper_film_ready"] as const;
  const push = (type: string, over: Record<string, unknown> = {}) => ({ type, id: MATCH, route: `/match-detail/${MATCH}`, ...over });

  beforeEach(async () => {
    markNotificationRouterReady();
    await flush();
  });

  it.each(kinds)("%s routes to the match page (the plate is its canonical film surface)", (type) => {
    expect(notificationTarget(push(type))).toBe(`/match-detail/${MATCH}`);
    tap(push(type));
    expect(mockPush).toHaveBeenCalledWith(`/match-detail/${MATCH}`);
    expect(mockNavigate).not.toHaveBeenCalled();
  });

  it.each(kinds)("%s without a route still opens its match from data.id", (type) => {
    expect(notificationTarget({ type, id: MATCH })).toBe(`/match-detail/${MATCH}`);
  });

  it("a video push with a route that is not its match page falls back to data.id", () => {
    expect(notificationTarget(push("film_ready", { route: "/arena" }))).toBe(`/match-detail/${MATCH}`);
    expect(notificationTarget(push("no_film", { route: `/(app)/match-detail/${MATCH}` }))).toBe(`/(app)/match-detail/${MATCH}`);
  });

  it.each(kinds)("%s is held during a live match and opens on the way out, never dropped", async (type) => {
    expect(holdsDuringMatch(push(type))).toBe(true);
    expect(dropsDuringMatch(push(type))).toBe(false);
    const leave = enterMatch();
    tap(push(type));
    expect(mockPush).not.toHaveBeenCalled();
    leave();
    await tick();
    expect(mockPush).toHaveBeenCalledWith(`/match-detail/${MATCH}`);
  });

  it("an unknown type falls back as before (its route, else nothing)", () => {
    expect(notificationTarget({ type: "angle_arriving", id: MATCH })).toBeNull();
    expect(holdsDuringMatch({ type: "angle_arriving", route: `/match-detail/${MATCH}` })).toBe(false);
  });

  it("no banner over a live match for a video push; it stays in the list", async () => {
    const handler = mockSetHandler.mock.calls[mockSetHandler.mock.calls.length - 1][0].handleNotification;
    const leave = enterMatch();
    const during = await handler({ request: { content: { data: push("film_ready") } } });
    expect(during).toMatchObject({ shouldShowBanner: false, shouldShowList: true });
    leave();
    const after = await handler({ request: { content: { data: push("film_ready") } } });
    expect(after.shouldShowBanner).toBe(true);
  });
});

describe("timekeeper-mode pushes (timekeeper mode M2, spec 8)", () => {
  const M = "0c1d2e3f-4a5b-4c6d-8e7f-001122334455";
  const OTHER = "0c1d2e3f-4a5b-4c6d-8e7f-667788990011";
  const TIMEKEEP = `/match/${M}/timekeep`;
  const ADMIN = "/settings/admin/timekeeper-reviews";
  /** A push as the jr_be push function builds it: type, kind, match_id and one href key. */
  const tk = (kind: string, link: Record<string, string>, matchId = M) => ({ type: "timekeeper", kind, match_id: matchId, ...link });
  /** Mount a screen of one match (the match route passes its id). */
  const enterMatchOf = (matchId: string) => renderHook(() => useArenaMatchScreen(matchId)).unmount;
  const handler = () =>
    mockSetHandler.mock.calls[mockSetHandler.mock.calls.length - 1][0].handleNotification as (
      n: unknown,
    ) => Promise<Record<string, boolean>>;
  const note = (data: unknown) => ({ request: { content: { data } } });

  beforeEach(async () => {
    markNotificationRouterReady();
    await flush();
  });

  it("the asked person's timekeep_href opens the timekeep sheet", () => {
    tap(tk("timekeeper_requested", { timekeep_href: TIMEKEEP }));
    expect(mockPush).toHaveBeenCalledWith(TIMEKEEP);
    expect(mockNavigate).not.toHaveBeenCalled();
  });

  it("an admin's admin_href opens Admin > Timekeeper reviews", () => {
    tap(tk("admin_result_review", { admin_href: ADMIN }));
    expect(mockPush).toHaveBeenCalledWith(ADMIN);
  });

  it("ignores timekeeper hrefs that do not match their exact shape", () => {
    expect(notificationTarget({ timekeep_href: "/match/x/timekeep" })).toBeNull();
    expect(notificationTarget({ timekeep_href: `${TIMEKEEP}/../../settings` })).toBeNull();
    expect(notificationTarget({ timekeep_href: `https://evil.example${TIMEKEEP}` })).toBeNull();
    expect(notificationTarget({ admin_href: "/settings/admin/flags" })).toBeNull();
    expect(notificationTarget(tk("timekeeper_accepted", { match_href: `/match/${M}` }))).toBe(`/match/${M}`);
  });

  it("a timekeep tap during a match is not dropped: the sheet opens at once (its request lapses in 2 minutes)", () => {
    const leave = enterMatchOf(OTHER);
    tap(tk("timekeeper_requested", { timekeep_href: TIMEKEEP }));
    expect(mockPush).toHaveBeenCalledWith(TIMEKEEP);
    expect(dropsDuringMatch(tk("timekeeper_requested", { timekeep_href: TIMEKEEP }))).toBe(false);
    expect(holdsDuringMatch(tk("timekeeper_requested", { timekeep_href: TIMEKEEP }))).toBe(false);
    leave();
  });

  it("a timekeep tap during the practice run (no match id) waits for its exit, then opens the sheet once", async () => {
    // Nothing refuses an Accept during practice (it writes nothing), so the
    // match would open over the practice screen and its camera.
    const leave = enterMatch();
    tap(tk("timekeeper_requested", { timekeep_href: TIMEKEEP }), "tk-practice-ask");
    expect(mockPush).not.toHaveBeenCalled();
    leave();
    await tick();
    expect(mockPush).toHaveBeenCalledWith(TIMEKEEP);
    expect(mockPush).toHaveBeenCalledTimes(1);
    tap(tk("timekeeper_requested", { timekeep_href: TIMEKEEP }), "tk-practice-ask");
    expect(mockPush).toHaveBeenCalledTimes(1);
  });

  it("a real match screen mounted with practice is not practice only: the timekeep tap opens at once", () => {
    const leavePractice = enterMatch();
    const leave = enterMatchOf(OTHER);
    tap(tk("timekeeper_requested", { timekeep_href: TIMEKEEP }));
    expect(mockPush).toHaveBeenCalledWith(TIMEKEEP);
    leave();
    leavePractice();
  });

  it("an admin review tap during a match is held, never dropped, and opens after the exit", async () => {
    const leave = enterMatchOf(OTHER);
    tap(tk("admin_result_review", { admin_href: ADMIN }), "adm-1");
    expect(mockPush).not.toHaveBeenCalled();
    leave();
    await tick();
    expect(mockPush).toHaveBeenCalledWith(ADMIN);
    expect(mockPush).toHaveBeenCalledTimes(1);
  });

  it("a cold start from the timekeep push opens the sheet once the router is ready", async () => {
    resetNotificationRoutingForTests();
    mockGetLast.mockResolvedValue(response(tk("timekeeper_requested", { timekeep_href: TIMEKEEP }), "cold-tk"));
    markNotificationRouterReady();
    await flush();
    expect(mockPush).toHaveBeenCalledWith(TIMEKEEP);
    expect(mockPush).toHaveBeenCalledTimes(1);
  });

  it("no foreground banner for a timekeeper push about the match on screen; it stays in the list", async () => {
    const push = tk("timekeeper_result_recorded", { match_href: `/match/${M}` });
    expect((await handler()(note(push))).shouldShowBanner).toBe(true);
    const leave = enterMatchOf(M);
    const during = await handler()(note(push));
    expect(during).toMatchObject({ shouldShowBanner: false, shouldShowList: true });
    // About another match: spec 8 quiets only the match on screen, so its
    // banner shows (only its tap waits for the exit), and it is listed.
    const other = tk("match_timed_out", { match_href: `/match/${OTHER}` }, OTHER);
    expect(await handler()(note(other))).toMatchObject({ shouldShowBanner: true, shouldShowList: true });
    expect(holdsDuringMatch(other)).toBe(true);
    // Not a timekeeper-mode push (flag OFF invites): the banner as before.
    expect((await handler()(note({ type: "invite", match_id: M, match_href: `/match/${M}` }))).shouldShowBanner).toBe(true);
    expect((await handler()(note({ type: "invite", match_id: OTHER, match_href: `/match/${OTHER}` }))).shouldShowBanner).toBe(true);
    // The asked person's request for another match is urgent (2 minutes): its banner shows.
    const ask = tk("timekeeper_requested", { timekeep_href: `/match/${OTHER}/timekeep` }, OTHER);
    expect((await handler()(note(ask))).shouldShowBanner).toBe(true);
    leave();
    expect((await handler()(note(push))).shouldShowBanner).toBe(true);
    expect((await handler()(note(other))).shouldShowBanner).toBe(true);
  });

  it("a timekeeper push about another match during practice (no match id) keeps its banner (spec 8)", async () => {
    const leave = enterMatch();
    const other = tk("timekeeper_result_edited", { match_href: `/match/${OTHER}` }, OTHER);
    expect(await handler()(note(other))).toMatchObject({ shouldShowBanner: true, shouldShowList: true });
    leave();
  });

  it("the asked person's TK-N1 while that match's timekeep sheet is up: no banner, and its tap stacks no second sheet", async () => {
    __resetTimekeepSheetStoreForTests();
    const push = tk("timekeeper_requested", { timekeep_href: TIMEKEEP });
    const sheet = renderHook(() => useTimekeepSheetScreen(M, "q1"));
    expect((await handler()(note(push))).shouldShowBanner).toBe(false);
    tap(push);
    expect(mockPush).not.toHaveBeenCalled();
    // Another match's request still shows and opens.
    const other = tk("timekeeper_requested", { timekeep_href: `/match/${OTHER}/timekeep` }, OTHER);
    expect((await handler()(note(other))).shouldShowBanner).toBe(true);
    tap(other);
    expect(mockPush).toHaveBeenCalledWith(`/match/${OTHER}/timekeep`);
    sheet.unmount();
    expect((await handler()(note(push))).shouldShowBanner).toBe(true);
  });

  it("an old TK-N1 for the match the asked person now timekeeps (its screen is up): no banner, and its tap stays on the match", async () => {
    __resetTimekeepSheetStoreForTests();
    const push = tk("timekeeper_requested", { timekeep_href: TIMEKEEP });
    const leave = enterMatchOf(M);
    expect((await handler()(note(push))).shouldShowBanner).toBe(false);
    tap(push, "tk-seated");
    expect(mockPush).not.toHaveBeenCalled();
    leave();
    // Off that match, the same push opens its sheet (which then reads the request and says it is closed).
    expect((await handler()(note(push))).shouldShowBanner).toBe(true);
    tap(push, "tk-after");
    expect(mockPush).toHaveBeenCalledWith(TIMEKEEP);
  });

  describe("modal precedence (spec 9.1): the challenge prompt or a blocked start's sheet is up", () => {
    const holdWhile = (held: boolean) =>
      renderHook(({ h }: { h: boolean }) => useTimekeepTapHold(h), { initialProps: { h: held } });

    beforeEach(() => __resetTimekeepSheetStoreForTests());

    it("a TK-N1 tap waits and opens the sheet once the prompt closes", async () => {
      const hold = holdWhile(true);
      tap(tk("timekeeper_requested", { timekeep_href: TIMEKEEP }), "tk-held");
      expect(mockPush).not.toHaveBeenCalled();
      // Only the asked person's tap waits: an athlete's timekeeper push opens as before.
      tap(tk("timekeeper_accepted", { match_href: `/match/${OTHER}` }, OTHER));
      expect(mockPush).toHaveBeenCalledWith(`/match/${OTHER}`);
      mockPush.mockClear();
      hold.rerender({ h: false });
      await tick();
      expect(mockPush).toHaveBeenCalledWith(TIMEKEEP);
      expect(mockPush).toHaveBeenCalledTimes(1);
      // Routed once: a repeat of the same tap does nothing.
      tap(tk("timekeeper_requested", { timekeep_href: TIMEKEEP }), "tk-held");
      expect(mockPush).toHaveBeenCalledTimes(1);
      hold.unmount();
    });

    it("the prompt closed because the athlete entered a match: the held tap is dropped, also after the exit", async () => {
      const hold = holdWhile(true);
      tap(tk("timekeeper_requested", { timekeep_href: TIMEKEEP }), "tk-drop");
      const leave = enterMatchOf(OTHER);
      hold.rerender({ h: false });
      await tick();
      expect(mockPush).not.toHaveBeenCalled();
      leave();
      await tick();
      expect(mockPush).not.toHaveBeenCalled();
      hold.unmount();
    });

    it("the prompt closes and the match mounts in the same commit (Accept): the release waits a tick, so the tap is still dropped", async () => {
      // One commit, as when Accept takes the athlete into the match: the
      // prompt's release effect runs before the match screen's mount effect.
      const Prompt = ({ up }: { up: boolean }) => {
        useTimekeepTapHold(up);
        return null;
      };
      const Match = () => {
        useArenaMatchScreen(OTHER);
        return null;
      };
      const shell = (entered: boolean) =>
        React.createElement(
          React.Fragment,
          null,
          React.createElement(Prompt, { up: !entered }),
          entered ? React.createElement(Match) : null,
        );
      const s = render(shell(false));
      tap(tk("timekeeper_requested", { timekeep_href: TIMEKEEP }), "tk-same-commit");
      expect(mockPush).not.toHaveBeenCalled();
      s.rerender(shell(true));
      await tick();
      expect(mockPush).not.toHaveBeenCalled();
      s.unmount();
      await tick();
      expect(mockPush).not.toHaveBeenCalled();
    });

    it("sign-out drops a held tap", async () => {
      const hold = holdWhile(true);
      tap(tk("timekeeper_requested", { timekeep_href: TIMEKEEP }), "tk-out");
      resetNotificationRouterReady();
      hold.rerender({ h: false });
      await tick();
      expect(mockPush).not.toHaveBeenCalled();
      hold.unmount();
    });
  });

  it("a timekeeper push tapped while its match is on screen does not stack a second screen of it", async () => {
    const leave = enterMatchOf(M);
    tap(tk("timekeeper_result_edited", { match_href: `/match/${M}` }), "tk-same");
    expect(mockPush).not.toHaveBeenCalled();
    leave();
    await tick();
    // Claimed, not held: nothing opens after the exit either.
    expect(mockPush).not.toHaveBeenCalled();
  });

  it.each([
    ["timekeeper_result_edited"],
    ["timekeeper_result_recorded"],
    ["admin_result_recorded"],
    ["match_no_contest"],
    ["match_timed_out"],
    ["timekeeper_expired"],
    ["match_cancelled_athlete_left"],
    ["admin_match_voided"],
  ])("%s: a tap about another match waits for the live match's exit, then opens once", async (kind) => {
    const push = tk(kind, { match_href: `/match/${OTHER}` }, OTHER);
    const leave = enterMatchOf(M);
    expect(holdsDuringMatch(push)).toBe(true);
    tap(push, `tk-held-${kind}`);
    // Never pushed over match M: its wizard's exitMatchTo would pop M too.
    expect(mockPush).not.toHaveBeenCalled();
    expect(mockDismissTo).not.toHaveBeenCalled();
    leave();
    await tick();
    expect(mockPush).toHaveBeenCalledWith(`/match/${OTHER}`);
    expect(mockPush).toHaveBeenCalledTimes(1);
    tap(push, `tk-held-${kind}`);
    expect(mockPush).toHaveBeenCalledTimes(1);
  });

  it("a timekeeper push about another match tapped during practice waits for its exit", async () => {
    const leave = enterMatch();
    tap(tk("timekeeper_result_edited", { match_href: `/match/${OTHER}` }, OTHER), "tk-practice");
    expect(mockPush).not.toHaveBeenCalled();
    leave();
    await tick();
    expect(mockPush).toHaveBeenCalledWith(`/match/${OTHER}`);
  });

  it("a held tap whose match the athlete opened meanwhile does not open it a second time", async () => {
    const leaveM = enterMatchOf(M);
    tap(tk("timekeeper_result_edited", { match_href: `/match/${OTHER}` }, OTHER), "tk-entered");
    // OTHER's screen mounts over M before M ends.
    const leaveOther = enterMatchOf(OTHER);
    leaveM();
    leaveOther();
    await tick();
    expect(mockPush).not.toHaveBeenCalled();
  });

  it("flag OFF: an invite match_href about another match still opens during a match (not held)", () => {
    const leave = enterMatchOf(M);
    const invite = { type: "invite", match_id: OTHER, match_href: `/match/${OTHER}` };
    expect(holdsDuringMatch(invite)).toBe(false);
    tap(invite);
    expect(mockPush).toHaveBeenCalledWith(`/match/${OTHER}`);
    leave();
  });
});
