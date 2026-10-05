/**
 * The upload error mapper (jits-n2im.5): every failure lands in one small
 * class with friendly copy, and no raw transport or server text ever
 * reaches the copy the banner shows.
 */
import {
  classifyByteFailure,
  classifyRowFailure,
  describeUploadFailure,
  httpClassOf,
  isTerminalUploadClass,
  type UploadErrorClass,
} from "@/lib/video/upload-errors";

function tusError(status: number, message = "tus: unexpected response"): Error {
  const err = new Error(message) as Error & { originalResponse: unknown };
  err.originalResponse = { getStatus: () => status };
  return err;
}

/** House style bans the long dash; built from its code point. */
const LONG_DASH = new RegExp(String.fromCharCode(8212));

const ALL: UploadErrorClass[] = [
  "offline",
  "server",
  "auth",
  "not_allowed",
  "too_large",
  "limit",
  "disabled",
  "not_in_cohort",
  "reslice_limit",
  "file_missing",
  "save_failed",
  "unknown",
];

describe("classifyByteFailure (tus)", () => {
  it.each([
    ["no status (airplane mode, DNS, socket reset)", new Error("Network request failed"), "offline"],
    ["the stall watchdog's abort", new Error("Upload aborted"), "server"],
    ["no session before any request", new Error("Not signed in"), "auth"],
    ["the 2 GB client cap", new Error("Videos must be under 2 GB."), "too_large"],
    ["401", tusError(401), "auth"],
    ["403 (RLS)", tusError(403), "not_allowed"],
    ["400", tusError(400), "not_allowed"],
    ["404 (dropped upload URL)", tusError(404), "server"],
    ["409 (offset conflict)", tusError(409), "server"],
    ["410", tusError(410), "server"],
    ["413", tusError(413), "too_large"],
    ["429", tusError(429), "server"],
    ["500", tusError(500), "server"],
    ["503", tusError(503), "server"],
  ] as const)("%s", (_label, err, klass) => {
    expect(classifyByteFailure(err)).toBe(klass);
  });
});

describe("classifyRowFailure (match_videos write)", () => {
  it.each([
    ["rate_limited", "limit"],
    ["disabled", "disabled"],
    ["not_in_cohort", "not_in_cohort"],
    ["reslice_limit", "reslice_limit"],
  ] as const)("maps the %s gate", (gate, klass) => {
    expect(classifyRowFailure(Object.assign(new Error("x"), { gate }))).toBe(klass);
  });

  it("treats an expired JWT as auth, anything else as a save that will retry", () => {
    expect(classifyRowFailure(new Error("JWT expired"))).toBe("auth");
    expect(classifyRowFailure(new Error('new row violates row-level security policy for table "match_videos"'))).toBe(
      "save_failed",
    );
  });
});

describe("describeUploadFailure", () => {
  it.each(ALL)("%s has friendly copy with no raw server or transport text", (klass) => {
    const copy = describeUploadFailure(klass);
    expect(copy.message.length).toBeGreaterThan(10);
    expect(copy.message).not.toMatch(/row-level|policy|JWT|HTTP|Network request failed|P0001|hint/i);
    expect(copy.message).not.toMatch(LONG_DASH);
  });

  it("never promises the recording is kept forever (the 7-day cleanup breaks that)", () => {
    for (const klass of ALL) {
      const { message } = describeUploadFailure(klass);
      expect(message).not.toMatch(/saved on this device/i);
      if (/stays on this phone/.test(message)) expect(message).toMatch(/for 7 days/);
    }
  });

  it("pauses what retries itself and fails what needs the athlete", () => {
    const paused = ALL.filter((k) => describeUploadFailure(k).disposition === "paused");
    expect(paused.sort()).toEqual(["auth", "limit", "offline", "save_failed", "server", "unknown"]);
  });

  it("marks only the failures a retry can never fix as terminal", () => {
    expect(ALL.filter(isTerminalUploadClass).sort()).toEqual(["file_missing", "reslice_limit", "too_large"]);
    expect(isTerminalUploadClass(null)).toBe(false);
  });

  it("says the limit lifts when the window does, within the retention window", () => {
    expect(describeUploadFailure("limit").message).toBe(
      "Daily video limit reached. It uploads once your limit resets, as long as you open the app within 7 days.",
    );
  });
});

describe("httpClassOf", () => {
  it("groups statuses for telemetry", () => {
    expect(httpClassOf(null)).toBe("none");
    expect(httpClassOf(403)).toBe("4xx");
    expect(httpClassOf(502)).toBe("5xx");
    expect(httpClassOf(302)).toBe("other");
  });
});
