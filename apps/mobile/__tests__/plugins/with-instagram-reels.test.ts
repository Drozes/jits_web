/**
 * Tests for the Instagram Reels config plugin (jits-s6mi.2).
 *
 * WHAT THESE CAN AND CANNOT SHOW. They check the Info.plist key and the
 * AndroidManifest element this plugin produces, and that a real Expo config
 * pipeline registers both mods. They do NOT prove iOS's `canOpenURL` then
 * answers true, or that Android stops filtering the Instagram package:
 * that needs a prebuild plus a physical device with Instagram installed,
 * which is the actual acceptance test for this slice and lives in slice
 * jits-s6mi.6.
 *
 * They are worth having because both declarations fail SILENTLY. Without
 * the plist entry, availability detection reports Instagram as missing on a
 * device where it plainly is. Without the `<queries>` entry, the explicit
 * `ADD_TO_REEL` intent throws `ActivityNotFoundException` and the share
 * looks like Instagram ignored it. Neither leaves a trace anywhere.
 */
/// <reference types="node" />
// Scoped to this file, same standing decision as
// `with-android-backup-rules.test.ts`: @types/node stays out of the mobile
// tsconfig's `types` so app code is not shown `Buffer` and friends, and a
// config plugin genuinely is node code. Note the same hoisting reliance:
// `@types/node` resolves only because `apps/web` declares it.
import fs from "node:fs";
import path from "node:path";

import withInstagramReels, {
  INSTAGRAM_PACKAGE,
  QUERIED_SCHEMES,
  addInstagramPackageQuery,
  addQueriedSchemes,
} from "../../plugins/with-instagram-reels";

type FakeManifest = {
  manifest: {
    queries?: { package?: { $: { "android:name": string } }[] }[];
    application: Array<{ $: Record<string, string> }>;
  };
};

function manifest(queries?: FakeManifest["manifest"]["queries"]): FakeManifest {
  return {
    manifest: {
      ...(queries ? { queries } : {}),
      application: [{ $: { "android:name": ".MainApplication" } }],
    },
  };
}

function packageNamesIn(m: FakeManifest): string[] {
  return (m.manifest.queries ?? []).flatMap((query) =>
    (query.package ?? []).map((entry) => entry.$["android:name"]),
  );
}

describe("the schemes being declared", () => {
  it("covers the Reels composer and plain Instagram", () => {
    // `instagram-reels` is what the iOS half opens. `instagram` is listed
    // so slice jits-s6mi.3 can tell "installed but too old for Reels" from
    // "not installed", which are different messages for a user.
    expect([...QUERIED_SCHEMES]).toEqual(["instagram-reels", "instagram"]);
  });

  it("does not declare the Stories scheme", () => {
    // Stories is explicitly out of scope: a 20s video cap and an
    // undocumented `backgroundVideo` pasteboard key. Declaring it would
    // invite a fallback nobody validated.
    expect(QUERIED_SCHEMES).not.toContain("instagram-stories");
  });
});

describe("LSApplicationQueriesSchemes", () => {
  it("adds both schemes to an empty plist", () => {
    const plist: { LSApplicationQueriesSchemes?: string[] } = {};
    addQueriedSchemes(plist);
    expect(plist.LSApplicationQueriesSchemes).toEqual(["instagram-reels", "instagram"]);
  });

  it("preserves entries other plugins put there", () => {
    // `@react-native-google-signin` and `expo-linking` both write this
    // array. Clobbering it would break sign-in in a way that looks nothing
    // like a Reels change.
    const plist = { LSApplicationQueriesSchemes: ["com.googleusercontent.apps.353209338104"] };
    addQueriedSchemes(plist);
    expect(plist.LSApplicationQueriesSchemes).toEqual([
      "com.googleusercontent.apps.353209338104",
      "instagram-reels",
      "instagram",
    ]);
  });

  it("is idempotent, because prebuild can run repeatedly", () => {
    const plist: { LSApplicationQueriesSchemes?: string[] } = {};
    addQueriedSchemes(plist);
    addQueriedSchemes(plist);
    expect(plist.LSApplicationQueriesSchemes).toEqual(["instagram-reels", "instagram"]);
  });

  it("survives a plist where the key is not an array", () => {
    // Plists come back from a parser, not from us. A scalar here would
    // otherwise throw during prebuild with a stack trace pointing at Expo.
    const plist = { LSApplicationQueriesSchemes: "instagram" as unknown as string[] };
    addQueriedSchemes(plist);
    expect(plist.LSApplicationQueriesSchemes).toEqual(["instagram-reels", "instagram"]);
  });
});

