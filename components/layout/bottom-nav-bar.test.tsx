import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { BottomNavBar } from "./bottom-nav-bar";

vi.mock("next/navigation", () => ({
  usePathname: () => "/",
}));

vi.mock("@/hooks/use-unread-count", () => ({
  useUnreadCount: () => 0,
}));

describe("BottomNavBar", () => {
  it("renders all five navigation tabs", () => {
    render(<BottomNavBar />);

    expect(screen.getByText("Home")).toBeInTheDocument();
    expect(screen.getByText("Rankings")).toBeInTheDocument();
    expect(screen.getByText("Arena")).toBeInTheDocument();
    expect(screen.getByText("Messages")).toBeInTheDocument();
    expect(screen.getByText("Profile")).toBeInTheDocument();
  });

  it("highlights the active tab based on pathname", () => {
    render(<BottomNavBar />);

    const homeLink = screen.getByText("Home").closest("a");
    expect(homeLink).toHaveClass("text-primary");

    const rankingsLink = screen.getByText("Rankings").closest("a");
    expect(rankingsLink).toHaveClass("text-muted-foreground");
  });

  it("links to the correct routes", () => {
    render(<BottomNavBar />);

    expect(screen.getByText("Home").closest("a")).toHaveAttribute("href", "/");
    expect(screen.getByText("Rankings").closest("a")).toHaveAttribute(
      "href",
      "/leaderboard",
    );
    expect(screen.getByText("Arena").closest("a")).toHaveAttribute(
      "href",
      "/arena",
    );
    expect(screen.getByText("Messages").closest("a")).toHaveAttribute(
      "href",
      "/messages",
    );
    expect(screen.getByText("Profile").closest("a")).toHaveAttribute(
      "href",
      "/profile",
    );
  });
});
