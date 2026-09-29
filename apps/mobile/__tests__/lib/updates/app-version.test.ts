import { formatAppVersion } from "@/lib/updates/app-version";

const base = {
  appVersion: "0.4.0",
  buildNumber: "23",
  updateId: "9287a1e5-f95f-4303-bb1a-2c5d76281b28",
  isEmbeddedLaunch: false,
};

describe("formatAppVersion", () => {
  it("shows version, build and the short OTA id", () => {
    expect(formatAppVersion(base)).toBe("v0.4.0 (23) · OTA 9287a1e5");
  });

  it("labels the embedded bundle instead of its update id", () => {
    expect(formatAppVersion({ ...base, isEmbeddedLaunch: true })).toBe(
      "v0.4.0 (23) · Embedded",
    );
  });

  it("treats a missing update id as embedded (dev client, updates off)", () => {
    expect(formatAppVersion({ ...base, updateId: null })).toBe("v0.4.0 (23) · Embedded");
  });

  it("degrades when native version fields are unavailable", () => {
    expect(
      formatAppVersion({ ...base, appVersion: null, buildNumber: null }),
    ).toBe("v? · OTA 9287a1e5");
  });
});
