import { act, fireEvent, render } from "@testing-library/react-native";
import { Modal } from "react-native";
import {
  CRITICAL_UPDATE_DEFAULT_BODY,
  CriticalUpdateModal,
} from "@/components/updates/critical-update-modal";
import { MODAL_FIRST_RETRY_MS } from "@/lib/updates/use-modal-present-watchdog";

function setup(notice: string | null = null, restarting = false, error: string | null = null) {
  const onRestart = jest.fn();
  const utils = render(
    <CriticalUpdateModal
      visible
      notice={notice}
      onRestart={onRestart}
      restarting={restarting}
      error={error}
    />,
  );
  return { ...utils, onRestart };
}

describe("CriticalUpdateModal", () => {
  it("renders the default copy when notice is null", () => {
    const { getByText } = setup();
    expect(CRITICAL_UPDATE_DEFAULT_BODY).toBe(
      "You just got an app update with critical improvements. Please restart the app to continue.",
    );
    expect(getByText(CRITICAL_UPDATE_DEFAULT_BODY)).toBeTruthy();
    expect(getByText("Update ready")).toBeTruthy();
    expect(getByText("ELO RATED")).toBeTruthy();
  });

  it("renders the notice when provided", () => {
    const { getByText, queryByText } = setup("We fixed match sync.");
    expect(getByText("We fixed match sync.")).toBeTruthy();
    expect(queryByText(CRITICAL_UPDATE_DEFAULT_BODY)).toBeNull();
  });

  it("has exactly one button and it calls onRestart", () => {
    const { getAllByRole, getByText, onRestart } = setup();
    expect(getAllByRole("button")).toHaveLength(1);
    fireEvent.press(getByText("Restart"));
    expect(onRestart).toHaveBeenCalledTimes(1);
  });

  it("has no dismiss/close control", () => {
    const { queryByLabelText, queryByText } = setup();
    expect(queryByLabelText(/dismiss|close/i)).toBeNull();
    expect(queryByText(/dismiss|close|later|cancel/i)).toBeNull();
  });

  it("onRequestClose is a no-op that leaves it visible", () => {
    const { UNSAFE_getByType, onRestart, getByText } = setup();
    const modal = UNSAFE_getByType(Modal);
    expect(modal.props.transparent).toBe(false);
    // Reactive-only motion: no ~300ms fade.
    expect(modal.props.animationType).toBe("none");
    modal.props.onRequestClose();
    expect(onRestart).not.toHaveBeenCalled();
    expect(UNSAFE_getByType(Modal).props.visible).toBe(true);
    expect(getByText("Restart")).toBeTruthy();
  });

  it("while restarting: disabled with Restarting... label", () => {
    const { getByText, getByTestId, onRestart } = setup(null, true);
    expect(getByText("Restarting...")).toBeTruthy();
    fireEvent.press(getByTestId("critical-update-restart"));
    expect(onRestart).not.toHaveBeenCalled();
  });

  it("renders a restart error inline", () => {
    const { getByText } = setup(null, false, "Couldn't restart. Close and reopen the app.");
    expect(getByText("Couldn't restart. Close and reopen the app.")).toBeTruthy();
  });

  it("uses the app's uppercase heading CTA typography", () => {
    const { getByText } = setup();
    const cls = getByText("Restart").props.className as string;
    expect(cls).toContain("uppercase");
    expect(cls).toContain("font-heading");
  });

  it("remounts the Modal (watchdog) when iOS never reports onShow", () => {
    jest.useFakeTimers();
    try {
      const { UNSAFE_getByType } = setup();
      const first = UNSAFE_getByType(Modal);
      act(() => {
        jest.advanceTimersByTime(MODAL_FIRST_RETRY_MS);
      });
      expect(UNSAFE_getByType(Modal)).not.toBe(first);
      const second = UNSAFE_getByType(Modal);
      act(() => second.props.onShow());
      act(() => {
        jest.advanceTimersByTime(10_000);
      });
      expect(UNSAFE_getByType(Modal)).toBe(second);
    } finally {
      jest.useRealTimers();
    }
  });

  it("draws on the ELO surfaces, not the legacy tokens (R3 SC-2)", () => {
    const { getByText } = setup(null, false, "Couldn't restart. Close and reopen the app.");
    const legacy = /(bg|text)-(background|foreground|muted-foreground)\b/;
    expect(getByText("Update ready").props.className).toContain("text-ink");
    expect(getByText(CRITICAL_UPDATE_DEFAULT_BODY).props.className).toContain("text-ink-2");
    expect(getByText("Couldn't restart. Close and reopen the app.").props.className).toContain("text-ink-2");
    for (const t of ["Update ready", CRITICAL_UPDATE_DEFAULT_BODY]) {
      expect(getByText(t).props.className).not.toMatch(legacy);
    }
  });
});
