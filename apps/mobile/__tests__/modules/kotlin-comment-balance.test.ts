/**
 * Kotlin block comments NEST, so a `/*` written inside a KDoc (for example a
 * MIME wildcard like image/* in prose) opens a comment that never closes and
 * the Android build fails with "Unclosed comment" (jits-mafl.1). No JS gate
 * compiles Kotlin, so this lexes every module and plugin `.kt` file the way
 * kotlinc does (strings, line comments, nesting block comments) and requires
 * every block comment to close. In KDoc write the wildcard as `image/\*`.
 */
/// <reference types="node" />
import fs from "node:fs";
import path from "node:path";

const MOBILE_ROOT = path.join(__dirname, "..", "..");

function kotlinFiles(root: string): string[] {
  if (!fs.existsSync(root)) return [];
  const out: string[] = [];
  for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
    if (entry.name === "node_modules" || entry.name === "build") continue;
    const full = path.join(root, entry.name);
    if (entry.isDirectory()) out.push(...kotlinFiles(full));
    else if (entry.name.endsWith(".kt")) out.push(full);
  }
  return out;
}

/** The block-comment depth left open at end of file (0 when balanced). */
function unclosedCommentDepth(src: string): number {
  let depth = 0;
  let i = 0;
  while (i < src.length) {
    const two = src.slice(i, i + 2);
    if (depth > 0) {
      if (two === "/*") {
        depth += 1;
        i += 2;
      } else if (two === "*/") {
        depth -= 1;
        i += 2;
      } else i += 1;
      continue;
    }
    if (two === "//") {
      const nl = src.indexOf("\n", i);
      i = nl < 0 ? src.length : nl;
    } else if (two === "/*") {
      depth = 1;
      i += 2;
    } else if (src.startsWith('"""', i)) {
      const end = src.indexOf('"""', i + 3);
      i = end < 0 ? src.length : end + 3;
    } else if (src[i] === '"') {
      i += 1;
      while (i < src.length && src[i] !== '"' && src[i] !== "\n") i += src[i] === "\\" ? 2 : 1;
      i += 1;
    } else i += 1;
  }
  return depth;
}

describe("Kotlin block comments", () => {
  it("the lexer catches a nested opener in KDoc and ignores strings and line comments", () => {
    expect(unclosedCommentDepth('/** a "image/* video/*" type */\nval x = 1')).toBeGreaterThan(0);
    expect(unclosedCommentDepth('/** a "image/\\* video/\\*" type */\nval m = "image/* video/*" // video/*')).toBe(0);
  });

  const files = [
    ...kotlinFiles(path.join(MOBILE_ROOT, "modules")),
    ...kotlinFiles(path.join(MOBILE_ROOT, "plugins")),
  ];

  it("finds the module sources", () => {
    expect(files.length).toBeGreaterThan(0);
  });

  it.each(files.map((f) => [path.relative(MOBILE_ROOT, f), f]))("%s closes every block comment", (_rel, file) => {
    expect(unclosedCommentDepth(fs.readFileSync(file, "utf8"))).toBe(0);
  });
});
