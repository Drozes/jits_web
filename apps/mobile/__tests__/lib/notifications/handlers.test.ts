/**
 * Push-tap routing after the session and gym routes were removed from mobile
 * (jits-gewv). A payload route into a removed family must go Home, never to an
 * unmatched screen; every other route is pushed unchanged.
 *
 * Source: apps/mobile/lib/notifications/handlers.ts
 */
type ResponseListener = (response: unknown) => void;
let mockListener: ResponseListener | null = null;

jest.mock("expo-notifications", () => ({
  setNotificationHandler: jest.fn(),
  addNotificationResponseReceivedListener: (fn: ResponseListener) => {
    mockListener = fn;
    return { remove: jest.fn() };
  },
}));

const mockPush = jest.fn();
jest.mock("expo-router", () => ({ router: { push: (...a: unknown[]) => mockPush(...a) } }));

import {
  setupNotificationHandlers,
  teardownNotificationHandlers,
} from "@/lib/notifications/handlers";

function tap(data: unknown) {
  mockListener?.({ notification: { request: { content: { data } } } });
}

beforeEach(() => {
  mockPush.mockClear();
  teardownNotificationHandlers();
  setupNotificationHandlers();
});

describe("notification tap routing", () => {
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
});
