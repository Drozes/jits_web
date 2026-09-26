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
