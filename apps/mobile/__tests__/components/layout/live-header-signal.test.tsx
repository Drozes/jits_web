/**
 * The header LIVE signal: an athlete who is live must always be able to see
 * it, on every screen with a header, and reach the Arena from it.
 */
import * as React from "react";
import { act, fireEvent, render } from "@testing-library/react-native";

type HostNode = ReturnType<typeof render>["UNSAFE_root"];
import { Text } from "react-native";

jest.mock("react-native-reanimated", () =>
  require("react-native-reanimated/mock"),
);

jest.mock("lucide-react-native", () => {
  const R = require("react");
  const RN = require("react-native");
  const stub = () => R.createElement(RN.View, { testID: "icon" });
  return new Proxy(
    {},
    {
      get: (_t: Record<string, unknown>, prop: string) =>
        prop === "__esModule" ? true : stub,
    },
  );
});

jest.mock("react-native-safe-area-context", () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

jest.mock("@/lib/theme/use-theme", () => ({
  useThemedTokens: () => ({ textSecondary: "#9CA3AF" }),
}));

jest.mock("@/components/notifications/notification-bell", () => ({
  NotificationBell: () => {
    const R = require("react");
    const RN = require("react-native");
    return R.createElement(RN.View, { testID: "notification-bell" });
  },
}));

const mockNavigate = jest.fn();
jest.mock("expo-router", () => ({
  useRouter: () => ({
    navigate: mockNavigate,
    push: jest.fn(),
    replace: jest.fn(),
    back: jest.fn(),
    canGoBack: () => true,
  }),
}));

import { LiveHeaderSignal } from "@/components/layout/live-header-signal";
import { AppHeader } from "@/components/layout/app-header";
import { BrandHeader } from "@/components/layout/brand-header";
import {
  IDLE_ARENA_STATE,
  __resetArenaStoreForTests,
  publishArenaState,
} from "@/lib/arena/arena-store";
import { ARENA_HREF } from "@/lib/arena/constants";

function goLive(isLive: boolean) {
  act(() => {
    publishArenaState({ ...IDLE_ARENA_STATE, isLive });
  });
}

beforeEach(() => {
  jest.clearAllMocks();
  __resetArenaStoreForTests();
});

describe("LiveHeaderSignal", () => {
  it("renders nothing while the athlete is offline", () => {
    const { queryByTestId, queryByText } = render(<LiveHeaderSignal />);

    expect(queryByTestId("live-header-signal")).toBeNull();
    expect(queryByText("LIVE")).toBeNull();
  });

  it("shows LIVE while live, and goes away again when they go offline", () => {
    const { getByText, queryByText } = render(<LiveHeaderSignal />);

    goLive(true);
    expect(getByText("LIVE")).toBeTruthy();

    goLive(false);
    expect(queryByText("LIVE")).toBeNull();
  });

  it("is a labelled button that opens the Arena tab", () => {
    goLive(true);
    const { getByLabelText } = render(<LiveHeaderSignal />);

    const button = getByLabelText("You are live in the Arena. Open Arena");
    expect(button.props.accessibilityRole).toBe("button");
    fireEvent.press(button);

    expect(mockNavigate).toHaveBeenCalledWith(ARENA_HREF);
  });

  it("is not a link in its static variant (the Arena itself)", () => {
    goLive(true);
    const { getByLabelText, queryByLabelText } = render(
      <LiveHeaderSignal variant="static" />,
    );

    expect(getByLabelText("You are live in the Arena")).toBeTruthy();
    expect(queryByLabelText("You are live in the Arena. Open Arena")).toBeNull();
  });
});

describe("AppHeader", () => {
  it("carries the LIVE signal alongside its right action", () => {
    goLive(true);
    const { getByTestId, getByText } = render(
      <AppHeader title="Profile" rightAction={<Text>Share</Text>} />,
    );

    expect(getByTestId("live-header-signal")).toBeTruthy();
    expect(getByText("Share")).toBeTruthy();
    expect(getByText("Profile")).toBeTruthy();
  });

  it("shows no LIVE signal while offline", () => {
    const { queryByTestId } = render(<AppHeader title="Settings" back />);
    expect(queryByTestId("live-header-signal")).toBeNull();
  });

  it("passes the static variant through for the Arena", () => {
    goLive(true);
    const { getByLabelText } = render(
      <AppHeader title="Arena" liveSignal="static" />,
    );
    expect(getByLabelText("You are live in the Arena")).toBeTruthy();
  });
});

describe("BrandHeader", () => {
  it("has exactly the LIVE signal then the bell on the right, and no avatar", () => {
    goLive(true);
    const { getByTestId, queryByText, UNSAFE_root } = render(
      <BrandHeader athleteId="me-1" />,
    );

    expect(getByTestId("live-header-signal")).toBeTruthy();
    expect(getByTestId("notification-bell")).toBeTruthy();
    // Avatar32 renders the athlete's initials; the header no longer carries it.
    expect(queryByText("M·M")).toBeNull();

    // Order: LIVE before the bell.
    const ids = UNSAFE_root.findAll(
      (n: HostNode) => typeof n.type === "string" && typeof n.props.testID === "string",
    ).map((n: HostNode) => n.props.testID as string);
    expect(ids.indexOf("live-header-signal")).toBeGreaterThan(-1);
    expect(ids.indexOf("live-header-signal")).toBeLessThan(
      ids.indexOf("notification-bell"),
    );
  });

  it("always shows the bell, and no LIVE signal while offline", () => {
    const { getByTestId, queryByTestId } = render(<BrandHeader athleteId="me-1" />);
    expect(getByTestId("notification-bell")).toBeTruthy();
    expect(queryByTestId("live-header-signal")).toBeNull();
  });
});
