/**
 * TK-RC3 (timekeeper mode A8, TEST-PLAN 3.2): the toast to an athlete whose
 * confirmation a result edit reset, "Result changed / {name} corrected the
 * result. Confirm it again.", shown once per edit, and never to an athlete
 * who had not confirmed, nor for a read that straddles the edit (the match
 * read at the new count, the confirmations read a moment older).
 */
import AsyncStorage from "@react-native-async-storage/async-storage";
import { act, renderHook } from "@testing-library/react-native";

const mockInfo = jest.fn();
jest.mock("@/components/ui/toast", () => ({ toast: { info: (...a: unknown[]) => mockInfo(...a) } }));

import {
  noteResultConfirmed,
  RESULT_EDIT_NOTICE_STORAGE_KEY,
  resetResultEditNotices,
  resultEditNotice,
  useResultEditNotice,
} from "@/lib/match-flow/use-result-edit-notice";

type Props = Parameters<typeof useResultEditNotice>[0];

const BASE: Props = {
  matchId: "M1",
  athleteId: "me",
  enabled: true,
  resultEditCount: 0,
  confirmedAthleteIds: [],
  timekeeperName: "J. Cruz",
};

function mount(props: Partial<Props> = {}) {
  return renderHook((p: Props) => useResultEditNotice(p), { initialProps: { ...BASE, ...props } });
}

const RC3 = { text1: "Result changed", description: "J. Cruz corrected the result. Confirm it again." };

beforeEach(() => {
  mockInfo.mockClear();
  resetResultEditNotices();
});

