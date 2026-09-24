/**
 * Source-level guards for the InstagramReels module (jits-s6mi.1 / .2).
 *
 * Two jobs, both of which a dev box CAN do and neither of which any other
 * gate here does.
 *
 * ONE: prove the module is UNREACHABLE. The share entry point is slice
 * jits-s6mi.4, gated on `highlight_share_enabled`, which must stay false
 * while the consent decision `jr_be-17f` is open. That gate covers the
 * Reels handoff, the generic share sheet AND save-to-camera-roll, because
 * all three hand the other athlete's likeness to a destination outside the
 * two participants. The capability is allowed to exist; a code path to it
 * is not. This suite fails the build the moment app code imports it.
 *
 * TWO: prove the three language halves agree. The JS wrapper maps native
 * error codes by string, the FileProvider authority is a string in Kotlin
 * that must match a string in XML, and autolinking finds the native halves
 * by class names written in a JSON file. Every one of those is a literal
 * that no compiler cross-checks, and every one fails SILENTLY: a renamed
 * code becomes `unknown`, a mismatched authority becomes an exception at
 * the moment a user taps share, a wrong class name becomes a module that
 * simply is not there.
 *
 * What this suite still does NOT do is compile Swift or Kotlin. Nothing on
 * a dev box does.
 */
/// <reference types="node" />
// Scoped to this file, same reasoning as
// `__tests__/plugins/with-android-backup-rules.test.ts`: `lib/env.ts`
// records the standing decision to keep @types/node out of the mobile
// tsconfig's `types` so app code is not shown `Buffer` and friends. A test
// that reads the repo off disk genuinely is node code.
import fs from "node:fs";
import path from "node:path";

const MOBILE_ROOT = path.join(__dirname, "..", "..");
const REPO_ROOT = path.join(MOBILE_ROOT, "..", "..");
const MODULE_ROOT = path.join(MOBILE_ROOT, "modules", "instagram-reels");

const SOURCE_EXTENSIONS = [".ts", ".tsx", ".js", ".jsx"];

/** Every source file under `root`, recursively. */
function sourceFilesUnder(root: string): string[] {
  if (!fs.existsSync(root)) return [];
  const found: string[] = [];
  for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
    const full = path.join(root, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === "node_modules") continue;
      found.push(...sourceFilesUnder(full));
    } else if (SOURCE_EXTENSIONS.includes(path.extname(entry.name))) {
      found.push(full);
    }
  }
  return found;
}

function read(...segments: string[]): string {
  return fs.readFileSync(path.join(...segments), "utf8");
}

/** The `ERR_REELS_*` literals a file declares. */
function reelsErrorCodesIn(source: string): string[] {
  return [...new Set(source.match(/ERR_REELS_[A-Z_]+/g) ?? [])].sort();
}

describe("nothing in the app reaches this module", () => {
  /**
   * Everything the two apps actually run. `modules/` and `__tests__/` are
   * excluded because they are the module and its tests; `plugins/` because
   * the config plugin is the native declaration half of the same feature
   * and is meant to be wired into app.json.
   */
  const appRoots = [
    path.join(MOBILE_ROOT, "app"),
    path.join(MOBILE_ROOT, "components"),
    path.join(MOBILE_ROOT, "hooks"),
    path.join(MOBILE_ROOT, "lib"),
    path.join(MOBILE_ROOT, "types"),
    path.join(REPO_ROOT, "packages", "shared", "src"),
  ];

  it("has app roots to scan, so a moved directory cannot make this vacuous", () => {
    // Without this the suite would pass loudly after a rename that made
    // every glob empty, which is the classic way a guard like this dies.
    for (const root of appRoots) {
      expect(fs.existsSync(root)).toBe(true);
    }
    expect(sourceFilesUnder(path.join(MOBILE_ROOT, "app")).length).toBeGreaterThan(20);
  });

  it("is imported by no screen, component, hook or shared module", () => {
    const offenders = appRoots
      .flatMap(sourceFilesUnder)
      .filter((file) => /instagram-reels|InstagramReels|shareToReels/.test(fs.readFileSync(file, "utf8")))
      .map((file) => path.relative(REPO_ROOT, file));

    // If this fails, the share entry point has arrived early. It belongs in
    // slice jits-s6mi.4, behind `highlight_share_enabled`, and that flag
    // must not go true while jr_be-17f is open.
    expect(offenders).toEqual([]);
  });

  it("ships no UI of its own", () => {
    // A `.tsx` here would mean a component, and a component is one import
    // away from a screen.
    const files = sourceFilesUnder(MODULE_ROOT).map((file) => path.basename(file));
    expect(files).toEqual(["index.ts"]);
  });

  it("is not re-exported from any barrel", () => {
    // The other way a module becomes reachable without anyone noticing:
    // an `export * from` in an index that a screen already imports.
    const barrels = [
      ...sourceFilesUnder(path.join(MOBILE_ROOT, "lib")),
      ...sourceFilesUnder(path.join(REPO_ROOT, "packages", "shared", "src")),
    ].filter((file) => path.basename(file) === "index.ts");
    for (const barrel of barrels) {
      expect(fs.readFileSync(barrel, "utf8")).not.toMatch(/instagram-reels/);
    }
  });
});

