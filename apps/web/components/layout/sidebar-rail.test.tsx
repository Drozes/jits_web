import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, within } from "@testing-library/react";
import { SidebarRail } from "./sidebar-rail";

const nav = vi.hoisted(() => ({ pathname: "/" }));
vi.mock("next/navigation", () => ({ usePathname: () => nav.pathname }));

const arena = vi.hoisted(() => ({ isLive: false, onlineCount: 0 }));
vi.mock("@/lib/arena/arena-store", () => ({
  useIsArenaLive: () => arena.isLive,
  useArenaOnlineCount: () => arena.onlineCount,
}));

beforeEach(() => {
  nav.pathname = "/";
  arena.isLive = false;
  arena.onlineCount = 0;
});

const arenaLink = () => screen.getByText("Arena").closest("a")!;

describe("SidebarRail Arena status", () => {
  it("shows nothing next to Arena when offline and nobody is online", () => {
    render(<SidebarRail footer={null} />);
    expect(screen.queryByTestId("arena-live-dot")).not.toBeInTheDocument();
    expect(screen.queryByTestId("arena-online-count")).not.toBeInTheDocument();
  });

  it("shows the live dot and count next to the Arena label", () => {
    arena.isLive = true;
    arena.onlineCount = 2;
    render(<SidebarRail footer={null} />);
    expect(within(arenaLink()).getByTestId("arena-live-dot")).toBeInTheDocument();
    expect(within(arenaLink()).getByTestId("arena-online-count")).toHaveTextContent("2");
    expect(arenaLink()).toHaveAccessibleName(/^Arena\s*, live,\ 2\ athletes\ online\ in\ the\ Arena$/);
    // Only the Arena item carries status.
    expect(screen.getByText("Home").closest("a")).toHaveAccessibleName("Home");
  });

  it("uses the singular label for one athlete", () => {
    arena.onlineCount = 1;
    render(<SidebarRail footer={null} />);
    expect(arenaLink()).toHaveAccessibleName(/^Arena\s*, 1\ athlete\ online\ in\ the\ Arena$/);
  });

  it("renders nothing on immersive routes", () => {
    nav.pathname = "/arena/match/abc";
    arena.isLive = true;
    const { container } = render(<SidebarRail footer={null} />);
    expect(container).toBeEmptyDOMElement();
  });
});
