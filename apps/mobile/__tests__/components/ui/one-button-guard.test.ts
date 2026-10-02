/**
 * WP3 guard (jits-3eeg.4, findings BT-1 to BT-7, MO-9): one Button, one
 * press feedback. Grep-style, so a second button family or a hand-rolled
 * Signal Red CTA cannot come back unnoticed.
 */
import * as fs from "fs";
import * as path from "path";

const ROOT = path.resolve(__dirname, "../../..");
const SCAN = ["app", "components", "lib"];

function sources(): { file: string; text: string }[] {
  const out: { file: string; text: string }[] = [];
  const walk = (dir: string) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (entry.name === "node_modules" || entry.name === "__tests__") continue;
        walk(p);
      } else if (/\.(tsx?|jsx?)$/.test(entry.name)) {
        out.push({ file: path.relative(ROOT, p), text: fs.readFileSync(p, "utf8") });
      }
    }
  };
  for (const d of SCAN) walk(path.join(ROOT, d));
  return out;
}

/** Every opening tag `<Name ...>` (brace-aware, so arrow functions in props do not end it). */
function openingTags(text: string, name: string): string[] {
  const tags: string[] = [];
  const re = new RegExp(`<${name}\\b`, "g");
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) {
    let depth = 0;
    let k = m.index + m[0].length;
    for (; k < text.length; k++) {
      const c = text[k];
      if (c === "{") depth++;
      else if (c === "}") depth--;
      else if (depth === 0 && c === ">") break;
    }
    tags.push(text.slice(m.index, k + 1));
  }
  return tags;
}

const FILES = sources();

describe("one Button (WP3)", () => {
  it("the retired button families are gone", () => {
    for (const gone of [
      "components/auth/auth-buttons.tsx",
      "components/highlight-viewer/viewer-button.tsx",
    ]) {
      expect(fs.existsSync(path.join(ROOT, gone))).toBe(false);
    }
    const names = /\b(CtaButton|SecondaryButton|TertiaryButton|DestructiveButton|PracticeButton|ViewerButton)\b/;
    const offenders = FILES.filter((f) => names.test(f.text)).map((f) => f.file);
    expect(offenders).toEqual([]);
  });

  it("no new uses of the legacy shadcn Button (WP4 deletes it; only the update banner is left)", () => {
    const legacy = /from\s+["'](@\/components\/ui\/button|\.\.?\/(ui\/)?button)["']/;
    const barrel = /import\s*\{[^}]*\bButton\b[^}]*\}\s*from\s*["']@\/components\/ui["']/;
    const offenders = FILES.filter(
      (f) => (legacy.test(f.text) || barrel.test(f.text)) && !f.file.startsWith("components/ui/"),
    ).map((f) => f.file);
    expect(offenders).toEqual(["components/updates/update-banner.tsx"]);
  });

  it("no Signal Red fill on a raw Pressable / Touchable (a red CTA is a Button or a PressableScale)", () => {
    const offenders: string[] = [];
    for (const f of FILES) {
      for (const name of ["Pressable", "TouchableOpacity", "TouchableHighlight", "TouchableWithoutFeedback"]) {
        for (const tag of openingTags(f.text, name)) {
          if (/\bbg-cta\b/.test(tag)) offenders.push(`${f.file}: <${name}>`);
        }
      }
    }
    expect(offenders).toEqual([]);
  });

  it("the glass button look carries no press transform of its own (PRESS_SCALE via PressableScale)", () => {
    const tokens = fs.readFileSync(path.join(ROOT, "components/match-flow/live/broadcast-tokens.ts"), "utf8");
    const fn = tokens.slice(tokens.indexOf("export function glassButtonStyle"));
    const body = fn.slice(0, fn.indexOf("\n}\n"));
    expect(body).not.toMatch(/transform|scale/);
  });

  it("one disabled style: no 60% disabled dims left (DISABLED_OPACITY is 0.5)", () => {
    const sixty = /(^|["'\s])opacity-60(["'\s]|$)|(disabled|isSaving|busy)\s*\?\s*\{\s*opacity:\s*0\.6\s*\}/m;
    const offenders = FILES.filter((f) => sixty.test(f.text)).map((f) => f.file);
    expect(offenders).toEqual([]);
  });
});
