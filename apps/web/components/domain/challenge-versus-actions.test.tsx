/**
 * The sender's Cancel on a challenge card (jits-q9x8). `cancelChallenge`
 * reports `{ cancelled: false }` when no row changed (the challenge was
 * already over, or the opponent had just started the match), which is not an
 * error. It must not be treated as a plain success: a started match is
 * joined, anything else just refreshes the list.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { act, fireEvent, render } from "@testing-library/react";

const nav = vi.hoisted(() => ({ push: vi.fn(), refresh: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => nav }));
vi.mock("@/lib/supabase/client", () => ({ createClient: () => ({}) }));
const m = vi.hoisted(() => ({
  cancelChallenge: vi.fn(),
  startMatchFromChallenge: vi.fn(),
}));
vi.mock("@jits/shared/api/mutations", () => m);
vi.mock("@/components/domain/challenge-response-sheet", () => ({
  ChallengeResponseSheet: () => null,
}));
vi.mock("@/components/domain/expiry-badge", () => ({ ExpiryBadge: () => null }));

import { ChallengeVersusActions } from "./challenge-versus-actions";

function renderSender() {
  return render(
    <ChallengeVersusActions
      challengeId="c1"
      isSender
      expiresAt="2026-10-01T00:00:00.000Z"
      challengerName="Me"
      challengerElo={1200}
      challengerWeight={170}
      matchType="ranked"
      currentAthleteElo={1200}
    />,
  );
}

async function clickCancel(view: ReturnType<typeof renderSender>) {
  await act(async () => {
    fireEvent.click(view.getByText("Cancel"));
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  m.cancelChallenge.mockResolvedValue({ ok: true, data: { cancelled: true } });
  m.startMatchFromChallenge.mockResolvedValue({
    ok: false,
    error: { code: "CHALLENGE_NOT_ACCEPTED", message: "x" },
  });
});

describe("ChallengeVersusActions cancel", () => {
  it("refreshes after a real cancel, without asking for a match", async () => {
    const view = renderSender();
    await clickCancel(view);
    expect(m.cancelChallenge).toHaveBeenCalledWith({}, "c1");
    expect(m.startMatchFromChallenge).not.toHaveBeenCalled();
    expect(nav.refresh).toHaveBeenCalledTimes(1);
    expect(nav.push).not.toHaveBeenCalled();
  });

  it("joins the match when nothing was cancelled because the opponent had started it", async () => {
    m.cancelChallenge.mockResolvedValue({ ok: true, data: { cancelled: false } });
    m.startMatchFromChallenge.mockResolvedValue({ ok: true, data: { match_id: "m7" } });
    const view = renderSender();
    await clickCancel(view);
    expect(m.startMatchFromChallenge).toHaveBeenCalledWith({}, "c1");
    expect(nav.push).toHaveBeenCalledWith("/arena/match/m7");
    expect(nav.refresh).not.toHaveBeenCalled();
  });

  it("refreshes when nothing was cancelled and there is no match to join", async () => {
    m.cancelChallenge.mockResolvedValue({ ok: true, data: { cancelled: false } });
    const view = renderSender();
    await clickCancel(view);
    expect(nav.push).not.toHaveBeenCalled();
    expect(nav.refresh).toHaveBeenCalledTimes(1);
    expect(view.getByText("Cancel")).toBeTruthy();
  });

  it("shows the error and stays put when the cancel failed", async () => {
    m.cancelChallenge.mockResolvedValue({
      ok: false,
      error: { code: "UNKNOWN", message: "Couldn't cancel." },
    });
    const view = renderSender();
    await clickCancel(view);
    expect(view.getByText("Couldn't cancel.")).toBeTruthy();
    expect(nav.refresh).not.toHaveBeenCalled();
    expect(m.startMatchFromChallenge).not.toHaveBeenCalled();
  });
});
