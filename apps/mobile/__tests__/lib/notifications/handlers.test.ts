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
jest.mock("expo-router", () => ({ router: { push: (...a: unknown[]) => mockPush(...a) } }));

import { renderHook } from "@testing-library/react-native";
import {
  markNotificationRouterReady,
  notificationTarget,
  resetNotificationRouterReady,
  resetNotificationRoutingForTests,
  setupNotificationHandlers,
  teardownNotificationHandlers,
} from "@/lib/notifications/handlers";
import { __resetArenaStoreForTests, useArenaMatchScreen } from "@/lib/arena/arena-store";
import { resolveSystemPath } from "@/lib/deep-links/system-path";

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

  it.each(["/athlete/a-1", "/match/m-1", "/arena"])("pushes %s unchanged", (route) => {
    tap({ route });
    expect(mockPush).toHaveBeenCalledWith(route);
  });

  it.each([
    "/session/s-1/lobby",
    "/(app)/session/s-1/join",
    "/gyms/g-1",
    "/gym-manager/roster",
  ])("sends removed route %s Home", (route) => {
    tap({ route });
    expect(mockPush).toHaveBeenCalledTimes(1);
    expect(mockPush).toHaveBeenCalledWith("/");
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
    expect(mockPush).toHaveBeenCalledTimes(2);
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
    expect(mockPush).toHaveBeenCalledWith("/");
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
    expect(mockPush).toHaveBeenCalledTimes(1);
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
