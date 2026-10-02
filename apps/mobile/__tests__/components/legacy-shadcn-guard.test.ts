/**
 * WP4 guard (jits-3eeg.5, R3 LG-1, LG-3, TY-5): the legacy shadcn layer is
 * retired and cannot come back unnoticed. Grep-style over `app/`,
 * `components/`, `lib/`, `hooks/` and `modules/`:
 *
 *  - the deleted primitives stay deleted;
 *  - no legacy shadcn color class (`bg-background`, `text-foreground`,
 *    `text-muted-foreground`, `bg-primary`, `bg-destructive`, `border-input`,
 *    ...) is written anywhere; those classes no longer resolve to a color;
 *  - the legacy color plumbing is gone from tailwind.config.js and
 *    theme-provider.tsx;
 *  - no legacy token key survives in ColorTokens (the last three,
 *    `background`, `primary` and `muted`, left after WP2 moved the Switch onto
 *    ELO tokens) and nothing reads one.
 */
import * as fs from "fs";
import * as path from "path";

const ROOT = path.resolve(__dirname, "../..");

function sources(): { file: string; text: string }[] {
  const out: { file: string; text: string }[] = [];
  const walk = (dir: string) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (entry.name === "node_modules" || entry.name === "__tests__") continue;
        walk(p);
      } else if (/\.(tsx?|jsx?)$/.test(entry.name)) {
        out.push({ file: path.relative(ROOT, p).split(path.sep).join("/"), text: fs.readFileSync(p, "utf8") });
      }
    }
  };
  for (const d of ["app", "components", "lib", "hooks", "modules"]) {
    if (fs.existsSync(path.join(ROOT, d))) walk(path.join(ROOT, d));
  }
  return out;
}

const FILES = sources();

const LEGACY_COLOR_KEYS = [
  "background",
  "foreground",
  "card",
  "card-foreground",
  "popover",
  "popover-foreground",
  "primary",
  "primary-foreground",
  "secondary",
  "secondary-foreground",
  "muted",
  "muted-foreground",
  "accent",
  "accent-foreground",
  "destructive",
  "destructive-foreground",
  "success",
  "success-foreground",
  "border",
  "input",
  "ring",
  "gold",
  "brand-orange",
  "deep-red",
];

const LEGACY_CLASS = new RegExp(
  `(^|[\\s"'\`:])(bg|text|border|border-[trblxy]|ring|fill|stroke|divide|placeholder|decoration|tint)-(${LEGACY_COLOR_KEYS.join("|")})(\\/\\d+)?(?=[\\s"'\`]|$)`,
  "gm",
);

describe("legacy shadcn layer is retired (WP4)", () => {
  it("the deleted primitives stay deleted", () => {
    for (const gone of [
      "components/ui/card.tsx",
      "components/ui/input.tsx",
      "components/ui/label.tsx",
      "components/ui/avatar.tsx",
      "components/ui/separator.tsx",
      "components/ui/tabs.tsx",
      "components/ui/select.tsx",
      "components/ui/button.tsx",
      "components/online-indicator.tsx",
    ]) {
      expect(fs.existsSync(path.join(ROOT, gone))).toBe(false);
    }
  });

  it("finds source to scan (the scan is not vacuous)", () => {
    expect(FILES.length).toBeGreaterThan(100);
  });

  it("no legacy shadcn color class is written anywhere", () => {
    const offenders: string[] = [];
    for (const f of FILES) {
      for (const m of f.text.matchAll(LEGACY_CLASS)) offenders.push(`${f.file}: ${m[0].trim()}`);
    }
    expect(offenders).toEqual([]);
  });

  it("no legacy color is plumbed through Tailwind or the theme provider", () => {
    const tw = fs.readFileSync(path.join(ROOT, "tailwind.config.js"), "utf8");
    const provider = fs.readFileSync(path.join(ROOT, "lib/theme/theme-provider.tsx"), "utf8");
    for (const key of LEGACY_COLOR_KEYS) {
      expect(tw).not.toContain(`"--${key}"`);
      expect(provider).not.toContain(`"--${key}"`);
    }
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const config = require("../../tailwind.config.js");
    const colors = Object.keys(config.theme.extend.colors);
    for (const key of LEGACY_COLOR_KEYS) expect(colors).not.toContain(key);
  });

  it("no legacy token key survives in ColorTokens, and nothing reads one", () => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { darkTokens, lightTokens } = require("../../lib/tokens");
    for (const t of [darkTokens, lightTokens]) {
      for (const key of LEGACY_COLOR_KEYS) expect(Object.keys(t)).not.toContain(key);
    }
    const legacyRead = /\b(tokens|t|theme|colors|lightTokens|darkTokens|useThemedTokens\(\))\.(background|primary|muted)\b/;
    const readers = FILES.filter((f) => legacyRead.test(f.text)).map((f) => f.file);
    expect(readers).toEqual([]);
  });
});
