import { describe, it, expect } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { RecentActivitySection } from "./recent-activity-section";

describe("RecentActivitySection", () => {
  it("Me scope rows link to match detail; All scope rows do not", () => {
    render(
      <RecentActivitySection
        myMatches={[
          { id: "m-3", opponentName: "Demo Red", result: "win", matchType: "ranked", eloDelta: 9, date: "2026-09-20T10:05:00Z" },
        ]}
        allActivity={[
          { id: "m-4", winnerName: "Alpha", loserName: "Bravo", result: "submission", matchType: "ranked", date: "2026-09-20T10:05:00Z" },
        ]}
      />,
    );
    expect(screen.getByText("Alpha").closest("a")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Me" }));
    expect(screen.getByText("Demo Red").closest("a")).toHaveAttribute("href", "/matches/m-3");
  });
});
