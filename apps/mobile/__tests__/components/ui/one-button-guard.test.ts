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
      // WP4 (jits-3eeg.5): the legacy shadcn Button.
      "components/ui/button.tsx",
    ]) {
      expect(fs.existsSync(path.join(ROOT, gone))).toBe(false);
    }
    const names = /\b(CtaButton|SecondaryButton|TertiaryButton|DestructiveButton|PracticeButton|ViewerButton)\b/;
    const offenders = FILES.filter((f) => names.test(f.text)).map((f) => f.file);
    expect(offenders).toEqual([]);
  });

  it("nothing imports a legacy Button (the shadcn one was deleted by WP4; the one Button is elo-system/button)", () => {
    const legacy = /from\s+["'](@\/components\/ui\/button|\.\.?\/(ui\/)?button)["']/;
    const barrel = /import\s*\{[^}]*\bButton\b[^}]*\}\s*from\s*["']@\/components\/ui["']/;
    const offenders = FILES.filter(
      (f) => (legacy.test(f.text) || barrel.test(f.text)) && !f.file.startsWith("components/ui/elo-system/"),
    ).map((f) => f.file);
    expect(offenders).toEqual([]);
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

  it("one disabled style: no 0.6 dim anywhere outside the reviewed exceptions (DISABLED_OPACITY is 0.5)", () => {
    // Any 0.6 opacity: an `opacity: 0.6` style (whatever its condition) or an
    // `opacity-60` class, `active:` included.
    const sixty = /opacity:\s*0\.6\b|(^|[\s"'`:])opacity-60\b/g;
    // Reviewed exceptions, each with its count in that file and the reason.
    const ALLOWED: Record<string, { count: number; reason: string }> = {
      "components/arena/challenge-prompt-sheet.tsx": {
        count: 3,
        reason: "Adding Flare: the busy dims of Accept / Decline / Later are part of the shipped accept sweep",
      },
      "components/arena/mat-board.tsx": {
        count: 1,
        reason: "the locked (not disabled) Go live / offline toggle, a separate state from disabled",
      },
      "components/match-flow/faceoff/faceoff-top.tsx": {
        count: 1,
        reason: "the face-off Cancel match control: its pressed dip and its in-flight cancelling dip (harness label, unchanged)",
      },
    };
    const offenders: string[] = [];
    for (const f of FILES) {
      const n = (f.text.match(sixty) ?? []).length;
      if (n === 0) continue;
      const allowed = ALLOWED[f.file];
      if (!allowed || n !== allowed.count) offenders.push(`${f.file} (${n})`);
    }
    expect(offenders).toEqual([]);
    for (const [file, { reason }] of Object.entries(ALLOWED)) {
      expect(reason.length).toBeGreaterThan(0);
      expect(fs.existsSync(path.join(ROOT, file))).toBe(true);
    }
  });
});
