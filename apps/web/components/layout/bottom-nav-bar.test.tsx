import { describe, it, expect, vi, beforeEach } from "vitest";
import { act, render, screen, within } from "@testing-library/react";
import {
  IDLE_ARENA_STATE,
  __resetArenaStoreForTests,
  publishArenaState,
} from "@/lib/arena/arena-store";
import { BottomNavBar } from "./bottom-nav-bar";

vi.mock("next/navigation", () => ({
  usePathname: () => "/",
}));

// The REAL store: tests publish into it the way the owner does.
function publish(isLive: boolean, onlineCount: number) {
  act(() =>
    publishArenaState({ ...IDLE_ARENA_STATE, ready: true, isLive, onlineCount }),
  );
}

beforeEach(() => __resetArenaStoreForTests());

describe("BottomNavBar", () => {
  it("renders every navigation tab", () => {
    render(<BottomNavBar />);

    expect(screen.getByText("Home")).toBeInTheDocument();
    expect(screen.getByText("Arena")).toBeInTheDocument();
    expect(screen.getByText("Rankings")).toBeInTheDocument();
    expect(screen.getByText("Profile")).toBeInTheDocument();
  });

  it("omits the hidden Gyms tab", () => {
    render(<BottomNavBar />);

    expect(screen.queryByText("Gyms")).not.toBeInTheDocument();
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
    expect(screen.getByText("Arena").closest("a")).toHaveAttribute(
      "href",
      "/arena",
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

  describe("Arena status", () => {
    const arenaLink = () => screen.getByText("Arena").closest("a")!;

    it("shows no dot or count when offline and the lobby is empty", () => {
      render(<BottomNavBar />);
      expect(screen.queryByTestId("arena-live-dot")).not.toBeInTheDocument();
      expect(screen.queryByTestId("arena-online-count")).not.toBeInTheDocument();
      expect(arenaLink()).toHaveAccessibleName("Arena");
    });

    it("shows the live dot on the Arena icon only, with sr-only text", () => {
      publish(true, 0);
      render(<BottomNavBar />);
      const dot = within(arenaLink()).getByTestId("arena-live-dot");
      expect(dot).toBeInTheDocument();
      expect(screen.getAllByTestId("arena-live-dot")).toHaveLength(1);
      expect(arenaLink()).toHaveAccessibleName(/^Arena\s*, live$/);
    });

    it("shows the online count badge with an accessible label", () => {
      publish(false, 3);
      render(<BottomNavBar />);
      expect(within(arenaLink()).getByTestId("arena-online-count")).toHaveTextContent("3");
      expect(screen.queryByTestId("arena-live-dot")).not.toBeInTheDocument();
      expect(arenaLink()).toHaveAccessibleName(/^Arena\s*, 3\ athletes\ online\ in\ the\ Arena$/);
    });

    it("caps the badge at 9+ but keeps the exact count for screen readers", () => {
      publish(true, 10);
      render(<BottomNavBar />);
      expect(screen.getByTestId("arena-online-count")).toHaveTextContent("9+");
      expect(screen.getByTestId("arena-live-dot")).toBeInTheDocument();
      expect(arenaLink()).toHaveAccessibleName(/^Arena\s*, live,\ 10\ athletes\ online\ in\ the\ Arena$/);
    });

    it("shows 9 uncapped", () => {
      publish(false, 9);
      render(<BottomNavBar />);
      expect(screen.getByTestId("arena-online-count")).toHaveTextContent(/^9$/);
    });

    it("live with nobody else online shows the dot but no count badge", () => {
      publish(true, 0);
      render(<BottomNavBar />);
      expect(screen.getByTestId("arena-live-dot")).toBeInTheDocument();
      expect(screen.queryByTestId("arena-online-count")).not.toBeInTheDocument();
    });

    it("updates live from the store, with no rerender or page refresh", () => {
      render(<BottomNavBar />);
      expect(screen.queryByTestId("arena-live-dot")).not.toBeInTheDocument();
      publish(true, 2);
      expect(screen.getByTestId("arena-live-dot")).toBeInTheDocument();
      expect(screen.getByTestId("arena-online-count")).toHaveTextContent("2");
      publish(false, 0);
      expect(screen.queryByTestId("arena-live-dot")).not.toBeInTheDocument();
      expect(screen.queryByTestId("arena-online-count")).not.toBeInTheDocument();
    });
  });
});
