/**
 * The launch portrait lock: Android's `orientation: "default"` leaves the
 * activity unlocked, so the root layout locks portrait once on mount.
 */
import * as React from "react";
import { render } from "@testing-library/react-native";

jest.mock("@/lib/orientation", () => ({ lockPortrait: jest.fn(async () => undefined) }));

import { lockPortrait } from "@/lib/orientation";
import { OrientationBootstrap } from "@/lib/orientation-bootstrap";

it("locks portrait once on mount and not again on re-render", () => {
  const { rerender } = render(<OrientationBootstrap />);
  rerender(<OrientationBootstrap />);
  expect(lockPortrait).toHaveBeenCalledTimes(1);
});
