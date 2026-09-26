/**
 * The profile Challenge must ride the Arena handshake (so the challenger gets
 * the waiting bar and enters the match when a live opponent accepts), and a
 * pending challenge must never link to the hidden /athlete/[id]/challenges.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import {
  IDLE_ARENA_STATE,
  __resetArenaStoreForTests,
  publishArenaState,
  registerArenaController,
} from "@/lib/arena/arena-store";

const db = vi.hoisted(() => ({ createChallenge: vi.fn(), canCreateChallenge: vi.fn() }));
vi.mock("@/lib/supabase/client", () => ({
  createClient: () => ({ rpc: () => Promise.resolve({ data: null }) }),
}));
vi.mock("@jits/shared/api/queries", () => ({ canCreateChallenge: db.canCreateChallenge }));
vi.mock("@jits/shared/api/mutations", () => ({ createChallenge: db.createChallenge }));

import { ARENA_CHALLENGE_FRESH_MS } from "@jits/shared/constants";
import { AthleteProfileActions } from "./athlete-profile-actions";

const stats = {
  displayName: "X",
  elo: 1200,
  wins: 0,
  losses: 0,
  draws: 0,
  winRate: 0,
  weight: 170,
};

function renderActions(
  pendingChallengeId: string | null = null,
  competitorInArena = true,
  pendingChallengeCreatedAt: string | null = pendingChallengeId ? new Date().toISOString() : null,
) {
  return render(
    <AthleteProfileActions
      competitorId="op"
      currentAthleteId="me"
      currentAthlete={{ ...stats, displayName: "Me" }}
      competitor={{ ...stats, displayName: "Opp" }}
      headToHead={[]}
      pendingChallengeId={pendingChallengeId}
      pendingChallengeCreatedAt={pendingChallengeCreatedAt}
      competitorInArena={competitorInArena}
    />,
  );
}

const controller = {
  toggle: vi.fn(async () => {}),
  goLive: vi.fn(async () => {}),
  goOffline: vi.fn(async () => {}),
  sendChallenge: vi.fn(async () => {}),
  accept: vi.fn(async () => {}),
  decline: vi.fn(async () => {}),
  cancelOutgoing: vi.fn(async () => {}),
};

beforeEach(() => {
  vi.clearAllMocks();
  __resetArenaStoreForTests();
  registerArenaController(controller);
  publishArenaState({ ...IDLE_ARENA_STATE, ready: true });
  db.canCreateChallenge.mockResolvedValue(true);
});

describe("AthleteProfileActions", () => {
  it("sends the profile challenge through the Arena, never a direct insert", async () => {
    renderActions();
    fireEvent.click(screen.getByRole("button", { name: /^challenge$/i }));
    const send = await screen.findByRole("button", { name: /send challenge/i });
    fireEvent.click(send);
    await waitFor(() => expect(controller.sendChallenge).toHaveBeenCalledWith("op", "Opp"));
    expect(db.createChallenge).not.toHaveBeenCalled();
  });

  it("shows the waiting state and blocks a second challenge", () => {
    renderActions();
    act(() =>
      publishArenaState({
        ...IDLE_ARENA_STATE,
        ready: true,
        outgoing: { challengeId: "c1", opponentId: "op", opponentName: "Opp" },
      }),
    );
    const btn = screen.getByRole("button", { name: /challenge sent/i });
    expect(btn).toBeDisabled();
  });

  it("blocks challenging while another Arena challenge is out", () => {
    renderActions();
    act(() =>
      publishArenaState({
        ...IDLE_ARENA_STATE,
        ready: true,
        outgoing: { challengeId: "c1", opponentId: "someone", opponentName: "S" },
      }),
    );
    expect(screen.getByRole("button", { name: /^challenge$/i })).toBeDisabled();
  });

  it("disables Send and says why when the opponent is not in the Arena", async () => {
    renderActions(null, false);
    fireEvent.click(screen.getByRole("button", { name: /^challenge$/i }));
    expect(await screen.findByText("Opp isn't in the Arena right now.")).toBeInTheDocument();
    const send = screen.getByRole("button", { name: /send challenge/i });
    expect(send).toBeDisabled();
    fireEvent.click(send);
    expect(controller.sendChallenge).not.toHaveBeenCalled();
  });

  it("blocks challenging until the Arena owner has registered", () => {
    act(() => publishArenaState(IDLE_ARENA_STATE));
    renderActions();
    expect(screen.getByRole("button", { name: /^challenge$/i })).toBeDisabled();
  });

  it("points a pending challenge at the Arena, not the hidden challenges route", () => {
    renderActions("pending-1");
    const link = screen.getByRole("link", { name: /open arena/i });
    expect(link).toHaveAttribute("href", "/arena");
    expect(document.querySelector('a[href*="/challenges"]')).toBeNull();
  });

  it("treats a pending challenge older than the Arena window as not pending", () => {
    const stale = new Date(Date.now() - ARENA_CHALLENGE_FRESH_MS - 60_000).toISOString();
    renderActions("pending-old", true, stale);
    expect(screen.queryByRole("link", { name: /open arena/i })).toBeNull();
    expect(screen.getByRole("button", { name: /^challenge$/i })).toBeEnabled();
  });

  it("treats an undated pending challenge as not pending", () => {
    renderActions("pending-x", true, null);
    expect(screen.queryByRole("link", { name: /open arena/i })).toBeNull();
  });
});
