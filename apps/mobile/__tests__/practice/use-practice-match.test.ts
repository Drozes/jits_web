/**
 * The practice state machine and its scripted bot
 * (lib/practice/use-practice-match.ts).
 */
import { act, renderHook } from "@testing-library/react-native";
import {
  INITIAL_PRACTICE_STATE,
  practiceReducer,
  usePracticeMatch,
  type PracticeAction,
  type PracticeState,
} from "@/lib/practice/use-practice-match";
import { BOT_ACCEPT_MS, BOT_CONFIRM_MS, BOT_READY_MS } from "@/lib/practice/constants";

function run(actions: PracticeAction[], from: PracticeState = INITIAL_PRACTICE_STATE) {
  return actions.reduce(practiceReducer, from);
}

describe("practiceReducer", () => {
  it("walks the Arena phases in order", () => {
    const phases: string[] = [];
    let s = INITIAL_PRACTICE_STATE;
    const steps: PracticeAction[] = [
      { type: "GO_LIVE" },
      { type: "CHALLENGE" },
      { type: "BOT_ACCEPTED" },
      { type: "CONFIRM_WEIGHTS" },
      { type: "USER_READY" },
      { type: "BOT_READY" },
      { type: "END_MATCH" },
      { type: "ENDED" },
      { type: "SUBMIT_RESULT", result: { result: "draw" } },
      { type: "BOT_CONFIRMED" },
      { type: "USER_CONFIRM" },
    ];
    for (const a of steps) {
      s = practiceReducer(s, a);
      phases.push(s.phase);
    }
    expect(phases).toEqual([
      "lobby",
      "waiting",
      "weight",
      "ready",
      "ready",
      "live",
      "end",
      "result",
      "confirm",
      "confirm",
      "summary",
    ]);
    expect(s.result).toEqual({ result: "draw" });
    expect(s.botConfirmed).toBe(true);
  });

  it("goes live only when both athletes are ready, in either order", () => {
    const atReady = run([{ type: "GO_LIVE" }, { type: "CHALLENGE" }, { type: "BOT_ACCEPTED" }, { type: "CONFIRM_WEIGHTS" }]);
    expect(run([{ type: "BOT_READY" }], atReady).phase).toBe("ready");
    expect(run([{ type: "BOT_READY" }, { type: "USER_READY" }], atReady).phase).toBe("live");
    expect(run([{ type: "USER_READY" }, { type: "BOT_READY" }], atReady).phase).toBe("live");
  });

  it("cancel from waiting or ready returns to the lobby with ready flags cleared", () => {
    const waiting = run([{ type: "GO_LIVE" }, { type: "CHALLENGE" }]);
    expect(run([{ type: "CANCEL" }], waiting).phase).toBe("lobby");
    const readyHalf = run(
      [{ type: "BOT_ACCEPTED" }, { type: "CONFIRM_WEIGHTS" }, { type: "USER_READY" }],
      waiting,
    );
    const back = run([{ type: "CANCEL" }], readyHalf);
    expect(back).toMatchObject({ phase: "lobby", userReady: false, botReady: false });
  });

  it("ignores actions from the wrong phase (a late bot timer cannot skip a step)", () => {
    const lobby = run([{ type: "GO_LIVE" }]);
    expect(run([{ type: "BOT_ACCEPTED" }], lobby)).toBe(lobby);
    expect(run([{ type: "BOT_CONFIRMED" }], lobby)).toBe(lobby);
    expect(run([{ type: "USER_CONFIRM" }], INITIAL_PRACTICE_STATE)).toBe(INITIAL_PRACTICE_STATE);
  });

  it("RESET returns to the fresh initial state", () => {
    const deep = run([{ type: "GO_LIVE" }, { type: "CHALLENGE" }, { type: "BOT_ACCEPTED" }]);
    expect(run([{ type: "RESET" }], deep)).toEqual(INITIAL_PRACTICE_STATE);
  });

  it("go offline from the lobby", () => {
    expect(run([{ type: "GO_LIVE" }, { type: "GO_OFFLINE" }]).phase).toBe("offline");
  });
});

describe("usePracticeMatch bot timers", () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  it("accepts BOT_ACCEPT_MS after the challenge", () => {
    const { result } = renderHook(() => usePracticeMatch());
    act(() => {
      result.current.dispatch({ type: "GO_LIVE" });
      result.current.dispatch({ type: "CHALLENGE" });
    });
    act(() => jest.advanceTimersByTime(BOT_ACCEPT_MS - 1));
    expect(result.current.state.phase).toBe("waiting");
    act(() => jest.advanceTimersByTime(1));
    expect(result.current.state.phase).toBe("weight");
  });

  it("is ready BOT_READY_MS after the ready phase starts", () => {
    const { result } = renderHook(() => usePracticeMatch());
    act(() => {
      result.current.dispatch({ type: "GO_LIVE" });
      result.current.dispatch({ type: "CHALLENGE" });
    });
    act(() => jest.advanceTimersByTime(BOT_ACCEPT_MS));
    act(() => result.current.dispatch({ type: "CONFIRM_WEIGHTS" }));
    act(() => jest.advanceTimersByTime(BOT_READY_MS - 1));
    expect(result.current.state.botReady).toBe(false);
    act(() => jest.advanceTimersByTime(1));
    expect(result.current.state.botReady).toBe(true);
  });

  it("confirms BOT_CONFIRM_MS after the confirm phase starts", () => {
    const { result } = renderHook(() => usePracticeMatch());
    const toConfirm: PracticeAction[] = [
      { type: "CONFIRM_WEIGHTS" },
      { type: "USER_READY" },
      { type: "BOT_READY" },
      { type: "END_MATCH" },
      { type: "ENDED" },
      { type: "SUBMIT_RESULT", result: { result: "draw" } },
    ];
    act(() => {
      result.current.dispatch({ type: "GO_LIVE" });
      result.current.dispatch({ type: "CHALLENGE" });
    });
    act(() => jest.advanceTimersByTime(BOT_ACCEPT_MS));
    act(() => toConfirm.forEach((a) => result.current.dispatch(a)));
    expect(result.current.state.phase).toBe("confirm");
    act(() => jest.advanceTimersByTime(BOT_CONFIRM_MS - 1));
    expect(result.current.state.botConfirmed).toBe(false);
    act(() => jest.advanceTimersByTime(1));
    expect(result.current.state.botConfirmed).toBe(true);
  });

  it("cancel clears the pending bot timer", () => {
    const { result } = renderHook(() => usePracticeMatch());
    act(() => {
      result.current.dispatch({ type: "GO_LIVE" });
      result.current.dispatch({ type: "CHALLENGE" });
    });
    act(() => result.current.dispatch({ type: "CANCEL" }));
    expect(jest.getTimerCount()).toBe(0);
    act(() => jest.advanceTimersByTime(BOT_ACCEPT_MS * 2));
    expect(result.current.state.phase).toBe("lobby");
  });

  it("unmount clears the pending bot timer", () => {
    const { result, unmount } = renderHook(() => usePracticeMatch());
    act(() => {
      result.current.dispatch({ type: "GO_LIVE" });
      result.current.dispatch({ type: "CHALLENGE" });
    });
    expect(jest.getTimerCount()).toBe(1);
    unmount();
    expect(jest.getTimerCount()).toBe(0);
  });
});
