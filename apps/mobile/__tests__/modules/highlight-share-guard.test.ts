/**
 * Source-level guard for the highlight share funnel (jr_be spec 015 section
 * 16.7). Replaces the first block of `instagram-reels-contract.test.ts`
 * ("no outbound footage affordance is reachable").
 *
 * The Reels handoff, the system share sheet and save-to-camera-roll all hand
 * the OTHER athlete's likeness to a destination outside the two participants,
 * so they are one disclosure behind one gate, `highlight_share_enabled`. The
 * capability now exists, in ONE directory, `lib/highlight-share/`, whose hook
 * refuses every action while the flag is off (the behavioural half of this
 * guard lives in `__tests__/lib/highlight-share/use-highlight-share.test.ts`).
 * This file fails the build the moment a code path to those packages appears
 * anywhere else, or the share module is imported from somewhere unexpected.
 */
/// <reference types="node" />
// Node APIs scoped to this file, same reasoning as the contract suite: the
// mobile tsconfig keeps @types/node out of app code on purpose.
import fs from "node:fs";
import path from "node:path";

const MOBILE_ROOT = path.join(__dirname, "..", "..");
const REPO_ROOT = path.join(MOBILE_ROOT, "..", "..");
const REELS_MODULE_ROOT = path.join(MOBILE_ROOT, "modules", "instagram-reels");
const SHARE_ROOT = path.join(MOBILE_ROOT, "lib", "highlight-share");

const SOURCE_EXTENSIONS = [".ts", ".tsx", ".js", ".jsx"];

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

/**
 * Everything the app runs (same roots as the former guard). `modules/` is
 * in, minus the Reels module itself: `modules/backup-exclusion` is imported
 * by live recording code, so a re-export there would make the Reels module
 * reachable from the recording path.
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
  return APP_ROOTS.flatMap((root) => sourceFilesUnder(root, [REELS_MODULE_ROOT]));
}

function relative(file: string): string {
  return path.relative(REPO_ROOT, file);
}

function mobileRelative(file: string): string {
  return path.relative(MOBILE_ROOT, file).split(path.sep).join("/");
}

function isInside(file: string, root: string): boolean {
  const rel = path.relative(root, file);
  return rel === "" || (!rel.startsWith("..") && !path.isAbsolute(rel));
}

/**
 * Every way code can reach the share packages or hand footage to Instagram,
 * outside `lib/highlight-share/`. Specifiers are matched as ANY string literal
 * (single, double or template quotes; static import, export-from, require,
 * dynamic import(); subpaths such as `expo-media-library/next`), plus the
 * native module names (direct `requireNativeModule` / `NativeModules` access),
 * the share-sheet / camera-roll calls and the Instagram URL schemes.
 */
