/**
 * The multi-angle player dev flag (#53 review N2): OFF unless a dev bundle
 * was started with EXPO_PUBLIC_MULTI_ANGLE_PLAYER=1.
 */
import { __setMultiAnglePlayerForTests, isMultiAnglePlayerEnabled } from "@/lib/video/multi-angle/flag";

const ORIGINAL = process.env.EXPO_PUBLIC_MULTI_ANGLE_PLAYER;
const g = globalThis as { __DEV__?: boolean };
const ORIGINAL_DEV = g.__DEV__;

afterEach(() => {
  if (ORIGINAL === undefined) delete process.env.EXPO_PUBLIC_MULTI_ANGLE_PLAYER;
  else process.env.EXPO_PUBLIC_MULTI_ANGLE_PLAYER = ORIGINAL;
  g.__DEV__ = ORIGINAL_DEV;
  __setMultiAnglePlayerForTests(null);
});

describe("isMultiAnglePlayerEnabled", () => {
  it("is false when EXPO_PUBLIC_MULTI_ANGLE_PLAYER is unset, even in a dev bundle", () => {
    delete process.env.EXPO_PUBLIC_MULTI_ANGLE_PLAYER;
    g.__DEV__ = true;
    expect(isMultiAnglePlayerEnabled()).toBe(false);
  });

  it("is false for any value but 1", () => {
    g.__DEV__ = true;
    for (const v of ["0", "true", ""]) {
      process.env.EXPO_PUBLIC_MULTI_ANGLE_PLAYER = v;
      expect(isMultiAnglePlayerEnabled()).toBe(false);
    }
  });

  it("is false in a release bundle even with the variable set", () => {
    process.env.EXPO_PUBLIC_MULTI_ANGLE_PLAYER = "1";
    g.__DEV__ = false;
    expect(isMultiAnglePlayerEnabled()).toBe(false);
  });

  it("is true only in a dev bundle with the variable set to 1", () => {
    process.env.EXPO_PUBLIC_MULTI_ANGLE_PLAYER = "1";
    g.__DEV__ = true;
    expect(isMultiAnglePlayerEnabled()).toBe(true);
  });
});
