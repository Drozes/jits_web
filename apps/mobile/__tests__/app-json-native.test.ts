/**
 * Native config the 1.0 App Store binary depends on (jits-8s9v). These are
 * TestFlight-only fields: an OTA cannot carry them.
 */
import fs from "fs";
import path from "path";

// eslint-disable-next-line @typescript-eslint/no-require-imports
const appJson = require("../app.json") as {
  expo: {
    version: string;
    runtimeVersion: { policy: string };
    ios: { usesAppleSignIn?: boolean; infoPlist: Record<string, unknown> };
    android: {
      permissions: string[];
      blockedPermissions?: string[];
      intentFilters: Array<{ autoVerify?: boolean; data: Array<{ scheme: string; host: string; pathPrefix?: string }> }>;
    };
    plugins: Array<string | [string, Record<string, unknown>]>;
  };
};

const plugin = (name: string) =>
  appJson.expo.plugins.find((p) => (Array.isArray(p) ? p[0] === name : p === name));
const pluginOptions = (name: string) => {
  const p = plugin(name);
  return (Array.isArray(p) ? p[1] : {}) as Record<string, unknown>;
};

const CAMERA = "ELO RATED uses your camera to record your matches.";
const MICROPHONE = "ELO RATED uses your microphone so your match recordings include audio.";
const LOCATION =
  "ELO RATED uses your location when you go live or challenge someone, so nearby athletes can find you and your match can start on the same mat.";
const PHOTOS_READ = "ELO RATED uses your photo library to save your match highlights.";
const PHOTOS_ADD = "ELO RATED saves your match highlights to your photo library.";
const EM_DASH = String.fromCharCode(0x2014);

describe("app.json native config", () => {
  it("requests the Sign in with Apple entitlement (guideline 4.8)", () => {
    expect(appJson.expo.ios.usesAppleSignIn).toBe(true);
    expect(plugin("expo-apple-authentication")).toBeTruthy();
    // The 0.5.0 strip plugin is gone for good.
    expect(plugin("./plugins/with-no-apple-signin")).toBeUndefined();
    expect(fs.existsSync(path.join(__dirname, "..", "plugins", "with-no-apple-signin.js"))).toBe(
      false,
    );
  });

  it("gives every camera and microphone source the same purpose string", () => {
    // infoPlist and expo-camera both write NSCameraUsageDescription and
    // NSMicrophoneUsageDescription, and whichever runs last wins (build 25
    // shipped the old image picker's profile picture text). Keep them identical.
    const { infoPlist } = appJson.expo.ios;
    expect(infoPlist.NSCameraUsageDescription).toBe(CAMERA);
    expect(infoPlist.NSMicrophoneUsageDescription).toBe(MICROPHONE);
    expect(pluginOptions("expo-camera").cameraPermission).toBe(CAMERA);
    expect(pluginOptions("expo-camera").microphonePermission).toBe(MICROPHONE);
  });

  it("gives every photo library source the same purpose string", () => {
    // The app only saves highlight reels (write-only access);
    // expo-media-library writes both photo library strings.
    expect(pluginOptions("expo-media-library").photosPermission).toBe(PHOTOS_READ);
    expect(pluginOptions("expo-media-library").savePhotosPermission).toBe(PHOTOS_ADD);
  });

  it("asks for location only while in use, for going live", () => {
    const loc = pluginOptions("expo-location");
    expect(loc.locationWhenInUsePermission).toBe(LOCATION);
    // false deletes the key; leaving it unset writes a generic default string.
    expect(loc.locationAlwaysAndWhenInUsePermission).toBe(false);
    expect(loc.locationAlwaysPermission).toBe(false);
    expect(loc.isIosBackgroundLocationEnabled).toBe(false);
    expect(loc.isAndroidBackgroundLocationEnabled).toBe(false);
  });

  it("does not declare Face ID (the app never uses biometrics)", () => {
    expect(pluginOptions("expo-secure-store").faceIDPermission).toBe(false);
  });

  it("is version 1.0 to match App Store Connect, a new runtime (appVersion policy)", () => {
    // OTAs for 0.5.0 never reach 1.0 and the other way round.
    expect(appJson.expo.version).toBe("1.0");
    expect(appJson.expo.runtimeVersion.policy).toBe("appVersion");
  });

  it("uses no em dashes or exclamation marks in any purpose string", () => {
    // Scan app.json itself: every Info.plist string and every plugin option
    // whose key ends with "Permission", not this file's constants.
    const texts: string[] = [];
    for (const value of Object.values(appJson.expo.ios.infoPlist)) {
      if (typeof value === "string") texts.push(value);
    }
    for (const p of appJson.expo.plugins) {
      if (!Array.isArray(p)) continue;
      for (const [key, value] of Object.entries(p[1])) {
        if (key.endsWith("Permission") && typeof value === "string") texts.push(value);
      }
    }
    expect(texts.length).toBeGreaterThanOrEqual(7);
    for (const text of texts) {
      expect(text.includes(EM_DASH)).toBe(false);
      expect(text.includes("!")).toBe(false);
    }
  });

  it("does not ship the unused expo-image-picker, expo-av or expo-video-thumbnails (jits-mafl.1)", () => {
    expect(plugin("expo-image-picker")).toBeUndefined();
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const pkg = require("../package.json") as { dependencies: Record<string, string> };
    for (const dep of ["expo-image-picker", "expo-av", "expo-video-thumbnails"]) {
      expect(pkg.dependencies).not.toHaveProperty(dep);
    }
  });
});