const FORBIDDEN_PATTERNS: ReadonlyArray<[string, RegExp]> = [
  ["share package specifier", /["'`]expo-(sharing|media-library|clipboard)(\/[^"'`]*)?["'`]/],
  ["Reels module", /instagram-reels|shareToReels/],
  ["native module name", /\b(ExpoSharing|ExpoMediaLibrary|ExpoClipboard|InstagramReels)\b/],
  ["share sheet call", /shareAsync\s*\(/],
  ["camera roll call", /saveToLibraryAsync|createAssetAsync/],
  ["Instagram URL scheme", /instagram(-reels|-stories)?:\/\//],
  ["iOS action-sheet share", /showShareActionSheetWithOptions/],
  ["Android storage access", /StorageAccessFramework/],
];

/** The names of every forbidden pattern `source` matches. */
function forbiddenHits(source: string): string[] {
  return FORBIDDEN_PATTERNS.filter(([, re]) => re.test(source)).map(([name]) => name);
}

/**
 * The one narrow exception (invites, jits-b3js.9): the system paste control
 * READS the clipboard on the athlete's own tap (UIPasteControl, no prompt) so
 * an invite link copied on the landing page survives the App Store install.
 * It may import expo-clipboard and nothing else on this list, and may never
 * call a clipboard WRITE, so it can never carry footage or likeness out.
 */
const PASTE_ONLY_FILES = [path.join(MOBILE_ROOT, "components", "invite", "PasteInviteButton.tsx")];
const CLIPBOARD_WRITE = /\bset(String|Image|Url)(Async)?\s*\(/;

function pasteOnlyHits(source: string): string[] {
  const hits = forbiddenHits(source);
  const onlyClipboard = !/["'`]expo-(sharing|media-library)/.test(source) && !CLIPBOARD_WRITE.test(source);
  return onlyClipboard ? hits.filter((h) => h !== "share package specifier") : hits;
}

interface ImportRef {
  specifier: string;
  names: string[];
}

/** Every static import / export-from / require / dynamic import in `source`. */
function importsOf(source: string): ImportRef[] {
  const refs: ImportRef[] = [];
  const fromRe = /(?:import|export)\s+(type\s+)?([\s\S]*?)\s+from\s+["']([^"']+)["']/g;
  for (const m of source.matchAll(fromRe)) {
    const clause = m[2];
    const braces = clause.match(/\{([\s\S]*)\}/);
    const names = braces
      ? braces[1]
          .split(",")
          .map((n) => n.trim().replace(/^type\s+/, "").split(/\s+as\s+/)[0].trim())
          .filter(Boolean)
      : [clause.trim()];
    refs.push({ specifier: m[3], names });
  }
  for (const m of source.matchAll(/(?:require|import)\(\s*["']([^"']+)["']\s*\)/g)) {
    refs.push({ specifier: m[1], names: ["*"] });
  }
  for (const m of source.matchAll(/^\s*import\s+["']([^"']+)["']/gm)) {
    refs.push({ specifier: m[1], names: ["*"] });
  }
  return refs;
}

/** Absolute path an import specifier points at, or null for a package. */
function resolveSpecifier(fromFile: string, specifier: string): string | null {
  if (specifier.startsWith("@/")) return path.join(MOBILE_ROOT, specifier.slice(2));
  if (specifier.startsWith(".")) return path.resolve(path.dirname(fromFile), specifier);
  return null;
}

function importsOfShareModule(file: string): ImportRef[] {
  return importsOf(fs.readFileSync(file, "utf8")).filter((ref) => {
    const target = resolveSpecifier(file, ref.specifier);
    return target !== null && isInside(target, SHARE_ROOT);
  });
}

/**
 * The argument text of every `Share.share(...)` call in `source`, found by
 * balancing parentheses from the opening one.
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

describe("1. the scan is not vacuous", () => {
  it("has every app root, and app/ has more than 20 files", () => {
    for (const root of APP_ROOTS) {
      expect(fs.existsSync(root)).toBe(true);
    }
    expect(sourceFilesUnder(path.join(MOBILE_ROOT, "app")).length).toBeGreaterThan(20);
  });

  it("scans the sibling local module that live code imports", () => {
    const scanned = appSourceFiles().map(relative);
    expect(scanned).toContain(path.join("apps", "mobile", "modules", "backup-exclusion", "index.ts"));
    expect(scanned.filter((file) => file.includes(path.join("modules", "instagram-reels")))).toEqual([]);
  });

  it("has the allowed root, with files in it", () => {
    expect(fs.existsSync(SHARE_ROOT)).toBe(true);
    expect(sourceFilesUnder(SHARE_ROOT).length).toBeGreaterThan(3);
  });
});

describe("2. lib/highlight-share/ is the single importer of the share packages", () => {
  it("no app file outside it touches the Reels module, expo-sharing, expo-media-library or expo-clipboard", () => {
    const offenders = appSourceFiles()
      .filter((file) => !isInside(file, SHARE_ROOT))
      .map((file) => {
        const src = fs.readFileSync(file, "utf8");
        return [relative(file), PASTE_ONLY_FILES.includes(file) ? pasteOnlyHits(src) : forbiddenHits(src)] as const;
      })
      .filter(([, hits]) => hits.length > 0)
      .map(([file, hits]) => `${file}: ${hits.join(", ")}`);
    expect(offenders).toEqual([]);
  });

  it("the paste-only exception never writes the clipboard", () => {
    for (const file of PASTE_ONLY_FILES) {
      expect(fs.existsSync(file)).toBe(true);
      expect(fs.readFileSync(file, "utf8")).not.toMatch(CLIPBOARD_WRITE);
    }
    expect(pasteOnlyHits('import * as C from "expo-clipboard"; C.setStringAsync("x");')).toEqual([
      "share package specifier",
    ]);
  });

  it.each([
    ["single quotes", "import * as Sharing from 'expo-sharing';"],
    ["subpath", 'import { saveAsync } from "expo-media-library/next";'],
    ["dynamic import", 'const Sharing = await import("expo-sharing");'],
    ["single-quoted require", "const Clip = require('expo-clipboard');"],
    ["template-literal require", "const Media = require(`expo-media-library`);"],
    ["spaced call", "await Sharing.shareAsync (uri);"],
    ["Instagram app URL", 'Linking.openURL("instagram://library?AssetPath=x");'],
    ["Reels URL", "Linking.openURL('instagram-reels://share');"],
    ["Stories URL", 'Linking.openURL("instagram-stories://share");'],
    ["direct native module", 'const m = requireOptionalNativeModule("ExpoSharing");'],
    ["NativeModules access", "NativeModules.InstagramReels.share(x);"],
    ["media library native", 'requireNativeModule("ExpoMediaLibrary")'],
    ["clipboard native", 'requireOptionalNativeModule("ExpoClipboard")'],
    ["ActionSheetIOS share", "ActionSheetIOS.showShareActionSheetWithOptions({ url: fileUri }, onErr, onOk);"],
    ["Storage Access Framework", "await FileSystem.StorageAccessFramework.createFileAsync(dir, name, mime);"],
  ])("catches a %s bypass", (_label, fixture) => {
    expect(forbiddenHits(fixture).length).toBeGreaterThan(0);
  });

  it("does not flag ordinary code", () => {
    expect(forbiddenHits('import { Share } from "react-native"; const x = "instagram";')).toEqual([]);
  });

  it("inside it, the patterns really occur (the scan can see them)", () => {
    const inside = sourceFilesUnder(SHARE_ROOT).map((file) => fs.readFileSync(file, "utf8"));
    expect(inside.some((src) => /from "@\/modules\/instagram-reels"/.test(src))).toBe(true);
    expect(inside.some((src) => /require\("expo-sharing"\)/.test(src))).toBe(true);
    expect(inside.some((src) => forbiddenHits(src).length > 0)).toBe(true);
  });
});

describe("3. who may import the share module", () => {
  /** [predicate on the mobile-relative path, names it may import or null for any]. */
  const ALLOWED: Array<[(rel: string) => boolean, ReadonlySet<string> | null]> = [
    [(rel) => rel === "app/(app)/highlight/[id].tsx", null],
    [(rel) => rel.startsWith("components/highlight-viewer/"), null],
    [(rel) => rel.startsWith("app/(app)/settings/admin/"), new Set(["getShareCapabilities", "ShareCapabilities"])],
    [(rel) => rel.startsWith("lib/auth/"), new Set(["clearShareCache"])],
  ];

  it("only the viewer, the admin diagnostics row and sign-out import it, with the allowed names", () => {
    const offenders: string[] = [];
    let importers = 0;
    for (const file of appSourceFiles()) {
      if (isInside(file, SHARE_ROOT)) continue;
      const refs = importsOfShareModule(file);
      if (refs.length === 0) continue;
      importers += 1;
      const rel = mobileRelative(file);
      const rule = ALLOWED.find(([matches]) => matches(rel));
      if (!rule) {
        offenders.push(`${rel}: not an allowed importer`);
        continue;
      }
      const allowedNames = rule[1];
      if (!allowedNames) continue;
      for (const ref of refs) {
        for (const name of ref.names) {
          if (!allowedNames.has(name)) offenders.push(`${rel}: imports ${name}`);
        }
      }
    }
    expect(offenders).toEqual([]);
    // Not vacuous: sign-out and the admin row import it today.
    expect(importers).toBeGreaterThanOrEqual(2);
  });

  it("the import detector sees alias and relative imports", () => {
    const fake = path.join(MOBILE_ROOT, "lib", "auth", "x.ts");
    const refs = (src: string) =>
      importsOf(src).filter((ref) => {
        const target = resolveSpecifier(fake, ref.specifier);
        return target !== null && isInside(target, SHARE_ROOT);
      });
    expect(refs('import { clearShareCache } from "../highlight-share";')[0].names).toEqual(["clearShareCache"]);
    expect(refs('import { track } from "@/lib/highlight-share/telemetry";')[0].names).toEqual(["track"]);
    expect(refs('const m = require("../highlight-share/download");')[0].names).toEqual(["*"]);
    expect(refs('import { x } from "@/lib/highlight";')).toEqual([]);
  });
});

