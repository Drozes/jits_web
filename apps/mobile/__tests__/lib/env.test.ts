/**
 * Guards the env-resolution contract that the launch-crash fix depends on:
 * lib/env.ts must read `Constants.expoConfig.extra` FIRST (populated by
 * app.config.js), then fall back to `process.env.EXPO_PUBLIC_*`, and throw a
 * clear error only when neither source has the value. A regression here is what
 * shipped two launch-crashing TestFlight builds (missing EXPO_PUBLIC_SUPABASE_URL).
 */
const mockExtra: Record<string, unknown> = {};

jest.mock("expo-constants", () => ({
  __esModule: true,
  default: {
    get expoConfig() {
      return { extra: mockExtra };
    },
  },
}));

describe("env", () => {
  const ORIGINAL_ENV = process.env;

  beforeEach(() => {
    jest.resetModules();
    for (const key of Object.keys(mockExtra)) delete mockExtra[key];
    process.env = { ...ORIGINAL_ENV };
    delete process.env.EXPO_PUBLIC_SUPABASE_URL;
    delete process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;
  });

  afterAll(() => {
    process.env = ORIGINAL_ENV;
  });

  it("prefers Constants.expoConfig.extra over process.env", () => {
    mockExtra.SUPABASE_URL = "https://from-extra.supabase.co";
    process.env.EXPO_PUBLIC_SUPABASE_URL = "https://from-process.supabase.co";
    const { env } = require("@/lib/env");
    expect(env.supabaseUrl).toBe("https://from-extra.supabase.co");
  });

  it("falls back to process.env.EXPO_PUBLIC_* when extra is missing", () => {
    process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY = "anon-from-process";
    const { env } = require("@/lib/env");
    expect(env.supabaseAnonKey).toBe("anon-from-process");
  });

  it("throws a clear, actionable error when neither source has the value", () => {
    const { env } = require("@/lib/env");
    expect(() => env.supabaseUrl).toThrow(
      "Missing env var: EXPO_PUBLIC_SUPABASE_URL",
    );
  });
});
