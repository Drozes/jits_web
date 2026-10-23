/**
 * The dispute form in timekeeper mode (PM29 audit 5.1; the confirm step
 * passes `timekeeperMode`): the submit is bounded (SEND_CEILING_MS: the
 * confirm step has no exit), a failure shows the shipped title with `Check
 * your connection and try again.` and never a DomainError message (M-R4; a
 * closed window shows its title alone), a refusal that means the match moved
 * on (ALREADY_DISPUTED, MATCH_NOT_PENDING) closes the form with no toast and
 * re-reads, and an edit saved while the form is open says TK-RC4 once and
 * keeps the typed reason (one saved while the dispute is out waits for the
 * reply, and after a failure TK-RC4 is the one toast). The submit lives in
 * `useDisputeSubmit`. Without the prop the form is the shipped one
 * (`result-end-dispute-copy.test.tsx` keeps its flag-OFF look and haptic).
 */
import * as React from "react";
import { act, fireEvent, render } from "@testing-library/react-native";

jest.mock("@/lib/supabase/client", () => ({ supabase: { tag: "client" } }));
const mockToast = { success: jest.fn(), error: jest.fn(), info: jest.fn() };
jest.mock("@/components/ui/toast", () => ({
  toast: {
    success: (...a: unknown[]) => mockToast.success(...a),
    error: (...a: unknown[]) => mockToast.error(...a),
    info: (...a: unknown[]) => mockToast.info(...a),
  },
}));
jest.mock("@/lib/theme/use-theme", () => ({
  useThemedTokens: () => ({ textTertiary: "#888", textOnAccent: "#000", textPrimary: "#fff" }),
  useResolvedColorScheme: () => "dark",
}));
jest.mock("lucide-react-native", () => {
  const RN = require("react-native");
  const R = require("react");
  const stub = () => R.createElement(RN.View, { testID: "icon" });
  return new Proxy({}, { get: (_t: Record<string, unknown>, prop: string) => (prop === "__esModule" ? true : stub) });
});
const mockHapticError = jest.fn(() => Promise.resolve());
jest.mock("@/lib/match-flow/use-haptics", () => ({ matchHaptics: { error: () => mockHapticError() } }));
const mockDispute = jest.fn();
jest.mock("@jits/shared/api/mutations", () => ({ disputeMatchResult: (...a: unknown[]) => mockDispute(...a) }));

import { DisputeForm } from "@/components/match-flow/steps/dispute-form";
import { SEND_CEILING_MS } from "@/lib/match-flow/send-timing";

const GUIDANCE = "Check your connection and try again.";
const RC4 = { text1: "The result just changed", description: "Check the new result, then confirm." };
const reread = jest.fn();

type FormProps = React.ComponentProps<typeof DisputeForm>;

function form(overrides: Partial<FormProps> = {}): FormProps {
  return {
    matchId: "M1",
    timekeeperMode: { editCount: 0, reread },
    onCancel: jest.fn(),
    onSubmitted: jest.fn(),
    onWindowClosed: jest.fn(),
    ...overrides,
  };
}

async function submit(s: ReturnType<typeof render>) {
  await act(async () => {
    fireEvent.press(s.getByTestId("dispute-submit"));
  });
}

const shown = () => JSON.stringify([mockToast.error.mock.calls, mockToast.info.mock.calls]);

beforeEach(() => {
  jest.clearAllMocks();
  mockDispute.mockResolvedValue({ ok: true, data: undefined });
});
afterEach(() => jest.useRealTimers());

