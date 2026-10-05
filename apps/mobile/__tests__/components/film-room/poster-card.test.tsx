import * as React from "react";
import { render, within } from "@testing-library/react-native";

jest.mock("expo-image", () => {
  const R = require("react");
  const RN = require("react-native");
  return { Image: (props: Record<string, unknown>) => R.createElement(RN.View, props) };
});

import { PosterCard, compactBadgeLabel } from "@/components/film-room/poster-card";
import { libItem, libVideo } from "../../support/film-fixtures";

const viewer = { name: "Kai Reyes", photoUrl: null };
const TWO = [libVideo(), libVideo({ video_id: "v-2", uploaded_by: "opp-1" })];

function badgeTexts(utils: ReturnType<typeof render>): string[] {
  const column = utils.getByTestId("film-card-badges");
  return within(column)
    .UNSAFE_getAllByType(require("react-native").Text)
    .map((t: { props: { children: string } }) => t.props.children);
}

describe("PosterCard badges", () => {
  it("stacks status, DISPUTED and angles in one column so none share a row", () => {
    const utils = render(
      <PosterCard item={libItem({ status: "disputed", videos: TWO })} status={{ kind: "ready" }} viewer={viewer} onPress={jest.fn()} />,
    );
    const column = utils.getByTestId("film-card-badges");
    // A column (no row direction), right-aligned, one badge per line.
    expect(column.props.style.flexDirection).toBeUndefined();
    expect(column.props.style.alignItems).toBe("flex-end");
    expect(badgeTexts(utils)).toEqual(["BREAKDOWN READY", "DISPUTED", "2 ANGLES"]);
    expect(utils.getByTestId("film-card-m-1").props.accessibilityLabel).toMatch(/BREAKDOWN READY, disputed$/);
  });

  it("uses short labels on the compact Profile tile", () => {
    const utils = render(
      <PosterCard
        variant="compact"
        item={libItem({ videos: TWO })}
        status={{ kind: "analyzing", done: 3, total: 7 }}
        viewer={viewer}
        onPress={jest.fn()}
      />,
    );
    expect(badgeTexts(utils)).toEqual(["3/7", "2×"]);
    expect(compactBadgeLabel({ kind: "ready" })).toBe("READY");
    expect(compactBadgeLabel({ kind: "analyzing", done: null, total: null })).toBe("ANALYZING");
    expect(compactBadgeLabel({ kind: "uploading", progress: 0.3 })).toBeNull();
  });

  it("renders no badge column when there is nothing to say", () => {
    const utils = render(<PosterCard item={libItem()} status={{ kind: "none" }} viewer={viewer} onPress={jest.fn()} />);
    expect(utils.queryByTestId("film-card-badges")).toBeNull();
  });
});

describe("this phone's paused or failed upload on the card (jits-n2im.3/.4)", () => {
  const { fireEvent } = require("@testing-library/react-native");

  it("shows UPLOAD PAUSED with a 44 pt Try again that does not open the match (M2)", () => {
    const onPress = jest.fn();
    const onRetry = jest.fn();
    const utils = render(
      <PosterCard item={libItem({ videos: [] })} status={{ kind: "paused", progress: 0.4 }} viewer={viewer} onPress={onPress} onRetry={onRetry} />,
    );
    expect(badgeTexts(utils)).toContain("UPLOAD PAUSED");
    expect(utils.getAllByText("UPLOAD PAUSED").length).toBeGreaterThan(0);
    const retry = utils.getByTestId("film-card-retry");
    expect(retry.props.accessibilityLabel).toBe("Try again: upload match video");
    expect(utils.getByText("Try again")).toBeTruthy();
    fireEvent.press(retry);
    expect(onRetry).toHaveBeenCalledTimes(1);
    expect(onPress).not.toHaveBeenCalled();
  });

  it("offers Try again to VoiceOver as an action on the card itself (M2)", () => {
    const onRetry = jest.fn();
    const utils = render(
      <PosterCard item={libItem({ videos: [] })} status={{ kind: "upload_failed", terminal: false }} viewer={viewer} onPress={jest.fn()} onRetry={onRetry} />,
    );
    const card = utils.getByTestId("film-card-m-1");
    expect(card.props.accessibilityActions).toEqual([{ name: "retry", label: "Try again: upload match video" }]);
    fireEvent(card, "accessibilityAction", { nativeEvent: { actionName: "retry" } });
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it("has no retry action when there is nothing to retry", () => {
    const utils = render(<PosterCard item={libItem()} status={{ kind: "ready" }} viewer={viewer} onPress={jest.fn()} />);
    expect(utils.getByTestId("film-card-m-1").props.accessibilityActions).toBeUndefined();
  });

  it("shows DIDN'T UPLOAD, never NO FILM RECORDED, while the phone still owes the clip", () => {
    const utils = render(
      <PosterCard item={libItem({ videos: [] })} status={{ kind: "upload_failed", terminal: false }} viewer={viewer} onPress={jest.fn()} />,
    );
    expect(utils.queryByText("NO FILM RECORDED")).toBeNull();
    expect(utils.getAllByText("DIDN'T UPLOAD").length).toBeGreaterThan(0);
  });

  it("says PROCESSING FILM, not 'after upload', once the film is on the server", () => {
    const utils = render(
      <PosterCard item={libItem({ videos: [libVideo({ poster_url: null })] })} status={{ kind: "none" }} viewer={viewer} onPress={jest.fn()} />,
    );
    expect(utils.getByText("PROCESSING FILM")).toBeTruthy();
    expect(utils.queryByText(/AFTER UPLOAD/)).toBeNull();
  });

  it("keeps the compact Profile tile free of the Retry", () => {
    const utils = render(
      <PosterCard variant="compact" item={libItem({ videos: [] })} status={{ kind: "paused", progress: 0.4 }} viewer={viewer} onPress={jest.fn()} onRetry={jest.fn()} />,
    );
    expect(utils.queryByTestId("film-card-retry")).toBeNull();
    expect(compactBadgeLabel({ kind: "paused", progress: null })).toBe("PAUSED");
    // An upload failure is not a processing failure (m11).
    expect(compactBadgeLabel({ kind: "upload_failed", terminal: true })).toBe("DIDN'T UPLOAD");
    expect(compactBadgeLabel({ kind: "failed" })).toBe("FAILED");
  });
});
