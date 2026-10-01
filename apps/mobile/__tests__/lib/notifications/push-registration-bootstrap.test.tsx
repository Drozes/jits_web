/**
 * The iOS push permission prompt is a one-shot; it must not fire on the TOS
 * step for a pending athlete, only once the athlete is active (jits-r75.1).
 */
import * as React from "react";
import { act, render } from "@testing-library/react-native";

let mockAthlete: { id: string; status: string } | null = null;
jest.mock("@/lib/auth/hooks", () => ({
  useAuth: () => ({ athlete: mockAthlete }),
}));
jest.mock("@/lib/supabase/client", () => ({ supabase: {} }));

const mockRegister = jest.fn(() => Promise.resolve({ ok: true }));
jest.mock("@/lib/notifications/register-push", () => ({
  registerForPushNotifications: (...a: unknown[]) => mockRegister(...(a as [])),
}));
jest.mock("@/lib/notifications/handlers", () => ({
  setupNotificationHandlers: jest.fn(),
}));

import { PushRegistrationBootstrap } from "@/lib/notifications/push-registration-bootstrap";

const flush = () => act(async () => {});

beforeEach(() => {
  jest.clearAllMocks();
  mockAthlete = null;
});

describe("PushRegistrationBootstrap", () => {
  it("does not register (or prompt) for a pending athlete", async () => {
    mockAthlete = { id: "me-1", status: "pending" };
    render(<PushRegistrationBootstrap />);
    await flush();
    expect(mockRegister).not.toHaveBeenCalled();
  });

  it("registers once the athlete becomes active", async () => {
    mockAthlete = { id: "me-1", status: "pending" };
    const r = render(<PushRegistrationBootstrap />);
    await flush();
    expect(mockRegister).not.toHaveBeenCalled();

    mockAthlete = { id: "me-1", status: "active" };
    r.rerender(<PushRegistrationBootstrap />);
    await flush();
    expect(mockRegister).toHaveBeenCalledTimes(1);
    expect(mockRegister).toHaveBeenCalledWith({}, "me-1");
  });

  it("still registers a non-pending, non-active athlete (e.g. inactive)", async () => {
    mockAthlete = { id: "me-1", status: "inactive" };
    render(<PushRegistrationBootstrap />);
    await flush();
    expect(mockRegister).toHaveBeenCalledTimes(1);
  });

  it("does not register with no athlete", async () => {
    render(<PushRegistrationBootstrap />);
    await flush();
    expect(mockRegister).not.toHaveBeenCalled();
  });
});

describe("invitee push deferral (jr_be spec 016: asked after the first match)", () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const AsyncStorage = jest.requireMock("@react-native-async-storage/async-storage");
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { useArenaMatchScreen } = require("@/lib/arena/arena-store");

  function MatchScreen() {
    useArenaMatchScreen();
    return null;
  }

  afterEach(async () => {
    await AsyncStorage.clear();
  });

  // Runs before the match test: the match-exit count is module state.
  it("a join-link invitee (no match to wait for) registers as soon as the deferral is released", async () => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { releasePushDeferral } = require("@/lib/invites/pending-invite");
    await AsyncStorage.setItem("elorated.invite.deferPush.v1", "1");
    mockAthlete = { id: "me-1", status: "active" };
    render(<PushRegistrationBootstrap />);
    await flush();
    expect(mockRegister).not.toHaveBeenCalled();
    await act(async () => {
      await releasePushDeferral();
    });
    await flush();
    expect(mockRegister).toHaveBeenCalledTimes(1);
  });

  it("holds registration until a match screen has been left, then clears the flag", async () => {
    await AsyncStorage.setItem("elorated.invite.deferPush.v1", "1");
    mockAthlete = { id: "me-1", status: "active" };
    render(<PushRegistrationBootstrap />);
    await flush();
    expect(mockRegister).not.toHaveBeenCalled();

    const match = render(<MatchScreen />);
    await flush();
    match.unmount();
    await flush();
    expect(mockRegister).toHaveBeenCalledTimes(1);
    expect(await AsyncStorage.getItem("elorated.invite.deferPush.v1")).toBeNull();
  });

});