const VIEWER_ROOT = path.join(MOBILE_ROOT, "components", "highlight-viewer");
const VIEWER_ROUTE = "app/(app)/highlight/[id].tsx";

/** Re-exports of the share module in `source` (export * / export {..} from it). */
function shareReExports(file: string, source: string): string[] {
  const hits: string[] = [];
  for (const m of source.matchAll(/export\s+(?:type\s+)?(\*|\{[\s\S]*?\})\s*(?:as\s+\w+\s*)?from\s+["'`]([^"'`]+)["'`]/g)) {
    const target = resolveSpecifier(file, m[2]);
    if (target !== null && isInside(target, SHARE_ROOT)) hits.push(m[0].replace(/\s+/g, " "));
  }
  if (/export\s*\{[^}]*\buseHighlightShare\b[^}]*\}\s*;?/.test(source.replace(/export\s*\{[^}]*\}\s*from[^;]*;?/g, ""))) {
    hits.push("re-exports useHighlightShare");
  }
  return hits;
}

describe("3b. the allowed importers do not launder the share module", () => {
  it("the route and components/highlight-viewer/** never re-export it", () => {
    const files = [...sourceFilesUnder(VIEWER_ROOT), path.join(MOBILE_ROOT, VIEWER_ROUTE)];
    expect(files.length).toBeGreaterThan(5);
    const offenders = files.flatMap((file) =>
      shareReExports(file, fs.readFileSync(file, "utf8")).map((hit) => `${mobileRelative(file)}: ${hit}`),
    );
    expect(offenders).toEqual([]);
  });

  it("components/highlight-viewer/ has no export * at all", () => {
    const offenders = sourceFilesUnder(VIEWER_ROOT)
      .filter((file) => /export\s*\*/.test(fs.readFileSync(file, "utf8")))
      .map(mobileRelative);
    expect(offenders).toEqual([]);
  });

  it("only the viewer route imports components/highlight-viewer/, and only the screen", () => {
    const offenders: string[] = [];
    for (const file of appSourceFiles()) {
      if (isInside(file, VIEWER_ROOT)) continue;
      for (const ref of importsOf(fs.readFileSync(file, "utf8"))) {
        const target = resolveSpecifier(file, ref.specifier);
        if (target === null || !isInside(target, VIEWER_ROOT)) continue;
        const rel = mobileRelative(file);
        const ok = rel === VIEWER_ROUTE && path.basename(target) === "viewer-screen";
        if (!ok) offenders.push(`${rel}: imports ${ref.specifier}`);
      }
    }
    expect(offenders).toEqual([]);
  });

  it.each([
    ['export * from "@/lib/highlight-share";'],
    ["export { useHighlightShare } from '../../lib/highlight-share';"],
    ['export { track as t } from "@/lib/highlight-share/telemetry";'],
    ['import { useHighlightShare } from "@/lib/highlight-share";\nexport { useHighlightShare };'],
  ])("catches the re-export %s", (fixture) => {
    const file = path.join(VIEWER_ROOT, "x.ts");
    expect(shareReExports(file, fixture).length).toBeGreaterThan(0);
  });

  it("does not flag a normal import", () => {
    const file = path.join(VIEWER_ROOT, "x.ts");
    expect(shareReExports(file, 'import { SHARE_COPY } from "@/lib/highlight-share";\nexport function A() {}')).toEqual([]);
  });
});

describe("4. the share module re-exports no native package", () => {
  it("index.ts has no export * and no export from a native package", () => {
    const index = fs.readFileSync(path.join(SHARE_ROOT, "index.ts"), "utf8");
    expect(index).not.toMatch(/export\s*\*/);
    const exportSources = [...index.matchAll(/export\s+[\s\S]*?from\s+["']([^"']+)["']/g)].map((m) => m[1]);
    expect(exportSources.length).toBeGreaterThan(0);
    for (const src of exportSources) {
      expect(src).not.toMatch(/instagram-reels|expo-sharing|expo-media-library|expo-clipboard/);
      expect(src.startsWith("./")).toBe(true);
    }
  });
});

/** The first argument of a call when it is an object literal (balanced braces), else null. */
function firstObjectLiteral(args: string): string | null {
  const text = args.trimStart();
  if (!text.startsWith("{")) return null;
  let depth = 0;
  for (let i = 0; i < text.length; i += 1) {
    if (text[i] === "{") depth += 1;
    if (text[i] === "}") {
      depth -= 1;
      if (depth === 0) {
        const rest = text.slice(i + 1).trim();
        return rest === "" || rest.startsWith(",") ? text.slice(0, i + 1) : null;
      }
    }
  }
  return null;
}

/**
 * Problems with the RN `Share` API in `source`: every `Share.share` url must
 * come from a known share-URL builder (`buildShareUrl(...)` inline or a
 * variable assigned from it in the same file), and `share` may not be pulled
 * off `Share` (destructured, indexed or aliased), which would dodge the scan.
 */
function shareApiProblems(source: string): string[] {
  const problems: string[] = [];
  if (/\{[^{}]*\bshare\b[^{}]*\}\s*=\s*Share\b/.test(source)) problems.push("destructures share from Share");
  if (/\bShare\s*\[\s*["'`]share["'`]\s*\]/.test(source)) problems.push("indexes Share['share']");
  if (/\bShare\.share\b(?!\s*\()/.test(source)) problems.push("aliases Share.share");
  // React Native's Share itself may not be renamed (no allowlist): an alias
  // would hide its calls from the Share.share scan.
  if (/\bShare\s+as\s+\w+/.test(source)) problems.push("imports Share under an alias");
  if (/=\s*[\w$]+\s*\.\s*Share\b(?!\s*\.)/.test(source)) problems.push("assigns X.Share to a variable");
  if (/\{[^{}]*\bShare\b[^{}]*\}\s*=\s*[\w$]+/.test(source)) problems.push("destructures Share from a namespace");
  const builtVars = new Set(
    [...source.matchAll(/\b(?:const|let|var)\s+(\w+)\s*=\s*buildShareUrl\s*\(/g)].map((m) => m[1]),
  );
  for (const args of shareCallArguments(source)) {
    const literal = firstObjectLiteral(args);
    if (literal === null) problems.push("Share.share argument is not an object literal");
    else if (literal.includes("...")) problems.push("Share.share object literal spreads");
    const explicit = args.match(/\burl\s*:\s*([^,}\n]+)/);
    const shorthand = /(?:^|[{,\s])url\s*(?:,|\}|$)/m.test(args);
    if (explicit) {
      const expr = explicit[1].trim();
      const ok = /^buildShareUrl\s*\(/.test(expr) || builtVars.has(expr);
      if (!ok) problems.push(`url from ${expr}`);
    } else if (shorthand && !builtVars.has("url")) {
      problems.push("url shorthand not from buildShareUrl");
    }
  }
  return problems;
}

describe("5. Share.share stays as it is", () => {
  it("has exactly four calls and none hands over a local file", () => {
    const calls = appSourceFiles().flatMap((file) =>
      shareCallArguments(fs.readFileSync(file, "utf8")).map((args) => [relative(file), args] as const),
    );
    // Athlete profile, own profile share sheet, match summary, and the
    // invite share (jr_be spec 016: message only, the link inside it).
    expect(calls).toHaveLength(4);
    const offenders = calls
      .filter(([, args]) =>
        /videoUri|videoUrl|recordingUri|clipUri|localUri|fileUri|file:\/\/|\.mp4|\.mov/.test(args),
      )
      .map(([file]) => file);
    expect(offenders).toEqual([]);
  });

  it("every Share.share url comes from buildShareUrl, and share is never pulled off Share", () => {
    const offenders = appSourceFiles().flatMap((file) =>
      shareApiProblems(fs.readFileSync(file, "utf8")).map((problem) => `${relative(file)}: ${problem}`),
    );
    expect(offenders).toEqual([]);
  });

  it.each([
    ["a file uri as url", "await Share.share({ message: 'x', url: fileUri });"],
    ["a non-builder variable", "const u = localPath; await Share.share({ url: u });"],
    ["shorthand url not from the builder", "const url = reel.uri; await Share.share({ url });"],
    ["destructured share", "const { share } = Share; await share({ url: x });"],
    ["destructured with alias", "const { share: s } = Share;"],
    ["indexed share", 'await Share["share"]({ url: x });'],
    ["aliased share", "const s = Share.share; await s({ url: x });"],
    ["Share imported under an alias", 'import { Share as S, View } from "react-native";'],
    ["RN namespace Share assigned", 'import * as RN from "react-native";\nconst S = RN.Share;'],
    ["ReactNative.Share assigned", "const Sharer = ReactNative.Share;"],
    ["Share destructured from a namespace", "const { Share } = RN;"],
    ["a non-literal argument", "const opts = { url: buildShareUrl('a', id) }; await Share.share(opts);"],
    ["a spread in the literal", "await Share.share({ ...payload, message: 'x' });"],
    ["a spread after a builder url", "const url = buildShareUrl('a', id); await Share.share({ url, ...extra });"],
  ])("flags %s", (_label, fixture) => {
    expect(shareApiProblems(fixture).length).toBeGreaterThan(0);
  });

  it.each([
    ["inline builder", 'await Share.share({ message: "m", url: buildShareUrl("athlete", id) });'],
    ["builder variable", 'const url = buildShareUrl("athlete", id);\nawait Share.share({ title: "t", url });'],
    ["named builder variable", 'const link = buildShareUrl("athlete", id);\nawait Share.share({ url: link });'],
    ["no url at all", 'await Share.share({ message: "hi" });'],
    ["literal with options", 'await Share.share({ message: "hi" }, { dialogTitle: "Share" });'],
    ["plain react-native import", 'import { Share, View } from "react-native";\nawait Share.share({ message: "m" });'],
  ])("accepts %s", (_label, fixture) => {
    expect(shareApiProblems(fixture)).toEqual([]);
  });
});
