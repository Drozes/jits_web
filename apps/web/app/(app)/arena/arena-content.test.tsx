import { describe, it, expect, vi, beforeEach } from "vitest";
import { act, render, screen } from "@testing-library/react";
import {
  IDLE_ARENA_STATE,
  __resetArenaStoreForTests,
  publishArenaState,
} from "@/lib/arena/arena-store";
import { ArenaContent } from "./arena-content";

const lobby = vi.hoisted(() => ({ ids: new Set<string>() }));
vi.mock("@/hooks/use-lobby-presence", () => ({ useLobbyIds: () => lobby.ids }));

const competitor = (id: string, displayName: string) => ({
  id,
  displayName,
  currentElo: 1500,
  eloDiff: 0,
});

beforeEach(() => {
  __resetArenaStoreForTests();
  lobby.ids = new Set();
});

describe("ArenaContent", () => {
  it("uses the server live value until the owner publishes", () => {
    render(<ArenaContent lookingCompetitors={[]} currentAthleteRanked />);
    expect(screen.getByRole("button", { name: "Go offline" })).toBeInTheDocument();
    expect(screen.getByText(/You're live, but nobody else is yet/)).toBeInTheDocument();
  });

  it("follows the store once the owner has published", () => {
    render(<ArenaContent lookingCompetitors={[]} currentAthleteRanked />);
    act(() => publishArenaState({ ...IDLE_ARENA_STATE, ready: true, isLive: false }));
    expect(screen.getByRole("button", { name: "Go live" })).toBeInTheDocument();
  });

  it("keeps the Online now / Open to challenges split driven by presence", () => {
    lobby.ids = new Set(["a"]);
    render(
      <ArenaContent
        lookingCompetitors={[competitor("a", "Ana"), competitor("b", "Bo")]}
        currentAthleteRanked={false}
      />,
    );
    const online = screen.getByRole("region", { name: /Online now/ });
    const open = screen.getByRole("region", { name: /Open to challenges/ });
    expect(online).toHaveTextContent("Ana");
    expect(open).toHaveTextContent("Bo");
    expect(open).not.toHaveTextContent("Ana");
  });

  it("renders the incoming plate inline from the store", () => {
    render(<ArenaContent lookingCompetitors={[]} currentAthleteRanked={false} />);
    act(() =>
      publishArenaState({
        ...IDLE_ARENA_STATE,
        ready: true,
        incoming: { challengeId: "c1", challengerId: "a", challengerName: "Ana" },
      }),
    );
    expect(screen.getByText("Ana wants to roll")).toBeInTheDocument();
  });
});
