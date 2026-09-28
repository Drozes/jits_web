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
    delete process.env.EXPO_PUBLIC_FACEBOOK_APP_ID;
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

  describe("facebookAppId (optional, jits-r71z)", () => {
    it("reads extra.FACEBOOK_APP_ID first", () => {
      mockExtra.FACEBOOK_APP_ID = "1234567890";
      process.env.EXPO_PUBLIC_FACEBOOK_APP_ID = "999";
      const { env } = require("@/lib/env");
      expect(env.facebookAppId).toBe("1234567890");
    });

    it("falls back to process.env.EXPO_PUBLIC_FACEBOOK_APP_ID", () => {
      process.env.EXPO_PUBLIC_FACEBOOK_APP_ID = " 555 ";
      const { env } = require("@/lib/env");
      expect(env.facebookAppId).toBe("555");
    });

    it("is null, not a throw, when absent or blank", () => {
      const { env } = require("@/lib/env");
      expect(env.facebookAppId).toBeNull();
      mockExtra.FACEBOOK_APP_ID = "";
      process.env.EXPO_PUBLIC_FACEBOOK_APP_ID = "   ";
      expect(env.facebookAppId).toBeNull();
    });
  });
});

describe("app.config.js FACEBOOK_APP_ID", () => {
  // Evaluated from source with an explicit `process`, NOT required: the Jest
  // babel transform inlines `process.env.EXPO_PUBLIC_*` at transform time, so
  // a required copy would not see the env each case sets.
  const source: string = jest
    .requireActual<typeof import("fs")>("fs")
    .readFileSync(`${__dirname}/../../app.config.js`, "utf8");

  type ConfigFactory = (arg: { config: Record<string, unknown> }) => { extra: Record<string, unknown> };

  function load(envVars: Record<string, string>): ConfigFactory {
    const mod: { exports: unknown } = { exports: undefined };
    const fakeConsole = { ...console, warn: () => undefined };
    // eslint-disable-next-line no-new-func
    new Function("module", "process", "console", source)(mod, { env: envVars }, fakeConsole);
    return mod.exports as ConfigFactory;
  }

  const CONFIG = { name: "x", slug: "x", extra: { eas: { projectId: "p" } } };

  it("builds with the variable unset and leaves the key undefined", () => {
    const out = load({})({ config: CONFIG });
    expect(out.extra.FACEBOOK_APP_ID).toBeUndefined();
    expect(out.extra.eas).toEqual({ projectId: "p" });
  });

  it("carries the variable into extra when set", () => {
    const out = load({ EXPO_PUBLIC_FACEBOOK_APP_ID: "1234567890" })({ config: CONFIG });
    expect(out.extra.FACEBOOK_APP_ID).toBe("1234567890");
  });

  it("is not a required variable on an EAS build", () => {
    const factory = load({
      EAS_BUILD: "true",
      EXPO_PUBLIC_SUPABASE_URL: "https://x.supabase.co",
      EXPO_PUBLIC_SUPABASE_ANON_KEY: "anon",
    });
    expect(() => factory({ config: CONFIG })).not.toThrow();
    // Control: the required ones still throw on EAS.
    expect(() => load({ EAS_BUILD: "true" })({ config: CONFIG })).toThrow(/Missing required env/);
  });
});