describe("timekeeper mode", () => {
  it("submits the typed reason and leaves on success", async () => {
    const p = form();
    const s = render(<DisputeForm {...p} />);
    fireEvent.changeText(s.getByTestId("dispute-reason"), "Wrong winner");
    await submit(s);
    expect(mockDispute).toHaveBeenCalledWith({ tag: "client" }, "M1", "Wrong winner");
    expect(p.onSubmitted).toHaveBeenCalledTimes(1);
    expect(mockToast.error).not.toHaveBeenCalled();
  });

  it("no reply: Submitting... and Back disabled just before the ceiling; at it Couldn't dispute with the guidance, Submit and Back back, a re-read, and a late reply dropped", async () => {
    jest.useFakeTimers();
    let reply: (v: unknown) => void = () => undefined;
    mockDispute.mockReturnValue(new Promise((r) => (reply = r)));
    const p = form();
    const s = render(<DisputeForm {...p} />);
    await submit(s);
    await act(async () => {
      jest.advanceTimersByTime(SEND_CEILING_MS - 1);
    });
    s.getByText("Submitting...");
    expect(s.getByTestId("dispute-submit").props.accessibilityState).toMatchObject({ disabled: true });
    expect(s.getByTestId("dispute-back").props.accessibilityState).toMatchObject({ disabled: true });
    expect(mockToast.error).not.toHaveBeenCalled();
    await act(async () => {
      jest.advanceTimersByTime(1);
    });
    expect(mockToast.error).toHaveBeenCalledTimes(1);
    expect(mockToast.error).toHaveBeenCalledWith({ text1: "Couldn't dispute", description: GUIDANCE });
    expect(mockHapticError).toHaveBeenCalledTimes(1);
    expect(reread).toHaveBeenCalledTimes(1);
    s.getByText("Submit Dispute");
    expect(s.getByTestId("dispute-submit").props.accessibilityState).toMatchObject({ disabled: false });
    expect(s.getByTestId("dispute-back").props.accessibilityState).toMatchObject({ disabled: false });
    // The dispute lands late: dropped here; the re-read moves the step to the DISPUTED verdict.
    await act(async () => {
      reply({ ok: true, data: undefined });
    });
    expect(p.onSubmitted).not.toHaveBeenCalled();
  });

  it.each([
    ["UNKNOWN", "Network request failed"],
    ["NOT_PARTICIPANT", "You are not a participant in this match."],
    ["RLS_VIOLATION", "permission denied"],
  ])("a %s failure: Couldn't dispute with the guidance, never the error's message", async (code, message) => {
    mockDispute.mockResolvedValue({ ok: false, error: { code, message } });
    const p = form();
    const s = render(<DisputeForm {...p} />);
    await submit(s);
    expect(mockToast.error).toHaveBeenCalledWith({ text1: "Couldn't dispute", description: GUIDANCE });
    expect(shown()).not.toContain(message);
    expect(mockHapticError).toHaveBeenCalledTimes(1);
    expect(reread).toHaveBeenCalledTimes(1);
    expect(p.onCancel).not.toHaveBeenCalled();
    s.getByTestId("dispute-submit");
  });

  it("a closed window: the shipped title alone, and the confirm step says why", async () => {
    mockDispute.mockResolvedValue({ ok: false, error: { code: "DISPUTE_WINDOW_CLOSED", message: "Results lock 24 hours after the match." } });
    const p = form();
    const s = render(<DisputeForm {...p} />);
    await submit(s);
    expect(mockToast.error).toHaveBeenCalledWith({ text1: "Dispute window closed" });
    expect(shown()).not.toContain("Results lock");
    expect(p.onWindowClosed).toHaveBeenCalledTimes(1);
    // The shipped error haptic, once.
    expect(mockHapticError).toHaveBeenCalledTimes(1);
  });

  it.each(["ALREADY_DISPUTED", "MATCH_NOT_PENDING"])("moved on (%s): the form closes with no toast and no haptic, and re-reads", async (code) => {
    mockDispute.mockResolvedValue({ ok: false, error: { code, message: "server words" } });
    const p = form();
    const s = render(<DisputeForm {...p} />);
    await submit(s);
    expect(p.onCancel).toHaveBeenCalledTimes(1);
    expect(reread).toHaveBeenCalledTimes(1);
    expect(mockToast.error).not.toHaveBeenCalled();
    expect(mockToast.info).not.toHaveBeenCalled();
    expect(mockHapticError).not.toHaveBeenCalled();
    expect(p.onSubmitted).not.toHaveBeenCalled();
  });

  it("an edit while the form is open: TK-RC4 once per edit, the typed reason kept", () => {
    const p = form();
    const s = render(<DisputeForm {...p} />);
    fireEvent.changeText(s.getByTestId("dispute-reason"), "Wrong finish");
    s.rerender(<DisputeForm {...p} timekeeperMode={{ editCount: 1, reread }} />);
    expect(mockToast.info).toHaveBeenCalledTimes(1);
    expect(mockToast.info).toHaveBeenCalledWith(RC4);
    expect(s.getByTestId("dispute-reason").props.value).toBe("Wrong finish");
    // Another read of the same edit says nothing more.
    s.rerender(<DisputeForm {...p} timekeeperMode={{ editCount: 1, reread }} />);
    expect(mockToast.info).toHaveBeenCalledTimes(1);
    // A second edit is a new change.
    s.rerender(<DisputeForm {...p} timekeeperMode={{ editCount: 2, reread }} />);
    expect(mockToast.info).toHaveBeenCalledTimes(2);
  });

  it("an edit while the dispute is in flight waits for the reply: after a failure TK-RC4 alone (one toast: the athlete checks the new result first), never after a success", async () => {
    let reply: (v: unknown) => void = () => undefined;
    mockDispute.mockReturnValue(new Promise((r) => (reply = r)));
    const p = form();
    const s = render(<DisputeForm {...p} />);
    fireEvent.changeText(s.getByTestId("dispute-reason"), "Wrong finish");
    await submit(s);
    s.rerender(<DisputeForm {...p} timekeeperMode={{ editCount: 1, reread }} />);
    expect(mockToast.info).not.toHaveBeenCalled();
    await act(async () => {
      reply({ ok: false, error: { code: "UNKNOWN", message: "network" } });
    });
    expect(mockToast.info).toHaveBeenCalledTimes(1);
    expect(mockToast.info).toHaveBeenCalledWith(RC4);
    // TK-RC4 is the one toast: no failure toast for it to replace, and no error haptic.
    expect(mockToast.error).not.toHaveBeenCalled();
    expect(mockHapticError).not.toHaveBeenCalled();
    expect(reread).toHaveBeenCalledTimes(1);
    // The form stays, with the typed reason and Submit back: the dispute did not go through.
    expect(s.getByTestId("dispute-reason").props.value).toBe("Wrong finish");
    expect(s.getByTestId("dispute-submit").props.accessibilityState).toMatchObject({ disabled: false });
    expect(p.onSubmitted).not.toHaveBeenCalled();
    // A retry that fails on the result now on screen is a plain failure.
    mockDispute.mockResolvedValueOnce({ ok: false, error: { code: "UNKNOWN", message: "network" } });
    await submit(s);
    expect(mockToast.error).toHaveBeenCalledWith({ text1: "Couldn't dispute", description: GUIDANCE });
    expect(mockToast.info).toHaveBeenCalledTimes(1);

    // A success leaves; the edit it raced is the verdict's to show.
    jest.clearAllMocks();
    mockDispute.mockResolvedValue({ ok: true, data: undefined });
    const q = form();
    const t = render(<DisputeForm {...q} />);
    let answer: (v: unknown) => void = () => undefined;
    mockDispute.mockReturnValue(new Promise((r) => (answer = r)));
    await submit(t);
    t.rerender(<DisputeForm {...q} timekeeperMode={{ editCount: 1, reread }} />);
    await act(async () => {
      answer({ ok: true, data: undefined });
    });
    expect(q.onSubmitted).toHaveBeenCalledTimes(1);
    expect(mockToast.info).not.toHaveBeenCalled();
  });

  it("an edit while a dispute is out, then the window closed: the closed window has the last word (TK-RC4 never replaces it)", async () => {
    let reply: (v: unknown) => void = () => undefined;
    mockDispute.mockReturnValue(new Promise((r) => (reply = r)));
    const p = form();
    const s = render(<DisputeForm {...p} />);
    await submit(s);
    s.rerender(<DisputeForm {...p} timekeeperMode={{ editCount: 1, reread }} />);
    await act(async () => {
      reply({ ok: false, error: { code: "DISPUTE_WINDOW_CLOSED", message: "Results lock 24 hours after the match." } });
    });
    expect(mockToast.error).toHaveBeenCalledTimes(1);
    expect(mockToast.error).toHaveBeenCalledWith({ text1: "Dispute window closed" });
    expect(p.onWindowClosed).toHaveBeenCalledTimes(1);
    // The form is still mounted here (the test's onWindowClosed does not close it): still no TK-RC4.
    expect(mockToast.info).not.toHaveBeenCalled();
  });

  it("unmounted with the dispute out: nothing shows", async () => {
    jest.useFakeTimers();
    let reply: (v: unknown) => void = () => undefined;
    mockDispute.mockReturnValue(new Promise((r) => (reply = r)));
    const p = form();
    const s = render(<DisputeForm {...p} />);
    await submit(s);
    s.unmount();
    await act(async () => {
      jest.advanceTimersByTime(SEND_CEILING_MS * 2);
    });
    await act(async () => {
      reply({ ok: false, error: { code: "UNKNOWN", message: "network" } });
    });
    expect(mockToast.error).not.toHaveBeenCalled();
    expect(mockHapticError).not.toHaveBeenCalled();
    expect(reread).not.toHaveBeenCalled();
  });
});

