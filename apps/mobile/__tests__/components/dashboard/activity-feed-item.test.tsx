/**
 * Home activity feed: the finishing method is data, so it renders in ink
 * mono, never Gain Green (reserved for rating increases, jits-4zp.8).
 *
 * Source: apps/mobile/components/dashboard/activity-feed-item.tsx
 */
import * as React from "react";
import { render } from "@testing-library/react-native";
import { ActivityFeedItem } from "@/components/dashboard/activity-feed-item";

const base = {
  id: "a1",
  winnerName: "Demo Blue",
  loserName: "Demo Red",
  result: "submission",
  date: "2026-09-25T10:00:00Z",
};

describe("ActivityFeedItem", () => {
  it("shows the result in ink mono, not green", () => {
    const { getByTestId } = render(<ActivityFeedItem item={base} />);
    const result = getByTestId("activity-result");
    expect(result).toHaveTextContent("submission");
    expect(result.props.className).toContain("text-ink");
    expect(result.props.className).toContain("font-mono-medium");
    expect(result.props.className).not.toContain("text-positive");
  });

  it("has no result word on a draw", () => {
    const { queryByTestId, getByText } = render(
      <ActivityFeedItem item={{ ...base, result: "draw" }} />,
    );
    expect(queryByTestId("activity-result")).toBeNull();
    expect(getByText(/drew with/)).toBeTruthy();
  });
});
