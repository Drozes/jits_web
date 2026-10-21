/**
 * `useAdminTimekeeperReviews` (lib/admin/use-admin-timekeeper-reviews.ts; A27,
 * spec 9.2, TEST-PLAN M10): the open result stalls from
 * `admin_list_timekeeper_reviews`, Record result and Void through
 * `admin_resolve_timekeeper_review`, the TK-AD6 toasts, the re-read after a
 * resolve, one resolve at a time, and no admin RPC until the caller is known
 * to be an admin.
 */
import { act, renderHook } from "@testing-library/react-native";

const mockList = jest.fn();
const mockResolve = jest.fn();
jest.mock("@jits/shared/api/timekeeper", () => ({
  adminListTimekeeperReviews: (...a: unknown[]) => mockList(...a),
  adminResolveTimekeeperReview: (...a: unknown[]) => mockResolve(...a),
}));
const mockTypes = jest.fn();
jest.mock("@jits/shared/api/queries", () => ({
  getSubmissionTypes: (...a: unknown[]) => mockTypes(...a),
}));
jest.mock("@/lib/supabase/client", () => ({ supabase: { tag: "client" } }));
const mockToast = { success: jest.fn(), error: jest.fn() };
jest.mock("@/components/ui/toast", () => ({
  get toast() {
    return mockToast;
  },
}));

import { recordParams, useAdminTimekeeperReviews } from "@/lib/admin/use-admin-timekeeper-reviews";

const REVIEW = {
  matchId: "m-1",
  flaggedAt: "2026-10-21T10:10:00Z",
  athletes: [
    { id: "a-1", displayName: "Mina Reyes" },
    { id: "a-2", displayName: "Dayo Okafor" },
  ],
  timekeeper: { id: "t-1", displayName: "Jo Cruz" },
  endedAt: "2026-10-21T10:00:00Z",
  finalElapsedS: 252,
  durationSeconds: 300,
};
const TYPES = [{ code: "armbar", name: "Armbar" }];
const SUBMISSION = { outcome: "submission" as const, winnerId: "a-2", submissionCode: "armbar", finishTimeStr: "3:05" };
const DRAW = { outcome: "draw" as const, winnerId: "", submissionCode: "", finishTimeStr: "4:12" };

async function settle() {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
  });
}

async function renderAdmin(enabled = true) {
  const hook = renderHook(({ on }: { on: boolean }) => useAdminTimekeeperReviews(on), { initialProps: { on: enabled } });
  await settle();
  return hook;
}

beforeEach(() => {
  jest.clearAllMocks();
  mockList.mockResolvedValue({ ok: true, data: [REVIEW] });
  mockTypes.mockResolvedValue(TYPES);
  mockResolve.mockResolvedValue({ ok: true, data: { action: "record", matchId: "m-1" } });
});

describe("recordParams", () => {
  it("a submission sends the winner, the finish and the finish time in seconds", () => {
    expect(recordParams("m-1", SUBMISSION)).toEqual({
      matchId: "m-1",
      action: "record",
      result: "submission",
      winnerId: "a-2",
      submissionTypeCode: "armbar",
      finishTimeSeconds: 185,
    });
  });

  it("a draw sends no winner, finish or time", () => {
    expect(recordParams("m-1", DRAW)).toEqual({
      matchId: "m-1",
      action: "record",
      result: "draw",
      winnerId: null,
      submissionTypeCode: null,
      finishTimeSeconds: null,
    });
  });
});

