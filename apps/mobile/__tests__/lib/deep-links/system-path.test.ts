/**
 * Incoming system URL rewriting (app/+native-intent.tsx).
 *
 * expo-router routes every link itself; this hook may only rewrite the URLs it
 * cannot route (removed session/gym routes, reset-password) and must hand
 * every other URL back byte for byte, or expo-router routes something else.
 *
 * Source: apps/mobile/lib/deep-links/system-path.ts, app/+native-intent.tsx
 */
import { resolveSystemPath } from "@/lib/deep-links/system-path";
import { isRetiredRoute } from "@/lib/deep-links/retired-routes";
import { redirectSystemPath } from "@/app/+native-intent";

const both = (path: string) => [
  `elorated://${path}`,
  `https://elorated.com/${path}`,
];

describe("resolveSystemPath", () => {
  it.each([
    ...both("session/s-1"),
    ...both("session/s-1/lobby"),
    ...both("session/s-1/join?ref=share"),
    ...both("gyms"),
    ...both("gyms/g-1"),
    ...both("gym-manager/roster"),
    "https://www.elorated.com/session/s-1",
    "/session/s-1/lobby",
    "exp://192.168.1.2:8081/--/gyms/g-1",
  ])("sends retired %s Home", (url) => {
    expect(resolveSystemPath(url)).toBe("/");
  });

  it.each([
    ...both("athlete/abc-123"),
    "elorated://login",
    "elorated://",
    "https://elorated.com",
    "https://elorated.com/",
    "elorated://match/m-1",
    "elorated://sessions-archive",
    // Dev client launcher: must reach expo-router untouched, including the
    // encoded inner URL, whatever that inner URL points at.
    "exp+elorated://expo-development-client/?url=http%3A%2F%2F192.168.1.2%3A8081",
    "exp+elorated://expo-development-client/?url=elorated%3A%2F%2Fsession%2Fs-1",
    "/athlete/a-1",
    "not a url",
  ])("leaves %s unchanged", (url) => {
    expect(resolveSystemPath(url)).toBe(url);
  });

  it.each([
    ["elorated://reset-password", "/login"],
    ["elorated://reset-password/", "/login"],
    ["elorated://reset-password?code=abc-123", "/login?code=abc-123"],
    [
      "elorated://reset-password#access_token=t.o.k&refresh_token=r&type=recovery",
      "/login#access_token=t.o.k&refresh_token=r&type=recovery",
    ],
    [
      "https://elorated.com/reset-password?code=a%2Bb#type=recovery",
      "/login?code=a%2Bb#type=recovery",
    ],
  ])("routes %s to login with its params untouched", (url, expected) => {
    expect(resolveSystemPath(url)).toBe(expected);
  });
});

describe("redirectSystemPath", () => {
  it.each([true, false])("applies the mapping (initial: %s)", (initial) => {
    expect(redirectSystemPath({ path: "elorated://session/s-1", initial })).toBe("/");
    expect(
      redirectSystemPath({ path: "https://elorated.com/athlete/a-1", initial }),
    ).toBe("https://elorated.com/athlete/a-1");
  });
});

describe("isRetiredRoute", () => {
  it.each([
    "/session/s-1/lobby",
    "session/s-1",
    "/(app)/session/s-1/join",
    "/gyms",
    "/gyms/g-1",
    "/(app)/gyms/g-1",
    "/gym-manager",
    "/gym-manager/stats-by-elo",
    "/session?x=1",
  ])("flags %s", (route) => {
    expect(isRetiredRoute(route)).toBe(true);
  });

  it.each([
    "/",
    "/arena",
    "/athlete/a-1",
    "/(app)/athlete/a-1",
    "/match/m-1",
    "/settings",
    "/sessions-archive",
    "/gymsx",
  ])("leaves %s alone", (route) => {
    expect(isRetiredRoute(route)).toBe(false);
  });
});