describe("the three language halves agree on the error vocabulary", () => {
  const jsSource = read(MODULE_ROOT, "index.ts");
  const swiftSource = read(MODULE_ROOT, "ios", "InstagramReelsModule.swift");
  const kotlinSource = read(
    MODULE_ROOT,
    "android",
    "src",
    "main",
    "java",
    "expo",
    "modules",
    "instagramreels",
    "ReelsFailure.kt",
  );

  it("declares the same eight codes in TypeScript, Swift and Kotlin", () => {
    // A code that exists on one platform only maps to `unknown` on the
    // other, which is how a "clip too long" turns into "sharing failed,
    // try again" for half the install base.
    const js = reelsErrorCodesIn(jsSource);
    expect(js).toHaveLength(8);
    expect(reelsErrorCodesIn(swiftSource)).toEqual(js);
    expect(reelsErrorCodesIn(kotlinSource)).toEqual(js);
  });

  it("passes the codes explicitly on both platforms rather than inferring them", () => {
    // Expo infers a code from the exception CLASS NAME when you let it, and
    // Swift and Kotlin infer by different rules. Inference here would
    // produce two different strings for the same failure.
    expect(swiftSource).toMatch(/promise\.reject\(failure\.code, failure\.message\)/);
    expect(kotlinSource).toMatch(/val errorCode: String/);
  });
});

describe("the Android FileProvider wiring", () => {
  const manifest = read(MODULE_ROOT, "android", "src", "main", "AndroidManifest.xml");
  const kotlin = read(
    MODULE_ROOT,
    "android",
    "src",
    "main",
    "java",
    "expo",
    "modules",
    "instagramreels",
    "InstagramReelsModule.kt",
  );

  it("uses an authority the Kotlin actually builds", () => {
    // `getUriForFile` throws IllegalArgumentException for an authority no
    // provider claims, at the exact moment a user taps share. The two
    // halves of that string live in different languages and nothing else
    // checks them against each other.
    const suffix = kotlin.match(/FILE_PROVIDER_SUFFIX\s*=\s*"([^"]+)"/)?.[1];
    expect(suffix).toBe(".ReelsFileProvider");
    expect(manifest).toContain(`android:authorities="\${applicationId}${suffix}"`);
  });

  it("names a provider class that exists", () => {
    const declared = manifest.match(/<provider\s+android:name="([^"]+)"/)?.[1];
    expect(declared).toBe("expo.modules.instagramreels.ReelsFileProvider");
    expect(fs.existsSync(path.join(MODULE_ROOT, "android", "src", "main", "java", "expo", "modules", "instagramreels", "ReelsFileProvider.kt"))).toBe(true);
  });

  it("points at a paths resource that exists", () => {
    // A missing `@xml/` resource is a manifest-merge-time failure at best
    // and a runtime crash at worst, and neither shows up on a dev box.
    const resource = manifest.match(/android:resource="@xml\/([^"]+)"/)?.[1];
    expect(resource).toBe("elo_reels_provider_paths");
    const paths = read(MODULE_ROOT, "android", "src", "main", "res", "xml", `${resource}.xml`);
    expect(paths).toMatch(/<files-path[^>]*path="\."/);
    expect(paths).toMatch(/<cache-path[^>]*path="\."/);
  });

  it("grants read permission explicitly as well as by flag", () => {
    // The flag alone covers the intent's data URI and its ClipData.
    // EXTRA_STREAM is migrated into ClipData only for ACTION_SEND, and this
    // is a custom action, so without BOTH of these Instagram gets a URI it
    // cannot open and the handoff looks like it was ignored.
    expect(kotlin).toMatch(/clipData = ClipData\.newRawUri/);
    expect(kotlin).toMatch(/addFlags\(Intent\.FLAG_GRANT_READ_URI_PERMISSION\)/);
    expect(kotlin).toMatch(
      /context\.grantUriPermission\(\s*INSTAGRAM_PACKAGE,\s*contentUri,\s*Intent\.FLAG_GRANT_READ_URI_PERMISSION\s*\)/,
    );
  });

  it("targets Meta's documented action, package and App ID extra", () => {
    expect(kotlin).toContain('REELS_ACTION = "com.instagram.share.ADD_TO_REEL"');
    expect(kotlin).toContain('INSTAGRAM_PACKAGE = "com.instagram.android"');
    expect(kotlin).toContain(
      'APPLICATION_ID_EXTRA = "com.instagram.platform.extra.APPLICATION_ID"',
    );
  });
});