describe("without the prop: the shipped form", () => {
  it("a closed window keeps the shipped error haptic, once, with the error's message", async () => {
    mockDispute.mockResolvedValue({ ok: false, error: { code: "DISPUTE_WINDOW_CLOSED", message: "Results lock 24 hours after the match." } });
    const p = form({ timekeeperMode: undefined });
    const s = render(<DisputeForm {...p} />);
    await submit(s);
    expect(mockToast.error).toHaveBeenCalledWith({ text1: "Dispute window closed", description: "Results lock 24 hours after the match." });
    expect(mockHapticError).toHaveBeenCalledTimes(1);
    expect(p.onWindowClosed).toHaveBeenCalledTimes(1);
  });

  it("keeps the error's message, and is never bounded", async () => {
    jest.useFakeTimers();
    mockDispute.mockResolvedValueOnce({ ok: false, error: { code: "UNKNOWN", message: "boom" } });
    const p = form({ timekeeperMode: undefined });
    const s = render(<DisputeForm {...p} />);
    await submit(s);
    expect(mockToast.error).toHaveBeenCalledWith({ text1: "Couldn't dispute", description: "boom" });
    mockDispute.mockResolvedValueOnce({ ok: false, error: { code: "ALREADY_DISPUTED", message: "This result has already been disputed." } });
    await submit(s);
    expect(mockToast.error).toHaveBeenLastCalledWith({ text1: "Couldn't dispute", description: "This result has already been disputed." });
    expect(p.onCancel).not.toHaveBeenCalled();
    mockDispute.mockResolvedValueOnce({ ok: false, error: { code: "DISPUTE_WINDOW_CLOSED", message: "Results lock 24 hours after the match." } });
    await submit(s);
    expect(mockToast.error).toHaveBeenLastCalledWith({ text1: "Dispute window closed", description: "Results lock 24 hours after the match." });
    mockDispute.mockReturnValueOnce(new Promise(() => undefined));
    await submit(s);
    await act(async () => {
      jest.advanceTimersByTime(SEND_CEILING_MS * 2);
    });
    expect(mockToast.error).toHaveBeenCalledTimes(3);
    s.getByText("Submitting...");
    expect(mockToast.info).not.toHaveBeenCalled();
  });
});
