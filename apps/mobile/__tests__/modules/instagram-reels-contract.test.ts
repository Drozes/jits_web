/**
 * Source-level guards for the InstagramReels module (jits-s6mi.1 / .2).
 *
 * Two jobs, both of which a dev box CAN do and neither of which any other
 * gate here does.
 *
 * ONE: prove NO OUTBOUND FOOTAGE AFFORDANCE IS REACHABLE. The share entry
 * point is slice jits-s6mi.4, gated on `highlight_share_enabled`, which
 * must stay false while the consent decision `jr_be-17f` is open. That gate
 * is broader than Instagram: the Reels handoff, the generic system share
 * sheet AND save-to-camera-roll all hand the other athlete's likeness to a
 * destination outside the two participants, so they are one disclosure and
 * one gate. The capability is allowed to exist; a code path to it is not.
 * These tests fail the build the moment one appears, whether it goes
 * through this module or around it.
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

/** Every source file under `root`, recursively, skipping `skip` entirely. */
function sourceFilesUnder(root: string, skip: string[] = []): string[] {
  if (!fs.existsSync(root)) return [];
  const found: string[] = [];
  for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
    const full = path.join(root, entry.name);
    if (skip.includes(full)) continue;
    if (entry.isDirectory()) {
      if (entry.name === "node_modules") continue;
      found.push(...sourceFilesUnder(full, skip));
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

/**
 * Everything the two apps actually run.
 *
 * `modules/` IS included, minus the module under test. That is not
 * pedantry: `modules/backup-exclusion/index.ts` is a sibling local module
 * that live recording code imports (`lib/video/recording-file.ts`,
 * `lib/video/video-upload-bootstrap.tsx`), so a single
 * `export * from "../instagram-reels"` added there would make
 * `shareToReels` reachable from two files on the recording path with every
 * test still green.
 *
 * `__tests__/` is excluded because it is these tests. `plugins/` is
 * excluded because the config plugin is the native-declaration half of the
 * same feature and is meant to be wired into app.json.
 */
const APP_ROOTS = [
  path.join(MOBILE_ROOT, "app"),
  path.join(MOBILE_ROOT, "components"),
  path.join(MOBILE_ROOT, "hooks"),
  path.join(MOBILE_ROOT, "lib"),
  path.join(MOBILE_ROOT, "modules"),
  path.join(MOBILE_ROOT, "types"),
  path.join(REPO_ROOT, "packages", "shared", "src"),
];

function appSourceFiles(): string[] {
  return APP_ROOTS.flatMap((root) => sourceFilesUnder(root, [MODULE_ROOT]));
}

function relative(file: string): string {
  return path.relative(REPO_ROOT, file);
}

/**
 * The argument text of every `Share.share(...)` call in `source`, found by
 * balancing parentheses from the opening one. Crude, and sufficient: these
 * are object literals a few lines long, and the alternative is a parser.
 */
function shareCallArguments(source: string): string[] {
  const calls: string[] = [];
  const needle = "Share.share(";
  let at = source.indexOf(needle);
  while (at !== -1) {
    const open = at + needle.length - 1;
    let depth = 0;
    let end = open;
    for (let i = open; i < source.length; i += 1) {
      if (source[i] === "(") depth += 1;
      if (source[i] === ")") {
        depth -= 1;
        if (depth === 0) {
          end = i;
          break;
        }
      }
    }
    calls.push(source.slice(open + 1, end));
    at = source.indexOf(needle, end);
  }
  return calls;
}

describe("no outbound footage affordance is reachable", () => {
  it("has app roots to scan, so a moved directory cannot make this vacuous", () => {
    // Without this the suite would pass loudly after a rename that made
    // every glob empty, which is the classic way a guard like this dies.
    for (const root of APP_ROOTS) {
      expect(fs.existsSync(root)).toBe(true);
    }
    expect(sourceFilesUnder(path.join(MOBILE_ROOT, "app")).length).toBeGreaterThan(20);
  });

  it("scans the sibling local module that live code already imports", () => {
    // Proves `modules/` is genuinely in the scanned set, by finding the
    // file whose existence is the reason it has to be.
    const scanned = appSourceFiles().map(relative);
    expect(scanned).toContain(path.join("apps", "mobile", "modules", "backup-exclusion", "index.ts"));
    expect(scanned.filter((file) => file.includes("instagram-reels"))).toEqual([]);
  });

  it("is imported by no screen, component, hook, shared module or sibling module", () => {
    const offenders = appSourceFiles()
      .filter((file) =>
        /instagram-reels|InstagramReels|shareToReels/.test(fs.readFileSync(file, "utf8")),
      )
      .map(relative);

    // If this fails, the share entry point has arrived early. It belongs in
    // slice jits-s6mi.4, behind `highlight_share_enabled`, and that flag
    // must not go true while jr_be-17f is open.
    expect(offenders).toEqual([]);
  });

  it("hands the system share sheet no local file", () => {
    // The generic share sheet is under the SAME gate as Instagram, and it
    // is one property away from being a footage affordance: the existing
    // call sites share a URL and a sentence, and adding `url: videoUri` to
    // any of them would ship the disclosure with no native change, no flag
    // and no review.
    const calls = appSourceFiles().flatMap((file) =>
      shareCallArguments(fs.readFileSync(file, "utf8")).map(
        (args) => [relative(file), args] as const,
      ),
    );
    // Not vacuous: there really are four today.
    expect(calls).toHaveLength(4);

    const offenders = calls
      .filter(([, args]) =>
        /videoUri|videoUrl|recordingUri|clipUri|localUri|fileUri|file:\/\/|\.mp4|\.mov/.test(args),
      )
      .map(([file]) => file);
    expect(offenders).toEqual([]);
  });

  it("imports neither expo-sharing nor expo-media-library in app code", () => {
    // Both are installed dependencies and neither is used today. They are
    // the two ways to put a local file in front of the OS without going
    // near this module: `Sharing.shareAsync(fileUri)` and
    // `MediaLibrary.saveToLibraryAsync(fileUri)`, the second being the
    // "just save it to my photos" convenience the epic explicitly forbids
    // shipping unflagged.
    const offenders = appSourceFiles()
      .filter((file) =>
        /from "expo-sharing"|from "expo-media-library"|saveToLibraryAsync|createAssetAsync/.test(
          fs.readFileSync(file, "utf8"),
        ),
      )
      .map(relative);
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
    const barrels = appSourceFiles().filter((file) => path.basename(file) === "index.ts");
    expect(barrels.length).toBeGreaterThan(0);
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
    "android/src/main/java/expo/modules/instagramreels/ReelsFailure.kt",
  );

  it("declares the same seven codes in TypeScript, Swift and Kotlin", () => {
    // A code that exists on one platform only maps to `unknown` on the
    // other, which is how a "clip too long" turns into "sharing failed,
    // try again" for half the install base.
    const js = reelsErrorCodesIn(jsSource);
    expect(js).toHaveLength(7);
    expect(reelsErrorCodesIn(swiftSource)).toEqual(js);
    expect(reelsErrorCodesIn(kotlinSource)).toEqual(js);
  });

  it("has no size-refusal code left anywhere", () => {
    // Size is ADVISORY: Meta recommends under 50 MB and requires 3-60s.
    // A leftover refusal on one platform would resurrect the inconsistency
    // where a legal 60s 1080p clip is refused with copy blaming its length
    // when the real cause is bitrate.
    for (const source of [jsSource, swiftSource, kotlinSource]) {
      expect(source).not.toContain("ERR_REELS_VIDEO_TOO_LARGE");
    }
  });

  it("passes the codes explicitly on both platforms rather than inferring them", () => {
    // Expo infers a code from the exception CLASS NAME when you let it, and
    // Swift and Kotlin infer by different rules. Inference here would
    // produce two different strings for the same failure.
    expect(swiftSource).toMatch(/promise\.reject\(failure\.code, failure\.message\)/);
    expect(kotlinSource).toMatch(/val errorCode: String/);
  });
});

describe("the Android intent matches Meta's single-media sample", () => {
  const kotlin = read(
    MODULE_ROOT,
    "android/src/main/java/expo/modules/instagramreels/InstagramReelsModule.kt",
  );

  it("sets the clip as the intent's DATA, not only its type", () => {
    // Meta publishes two samples and they are not interchangeable: the
    // single-media one uses setDataAndType, and only ADD_TO_REEL_MULTIPLE
    // uses a bare setType. Taking the multiple-media form here moves the
    // URI out of `intent.data`, which is both what the grant flag attaches
    // to and what Instagram's intent filter is matched against.
    expect(kotlin).toMatch(/setDataAndType\(contentUri, MEDIA_MIME\)/);
    expect(kotlin).not.toMatch(/^\s+type = /m);
  });

  it("uses the documented MIME string without narrowing it", () => {
    // Narrowing to "video/*" is a second silent deviation: if Instagram's
    // filter declares the combined type, a narrowed one can fail to match
    // and surface as "Instagram is not installed" on a phone where it is.
    expect(kotlin).toContain('MEDIA_MIME = "image/* video/*"');
  });

  it("targets Meta's documented action, package, App ID and sticker extras", () => {
    expect(kotlin).toContain('REELS_ACTION = "com.instagram.share.ADD_TO_REEL"');
    expect(kotlin).toContain('INSTAGRAM_PACKAGE = "com.instagram.android"');
    expect(kotlin).toContain(
      'APPLICATION_ID_EXTRA = "com.instagram.platform.extra.APPLICATION_ID"',
    );
    // Documented in Meta's "Example with Sticker" block on the same page.
    // An earlier revision of this module asserted no such extra existed.
    expect(kotlin).toContain('STICKER_ASSET_EXTRA = "interactive_asset_uri"');
  });

  it("does not attach ClipData", () => {
    // It was a workaround for NOT having the URI in `data`. With the
    // documented form the flag attaches to the data URI directly, and
    // `newRawUri` would advertise the clip as `text/uri-list` rather than
    // its real type. Asserted against the CODE, not the prose: the
    // docblock still has to explain why EXTRA_STREAM is not covered by the
    // flag, and that explanation names ClipData.
    expect(kotlin).not.toContain("import android.content.ClipData");
    expect(kotlin).not.toMatch(/clipData\s*=/);
    expect(kotlin).not.toContain("ClipData.newRawUri");
  });
});

describe("the Android FileProvider wiring", () => {
  const manifest = read(MODULE_ROOT, "android", "src", "main", "AndroidManifest.xml");
  const kotlin = read(
    MODULE_ROOT,
    "android/src/main/java/expo/modules/instagramreels/InstagramReelsModule.kt",
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
    expect(
      fs.existsSync(
        path.join(
          MODULE_ROOT,
          "android/src/main/java/expo/modules/instagramreels/ReelsFileProvider.kt",
        ),
      ),
    ).toBe(true);
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

  it("grants read permission per URI, explicitly, and not only by flag", () => {
    // The flag covers the intent's DATA uri. Neither EXTRA_STREAM nor the
    // sticker extra is reached by it, so both need naming. Without this
    // Instagram gets a URI it cannot open and the handoff looks ignored.
    expect(kotlin).toMatch(/addFlags\(Intent\.FLAG_GRANT_READ_URI_PERMISSION\)/);
    expect(kotlin).toMatch(
      /grantUriPermission\(INSTAGRAM_PACKAGE, contentUri, Intent\.FLAG_GRANT_READ_URI_PERMISSION\)/,
    );
    expect(kotlin).toMatch(
      /grantUriPermission\(INSTAGRAM_PACKAGE, stickerUri, Intent\.FLAG_GRANT_READ_URI_PERMISSION\)/,
    );
  });

  it("does not let a failed grant pre-empt the availability answer", () => {
    // A grant at a package that is not installed does nothing and on some
    // builds throws. Letting that propagate maps "Instagram is missing" to
    // a generic "the handoff failed"; startActivity stays the authority.
    expect(kotlin).toMatch(/runCatching \{\s*\n\s*context\.grantUriPermission/);
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

  it("sets an expiry and keeps the clip off Universal Clipboard", () => {
    // `localOnly` is not cosmetic: without it a video OF THE OTHER ATHLETE
    // syncs to the user's other Apple devices, which is the same
    // out-of-scope disclosure class the consent gate exists to decide. It
    // is consumed by the pasteboard server, so it cannot change what
    // Instagram sees.
    expect(swift).toMatch(/\.expirationDate: Date\(\)\.addingTimeInterval\(pasteboardTTLSeconds\)/);
    expect(swift).toMatch(/\.localOnly: true/);
  });

  it("restores the user's clipboard instead of destroying it", () => {
    // Writing tens of MB and only THEN discovering Instagram is absent used
    // to cost the user whatever they had copied, in exchange for nothing.
    expect(swift).toMatch(/let previousItems = await snapshotPasteboard\(\)/);
    expect(swift).toMatch(/UIPasteboard\.general\.items = previousItems/);
    expect(swift).not.toMatch(/UIPasteboard\.general\.items = \[\]/);
  });

  it("does not take a snapshot it does not need", () => {
    // Reading `items` is itself the cross-app read iOS 16 can prompt for.
    // `numberOfItems` does not prompt, so an empty pasteboard, the common
    // case, costs the user nothing.
    expect(swift).toMatch(/guard UIPasteboard\.general\.numberOfItems > 0 else \{ return \[\] \}/);
  });

  it("cannot leave the promise unsettled if `open` never calls back", () => {
    // The completion handler is not guaranteed to arrive (the reported case
    // is the app being suspended mid-transition). An unsettled promise is
    // worse than any named failure: the caller's spinner never resolves and
    // no copy is ever shown.
    expect(swift).toMatch(/asyncAfter\(deadline: \.now\(\) \+ openTimeoutSeconds\)/);
    // And resuming a CheckedContinuation twice is a hard crash, so the
    // race has to be one-shot.
    expect(swift).toMatch(/if latch\.claim\(\)/);
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
      "android/src/main/java/expo/modules/instagramreels/InstagramReelsModule.kt",
    );
    expect(kotlin).toContain("package expo.modules.instagramreels");
    expect(kotlin).toContain("class InstagramReelsModule : Module()");
  });

  it("registers the same JS name on both platforms", () => {
    // `requireOptionalNativeModule("InstagramReels")` resolves by this name.
    expect(read(MODULE_ROOT, "ios", "InstagramReelsModule.swift")).toContain(
      'Name("InstagramReels")',
    );
    expect(
      read(MODULE_ROOT, "android/src/main/java/expo/modules/instagramreels/InstagramReelsModule.kt"),
    ).toContain('Name("InstagramReels")');
    expect(read(MODULE_ROOT, "index.ts")).toContain(
      'requireOptionalNativeModule<InstagramReelsNativeModule>("InstagramReels")',
    );
  });

  it("builds for both platforms, matches the podspec name, and claims no tvOS", () => {
    expect(config.platforms.sort()).toEqual(["android", "apple"]);
    const podspec = read(MODULE_ROOT, "ios", "InstagramReels.podspec");
    expect(podspec).toContain("s.name           = 'InstagramReels'");
    // UIPasteboard does not exist on tvOS, so declaring the platform would
    // promise a build that cannot compile.
    expect(podspec).not.toMatch(/:tvos/);
  });
});
