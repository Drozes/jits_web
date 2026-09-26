/**
 * Result recording: a submission needs a finish time in 1..duration (the BE
 * refuses it otherwise, missing_fields / invalid_finish_time), and a missed
 * result_submitted broadcast is recovered from the DB on a failed record or
 * when the tab becomes visible.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";

const toasts = vi.hoisted(() => ({ error: vi.fn() }));
vi.mock("sonner", () => ({ toast: toasts }));
vi.mock("@/lib/supabase/client", () => ({ createClient: () => ({}) }));

const api = vi.hoisted(() => ({ recordMatchResult: vi.fn(), getMatchDetails: vi.fn() }));
vi.mock("@jits/shared/api/mutations", () => ({ recordMatchResult: api.recordMatchResult }));
vi.mock("@jits/shared/api/queries", () => ({ getMatchDetails: api.getMatchDetails }));

const sync = vi.hoisted(() => ({ broadcastResultSubmitted: vi.fn() }));
vi.mock("@jits/shared/hooks/use-session-match-sync", () => ({
  useSessionMatchSync: () => sync,
}));

// Radix Select is awkward in jsdom: a plain stand-in drives the same props.
vi.mock("@/app/(app)/match/[id]/results/submission-fields", () => ({
  SubmissionFields: (p: {
    onSubmissionChange: (c: string) => void;
    onFinishTimeChange: (s: number | undefined) => void;
  }) => (
    <div>
      <button type="button" onClick={() => p.onSubmissionChange("rnc")}>pick-sub</button>
      <button type="button" onClick={() => p.onFinishTimeChange(90)}>time-90</button>
      <button type="button" onClick={() => p.onFinishTimeChange(400)}>time-400</button>
    </div>
  ),
}));

import { ResultRecordingStep } from "./result-recording-step";

function renderStep() {
  const onNext = vi.fn();
  render(
    <ResultRecordingStep
      onNext={onNext}
      matchId="M1"
      currentAthleteId="me"
      durationSeconds={300}
      participants={[
        { id: "me", displayName: "Me" },
        { id: "op", displayName: "Opp" },
      ]}
      submissionTypes={[]}
      timekeeperEnabled={false}
      hasTimekeeper={false}
      isTimekeeper={false}
    />,
  );
  return onNext;
}

const recordBtn = () => screen.getByRole("button", { name: /record result/i });
const flushMountRead = () => act(async () => {});

function fillSubmission() {
  fireEvent.click(screen.getByRole("button", { name: "Submission" }));
  fireEvent.click(screen.getByRole("button", { name: "Me" }));
  fireEvent.click(screen.getByText("pick-sub"));
}

beforeEach(() => {
  vi.clearAllMocks();
  api.getMatchDetails.mockResolvedValue({ status: "in_progress", participants: [] });
});

describe("ResultRecordingStep", () => {
  it("requires a finish time within the match for a submission", () => {
    renderStep();
    fillSubmission();
    expect(recordBtn()).toBeDisabled();
    fireEvent.click(screen.getByText("time-400"));
    expect(recordBtn()).toBeDisabled();
    fireEvent.click(screen.getByText("time-90"));
    expect(recordBtn()).toBeEnabled();
  });

  it("drops a finish time entered for a different winner", () => {
    renderStep();
    fillSubmission();
    fireEvent.click(screen.getByText("time-90"));
    expect(recordBtn()).toBeEnabled();
    // Switching the winner remounts the fields empty; the old 90 must go too.
    fireEvent.click(screen.getByRole("button", { name: "Opp" }));
    expect(recordBtn()).toBeDisabled();
  });

  it("records a submission with its finish time", async () => {
    api.recordMatchResult.mockResolvedValue({ ok: true, data: {} });
    const onNext = renderStep();
    fillSubmission();
    fireEvent.click(screen.getByText("time-90"));
    fireEvent.click(recordBtn());
    await waitFor(() => expect(onNext).toHaveBeenCalledTimes(1));
    expect(api.recordMatchResult).toHaveBeenCalledWith(
      {},
      expect.objectContaining({ result: "submission", winnerId: "me", finishTimeSeconds: 90 }),
    );
  });

  it("shows the mapped BE message when a record fails and nothing is recorded", async () => {
    api.recordMatchResult.mockResolvedValue({
      ok: false,
      error: { message: "A submission needs a winner, a submission type and a finish time." },
    });
    const onNext = renderStep();
    fireEvent.click(screen.getByRole("button", { name: "Draw" }));
    fireEvent.click(recordBtn());
    await waitFor(() =>
      expect(toasts.error).toHaveBeenCalledWith(
        "A submission needs a winner, a submission type and a finish time.",
      ),
    );
    expect(onNext).not.toHaveBeenCalled();
  });

  it("moves on from the DB when the record fails because the opponent recorded first", async () => {
    api.recordMatchResult.mockResolvedValue({ ok: false, error: { message: "x" } });
    // The mount read still sees the match in progress.
    const onNext = renderStep();
    await flushMountRead();
    api.getMatchDetails.mockResolvedValue({
      status: "completed",
      participants: [
        { athlete_id: "me", outcome: "loss" },
        { athlete_id: "op", outcome: "win" },
      ],
    });
    fireEvent.click(screen.getByRole("button", { name: "Draw" }));
    fireEvent.click(recordBtn());
    await waitFor(() =>
      expect(onNext).toHaveBeenCalledWith({
        resultData: { result: "submission", winnerId: "op" },
      }),
    );
    expect(toasts.error).not.toHaveBeenCalled();
  });

  it("re-reads the match when the tab becomes visible", async () => {
    const onNext = renderStep();
    await flushMountRead();
    expect(onNext).not.toHaveBeenCalled();
    api.getMatchDetails.mockResolvedValue({
      status: "disputed",
      participants: [{ athlete_id: "me", outcome: "draw" }],
    });
    await act(async () => {
      document.dispatchEvent(new Event("visibilitychange"));
    });
    await waitFor(() =>
      expect(onNext).toHaveBeenCalledWith({ resultData: { result: "draw" } }),
    );
    expect(onNext).toHaveBeenCalledTimes(1);
  });

  it("moves on at mount when the result is already on the row", async () => {
    api.getMatchDetails.mockResolvedValue({
      status: "completed",
      participants: [
        { athlete_id: "me", outcome: "win" },
        { athlete_id: "op", outcome: "loss" },
      ],
    });
    const onNext = renderStep();
    await waitFor(() =>
      expect(onNext).toHaveBeenCalledWith({
        resultData: { result: "submission", winnerId: "me" },
      }),
    );
    expect(api.getMatchDetails).toHaveBeenCalledTimes(1);
    expect(onNext).toHaveBeenCalledTimes(1);
  });

  it("stays on the form at mount while the match is still in progress", async () => {
    const onNext = renderStep();
    await flushMountRead();
    expect(api.getMatchDetails).toHaveBeenCalledTimes(1);
    expect(onNext).not.toHaveBeenCalled();
    expect(recordBtn()).toBeInTheDocument();
  });
});