describe("app.json Android config (jits-mafl.1)", () => {
  const { android } = appJson.expo;

  it("App Links claim exactly /c/ and /athlete, verified (jits-d3hb dropped /session)", () => {
    expect(android.intentFilters).toHaveLength(1);
    const [filter] = android.intentFilters;
    expect(filter.autoVerify).toBe(true);
    expect(filter.data).toEqual([
      { scheme: "https", host: "elorated.com", pathPrefix: "/c/" },
      { scheme: "https", host: "elorated.com", pathPrefix: "/athlete" },
    ]);
  });

  it("blocks the photo, video, audio and overlay permissions Google Play would flag", () => {
    expect([...(android.blockedPermissions ?? [])].sort()).toEqual(
      [
        "android.permission.ACCESS_MEDIA_LOCATION",
        "android.permission.READ_EXTERNAL_STORAGE",
        "android.permission.READ_MEDIA_AUDIO",
        "android.permission.READ_MEDIA_IMAGES",
        "android.permission.READ_MEDIA_VIDEO",
        "android.permission.READ_MEDIA_VISUAL_USER_SELECTED",
        "android.permission.SYSTEM_ALERT_WINDOW",
      ].sort(),
    );
    // Saving a reel on API 32 and below still needs WRITE_EXTERNAL_STORAGE.
    expect(android.blockedPermissions).not.toContain("android.permission.WRITE_EXTERNAL_STORAGE");
  });

  it("expo-media-library declares no granular read permissions", () => {
    expect(pluginOptions("expo-media-library").granularPermissions).toEqual([]);
  });

  it("our backup rules plugin is the single owner of the Android backup XML", () => {
    expect(pluginOptions("expo-secure-store").configureAndroidBackup).toBe(false);
    expect(plugin("./plugins/with-android-backup-rules")).toBeTruthy();
  });

  it("notifications use the monochrome icon, the brand red and the 'default' channel", () => {
    const opts = pluginOptions("expo-notifications");
    expect(opts.icon).toBe("./assets/notification-icon.png");
    expect(fs.existsSync(path.join(__dirname, "..", "assets", "notification-icon.png"))).toBe(true);
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { darkTokens } = require("../lib/tokens") as { darkTokens: { accentCta: string } };
    expect(String(opts.color).toLowerCase()).toBe(darkTokens.accentCta.toLowerCase());
    expect(opts.defaultChannel).toBe("default");
  });
});
