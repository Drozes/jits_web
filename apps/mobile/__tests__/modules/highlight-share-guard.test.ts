/**
 * Source-level guard for the highlight share funnel (jr_be spec 014 section
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

const FORBIDDEN =
  /instagram-reels|InstagramReels|shareToReels|from "expo-sharing"|from "expo-media-library"|from "expo-clipboard"|require\("expo-(sharing|media-library|clipboard)"\)|saveToLibraryAsync|createAssetAsync|shareAsync\(/;

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
      .filter((file) => FORBIDDEN.test(fs.readFileSync(file, "utf8")))
      .map(relative);
    expect(offenders).toEqual([]);
  });

  it("inside it, the patterns really occur (the scan can see them)", () => {
    const inside = sourceFilesUnder(SHARE_ROOT).map((file) => fs.readFileSync(file, "utf8"));
    expect(inside.some((src) => /from "@\/modules\/instagram-reels"/.test(src))).toBe(true);
    expect(inside.some((src) => /require\("expo-sharing"\)/.test(src))).toBe(true);
    expect(inside.some((src) => FORBIDDEN.test(src))).toBe(true);
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

describe("5. Share.share stays as it is", () => {
  it("has exactly three calls and none hands over a local file", () => {
    const calls = appSourceFiles().flatMap((file) =>
      shareCallArguments(fs.readFileSync(file, "utf8")).map((args) => [relative(file), args] as const),
    );
    // Athlete profile, own profile share sheet, match summary.
    expect(calls).toHaveLength(3);
    const offenders = calls
      .filter(([, args]) =>
        /videoUri|videoUrl|recordingUri|clipUri|localUri|fileUri|file:\/\/|\.mp4|\.mov/.test(args),
      )
      .map(([file]) => file);
    expect(offenders).toEqual([]);
  });
});
