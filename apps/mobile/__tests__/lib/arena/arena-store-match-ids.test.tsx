/**
 * `isInArenaMatchFor` (lib/arena/arena-store.ts, timekeeper mode M2): which
 * match's screen is mounted, so a timekeeper-mode push about that match
 * shows no foreground banner and its tap does not stack a second screen of
 * it (spec 8). A count per match, like the in-match bit: a screen of the same
 * match pushed over it never clears it early. Only real ids are kept.
 * `isInPracticeOnly`: a match screen is mounted but none of a real match
 * (the practice run), so a TK-N1 tap waits for it to end.
 */
import { renderHook } from "@testing-library/react-native";
import {
  __resetArenaStoreForTests,
  isInArenaMatch,
  isInArenaMatchFor,
  isInPracticeOnly,
  useArenaMatchScreen,
} from "@/lib/arena/arena-store";

const M = "0c1d2e3f-4a5b-4c6d-8e7f-001122334455";
const N = "0c1d2e3f-4a5b-4c6d-8e7f-667788990011";

beforeEach(() => __resetArenaStoreForTests());

describe("isInArenaMatchFor", () => {
  it("is true only for the match whose screen is mounted", () => {
    expect(isInArenaMatchFor(M)).toBe(false);
    const screen = renderHook(() => useArenaMatchScreen(M));
    expect(isInArenaMatchFor(M)).toBe(true);
    expect(isInArenaMatchFor(N)).toBe(false);
    screen.unmount();
    expect(isInArenaMatchFor(M)).toBe(false);
  });

  it("counts two screens of one match (a nested remount)", () => {
    const a = renderHook(() => useArenaMatchScreen(M));
    const b = renderHook(() => useArenaMatchScreen(M));
    a.unmount();
    expect(isInArenaMatchFor(M)).toBe(true);
    b.unmount();
    expect(isInArenaMatchFor(M)).toBe(false);
  });

  it("a screen without a real id (practice) is in a match, but of no match", () => {
    const practice = renderHook(() => useArenaMatchScreen());
    const odd = renderHook(() => useArenaMatchScreen("not-a-uuid"));
    expect(isInArenaMatch()).toBe(true);
    expect(isInArenaMatchFor("not-a-uuid")).toBe(false);
    practice.unmount();
    odd.unmount();
  });
});

describe("isInPracticeOnly", () => {
  it("is true while only a screen without a real id is mounted (practice)", () => {
    expect(isInPracticeOnly()).toBe(false);
    const practice = renderHook(() => useArenaMatchScreen());
    expect(isInPracticeOnly()).toBe(true);
    practice.unmount();
    expect(isInPracticeOnly()).toBe(false);
  });

  it("is false while a real match's screen is mounted, with or without practice under it", () => {
    const screen = renderHook(() => useArenaMatchScreen(M));
    expect(isInPracticeOnly()).toBe(false);
    const practice = renderHook(() => useArenaMatchScreen());
    expect(isInPracticeOnly()).toBe(false);
    screen.unmount();
    expect(isInPracticeOnly()).toBe(true);
    practice.unmount();
    expect(isInPracticeOnly()).toBe(false);
  });
});