describe("the iOS pasteboard contract", () => {
  const swift = read(MODULE_ROOT, "ios", "InstagramReelsModule.swift");

  it("writes the three documented Reels keys", () => {
    // `backgroundVideo` and `appID` are both REQUIRED. The App ID travels
    // on the pasteboard here, not as a `source_application` URL parameter
    // the way the Stories handoff does it; getting that wrong is a silent
    // no-op.
    expect(swift).toContain('"com.instagram.sharedSticker.backgroundVideo"');
    expect(swift).toContain('"com.instagram.sharedSticker.appID"');
    expect(swift).toContain('"com.instagram.sharedSticker.stickerImage"');
  });

  it("opens the Reels scheme, not the Stories one", () => {
    // Stories caps video at 20s and its `backgroundVideo` pasteboard key is
    // undocumented; that rung is explicitly out of scope for this epic.
    expect(swift).not.toContain("instagram-stories://");
    // And the URL carries NO query string: on Reels the App ID travels on
    // the pasteboard. Appending it to the URL the way Stories does is the
    // documented way to get a silent no-op.
    const shareUrl = swift.match(/reelsShareURLString = "([^"]+)"/)?.[1];
    expect(shareUrl).toBe("instagram-reels://share");
  });

  it("sets an expiry so a 50 MB clip does not sit on the pasteboard", () => {
    expect(swift).toMatch(/\.expirationDate: Date\(\)\.addingTimeInterval\(pasteboardTTLSeconds\)/);
  });

  it("clears the pasteboard when the composer does not open", () => {
    expect(swift).toMatch(/UIPasteboard\.general\.items = \[\]/);
  });
});

describe("autolinking", () => {
  const config = JSON.parse(read(MODULE_ROOT, "expo-module.config.json")) as {
    platforms: string[];
    apple: { modules: string[] };
    android: { modules: string[] };
  };

  it("names the Swift class that exists", () => {
    // Autolinking finds native halves by these strings. A typo produces a
    // module that is simply absent, which the JS wrapper then reports as
    // "unavailable" forever, on a binary that does contain the code.
    expect(config.apple.modules).toEqual(["InstagramReelsModule"]);
    expect(read(MODULE_ROOT, "ios", "InstagramReelsModule.swift")).toContain(
      "public final class InstagramReelsModule: Module",
    );
  });

  it("names the Kotlin class that exists, fully qualified", () => {
    expect(config.android.modules).toEqual(["expo.modules.instagramreels.InstagramReelsModule"]);
    const kotlin = read(
      MODULE_ROOT,
      "android",
      "src",
      "main",
      "java",
      "expo",
      "modules",
      "instagramreels",
      "InstagramReelsModule.kt",
    );
    expect(kotlin).toContain("package expo.modules.instagramreels");
    expect(kotlin).toContain("class InstagramReelsModule : Module()");
  });

  it("registers the same JS name on both platforms", () => {
    // `requireOptionalNativeModule("InstagramReels")` resolves by this name.
    expect(read(MODULE_ROOT, "ios", "InstagramReelsModule.swift")).toContain('Name("InstagramReels")');
    expect(
      read(
        MODULE_ROOT,
        "android",
        "src",
        "main",
        "java",
        "expo",
        "modules",
        "instagramreels",
        "InstagramReelsModule.kt",
      ),
    ).toContain('Name("InstagramReels")');
    expect(read(MODULE_ROOT, "index.ts")).toContain('requireOptionalNativeModule<InstagramReelsNativeModule>("InstagramReels")');
  });

  it("builds for both platforms and matches the podspec name", () => {
    expect(config.platforms.sort()).toEqual(["android", "apple"]);
    expect(read(MODULE_ROOT, "ios", "InstagramReels.podspec")).toContain(
      "s.name           = 'InstagramReels'",
    );
  });
});
