import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { ResumeMatchCard } from "./resume-match-card";

describe("ResumeMatchCard", () => {
  it("offers an in-progress match by link, never by navigating itself", () => {
    render(
      <ResumeMatchCard match={{ matchId: "m1", status: "in_progress", opponentName: "Ana" }} />,
    );
    expect(screen.getByText("Match in progress")).toBeInTheDocument();
    expect(screen.getByText("In progress")).toBeInTheDocument();
    expect(screen.getByText(/vs Ana\./)).toBeInTheDocument();
    const link = screen.getByRole("link", { name: "Resume your match" });
    expect(link).toHaveAttribute("href", "/arena/match/m1");
  });

  it("labels a pending match and copes without an opponent name", () => {
    render(<ResumeMatchCard match={{ matchId: "m2", status: "pending", opponentName: null }} />);
    expect(screen.getByText("Match waiting to start")).toBeInTheDocument();
    expect(screen.getByText("Waiting")).toBeInTheDocument();
    expect(screen.queryByText(/vs /)).not.toBeInTheDocument();
    expect(screen.getByText("Pick up where you left off.")).toBeInTheDocument();
  });
});
