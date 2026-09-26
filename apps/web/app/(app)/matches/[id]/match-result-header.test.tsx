import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import type { MatchDetailView, MatchParticipant } from "@jits/shared/api/queries";
import { MatchResultHeader } from "./match-result-header";

function participant(over: Partial<MatchParticipant> = {}): MatchParticipant {
  return {
    athlete_id: "me-1",
    display_name: "Demo Blue",
    current_elo: 1210,
    current_weight: 170,
    profile_photo_url: null,
    role: "challenger",
    outcome: "win",
    elo_before: 1198,
    elo_after: 1210,
    elo_delta: 12,
    weight_division_gap: null,
    ...over,
  };
}

function makeView(
  opts: { outcome?: string | null; delta?: number; matchType?: string; status?: string; opponent?: boolean } = {},
): MatchDetailView {
  const { outcome = "win", delta = 12, matchType = "ranked", status = "completed", opponent = true } = opts;
  return {
    match: {
      id: "m-1",
      challenge_id: null,
      session_id: null,
      match_type: matchType,
      duration_seconds: 300,
      status,
      result: outcome === "draw" ? "draw" : "submission",
      started_at: "2026-09-20T10:00:00Z",
      completed_at: "2026-09-20T10:05:00Z",
      paused_at: null,
      total_paused_duration: 0,
      timekeeper_id: null,
    },
    me: participant({ outcome, elo_delta: delta }),
    opponent: opponent
      ? participant({ athlete_id: "opp-1", display_name: "Demo Red", current_elo: 1302, outcome: null })
      : null,
    videos: [],
  };
}

describe("MatchResultHeader", () => {
  it("WIN in the default foreground with a Gain Green delta", () => {
    render(<MatchResultHeader view={makeView()} />);
    expect(screen.getByTestId("match-verdict")).toHaveTextContent("WIN");
    expect(screen.getByTestId("match-verdict")).toHaveClass("text-foreground", "font-display");
    expect(screen.getByTestId("match-elo-delta")).toHaveTextContent("+12");
    expect(screen.getByTestId("match-elo-delta")).toHaveClass("text-success", "font-mono", "tabular-nums");
    expect(screen.getByText("1198 → 1210")).toHaveClass("font-mono");
  });

  it("LOSS in the negative token with a negative delta", () => {
    render(<MatchResultHeader view={makeView({ outcome: "loss", delta: -14 })} />);
    expect(screen.getByTestId("match-verdict")).toHaveTextContent("LOSS");
    expect(screen.getByTestId("match-verdict").className).toContain("--state-negative");
    expect(screen.getByTestId("match-elo-delta")).toHaveTextContent("-14");
    expect(screen.getByTestId("match-elo-delta").className).toContain("--state-negative");
  });

  it("DRAW is amber, including its (negative) delta", () => {
    render(<MatchResultHeader view={makeView({ outcome: "draw", delta: -4 })} />);
    expect(screen.getByTestId("match-verdict")).toHaveTextContent("DRAW");
    expect(screen.getByTestId("match-verdict")).toHaveClass("text-amber-500");
    expect(screen.getByTestId("match-elo-delta")).toHaveClass("text-amber-500");
    expect(screen.getByText("Draw")).toBeInTheDocument();
  });

  it("null outcome reads NO RESULT in muted", () => {
    render(<MatchResultHeader view={makeView({ outcome: null })} />);
    expect(screen.getByTestId("match-verdict")).toHaveTextContent("NO RESULT");
    expect(screen.getByTestId("match-verdict")).toHaveClass("text-muted-foreground");
  });

  it("casual replaces the delta with Casual, unrated", () => {
    render(<MatchResultHeader view={makeView({ matchType: "casual" })} />);
    expect(screen.getByText("Casual, unrated")).toBeInTheDocument();
    expect(screen.queryByTestId("match-elo-delta")).toBeNull();
    expect(screen.getByText("Casual")).toBeInTheDocument();
  });

  it("disputed: amber chip plus the review copy", () => {
    render(<MatchResultHeader view={makeView({ status: "disputed" })} />);
    const chip = screen.getByTestId("match-status-chip");
    expect(chip).toHaveTextContent(/disputed/i);
    expect(chip).toHaveClass("text-amber-500", "uppercase");
    expect(screen.getByText("This result is disputed and under review.")).toBeInTheDocument();
  });

  it("voided: muted chip, no dispute copy; completed: no chip", () => {
    const { unmount } = render(<MatchResultHeader view={makeView({ status: "voided" })} />);
    expect(screen.getByTestId("match-status-chip")).toHaveClass("text-muted-foreground");
    expect(screen.queryByText("This result is disputed and under review.")).toBeNull();
    unmount();
    render(<MatchResultHeader view={makeView()} />);
    expect(screen.queryByTestId("match-status-chip")).toBeNull();
  });

  it("opponent row links to their profile with an accessible label", () => {
    render(<MatchResultHeader view={makeView()} />);
    const link = screen.getByRole("link", { name: "View Demo Red's profile" });
    expect(link).toHaveAttribute("href", "/athlete/opp-1");
    expect(screen.getByText("1302")).toHaveClass("font-mono", "tabular-nums");
  });

  it("meta row: ranked tag, mono duration, submission", () => {
    render(<MatchResultHeader view={makeView()} />);
    expect(screen.getByText("Ranked")).toBeInTheDocument();
    expect(screen.getByText("5:00")).toHaveClass("font-mono");
    expect(screen.getByText("Submission")).toBeInTheDocument();
  });

  it("no opponent row on corrupt data", () => {
    render(<MatchResultHeader view={makeView({ opponent: false })} />);
    expect(screen.queryByRole("link")).toBeNull();
  });

  it("ranked with an unknown delta shows no ELO row (never a fake 0)", () => {
    const v = makeView();
    (v.me as { elo_delta: number | null }).elo_delta = null;
    render(<MatchResultHeader view={v} />);
    expect(screen.queryByTestId("match-elo-delta")).toBeNull();
    expect(screen.queryByText("1198 → 1210")).toBeNull();
  });

  it("opponent avatar is circular with shared initials", () => {
    render(<MatchResultHeader view={makeView()} />);
    const initials = screen.getByText("DR");
    expect(initials.closest('[data-slot="avatar"]')).toHaveClass("rounded-full");
  });

  it("meta row date is mono tabular", () => {
    render(<MatchResultHeader view={makeView()} />);
    const date = screen.getByTestId("match-date");
    expect(date).toHaveClass("font-mono");
  });
});