describe("useResultEditNotice", () => {
  it("shows TK-RC3 once when an edit resets this athlete's confirmation", () => {
    const hook = mount({ confirmedAthleteIds: ["me"] });
    expect(mockInfo).not.toHaveBeenCalled();
    hook.rerender({ ...BASE, resultEditCount: 1, confirmedAthleteIds: [] });
    expect(mockInfo).toHaveBeenCalledTimes(1);
    expect(mockInfo).toHaveBeenCalledWith(RC3);
    // Later reads of the same edit, and a remount, say nothing more.
    hook.rerender({ ...BASE, resultEditCount: 1, confirmedAthleteIds: ["opp"] });
    hook.unmount();
    mount({ resultEditCount: 1, confirmedAthleteIds: [] });
    expect(mockInfo).toHaveBeenCalledTimes(1);
  });

  it("shows it again for the next edit after the athlete re-confirmed", () => {
    const hook = mount({ confirmedAthleteIds: ["me"] });
    hook.rerender({ ...BASE, resultEditCount: 1, confirmedAthleteIds: [] });
    hook.rerender({ ...BASE, resultEditCount: 1, confirmedAthleteIds: ["me"] });
    hook.rerender({ ...BASE, resultEditCount: 2, confirmedAthleteIds: [] });
    expect(mockInfo).toHaveBeenCalledTimes(2);
  });

  it("once per reset: a second edit with no confirm in between says nothing more", () => {
    const hook = mount({ confirmedAthleteIds: ["me"] });
    hook.rerender({ ...BASE, resultEditCount: 1, confirmedAthleteIds: [] });
    expect(mockInfo).toHaveBeenCalledTimes(1);
    // The athlete never confirmed the first edit's result: the second edit resets nothing of theirs.
    hook.rerender({ ...BASE, resultEditCount: 2, confirmedAthleteIds: [] });
    hook.rerender({ ...BASE, resultEditCount: 3, confirmedAthleteIds: ["opp"] });
    expect(mockInfo).toHaveBeenCalledTimes(1);
  });

  it("a confirm the confirm step made after the reset, then the next edit: once more", () => {
    noteResultConfirmed("M1", "me", 0);
    const hook = mount();
    hook.rerender({ ...BASE, resultEditCount: 1, confirmedAthleteIds: [] });
    // The athlete confirms the edited result (their confirm carried count 1)...
    noteResultConfirmed("M1", "me", 1);
    // ...and the timekeeper edits again.
    hook.rerender({ ...BASE, resultEditCount: 2, confirmedAthleteIds: [] });
    expect(mockInfo).toHaveBeenCalledTimes(2);
  });

  it("a confirm refused as stale (RESULT_CHANGED: edit 2 landed first) never leads to TK-RC3 after TK-RC4", () => {
    const hook = mount({ confirmedAthleteIds: ["me"] });
    hook.rerender({ ...BASE, resultEditCount: 1, confirmedAthleteIds: [] });
    expect(mockInfo).toHaveBeenCalledTimes(1);
    // The confirm at count 1 is refused, so the confirm step records nothing;
    // the read after the refusal brings count 2.
    hook.rerender({ ...BASE, resultEditCount: 2, confirmedAthleteIds: [] });
    expect(mockInfo).toHaveBeenCalledTimes(1);
  });

  it("never for an athlete who had not confirmed (the confirm step's own header says it)", () => {
    const hook = mount();
    hook.rerender({ ...BASE, resultEditCount: 1, confirmedAthleteIds: [] });
    hook.rerender({ ...BASE, resultEditCount: 1, confirmedAthleteIds: ["opp"] });
    expect(mockInfo).not.toHaveBeenCalled();
  });

  it("a read that straddles the edit (new count, old confirmations) still leads to the toast", () => {
    const hook = mount({ confirmedAthleteIds: ["me"] });
    // The match read already has the edit; the confirmations read, older, still lists me.
    hook.rerender({ ...BASE, resultEditCount: 1, confirmedAthleteIds: ["me"] });
    expect(mockInfo).not.toHaveBeenCalled();
    // The next read is consistent.
    hook.rerender({ ...BASE, resultEditCount: 1, confirmedAthleteIds: [] });
    expect(mockInfo).toHaveBeenCalledTimes(1);
  });

  it("after the toast, a stale read re-listing the announced confirmation at an older count leads to no second toast", () => {
    const hook = mount({ confirmedAthleteIds: ["me"] });
    hook.rerender({ ...BASE, resultEditCount: 1, confirmedAthleteIds: [] });
    expect(mockInfo).toHaveBeenCalledTimes(1);
    // An out-of-order read: the count before the edit, the confirmation the edit deleted.
    hook.rerender({ ...BASE, resultEditCount: 0, confirmedAthleteIds: ["me"] });
    // The next read is consistent again: the same edit, already announced.
    hook.rerender({ ...BASE, resultEditCount: 1, confirmedAthleteIds: [] });
    expect(mockInfo).toHaveBeenCalledTimes(1);
  });

  it("knows a confirm the confirm step made before any read listed it", () => {
    const hook = mount();
    noteResultConfirmed("M1", "me", 0);
    hook.rerender({ ...BASE, resultEditCount: 1, confirmedAthleteIds: [] });
    expect(mockInfo).toHaveBeenCalledWith(RC3);
  });

  it("unknown confirmations (a failed read) decide nothing", () => {
    const hook = mount({ confirmedAthleteIds: ["me"] });
    hook.rerender({ ...BASE, resultEditCount: 1, confirmedAthleteIds: null });
    expect(mockInfo).not.toHaveBeenCalled();
    hook.rerender({ ...BASE, resultEditCount: 1, confirmedAthleteIds: [] });
    expect(mockInfo).toHaveBeenCalledTimes(1);
  });

  it("is inert when disabled (a two-athlete match, the timekeeper)", () => {
    const hook = mount({ enabled: false, confirmedAthleteIds: ["me"] });
    hook.rerender({ ...BASE, enabled: false, resultEditCount: 1, confirmedAthleteIds: [] });
    const tk = mount({ athleteId: null, confirmedAthleteIds: ["me"] });
    tk.rerender({ ...BASE, athleteId: null, resultEditCount: 1, confirmedAthleteIds: [] });
    expect(mockInfo).not.toHaveBeenCalled();
  });

  it("keeps matches apart", () => {
    noteResultConfirmed("M2", "me", 0);
    const hook = mount();
    hook.rerender({ ...BASE, resultEditCount: 1, confirmedAthleteIds: [] });
    expect(mockInfo).not.toHaveBeenCalled();
  });
});

