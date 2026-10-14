import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";

vi.mock("@/lib/guards", () => ({ getActiveAthlete: vi.fn() }));

import { SidebarAppBadges } from "./sidebar-footer";

describe("SidebarAppBadges", () => {
  it("renders both badges, centered, with no athlete data needed", () => {
    render(<SidebarAppBadges />);
    expect(screen.getByText("Get the app")).toBeTruthy();
    expect(screen.getByRole("group", { name: "App Store: coming soon" })).toBeTruthy();
    expect(screen.getByRole("group", { name: "Google Play: coming soon" })).toBeTruthy();
    expect(screen.getByTestId("store-badges").style.alignItems).toBe("center");
  });
});
