import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { ProfileHistoryList } from "./profile-history-list";

describe("ProfileHistoryList", () => {
  it("each row links to its match detail page", () => {
    render(
      <ProfileHistoryList
        rows={[
          { matchId: "m-1", opponentName: "Demo Red", gymName: null, outcome: "win", when: "2d ago", delta: 12 },
          { matchId: "m-2", opponentName: "Demo Blue", gymName: "Alpha", outcome: "loss", when: "3d ago", delta: -9 },
        ]}
      />,
    );
    expect(screen.getByRole("link", { name: "Open match vs Demo Red" })).toHaveAttribute("href", "/matches/m-1");
    expect(screen.getByRole("link", { name: "Open match vs Demo Blue" })).toHaveAttribute("href", "/matches/m-2");
  });

  it("empty state has no links", () => {
    render(<ProfileHistoryList rows={[]} />);
    expect(screen.getByText("No matches yet")).toBeInTheDocument();
    expect(screen.queryByRole("link")).toBeNull();
  });
});