describe("useAdminTimekeeperReviews", () => {
  it("reads nothing until the caller is known to be an admin", async () => {
    const hook = await renderAdmin(false);
    expect(mockList).not.toHaveBeenCalled();
    expect(mockTypes).not.toHaveBeenCalled();
    expect(hook.result.current.isLoading).toBe(true);
    hook.rerender({ on: true });
    await settle();
    expect(mockList).toHaveBeenCalledWith({ tag: "client" });
    expect(hook.result.current.reviews).toEqual([REVIEW]);
  });

  it("lists the open reviews and the submission types", async () => {
    const { result } = await renderAdmin();
    expect(result.current.isLoading).toBe(false);
    expect(result.current.loadFailed).toBe(false);
    expect(result.current.reviews).toEqual([REVIEW]);
    expect(result.current.submissionTypes).toEqual(TYPES);
    expect(mockTypes).toHaveBeenCalledWith({ tag: "client" });
  });

  it("a failed read is loadFailed, not an empty list; reload reads again", async () => {
    mockList.mockResolvedValueOnce({ ok: false, error: { code: "UNKNOWN", message: "boom" } });
    const { result } = await renderAdmin();
    expect(result.current.loadFailed).toBe(true);
    expect(result.current.notAdmin).toBe(false);
    expect(result.current.reviews).toEqual([]);
    act(() => result.current.reload());
    await settle();
    expect(mockList).toHaveBeenCalledTimes(2);
    expect(result.current.loadFailed).toBe(false);
    expect(result.current.reviews).toEqual([REVIEW]);
  });

  it("a thrown read is loadFailed too (never a stuck spinner)", async () => {
    mockList.mockRejectedValueOnce(new Error("network"));
    const { result } = await renderAdmin();
    expect(result.current.isLoading).toBe(false);
    expect(result.current.loadFailed).toBe(true);
  });

  it("the server's not_admin sets notAdmin", async () => {
    mockList.mockResolvedValue({ ok: false, error: { code: "NOT_ADMIN", message: "x" } });
    const { result } = await renderAdmin();
    expect(result.current.notAdmin).toBe(true);
  });

  it("Record result calls the admin RPC with the result, toasts and re-reads", async () => {
    const { result } = await renderAdmin();
    let outcome: string | undefined;
    await act(async () => {
      outcome = await result.current.record("m-1", SUBMISSION);
    });
    await settle();
    expect(outcome).toBe("resolved");
    expect(mockResolve).toHaveBeenCalledWith({ tag: "client" }, recordParams("m-1", SUBMISSION));
    expect(mockToast.success).toHaveBeenCalledWith("Result recorded");
    expect(mockToast.error).not.toHaveBeenCalled();
    expect(mockList).toHaveBeenCalledTimes(2);
    expect(result.current.busyMatchId).toBeNull();
  });

  it("Void calls the admin RPC with 'void', toasts and re-reads", async () => {
    mockResolve.mockResolvedValue({ ok: true, data: { action: "void", matchId: "m-1" } });
    const { result } = await renderAdmin();
    let outcome: string | undefined;
    await act(async () => {
      outcome = await result.current.voidMatch("m-1");
    });
    await settle();
    expect(outcome).toBe("resolved");
    expect(mockResolve).toHaveBeenCalledWith({ tag: "client" }, { matchId: "m-1", action: "void" });
    expect(mockToast.success).toHaveBeenCalledWith("Match voided");
    expect(mockList).toHaveBeenCalledTimes(2);
  });

  it.each(["NO_OPEN_REVIEW", "MATCH_NOT_PENDING", "NOT_TIMEKEEPER_MODE"])(
    "%s: the review is gone; the failure toast, and the list re-reads",
    async (code) => {
      mockResolve.mockResolvedValue({ ok: false, error: { code, message: "server text" } });
      const { result } = await renderAdmin();
      let outcome: string | undefined;
      await act(async () => {
        outcome = await result.current.voidMatch("m-1");
      });
      await settle();
      expect(outcome).toBe("gone");
      expect(mockToast.error).toHaveBeenCalledWith("Couldn't update the match");
      expect(mockList).toHaveBeenCalledTimes(2);
    },
  );

  it("any other refusal: the failure toast (never the server's text), no re-read, still open", async () => {
    mockResolve.mockResolvedValue({ ok: false, error: { code: "INVALID_RESULT", message: "Invalid submission type." } });
    const { result } = await renderAdmin();
    let outcome: string | undefined;
    await act(async () => {
      outcome = await result.current.record("m-1", SUBMISSION);
    });
    expect(outcome).toBe("failed");
    expect(mockToast.error).toHaveBeenCalledTimes(1);
    expect(mockToast.error).toHaveBeenCalledWith("Couldn't update the match");
    expect(mockList).toHaveBeenCalledTimes(1);
    expect(result.current.busyMatchId).toBeNull();
  });

  it("a thrown resolve fails plainly and frees the next one", async () => {
    mockResolve.mockRejectedValueOnce(new Error("network"));
    const { result } = await renderAdmin();
    let outcome: string | undefined;
    await act(async () => {
      outcome = await result.current.voidMatch("m-1");
    });
    expect(outcome).toBe("failed");
    expect(mockToast.error).toHaveBeenCalledWith("Couldn't update the match");
    await act(async () => {
      outcome = await result.current.voidMatch("m-1");
    });
    expect(outcome).toBe("resolved");
    expect(mockResolve).toHaveBeenCalledTimes(2);
  });

  it("a not_admin refusal sets notAdmin", async () => {
    mockResolve.mockResolvedValue({ ok: false, error: { code: "NOT_ADMIN", message: "x" } });
    const { result } = await renderAdmin();
    await act(async () => {
      await result.current.voidMatch("m-1");
    });
    expect(result.current.notAdmin).toBe(true);
  });

  it("one resolve at a time: a second call while one is in flight is refused locally", async () => {
    let finish: (v: unknown) => void = () => undefined;
    mockResolve.mockImplementationOnce(() => new Promise((r) => (finish = r)));
    const { result } = await renderAdmin();
    let first: Promise<string> = Promise.resolve("");
    act(() => {
      first = result.current.voidMatch("m-1");
    });
    expect(result.current.busyMatchId).toBe("m-1");
    let second: string | undefined;
    await act(async () => {
      second = await result.current.record("m-1", DRAW);
    });
    expect(second).toBe("failed");
    expect(mockResolve).toHaveBeenCalledTimes(1);
    await act(async () => {
      finish({ ok: true, data: { action: "void", matchId: "m-1" } });
      await first;
    });
    expect(result.current.busyMatchId).toBeNull();
  });
});
