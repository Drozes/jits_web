/**
 * WRITE_EXTERNAL_STORAGE is capped at API 32 (jits-mafl.1, review N4): the
 * app needs it only to save a reel on API 32 and below.
 *
 * Source: apps/mobile/plugins/with-write-storage-max-sdk.js
 */
import withWriteStorageMaxSdk, { capWriteExternalStorage, MAX_SDK, PERMISSION } from "../../plugins/with-write-storage-max-sdk";

type Perm = { $: Record<string, string> };
type FakeManifest = { manifest: { $: Record<string, string>; "uses-permission"?: Perm[] } };

const manifest = (perms?: Perm[]): FakeManifest => ({
  manifest: { $: { "xmlns:android": "http://schemas.android.com/apk/res/android" }, ...(perms ? { "uses-permission": perms } : {}) },
});
const write = (m: FakeManifest) => m.manifest["uses-permission"]!.filter((p) => p.$["android:name"] === PERMISSION);

describe("capWriteExternalStorage", () => {
  it("caps the existing entry at 32 with tools:replace and declares the tools namespace", () => {
    const m = manifest([{ $: { "android:name": "android.permission.CAMERA" } }, { $: { "android:name": PERMISSION } }]);
    capWriteExternalStorage(m);
    expect(MAX_SDK).toBe("32");
    expect(write(m)).toEqual([
      { $: { "android:name": PERMISSION, "android:maxSdkVersion": "32", "tools:replace": "android:maxSdkVersion" } },
    ]);
    expect(m.manifest.$["xmlns:tools"]).toBe("http://schemas.android.com/tools");
    expect(m.manifest["uses-permission"]).toHaveLength(2);
  });

  it("adds the capped entry when none exists yet, and is idempotent", () => {
    const m = manifest();
    capWriteExternalStorage(m);
    capWriteExternalStorage(m);
    expect(write(m)).toHaveLength(1);
    expect(write(m)[0].$["android:maxSdkVersion"]).toBe("32");
  });

  it("registers an Android manifest mod", () => {
    const cfg = withWriteStorageMaxSdk({ name: "x", slug: "x" } as never) as unknown as { mods?: { android?: { manifest?: unknown } } };
    expect(typeof cfg.mods?.android?.manifest).toBe("function");
  });
});

describe("app.json", () => {
  it("runs the plugin", () => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { expo } = require("../../app.json") as { expo: { plugins: unknown[] } };
    expect(expo.plugins).toContain("./plugins/with-write-storage-max-sdk");
  });
});
