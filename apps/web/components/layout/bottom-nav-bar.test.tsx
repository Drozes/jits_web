import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { BottomNavBar } from "./bottom-nav-bar";

vi.mock("next/navigation", () => ({
  usePathname: () => "/",
}));

describe("BottomNavBar", () => {
  it("renders all four navigation tabs", () => {
    render(<BottomNavBar />);

    expect(screen.getByText("Home")).toBeInTheDocument();
    expect(screen.getByText("Gyms")).toBeInTheDocument();
    expect(screen.getByText("Rankings")).toBeInTheDocument();
    expect(screen.getByText("Profile")).toBeInTheDocument();
  });

  it("highlights the active tab based on pathname", () => {
    render(<BottomNavBar />);

    const homeLink = screen.getByText("Home").closest("a");
    // Active tab uses the design-system text-primary token via inline style.
    expect(homeLink?.style.color).toBe("var(--text-primary)");
    // Active tab also gets the accent-cta top border.
    expect(homeLink?.style.borderTop).toContain("var(--accent-cta)");

    const rankingsLink = screen.getByText("Rankings").closest("a");
    // Inactive tabs use the tertiary text token and a transparent border.
    expect(rankingsLink?.style.color).toBe("var(--text-tertiary)");
    expect(rankingsLink?.style.borderTop).toContain("transparent");
  });

  it("links to the correct routes", () => {
    render(<BottomNavBar />);

    expect(screen.getByText("Home").closest("a")).toHaveAttribute("href", "/");
    expect(screen.getByText("Gyms").closest("a")).toHaveAttribute(
      "href",
      "/gyms",
    );
    expect(screen.getByText("Rankings").closest("a")).toHaveAttribute(
      "href",
      "/leaderboard",
    );
    expect(screen.getByText("Profile").closest("a")).toHaveAttribute(
      "href",
      "/profile",
    );
  });
});
