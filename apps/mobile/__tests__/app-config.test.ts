/**
 * app.config.js must only ADD the OTA criticality keys to `extra`
 * (updateCriticalIndex from update-critical-index.json, optional updateNotice
 * from env UPDATE_NOTICE). Every native-relevant field must pass through
 * untouched, or a JS-only OTA could silently diverge from the native build.
 */
import fs from "fs";
import path from "path";

// eslint-disable-next-line @typescript-eslint/no-require-imports
const appConfig = require("../app.config.js") as (ctx: {
  config: Record<string, unknown>;
}) => Record<string, unknown> & { extra: Record<string, unknown> };

const counterValue = (
  JSON.parse(
    fs.readFileSync(path.join(__dirname, "..", "update-critical-index.json"), "utf8"),
  ) as { criticalIndex: number }
).criticalIndex;

function fixture(): Record<string, unknown> {
  return {
    name: "ELO RATED",
    slug: "elo-rated",
    version: "0.3.0",
    scheme: "elorated",
    runtimeVersion: { policy: "appVersion" },
    updates: { url: "https://u.expo.dev/example", fallbackToCacheTimeout: 0 },
    plugins: ["expo-router", ["expo-camera", { cameraPermission: "x" }]],
    ios: { bundleIdentifier: "com.elorated.mobile", infoPlist: { UIBackgroundModes: [] } },
    android: { package: "com.elorated.mobile", permissions: ["CAMERA"] },
    extra: { eas: { projectId: "abc" }, router: {} },
  };
}

const ENV_KEYS = [
  "UPDATE_NOTICE",
  "SENTRY_ORG",
  "SENTRY_PROJECT",
  "SENTRY_AUTH_TOKEN",
  "EAS_BUILD",
  "EAS_BUILD_PROFILE",
] as const;
type EnvSnapshot = Record<string, string | undefined>;
let savedEnv: EnvSnapshot;

function snapshotEnv(): EnvSnapshot {
  return Object.fromEntries(ENV_KEYS.map((k) => [k, process.env[k]]));
}

function restoreEnv(snapshot: EnvSnapshot): void {
  for (const k of ENV_KEYS) {
    if (snapshot[k] === undefined) delete process.env[k];
    else process.env[k] = snapshot[k];
  }
}

beforeEach(() => {
  savedEnv = snapshotEnv();
  // Keep the run deterministic: no Sentry plugin push, no EAS hard-fail.
  for (const k of ENV_KEYS) delete process.env[k];
  jest.spyOn(console, "warn").mockImplementation(() => {});
});

afterEach(() => {
  restoreEnv(savedEnv);
  jest.restoreAllMocks();
});

describe("app.config.js", () => {
  it("passes every top-level key except extra and plugins through unchanged", () => {
    const input = fixture();
    const out = appConfig({ config: fixture() });
    for (const key of Object.keys(input)) {
      if (key === "extra" || key === "plugins") continue;
      expect(out[key]).toEqual(input[key]);
    }
    expect(Object.keys(out).sort()).toEqual(Object.keys(input).sort());
    expect(out.plugins).toEqual(input.plugins);
  });

  it("keeps existing extra keys and adds updateCriticalIndex from the counter file", () => {
    const out = appConfig({ config: fixture() });
    expect(out.extra.eas).toEqual({ projectId: "abc" });
    expect(out.extra.router).toEqual({});
    expect(Number.isSafeInteger(counterValue)).toBe(true);
    expect(out.extra.updateCriticalIndex).toBe(counterValue);
  });

  it("omits updateNotice when UPDATE_NOTICE is unset", () => {
    const out = appConfig({ config: fixture() });
    expect(out.extra.updateNotice).toBeUndefined();
    expect(JSON.parse(JSON.stringify(out.extra))).not.toHaveProperty("updateNotice");
  });

  it("trims UPDATE_NOTICE", () => {
    process.env.UPDATE_NOTICE = "  Hello  ";
    expect(appConfig({ config: fixture() }).extra.updateNotice).toBe("Hello");
  });

  it("omits a whitespace-only UPDATE_NOTICE", () => {
    process.env.UPDATE_NOTICE = "   ";
    expect(appConfig({ config: fixture() }).extra.updateNotice).toBeUndefined();
  });

  it("restores env after a test mutates it (self-contained)", () => {
    const before = snapshotEnv();
    process.env.UPDATE_NOTICE = "leaked";
    process.env.EAS_BUILD = "true";
    restoreEnv(before);
    expect(process.env.UPDATE_NOTICE).toBe(before.UPDATE_NOTICE);
    expect(process.env.EAS_BUILD).toBe(before.EAS_BUILD);
    expect(snapshotEnv()).toEqual(before);
  });
});
