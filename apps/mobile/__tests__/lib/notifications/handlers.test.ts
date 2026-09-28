/**
 * Push-tap routing.
 *
 * - After the session and gym routes were removed from mobile (jits-gewv), a
 *   payload route into a removed family must go Home, never to an unmatched
 *   screen; every other route is pushed unchanged.
 * - Highlight Reels phase 2 (jr_be spec 014 section 16.6.4): a
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

jest.mock("expo-notifications", () => ({
  setNotificationHandler: jest.fn(),
  addNotificationResponseReceivedListener: (fn: ResponseListener) => {
    mockListener = fn;
    return { remove: jest.fn() };
  },
  getLastNotificationResponseAsync: (...a: unknown[]) => mockGetLast(...a),
  clearLastNotificationResponseAsync: (...a: unknown[]) => mockClearLast(...a),
}));

const mockPush = jest.fn();
jest.mock("expo-router", () => ({ router: { push: (...a: unknown[]) => mockPush(...a) } }));

import {
  markNotificationRouterReady,
  notificationTarget,
  resetNotificationRoutingForTests,
  setupNotificationHandlers,
  teardownNotificationHandlers,
} from "@/lib/notifications/handlers";
import { resolveSystemPath } from "@/lib/deep-links/system-path";

let seq = 0;
function response(data: unknown, identifier = `n-${++seq}`) {
  return { notification: { request: { identifier, content: { data } } } };
}

function tap(data: unknown, identifier?: string) {
  mockListener?.(response(data, identifier));
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

beforeEach(() => {
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
