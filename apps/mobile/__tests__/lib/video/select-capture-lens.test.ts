/**
 * The timekeeper's lens (lib/video/select-capture-lens.ts; timekeeper mode
 * spec 13.3, A21): the ultrawide by its localized name on iOS, else the
 * default lens; athletes and Android never ask the camera.
 */
import { act, renderHook } from "@testing-library/react-native";
import {
  LENS_READY_BACKSTOP_MS,
  LENS_RETRY_MS,
  pickUltrawideLens,
  selectCaptureLens,
  useCaptureLens,
  type LensCamera,
} from "@/lib/video/select-capture-lens";

const IPHONE_EN = ["Back Camera", "Back Dual Wide Camera", "Back Ultra Wide Camera", "Back Triple Camera"];
const IPHONE_FR = ["Caméra arrière", "Caméra double grand-angle arrière", "Caméra ultra grand-angle arrière"];

function camera(lenses: string[] | Error): LensCamera & { getAvailableLensesAsync: jest.Mock } {
  return {
    getAvailableLensesAsync: jest.fn(async () => {
      if (lenses instanceof Error) throw lenses;
      return lenses;
    }),
  };
}

describe("pickUltrawideLens", () => {
  it("the English and the French ultrawide names; not the virtual dual-wide or triple cameras", () => {
    expect(pickUltrawideLens(IPHONE_EN)).toBe("Back Ultra Wide Camera");
    expect(pickUltrawideLens(IPHONE_FR)).toBe("Caméra ultra grand-angle arrière");
  });

  it("undefined without an ultrawide (iPhone SE, XR)", () => {
    expect(pickUltrawideLens(["Back Camera"])).toBeUndefined();
    expect(pickUltrawideLens([])).toBeUndefined();
  });
});

describe("selectCaptureLens", () => {
  const ref = (cam: LensCamera | null) => ({ current: cam });

  it("iOS with an ultrawide: its name", async () => {
    await expect(
      selectCaptureLens("ultrawide_preferred", ref(camera(["Back Camera", "Back Ultra Wide Camera"])), "ios"),
    ).resolves.toBe("Back Ultra Wide Camera");
  });

  it("a French phone matches too", async () => {
    await expect(
      selectCaptureLens("ultrawide_preferred", ref(camera(["Caméra ultra grand-angle arrière"])), "ios"),
    ).resolves.toBe("Caméra ultra grand-angle arrière");
  });

  it("a list without an ultrawide: the default lens, asked once", async () => {
    const cam = camera(["Back Camera"]);
    await expect(selectCaptureLens("ultrawide_preferred", ref(cam), "ios", 0)).resolves.toBeUndefined();
    expect(cam.getAvailableLensesAsync).toHaveBeenCalledTimes(1);
  });

  it("Android: the default lens, without calling the iOS-only API", async () => {
    const cam = camera(IPHONE_EN);
    await expect(selectCaptureLens("ultrawide_preferred", ref(cam), "android")).resolves.toBeUndefined();
    expect(cam.getAvailableLensesAsync).not.toHaveBeenCalled();
  });

  it("a rejected lookup: asked once more, then the default lens, never a throw", async () => {
    const cam = camera(new Error("no session"));
    await expect(selectCaptureLens("ultrawide_preferred", ref(cam), "ios", 0)).resolves.toBeUndefined();
    expect(cam.getAvailableLensesAsync).toHaveBeenCalledTimes(2);
  });

  it("an empty list (the view not registered yet) is asked once more, after LENS_RETRY_MS", async () => {
    jest.useFakeTimers();
    try {
      const cam = camera([]);
      cam.getAvailableLensesAsync.mockResolvedValueOnce([]).mockResolvedValueOnce(IPHONE_EN);
      const answer = selectCaptureLens("ultrawide_preferred", ref(cam), "ios");
      await Promise.resolve();
      await Promise.resolve();
      expect(cam.getAvailableLensesAsync).toHaveBeenCalledTimes(1);
      await jest.advanceTimersByTimeAsync(LENS_RETRY_MS);
      await expect(answer).resolves.toBe("Back Ultra Wide Camera");
      expect(cam.getAvailableLensesAsync).toHaveBeenCalledTimes(2);
    } finally {
      jest.useRealTimers();
    }
  });

  it("athletes (the default preference) never ask the camera", async () => {
    const cam = camera(IPHONE_EN);
    await expect(selectCaptureLens("default", ref(cam), "ios")).resolves.toBeUndefined();
    expect(cam.getAvailableLensesAsync).not.toHaveBeenCalled();
  });

  it("no camera mounted: the default lens", async () => {
    await expect(selectCaptureLens("ultrawide_preferred", ref(null), "ios", 0)).resolves.toBeUndefined();
  });
});

