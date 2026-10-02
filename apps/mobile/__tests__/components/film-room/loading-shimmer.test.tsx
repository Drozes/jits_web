/**
 * WP6 (R3 FR-4): the Film Room and highlight viewer loading placeholders use
 * the registered skeleton shimmer (Ambient, while loading) instead of opting
 * out, and fall back to plain static bars under Reduce Motion.
 */
import * as React from "react";
import { act, render } from "@testing-library/react-native";
import { FilmRoomSkeleton } from "@/components/film-room/film-room-states";
import { ViewerSkeleton } from "@/components/highlight-viewer/viewer-states";
import { __shimmerHoldersForTests } from "@/components/ui/skeleton/skeleton";
import { __setReduceMotionForTests } from "@/lib/motion";

jest.mock("react-native-reanimated", () => require("react-native-reanimated/mock"));

const HIDDEN = { includeHiddenElements: true } as const;

afterEach(() => {
  act(() => __setReduceMotionForTests(false));
});

it("Film Room: the month rule and six posters shimmer on the shared clock", () => {
  const view = render(<FilmRoomSkeleton />);
  view.getByTestId("film-room-loading");
  expect(view.getAllByTestId("skeleton-shimmer", HIDDEN)).toHaveLength(7);
  view.unmount();
  expect(__shimmerHoldersForTests()).toBe(0);
});

it("highlight viewer: the 9:16 poster frame shimmers, sized to the frame", () => {
  const view = render(<ViewerSkeleton frameStyle={{ width: 180, height: 320, alignSelf: "center" }} />);
  view.getByTestId("viewer-skeleton");
  const frame = view.getByTestId("viewer-skeleton-frame", HIDDEN);
  expect(frame.props.style).toEqual(expect.arrayContaining([expect.objectContaining({ width: 180, height: 320 })]));
  expect(view.getAllByTestId("skeleton-shimmer", HIDDEN)).toHaveLength(1);
  view.unmount();
});

it("both are plain static bars under Reduce Motion", () => {
  act(() => __setReduceMotionForTests(true));
  const film = render(<FilmRoomSkeleton />);
  const viewer = render(<ViewerSkeleton frameStyle={{ width: 180, height: 320 }} />);
  expect(film.queryByTestId("skeleton-shimmer", HIDDEN)).toBeNull();
  expect(viewer.queryByTestId("skeleton-shimmer", HIDDEN)).toBeNull();
  expect(__shimmerHoldersForTests()).toBe(0);
  viewer.getByTestId("viewer-skeleton-frame", HIDDEN);
});
