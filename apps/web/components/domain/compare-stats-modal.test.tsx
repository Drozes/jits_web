import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { CompareStatsModal } from "./compare-stats-modal";

const stats = { elo: 1500, wins: 4, losses: 2, draws: 1, winRate: 57, weight: 170 };

describe("CompareStatsModal", () => {
  it("renders career stats side by side with no All / Ranked / Casual filter pills", () => {
    render(
      <CompareStatsModal
        currentAthlete={{ ...stats, displayName: "Kai Reyes" }}
        competitor={{ ...stats, elo: 1480, displayName: "Mina Park" }}
        open
        onOpenChange={vi.fn()}
      />,
    );
    expect(screen.getByText("Compare Stats")).toBeInTheDocument();
    expect(screen.getByText("Kai Reyes")).toBeInTheDocument();
    expect(screen.getByText("Mina Park")).toBeInTheDocument();
    expect(screen.getByText("Win Rate")).toBeInTheDocument();
    for (const name of [/^all$/i, /^ranked$/i, /^casual$/i]) {
      expect(screen.queryByRole("button", { name })).toBeNull();
      expect(screen.queryByRole("tab", { name })).toBeNull();
      expect(screen.queryByText(name)).toBeNull();
    }
  });
});
