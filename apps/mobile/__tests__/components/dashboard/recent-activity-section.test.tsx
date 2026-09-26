/**
 * Recent Activity empty states point at the Arena, the only way to a match on
 * mobile now that gym sessions are gone (jits-gewv).
 *
 * Source: apps/mobile/components/dashboard/recent-activity-section.tsx
 */
import * as React from "react";
import { fireEvent, render } from "@testing-library/react-native";

const mockPush = jest.fn();
jest.mock("expo-router", () => ({
  useRouter: () => ({ push: mockPush }),
}));

jest.mock("lucide-react-native", () => {
  const R = require("react");
  const RN = require("react-native");
  const stub = () => R.createElement(RN.View, {});
  return new Proxy(
    {},
    {
      get: (_t: Record<string, unknown>, prop: string) => {
        if (prop === "__esModule") return true;
        return stub;
      },
    },
  );
});

import { RecentActivitySection } from "@/components/dashboard/recent-activity-section";
import { ARENA_HREF } from "@/lib/arena/constants";

beforeEach(() => mockPush.mockClear());

describe("RecentActivitySection empty states", () => {
  it("sends an athlete with no matches to the Arena", () => {
    const { getByText } = render(
      <RecentActivitySection myMatches={[]} allActivity={[]} />,
    );
    fireEvent.press(getByText("Me"));
    fireEvent.press(getByText("Find a match in the Arena →"));
    expect(mockPush).toHaveBeenCalledWith(ARENA_HREF);
  });

  it("lets the caller override the empty-state target", () => {
    const onPressFindMatch = jest.fn();
    const { getByText } = render(
      <RecentActivitySection
        myMatches={[]}
        allActivity={[]}
        onPressFindMatch={onPressFindMatch}
      />,
    );
    fireEvent.press(getByText("Me"));
    fireEvent.press(getByText("Find a match in the Arena →"));
    expect(onPressFindMatch).toHaveBeenCalledTimes(1);
    expect(mockPush).not.toHaveBeenCalled();
  });

  it("mentions the Arena, not sessions, when there is no activity at all", () => {
    const { getByText, queryByText } = render(
      <RecentActivitySection myMatches={[]} allActivity={[]} />,
    );
    getByText(/Go live in the Arena/);
    expect(queryByText(/session/i)).toBeNull();
  });
});

describe("RecentActivitySection Me rows", () => {
  it("opens a match by id, labelled for assistive tech", () => {
    const onPressMatch = jest.fn();
    const { getByText, getByLabelText } = render(
      <RecentActivitySection
        myMatches={[
          {
            id: "m-3",
            opponentName: "Demo Blue",
            result: "win",
            matchType: "ranked",
            eloDelta: 10,
            date: "2026-09-24T12:00:00.000Z",
          },
        ]}
        allActivity={[]}
        onPressMatch={onPressMatch}
      />,
    );
    fireEvent.press(getByText("Me"));
    fireEvent.press(getByLabelText("Open match vs Demo Blue"));
    expect(onPressMatch).toHaveBeenCalledWith("m-3");
  });
});
