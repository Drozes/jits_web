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

  it.each([
    ["proximity", "You need to be on the same mat as Ana to start."],
    ["denied", "Location is off. ELO RATED checks you're both on the same mat before a match starts."],
    ["accuracy", "Can't pin your location. Try near a window."],
  ] as const)("a %s-blocked start shows its copy in an alert with Retry and Cancel", (block, copy) => {
    render(<ArenaContent lookingCompetitors={[]} currentAthleteRanked={false} />);
    act(() =>
      publishArenaState({
        ...IDLE_ARENA_STATE,
        ready: true,
        incoming: {
          challengeId: "c1",
          challengerId: "a",
          challengerName: "Ana",
          startBlocked: block,
        },
      }),
    );
    expect(screen.getByRole("alert")).toHaveTextContent(copy);
    expect(screen.getByRole("button", { name: "Retry" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Cancel" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Accept" })).toBeNull();
  });

  it("a fresh prompt keeps Accept / Decline and an empty alert", () => {
    render(<ArenaContent lookingCompetitors={[]} currentAthleteRanked={false} />);
    act(() =>
      publishArenaState({
        ...IDLE_ARENA_STATE,
        ready: true,
        incoming: { challengeId: "c1", challengerId: "a", challengerName: "Ana" },
      }),
    );
    expect(screen.getByRole("button", { name: "Accept" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Decline" })).toBeInTheDocument();
    expect(screen.getByRole("alert")).toBeEmptyDOMElement();
  });
});