describe("Android <queries>", () => {
  it("declares the Instagram package when the manifest has no queries block", () => {
    const m = manifest();
    addInstagramPackageQuery(m);
    expect(packageNamesIn(m)).toEqual([INSTAGRAM_PACKAGE]);
  });

  it("adds to an existing block instead of replacing it", () => {
    // `expo-file-system`, `expo-sharing` and `expo-image-picker` each merge
    // a `<queries>` block in. Replacing the array would silently drop the
    // intent queries those libraries depend on.
    const m = manifest([{ package: [{ $: { "android:name": "com.other.app" } }] }]);
    addInstagramPackageQuery(m);
    expect(packageNamesIn(m)).toEqual(["com.other.app", INSTAGRAM_PACKAGE]);
    expect(m.manifest.queries).toHaveLength(1);
  });

  it("does not disturb a queries block that only holds intents", () => {
    const intentOnly = [{ intent: [{ action: [{ $: { "android:name": "android.intent.action.SEND" } }] }] }];
    const m = manifest(intentOnly as never);
    addInstagramPackageQuery(m);
    expect(m.manifest.queries?.[0]).toMatchObject({ intent: expect.any(Array) });
    expect(packageNamesIn(m)).toEqual([INSTAGRAM_PACKAGE]);
  });

  it("is idempotent, because prebuild can run repeatedly", () => {
    const m = manifest();
    addInstagramPackageQuery(m);
    addInstagramPackageQuery(m);
    expect(packageNamesIn(m)).toEqual([INSTAGRAM_PACKAGE]);
  });

  it("leaves the application element alone", () => {
    // `<queries>` is a sibling of `<application>`, not a child. Writing it
    // into the wrong place is a merge-time failure, and the two mods that
    // touch this manifest (this one and the backup-rules plugin) must not
    // interfere.
    const m = manifest();
    addInstagramPackageQuery(m);
    expect(m.manifest.application).toEqual([{ $: { "android:name": ".MainApplication" } }]);
  });

  it("targets the Instagram package the native module sends the intent to", () => {
    expect(INSTAGRAM_PACKAGE).toBe("com.instagram.android");
  });
});

describe("the plugin as Expo will run it", () => {
  it("registers both an ios and an android mod", () => {
    // The plugin is only worth anything if the config pipeline picks up
    // both halves. A plugin that returns config untouched on one platform
    // is the exact silent failure this slice is about.
    const registered = withInstagramReels({ name: "x", slug: "x", mods: {} } as never) as unknown as {
      mods: { ios?: Record<string, unknown>; android?: Record<string, unknown> };
    };
    expect(registered.mods.ios).toBeDefined();
    expect(registered.mods.android).toBeDefined();
    expect(typeof registered.mods.ios?.infoPlist).toBe("function");
    expect(typeof registered.mods.android?.manifest).toBe("function");
  });

  it("is wired into app.json's plugins array", () => {
    // Everything above is inert until app.json names it, and nothing else
    // in the build would complain if it did not.
    const appJson = JSON.parse(
      fs.readFileSync(path.join(__dirname, "..", "..", "app.json"), "utf8"),
    ) as { expo: { plugins: unknown[] } };
    expect(appJson.expo.plugins).toContain("./plugins/with-instagram-reels");
  });
});