// The hook runs under the jest preset's platform, iOS.
describe("useCaptureLens", () => {
  async function settle() {
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });
  }
  const pick = ({ selectedLens, lens, settled }: ReturnType<typeof useCaptureLens>) => ({ selectedLens, lens, settled });

  it("asks once the camera reports ready, then selects the ultrawide; never twice", async () => {
    const cam = camera(IPHONE_EN);
    const ref = { current: cam };
    const { result, rerender } = renderHook(
      ({ up }: { up: boolean }) => useCaptureLens("ultrawide_preferred", ref, up, false),
      { initialProps: { up: false } },
    );
    expect(pick(result.current)).toEqual({ selectedLens: undefined, lens: "default", settled: false });
    rerender({ up: true });
    // Mounted, but the native view is not ready yet: nothing asked, nothing decided.
    expect(cam.getAvailableLensesAsync).not.toHaveBeenCalled();
    expect(result.current.settled).toBe(false);
    act(() => result.current.onCameraReady());
    await settle();
    expect(pick(result.current)).toEqual({ selectedLens: "Back Ultra Wide Camera", lens: "ultrawide", settled: true });
    rerender({ up: false });
    rerender({ up: true });
    act(() => result.current.onCameraReady());
    await settle();
    expect(cam.getAvailableLensesAsync).toHaveBeenCalledTimes(1);
  });

  it("a camera that never reports ready is asked at the backstop", async () => {
    jest.useFakeTimers();
    try {
      const cam = camera(IPHONE_EN);
      const { result } = renderHook(() => useCaptureLens("ultrawide_preferred", { current: cam }, true, false));
      act(() => jest.advanceTimersByTime(LENS_READY_BACKSTOP_MS - 1));
      expect(cam.getAvailableLensesAsync).not.toHaveBeenCalled();
      await act(async () => {
        await jest.advanceTimersByTimeAsync(1);
      });
      expect(cam.getAvailableLensesAsync).toHaveBeenCalledTimes(1);
      expect(pick(result.current)).toEqual({ selectedLens: "Back Ultra Wide Camera", lens: "ultrawide", settled: true });
    } finally {
      jest.useRealTimers();
    }
  });

  it("athletes never ask, stay on the default lens and are settled at once", async () => {
    const cam = camera(IPHONE_EN);
    const { result } = renderHook(() => useCaptureLens("default", { current: cam }, true, false));
    act(() => result.current.onCameraReady());
    await settle();
    expect(cam.getAvailableLensesAsync).not.toHaveBeenCalled();
    expect(pick(result.current)).toEqual({ selectedLens: undefined, lens: "default", settled: true });
  });

  it("no ultrawide on the phone: the default lens, settled", async () => {
    const { result } = renderHook(() =>
      useCaptureLens("ultrawide_preferred", { current: camera(["Back Camera"]) }, true, false),
    );
    act(() => result.current.onCameraReady());
    await settle();
    expect(pick(result.current)).toEqual({ selectedLens: undefined, lens: "default", settled: true });
  });

  it("an answer that lands once the match is live is dropped: the clip keeps its lens", async () => {
    let answer: (names: string[]) => void = () => undefined;
    const cam: LensCamera = { getAvailableLensesAsync: () => new Promise<string[]>((res) => (answer = res)) };
    const { result, rerender } = renderHook(
      ({ locked }: { locked: boolean }) => useCaptureLens("ultrawide_preferred", { current: cam }, true, locked),
      { initialProps: { locked: false } },
    );
    act(() => result.current.onCameraReady());
    rerender({ locked: true });
    // Back to unlocked (the result step): still frozen for this viewfinder.
    rerender({ locked: false });
    await act(async () => {
      answer(IPHONE_EN);
      await Promise.resolve();
    });
    expect(pick(result.current)).toEqual({ selectedLens: undefined, lens: "default", settled: true });
  });

  it("first ready while already locked (re-entering a live match): never asked, the default lens (jits-o47s.14)", async () => {
    const cam = camera(IPHONE_EN);
    const { result } = renderHook(() => useCaptureLens("ultrawide_preferred", { current: cam }, true, true));
    act(() => result.current.onCameraReady());
    await settle();
    expect(cam.getAvailableLensesAsync).not.toHaveBeenCalled();
    expect(pick(result.current)).toEqual({ selectedLens: undefined, lens: "default", settled: true });
  });
});
