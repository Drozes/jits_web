import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { MatchResultsDisplay } from "./results-display";

vi.mock("next/link", () => ({
  default: ({
    children,
    href,
  }: {
    children: React.ReactNode;
    href: string;
  }) => <a href={href}>{children}</a>,
}));

const baseCurrentAthlete = {
  displayName: "Fighter A",
  outcome: "win" as const,
  eloBefore: 1000,
  eloAfter: 1016,
  eloDelta: 16,
};

const baseRivalAthlete = {
  displayName: "Fighter B",
  outcome: "loss" as const,
  eloBefore: 1000,
  eloAfter: 984,
  eloDelta: -16,
};

describe("MatchResultsDisplay", () => {
  it("renders victory for a win", () => {
    render(
      <MatchResultsDisplay
        matchType="ranked"
        result="submission"
        currentAthlete={baseCurrentAthlete}
        rivalAthlete={baseRivalAthlete}
      />,
    );

    expect(screen.getByText("Victory!")).toBeInTheDocument();
    expect(
      screen.getByText("You defeated Fighter B"),
    ).toBeInTheDocument();
  });

  it("renders defeat when current athlete lost", () => {
    render(
      <MatchResultsDisplay
        matchType="ranked"
        result="submission"
        currentAthlete={{ ...baseCurrentAthlete, outcome: "loss", eloDelta: -16 }}
        rivalAthlete={{ ...baseRivalAthlete, outcome: "win", eloDelta: 16 }}
      />,
    );

    expect(screen.getByText("Defeat")).toBeInTheDocument();
    expect(screen.getByText("Fighter B won")).toBeInTheDocument();
  });

  it("renders draw result", () => {
    render(
      <MatchResultsDisplay
        matchType="casual"
        result="draw"
        currentAthlete={{ ...baseCurrentAthlete, outcome: "draw", eloDelta: 0 }}
        rivalAthlete={{ ...baseRivalAthlete, outcome: "draw", eloDelta: 0 }}
      />,
    );

    expect(screen.getByText("Draw")).toBeInTheDocument();
    expect(
      screen.getByText("Draw against Fighter B"),
    ).toBeInTheDocument();
  });

  it("shows ELO changes for ranked matches", () => {
    render(
      <MatchResultsDisplay
        matchType="ranked"
        result="submission"
        currentAthlete={baseCurrentAthlete}
        rivalAthlete={baseRivalAthlete}
      />,
    );

    expect(screen.getByText("ELO Changes")).toBeInTheDocument();
    expect(screen.getByText("+16")).toBeInTheDocument();
    expect(screen.getByText("-16")).toBeInTheDocument();
    expect(screen.getByText("1000 → 1016")).toBeInTheDocument();
    expect(screen.getByText("1000 → 984")).toBeInTheDocument();
  });

  it("does not show ELO changes for casual matches", () => {
    render(
      <MatchResultsDisplay
        matchType="casual"
        result="submission"
        currentAthlete={{ ...baseCurrentAthlete, eloBefore: null, eloAfter: null }}
        rivalAthlete={{ ...baseRivalAthlete, eloBefore: null, eloAfter: null }}
      />,
    );

    expect(screen.queryByText("ELO Changes")).not.toBeInTheDocument();
  });

  it("renders navigation links", () => {
    render(
      <MatchResultsDisplay
        matchType="casual"
        result="draw"
        currentAthlete={{ ...baseCurrentAthlete, outcome: "draw" }}
        rivalAthlete={{ ...baseRivalAthlete, outcome: "draw" }}
      />,
    );

    const arenaLink = screen.getByText("Back to Arena").closest("a");
    expect(arenaLink).toHaveAttribute("href", "/arena");

    const homeLink = screen.getByText("Home").closest("a");
    expect(homeLink).toHaveAttribute("href", "/");
  });

  it("shows Ranked badge for ranked matches", () => {
    render(
      <MatchResultsDisplay
        matchType="ranked"
        result="submission"
        currentAthlete={baseCurrentAthlete}
        rivalAthlete={baseRivalAthlete}
      />,
    );

    expect(screen.getByText("Ranked")).toBeInTheDocument();
  });

  it("shows Casual badge for casual matches", () => {
    render(
      <MatchResultsDisplay
        matchType="casual"
        result="submission"
        currentAthlete={{ ...baseCurrentAthlete, eloBefore: null, eloAfter: null }}
        rivalAthlete={{ ...baseRivalAthlete, eloBefore: null, eloAfter: null }}
      />,
    );

    expect(screen.getByText("Casual")).toBeInTheDocument();
  });
});
