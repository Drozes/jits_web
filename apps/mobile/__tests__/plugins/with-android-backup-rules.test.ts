/**
 * Tests for the Android backup-rules config plugin (jits-vjbq).
 *
 * WHAT THESE CAN AND CANNOT SHOW. They check the XML this plugin emits and
 * the manifest attributes it sets. They do NOT prove Android honours them:
 * that needs a prebuild plus a real backup run (`adb shell bmgr backupnow`)
 * on a device, which no dev-box gate here reaches.
 *
 * They are still worth having, because every failure mode this plugin has
 * is a silent one. A typo in `@xml/elo_backup_rules`, a `domain` that is
 * not `file`, or emitting only one of the two rule files leaves a 300-600 MB
 * clip inside the backup set with nothing to indicate it.
 */
/// <reference types="node" />
// Scoped to this file on purpose. `lib/env.ts` records the standing decision
// NOT to put @types/node in the mobile tsconfig's `types`, because it would
// advertise `Buffer`, `process` and friends to app code that cannot use them
// at runtime. A config plugin genuinely IS node code, so it gets the types
// here and nowhere else.
//
// RELIANCE WORTH KNOWING ABOUT: `@types/node` is NOT declared by
// `apps/mobile` or by the workspace root. It resolves only because
// `apps/web` declares it (`"@types/node": "^20"`) and npm workspaces hoist
// it to the root `node_modules`. If web ever drops it, this file stops
// typechecking with "Cannot find module 'node:fs'", which looks nothing
// like its actual cause. The fix then is one line: add `@types/node` to
// `apps/mobile`'s devDependencies.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import withAndroidBackupRules, {
  DATA_EXTRACTION_RULES,
  DIRECTORY,
  FULL_BACKUP_CONTENT,
  setBackupAttributes,
} from "../../plugins/with-android-backup-rules";

import { RETAINED_DIR_NAME } from "@/lib/video/recording-file";

type FakeManifest = {
  manifest: { application: Array<{ $: Record<string, string> }> };
};

function manifest(): FakeManifest {
  return {
    manifest: {
      application: [{ $: { "android:name": ".MainApplication", "android:allowBackup": "true" } }],
    },
  };
}

describe("the excluded directory", () => {
  it("is the one recording-file.ts actually parks clips in", () => {
    // The plugin and the runtime agree by construction or not at all: the
    // path is a literal in XML that nothing else validates, so a rename of
    // RETAINED_DIR_NAME would otherwise silently un-exclude the directory.
    expect(DIRECTORY).toBe(RETAINED_DIR_NAME);
  });
});

describe("data extraction rules (API 31+)", () => {
  it("excludes the directory from cloud backup", () => {
    expect(DATA_EXTRACTION_RULES).toMatch(
      /<cloud-backup>\s*<exclude domain="file" path="match-uploads\/" \/>\s*<\/cloud-backup>/,
    );
  });

  it("excludes it from device-to-device transfer too", () => {
    // A separate section on API 31+. Covering only cloud-backup would still
    // copy the parked clip to a new phone during setup.
    expect(DATA_EXTRACTION_RULES).toMatch(
      /<device-transfer>\s*<exclude domain="file" path="match-uploads\/" \/>\s*<\/device-transfer>/,
    );
  });

  it('uses the "file" domain, which is what filesDir maps to', () => {
    // `Paths.document` is `context.filesDir` on Android. `domain="data"`
    // would silently match nothing.
    expect(DATA_EXTRACTION_RULES).not.toMatch(/domain="(?!file")/);
  });

  it("is well-formed XML with the declaration Android requires", () => {
    expect(DATA_EXTRACTION_RULES.trimStart()).toMatch(/^<\?xml version="1\.0"/);
  });
});

describe("full backup content (API 23-30)", () => {
  it("excludes the same directory", () => {
    // Shipping only the API 31+ file leaves every older device unprotected.
    expect(FULL_BACKUP_CONTENT).toMatch(
      /<full-backup-content>\s*<exclude domain="file" path="match-uploads\/" \/>\s*<\/full-backup-content>/,
    );
  });

  it("is well-formed XML with the declaration Android requires", () => {
    expect(FULL_BACKUP_CONTENT.trimStart()).toMatch(/^<\?xml version="1\.0"/);
  });
});

describe("manifest attributes", () => {
  it("points both attributes at the emitted files", () => {
    const m = manifest();
    setBackupAttributes(m);
    expect(m.manifest.application[0].$).toMatchObject({
      "android:dataExtractionRules": "@xml/elo_data_extraction_rules",
      "android:fullBackupContent": "@xml/elo_backup_rules",
    });
  });

  it("leaves allowBackup alone", () => {
    // Turning backup off entirely would also discard the preferences and
    // auth material the user does want preserved. The point is to exclude
    // one directory, not to opt out.
    const m = manifest();
    setBackupAttributes(m);
    expect(m.manifest.application[0].$["android:allowBackup"]).toBe("true");
  });

  it("is idempotent, because prebuild can run repeatedly", () => {
    const m = manifest();
    setBackupAttributes(m);
    const once = { ...m.manifest.application[0].$ };
    setBackupAttributes(m);
    expect(m.manifest.application[0].$).toEqual(once);
  });
});

describe("the dangerous mod prebuild will run", () => {
  it("writes both rule files where the manifest references them", async () => {
    // Runs the plugin's own mod against a temp project root, exactly as
    // prebuild does. This is as close to a prebuild as a dev box gets
    // without an Android toolchain, and it is what catches a wrong res
    // path, which would leave the manifest pointing at `@xml/` resources
    // that do not exist.
    const registered = withAndroidBackupRules({ name: "x", slug: "x", mods: {} } as never) as unknown as {
      mods: { android: { dangerous: (cfg: unknown) => Promise<unknown> } };
    };
    const projectRoot = await fs.promises.mkdtemp(path.join(os.tmpdir(), "prebuild-"));
    try {
      await registered.mods.android.dangerous({
        ...registered,
        modRequest: {
          platformProjectRoot: projectRoot,
          projectRoot,
          platform: "android",
          modName: "dangerous",
        },
        modResults: {},
      });

      const resXml = path.join(projectRoot, "app", "src", "main", "res", "xml");
      const written = (await fs.promises.readdir(resXml)).sort();
      // The names the manifest attributes resolve to: `@xml/<name>`.
      expect(written).toEqual(["elo_backup_rules.xml", "elo_data_extraction_rules.xml"]);
      expect(await fs.promises.readFile(path.join(resXml, "elo_backup_rules.xml"), "utf8")).toBe(
        FULL_BACKUP_CONTENT,
      );
      expect(
        await fs.promises.readFile(path.join(resXml, "elo_data_extraction_rules.xml"), "utf8"),
      ).toBe(DATA_EXTRACTION_RULES);
    } finally {
      await fs.promises.rm(projectRoot, { recursive: true, force: true });
    }
  });
});
