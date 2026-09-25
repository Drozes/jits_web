import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { LiveHeaderSignal } from "./live-header-signal";

const nav = vi.hoisted(() => ({ pathname: "/", reads: 0 }));
vi.mock("next/navigation", () => ({
  usePathname: () => {
    nav.reads++;
    return nav.pathname;
  },
}));

const arena = vi.hoisted(() => ({ isLive: false }));
vi.mock("@/lib/arena/arena-store", () => ({
  useIsArenaLive: () => arena.isLive,
}));

beforeEach(() => {
  nav.pathname = "/";
  nav.reads = 0;
  arena.isLive = false;
});

describe("LiveHeaderSignal", () => {
  it("renders nothing while offline, without reading the pathname", () => {
    const { container } = render(<LiveHeaderSignal />);
    expect(container).toBeEmptyDOMElement();
    expect(nav.reads).toBe(0);
  });

  it("links to the Arena with a LIVE pill while live on a non-Arena page", () => {
    arena.isLive = true;
    nav.pathname = "/leaderboard";
    render(<LiveHeaderSignal />);
    const link = screen.getByRole("link", {
      name: "You are live in the Arena. Open Arena",
    });
    expect(link).toHaveAttribute("href", "/arena");
    expect(link).toHaveTextContent("LIVE");
  });

  it("still shows on /arena/swipe (only the exact Arena page hides it)", () => {
    arena.isLive = true;
    nav.pathname = "/arena/swipe";
    render(<LiveHeaderSignal />);
    expect(screen.getByRole("link")).toHaveAttribute("href", "/arena");
  });

  it.each(["/arena", "/arena/match/m1", "/match/m1/live"])(
    "is hidden on %s",
    (path) => {
      arena.isLive = true;
      nav.pathname = path;
      const { container } = render(<LiveHeaderSignal />);
      expect(container).toBeEmptyDOMElement();
    },
  );
});
