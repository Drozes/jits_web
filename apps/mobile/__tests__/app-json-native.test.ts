/**
 * Native config the invites build depends on (jits-b3js.9). These are
 * TestFlight-only fields: an OTA cannot carry them.
 */
// eslint-disable-next-line @typescript-eslint/no-require-imports
const appJson = require("../app.json") as {
  expo: {
    version: string;
    ios: { usesAppleSignIn?: boolean };
    plugins: Array<string | [string, Record<string, unknown>]>;
  };
};

const plugin = (name: string) =>
  appJson.expo.plugins.find((p) => (Array.isArray(p) ? p[0] === name : p === name));

describe("app.json native config", () => {
  it("enables Sign in with Apple", () => {
    expect(appJson.expo.ios.usesAppleSignIn).toBe(true);
    expect(plugin("expo-apple-authentication")).toBeTruthy();
  });

  it("explains location as the same-mat check", () => {
    const loc = plugin("expo-location") as [string, { locationWhenInUsePermission: string }];
    expect(loc[1].locationWhenInUsePermission).toBe(
      "ELO RATED uses your location to confirm you and your opponent are on the same mat before a match starts.",
    );
  });

  it("is a new runtime (appVersion policy), so OTAs for 0.4.0 never reach it", () => {
    expect(appJson.expo.version).toBe("0.5.0");
  });
});
