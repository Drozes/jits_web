import * as React from "react";
import { render } from "@testing-library/react-native";

// ---- mocks ----

jest.mock("lucide-react-native", () => {
  const RN = require("react-native");
  const R = require("react");
  const stub = () => R.createElement(RN.View, { testID: "icon" });
  return new Proxy(
    {},
    {
      get: (_target: Record<string, unknown>, prop: string) => {
        if (prop === "__esModule") return true;
        return stub;
      },
    },
  );
});

jest.mock("@/lib/theme/use-theme", () => ({
  useThemedTokens: () => ({
    primary: "#E63946",
    foreground: "#000000",
    mutedForeground: "#6B7280",
    primaryForeground: "#ffffff",
  }),
}));

jest.mock("@/lib/supabase/client", () => ({
  supabase: {},
}));

jest.mock("@/components/ui/toast", () => ({
  toast: { success: jest.fn(), error: jest.fn() },
}));

jest.mock("@jits/shared/api/mutations", () => ({
  activateSession: jest.fn().mockResolvedValue({ ok: true, data: undefined }),
  cancelSession: jest.fn().mockResolvedValue({ ok: true, data: undefined }),
  completeSession: jest.fn().mockResolvedValue({ ok: true, data: undefined }),
}));

import { SessionActions } from "@/components/session/session-actions";

const onActionComplete = jest.fn();

beforeEach(() => {
  jest.clearAllMocks();
});

describe("SessionActions", () => {
  it("renders the menu trigger for a scheduled session", () => {
    const { getByTestId } = render(
      <SessionActions
        sessionId="s1"
        status="scheduled"
        onActionComplete={onActionComplete}
      />,
    );
    // The component renders a Pressable with a MoreVertical icon
    // If it renders at all (not returning null), the test passes
    expect(getByTestId("icon")).toBeTruthy();
  });

  it("renders the menu trigger for an active session", () => {
    const { getByTestId } = render(
      <SessionActions
        sessionId="s2"
        status="active"
        onActionComplete={onActionComplete}
      />,
    );
    expect(getByTestId("icon")).toBeTruthy();
  });

  it("returns null for a completed session (no actions available)", () => {
    const { toJSON } = render(
      <SessionActions
        sessionId="s3"
        status="completed"
        onActionComplete={onActionComplete}
      />,
    );
    expect(toJSON()).toBeNull();
  });

  it("returns null for a cancelled session (no actions available)", () => {
    const { toJSON } = render(
      <SessionActions
        sessionId="s4"
        status="cancelled"
        onActionComplete={onActionComplete}
      />,
    );
    expect(toJSON()).toBeNull();
  });
});
