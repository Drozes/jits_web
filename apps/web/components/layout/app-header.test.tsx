import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { AppHeader } from "./app-header";
import { DashboardHeaderShell } from "./dashboard-header-shell";

const nav = vi.hoisted(() => ({ pathname: "/leaderboard" }));
vi.mock("next/navigation", () => ({
  usePathname: () => nav.pathname,
  useRouter: () => ({ back: vi.fn() }),
}));
const arena = vi.hoisted(() => ({ isLive: false }));
vi.mock("@/lib/arena/arena-store", () => ({
  useIsArenaLive: () => arena.isLive,
}));
// Async server component; irrelevant here.
vi.mock("./page-header-actions", () => ({
  PageHeaderActions: () => <span>actions</span>,
}));

const pill = () =>
  screen.queryByRole("link", { name: "You are live in the Arena. Open Arena" });

beforeEach(() => {
  nav.pathname = "/leaderboard";
  arena.isLive = false;
});

describe("header LIVE signal", () => {
  it("AppHeader shows the pill beside its right action while live", () => {
    arena.isLive = true;
    render(<AppHeader title="Rankings" rightAction={<span>bell</span>} />);
    expect(pill()).toBeInTheDocument();
    expect(screen.getByText("bell")).toBeInTheDocument();
  });

  it("AppHeader shows no pill while offline", () => {
    render(<AppHeader title="Rankings" />);
    expect(pill()).not.toBeInTheDocument();
  });

  it("Home's DashboardHeaderShell shows the pill while live", () => {
    arena.isLive = true;
    nav.pathname = "/";
    render(<DashboardHeaderShell avatar={null} />);
    expect(pill()).toBeInTheDocument();
    expect(screen.getByText("actions")).toBeInTheDocument();
  });
});
