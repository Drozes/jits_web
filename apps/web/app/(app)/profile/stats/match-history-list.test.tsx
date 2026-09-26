import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { MatchHistoryList } from "./match-history-list";

describe("MatchHistoryList", () => {
  it("links every match row to its detail page", () => {
    render(
      <MatchHistoryList
        matches={[
          {
            match_id: "m-7",
            match_type: "ranked",
            athlete_outcome: "win",
            opponent_display_name: "Demo Red",
            elo_delta: 11,
            completed_at: "2026-09-20T10:05:00Z",
            submission_type_display_name: "",
            result: "submission",
          },
        ]}
      />,
    );
    expect(screen.getByText("Demo Red").closest("a")).toHaveAttribute("href", "/matches/m-7");
  });
});
