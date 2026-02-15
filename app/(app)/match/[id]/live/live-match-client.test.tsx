import { describe, it, expect, vi } from "vitest";
import { render, screen, act } from "@testing-library/react";
import { LiveMatchClient } from "./live-match-client";

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push: vi.fn(),
    refresh: vi.fn(),
  }),
}));

vi.mock("@/lib/supabase/client", () => ({
  createClient: () => ({
    rpc: vi.fn().mockResolvedValue({ data: { success: true }, error: null }),
  }),
}));

describe("LiveMatchClient", () => {
  it("renders opponent name", () => {
    render(
      <LiveMatchClient
        matchId="match-1"
        matchStatus="pending"
        matchType="ranked"
        durationSeconds={600}
        opponentName="Fighter B"
      />,
    );

    expect(screen.getByText("Fighter B")).toBeInTheDocument();
  });

  it("renders timer with correct initial time", () => {
    render(
      <LiveMatchClient
        matchId="match-1"
        matchStatus="pending"
        matchType="ranked"
        durationSeconds={600}
        opponentName="Fighter B"
      />,
    );

    expect(screen.getByText("10:00")).toBeInTheDocument();
  });

  it("renders Start Timer button when match is pending", () => {
    render(
      <LiveMatchClient
        matchId="match-1"
        matchStatus="pending"
        matchType="ranked"
        durationSeconds={600}
        opponentName="Fighter B"
      />,
    );

    expect(screen.getByText("Start Timer")).toBeInTheDocument();
  });

  it("renders End Match button when match is in progress", () => {
    render(
      <LiveMatchClient
        matchId="match-1"
        matchStatus="in_progress"
        matchType="ranked"
        durationSeconds={600}
        opponentName="Fighter B"
      />,
    );

    expect(screen.getByText("End Match")).toBeInTheDocument();
  });

  it("shows Ranked badge for ranked matches", () => {
    render(
      <LiveMatchClient
        matchId="match-1"
        matchStatus="pending"
        matchType="ranked"
        durationSeconds={600}
        opponentName="Fighter B"
      />,
    );

    expect(screen.getByText("Ranked")).toBeInTheDocument();
  });

  it("shows Casual badge for casual matches", () => {
    render(
      <LiveMatchClient
        matchId="match-1"
        matchStatus="pending"
        matchType="casual"
        durationSeconds={600}
        opponentName="Fighter B"
      />,
    );

    expect(screen.getByText("Casual")).toBeInTheDocument();
  });

  it("formats non-standard duration correctly", () => {
    render(
      <LiveMatchClient
        matchId="match-1"
        matchStatus="pending"
        matchType="casual"
        durationSeconds={300}
        opponentName="Fighter B"
      />,
    );

    expect(screen.getByText("5:00")).toBeInTheDocument();
  });

  it("shows ready to start text when pending", () => {
    render(
      <LiveMatchClient
        matchId="match-1"
        matchStatus="pending"
        matchType="casual"
        durationSeconds={600}
        opponentName="Fighter B"
      />,
    );

    expect(screen.getByText("Ready to start")).toBeInTheDocument();
  });

  it("counts down timer when in progress", async () => {
    vi.useFakeTimers();

    render(
      <LiveMatchClient
        matchId="match-1"
        matchStatus="in_progress"
        matchType="casual"
        durationSeconds={600}
        opponentName="Fighter B"
      />,
    );

    expect(screen.getByText("10:00")).toBeInTheDocument();
    expect(screen.getByText("Match in progress")).toBeInTheDocument();

    act(() => {
      vi.advanceTimersByTime(3000);
    });

    expect(screen.getByText("9:57")).toBeInTheDocument();

    vi.useRealTimers();
  });
});