/** Let the device record's one read per run, and its writes, land. */
async function settle() {
  await act(async () => {
    await new Promise((r) => setTimeout(r, 0));
  });
}

/** The app is killed and opened again: a new run, with what the device kept. */
const relaunch = () => resetResultEditNotices({ keepStored: true });

describe("useResultEditNotice after a relaunch (the record the device keeps)", () => {
  it("confirm, relaunch onto the verdict, then an edit: TK-RC3 exactly once", async () => {
    // Run 1: the athlete confirms at count 0 on the confirm step, then moves on to the verdict.
    noteResultConfirmed("M1", "me", 0);
    await settle();
    // Run 2 opens on the verdict: the confirm step, where the record is made,
    // never mounts until the edit brings the athlete back to it, not listed.
    relaunch();
    const hook = mount({ resultEditCount: 1, confirmedAthleteIds: [] });
    await settle();
    expect(mockInfo).toHaveBeenCalledTimes(1);
    expect(mockInfo).toHaveBeenCalledWith(RC3);
    // Later reads, a remount and another relaunch say nothing more: the record is spent.
    hook.rerender({ ...BASE, resultEditCount: 1, confirmedAthleteIds: ["opp"] });
    hook.unmount();
    mount({ resultEditCount: 1, confirmedAthleteIds: [] });
    await settle();
    relaunch();
    mount({ resultEditCount: 1, confirmedAthleteIds: [] });
    await settle();
    expect(mockInfo).toHaveBeenCalledTimes(1);
  });

  it("a confirmation a read listed before the relaunch counts the same", async () => {
    const run1 = mount({ confirmedAthleteIds: ["me"] });
    await settle();
    run1.unmount();
    relaunch();
    mount({ resultEditCount: 1, confirmedAthleteIds: [] });
    await settle();
    expect(mockInfo).toHaveBeenCalledTimes(1);
  });

  it("the athlete re-confirmed the edited result before the relaunch: only the next edit says it", async () => {
    noteResultConfirmed("M1", "me", 0);
    noteResultConfirmed("M1", "me", 1);
    await settle();
    relaunch();
    const hook = mount({ resultEditCount: 1, confirmedAthleteIds: [] });
    await settle();
    expect(mockInfo).not.toHaveBeenCalled();
    hook.rerender({ ...BASE, resultEditCount: 2, confirmedAthleteIds: [] });
    expect(mockInfo).toHaveBeenCalledTimes(1);
  });

  it("never for a record from a run whose edit window is long gone, another match, or an unreadable record", async () => {
    const twoHoursAgo = Date.now() - 2 * 60 * 60 * 1000;
    await AsyncStorage.setItem(
      RESULT_EDIT_NOTICE_STORAGE_KEY,
      JSON.stringify({ "M1:me": { count: 0, at: twoHoursAgo }, "M2:me": { count: 0, at: Date.now() } }),
    );
    relaunch();
    mount({ resultEditCount: 1, confirmedAthleteIds: [] });
    await settle();
    await AsyncStorage.setItem(RESULT_EDIT_NOTICE_STORAGE_KEY, "not json");
    relaunch();
    mount({ resultEditCount: 1, confirmedAthleteIds: [] });
    await settle();
    expect(mockInfo).not.toHaveBeenCalled();
  });

  it("is not read for a two-athlete match or the timekeeper", async () => {
    (AsyncStorage.getItem as jest.Mock).mockClear();
    mount({ enabled: false, resultEditCount: 1 });
    mount({ athleteId: null, resultEditCount: 1 });
    await settle();
    expect(AsyncStorage.getItem).not.toHaveBeenCalled();
  });
});

describe("resultEditNotice", () => {
  it("names the timekeeper (TK-RC3)", () => {
    expect(resultEditNotice("J. Cruz")).toEqual({
      title: "Result changed",
      description: "J. Cruz corrected the result. Confirm it again.",
    });
  });

  it("with no name: the title and the re-confirm line (TK-RC2), never a blank name", () => {
    expect(resultEditNotice("  ")).toEqual({ title: "Result changed", description: "Check it and confirm again." });
  });
});
