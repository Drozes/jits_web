/**
 * Compare Stats (P-Compare-Stats, jits-02vo.2): every match is ranked, so the
 * modal has no All / Ranked / Casual pills and always shows career stats,
 * ELO row included.
 */
import * as React from "react";
import { render } from "@testing-library/react-native";
import { CompareStatsModal } from "@/components/compare-stats-modal";

const ME = { displayName: "Marcus Reyes", elo: 1487, wins: 14, losses: 6, draws: 1, winRate: 70, weight: 170 };
const THEM = { displayName: "Dana Okafor", elo: 1512, wins: 11, losses: 5, draws: 1, winRate: 69, weight: 168 };

describe("CompareStatsModal", () => {
  it("shows ELO, Wins, Losses, Draws and Win Rate side by side with no filter pills", () => {
    const s = render(<CompareStatsModal open onOpenChange={jest.fn()} currentAthlete={ME} competitor={THEM} />);
    for (const label of ["ELO", "Wins", "Losses", "Draws", "Win Rate"]) s.getByText(label);
    s.getByText("1487");
    s.getByText("1512");
    s.getByText("70%");
    s.getByText("69%");
    expect(s.queryByText("All")).toBeNull();
    expect(s.queryByText("Ranked")).toBeNull();
    expect(s.queryByText(/casual/i)).toBeNull();
  });
});
