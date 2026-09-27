/**
 * The crash-safe expo-screen-orientation wrapper: a no-op without the native
 * module, the right specific lock at go-live, and a rejected lock logged once
 * and never thrown.
 */

const Orientation = { UNKNOWN: 0, PORTRAIT_UP: 1, PORTRAIT_DOWN: 2, LANDSCAPE_LEFT: 3, LANDSCAPE_RIGHT: 4 };
const OrientationLock = {
  DEFAULT: 0,
  ALL: 1,
  PORTRAIT: 2,
  PORTRAIT_UP: 3,
  PORTRAIT_DOWN: 4,
  LANDSCAPE: 5,
  LANDSCAPE_LEFT: 6,
  LANDSCAPE_RIGHT: 7,
};

function setup(native: boolean) {
  jest.resetModules();
  const so = {
    Orientation,
    OrientationLock,
    lockAsync: jest.fn(async (_lock: number) => undefined),
    getOrientationAsync: jest.fn(async () => Orientation.PORTRAIT_UP),
  };
  jest.doMock("expo-modules-core", () => ({
    requireOptionalNativeModule: jest.fn(() => (native ? {} : null)),
  }));
  jest.doMock("expo-screen-orientation", () => so);
  const lib = require("@/lib/orientation") as typeof import("@/lib/orientation");
  return { so, lib };
}

let warn: jest.SpyInstance;
beforeEach(() => {
  warn = jest.spyOn(console, "warn").mockImplementation(() => undefined);
});
afterEach(() => warn.mockRestore());

describe("without the native module (old binary, web, Expo Go)", () => {
  it("every call resolves without touching native", async () => {
    const { so, lib } = setup(false);
    await expect(lib.allowRotation()).resolves.toBeUndefined();
    await expect(lib.lockPortrait()).resolves.toBeUndefined();
    await expect(lib.lockToCurrent()).resolves.toBe("portrait");
    expect(so.lockAsync).not.toHaveBeenCalled();
    expect(so.getOrientationAsync).not.toHaveBeenCalled();
    expect(warn).not.toHaveBeenCalled();
  });
});

describe("with the native module", () => {
  it("ready follows the phone (DEFAULT); everything else is PORTRAIT_UP", async () => {
    const { so, lib } = setup(true);
    await lib.allowRotation();
    expect(so.lockAsync).toHaveBeenLastCalledWith(OrientationLock.DEFAULT);
    await lib.lockPortrait();
    expect(so.lockAsync).toHaveBeenLastCalledWith(OrientationLock.PORTRAIT_UP);
  });

  it.each([
    ["PORTRAIT_UP", Orientation.PORTRAIT_UP, OrientationLock.PORTRAIT_UP, "portrait"],
    ["LANDSCAPE_LEFT", Orientation.LANDSCAPE_LEFT, OrientationLock.LANDSCAPE_LEFT, "landscape"],
    ["LANDSCAPE_RIGHT", Orientation.LANDSCAPE_RIGHT, OrientationLock.LANDSCAPE_RIGHT, "landscape"],
    ["PORTRAIT_DOWN", Orientation.PORTRAIT_DOWN, OrientationLock.PORTRAIT_UP, "portrait"],
    ["UNKNOWN", Orientation.UNKNOWN, OrientationLock.PORTRAIT_UP, "portrait"],
  ])("go-live with the interface %s locks that specific side", async (_n, current, lock, result) => {
    const { so, lib } = setup(true);
    so.getOrientationAsync.mockResolvedValue(current);
    await expect(lib.lockToCurrent()).resolves.toBe(result);
    expect(so.lockAsync).toHaveBeenCalledTimes(1);
    expect(so.lockAsync).toHaveBeenCalledWith(lock);
  });

  it("a lockPortrait issued while go-live reads the side wins (no stale landscape lock)", async () => {
    const { so, lib } = setup(true);
    let resolve!: (o: number) => void;
    so.getOrientationAsync.mockImplementationOnce(
      () => new Promise<number>((r) => (resolve = r)),
    );
    const live = lib.lockToCurrent();
    await lib.lockPortrait();
    resolve(Orientation.LANDSCAPE_LEFT);
    await live;
    expect(so.lockAsync).toHaveBeenLastCalledWith(OrientationLock.PORTRAIT_UP);
    expect(so.lockAsync).not.toHaveBeenCalledWith(OrientationLock.LANDSCAPE_LEFT);
  });

  it("a rejected lock is swallowed and logged once", async () => {
    const { so, lib } = setup(true);
    so.lockAsync.mockRejectedValue(new Error("nope"));
    await expect(lib.allowRotation()).resolves.toBeUndefined();
    await expect(lib.lockPortrait()).resolves.toBeUndefined();
    await expect(lib.lockToCurrent()).resolves.toBe("portrait");
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn.mock.calls[0][0]).toMatch(/nope/);
  });
});
