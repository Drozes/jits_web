/**
 * WP5 (jits-3eeg.6): the type scale has one source, `lib/typography.ts`, and
 * every mirror must agree with it:
 *
 *   1. tailwind.config.js theme.extend.fontSize / letterSpacing (the classes)
 *   2. lib/cn.ts (tailwind-merge must know every step, or `cn()` drops it)
 *   3. design/system/project/tokens.json type groups "Scale" and "Tracking",
 *      and every kit text style's `step` / `tracking`
 *   4. design/system/project/Typography.md and the repo DESIGN.md tables
 */
import * as fs from "fs";
import * as path from "path";
import { cn } from "@/lib/cn";
import {
  DISPLAY_STEPS,
  TEXT_FLOOR,
  TEXT_STEPS,
  TRACKING,
  TRACKING_NAMES,
  TYPE_SCALE,
  TYPE_STEP_NAMES,
  numeralTracking,
  stepForSize,
  typeStep,
  type TrackingStep,
  type TypeStep,
} from "@/lib/typography";

const REPO_ROOT = path.resolve(__dirname, "../../../..");
// eslint-disable-next-line @typescript-eslint/no-require-imports
const tailwind = require("../../tailwind.config.js");

const px = (n: number) => `${n}px`;
const num = (v: string) => Number(v.replace(/px$/, ""));

describe("the scale itself", () => {
  it("never goes below the 10px floor and climbs in order", () => {
    const sizes = TYPE_STEP_NAMES.map((name) => TYPE_SCALE[name].fontSize);
    expect(Math.min(...sizes)).toBe(TEXT_FLOOR);
    expect(TEXT_FLOOR).toBe(10);
    expect([...sizes].sort((a, b) => a - b)).toEqual(sizes);
    expect(new Set(sizes).size).toBe(sizes.length);
  });

  it("text steps run 10 to 30; display steps are named by their px", () => {
    for (const value of Object.values(TEXT_STEPS)) {
      expect(value.fontSize).toBeLessThanOrEqual(30);
      expect(value.lineHeight).toBeGreaterThan(value.fontSize);
    }
    for (const [name, value] of Object.entries(DISPLAY_STEPS)) {
      expect(name).toBe(`display-${value.fontSize}`);
      expect(value.lineHeight).toBe(Math.round(value.fontSize * 1.1));
    }
  });

  it("keeps the protected Adding Flare and match-flow sizes as steps", () => {
    // Countdown numeral and GO slam, splash 72, face-off weight 36 (Bebas),
    // the rating-moment odometer 22 and its delta chip 26, the verdicts and
    // EloTile sizes, the live clock.
    for (const size of [240, 116, 72, 36, 22, 26, 96, 80, 52, 60, 64, 44, 88]) {
      expect(stepForSize(size)).toBeDefined();
    }
    expect(stepForSize(9)).toBeUndefined();
    expect(stepForSize(15)).toBeUndefined();
  });

  it("typeStep returns a fresh style object with the step's size and line", () => {
    expect(typeStep("micro")).toEqual({ fontSize: 10, lineHeight: 13 });
    expect(typeStep("display-240")).toEqual({ fontSize: 240, lineHeight: 264 });
    expect(typeStep("body")).not.toBe(TYPE_SCALE.body);
  });

  it("numeral tracking is -0.04em, as EloTile and the live clock", () => {
    expect(numeralTracking(88)).toBe(-3.52);
    expect(numeralTracking(80)).toBe(-3.2);
    expect(numeralTracking(96)).toBe(-3.84);
  });
});

describe("tailwind.config.js mirrors lib/typography.ts", () => {
  const ext = tailwind.theme.extend;

  it("fontSize: the same steps in the same order with the same size and line height", () => {
    const expected = Object.fromEntries(
      TYPE_STEP_NAMES.map((name) => [
        name,
        [px(TYPE_SCALE[name].fontSize), { lineHeight: px(TYPE_SCALE[name].lineHeight) }],
      ]),
    );
    expect(ext.fontSize).toEqual(expected);
    expect(Object.keys(ext.fontSize)).toEqual(TYPE_STEP_NAMES);
  });

  it("letterSpacing: the same tracking steps and values", () => {
    const expected = Object.fromEntries(TRACKING_NAMES.map((name) => [name, px(TRACKING[name])]));
    expect(ext.letterSpacing).toEqual(expected);
  });

  it("no step name collides with a color (text-<step> must stay a size)", () => {
    const colors = Object.keys(ext.colors ?? {});
    for (const name of TYPE_STEP_NAMES) expect(colors).not.toContain(name);
  });
});

describe("cn() knows the scale (tailwind-merge)", () => {
  it.each(TYPE_STEP_NAMES)("text-%s survives a color class and loses to a later size", (step) => {
    expect(cn(`text-${step}`, "text-ink")).toBe(`text-${step} text-ink`);
    expect(cn("text-ink-3", `text-${step}`)).toBe(`text-ink-3 text-${step}`);
    expect(cn(`text-${step}`, "text-micro")).toBe("text-micro");
    expect(cn("text-[13px]", `text-${step}`)).toBe(`text-${step}`);
  });

  it.each(TRACKING_NAMES)("tracking-%s merges as tracking", (step) => {
    expect(cn("tracking-caps-l", `tracking-${step}`)).toBe(`tracking-${step}`);
    expect(cn(`tracking-${step}`, "text-micro")).toBe(`tracking-${step} text-micro`);
  });
});

// ---------------------------------------------------------------------------
// The kit: design/system/project/tokens.json
// ---------------------------------------------------------------------------

interface KitStyle {
  name: string;
  step?: string | null;
  tracking?: string;
  fontSize: string;
  lineHeight?: string;
  letterSpacing?: string;
}
interface KitGroup {
  name: string;
  styles: KitStyle[];
}
const KIT = JSON.parse(
  fs.readFileSync(path.join(REPO_ROOT, "design/system/project/tokens.json"), "utf8"),
) as { type: { groups: KitGroup[] } };
const group = (name: string) => KIT.type.groups.find((g) => g.name === name);

/** Kit styles that sit off the scale on purpose, with why. */
const KIT_NO_STEP: Record<string, string> = {
  "count-badge": "the CountPill digit, the sanctioned 9px exception",
};
const KIT_UNTRACKED_SPACING: Record<string, string> = {
  "countdown-go": "the GO slam's 2px, a registered Adding Flare moment",
};

describe("design kit mirror (tokens.json type groups)", () => {
  it('group "Scale" lists every step as text-<step> with its size and line height', () => {
    const scale = group("Scale");
    expect(scale).toBeDefined();
    expect(scale!.styles.map((s) => [s.name, s.step, num(s.fontSize), num(s.lineHeight ?? "")])).toEqual(
      TYPE_STEP_NAMES.map((name) => [
        `text-${name}`,
        name,
        TYPE_SCALE[name].fontSize,
        TYPE_SCALE[name].lineHeight,
      ]),
    );
  });

  it('group "Tracking" lists every tracking step with its value', () => {
    const tracking = group("Tracking");
    expect(tracking).toBeDefined();
    expect(tracking!.styles.map((s) => [s.name, s.tracking, num(s.letterSpacing ?? "")])).toEqual(
      TRACKING_NAMES.map((name) => [`tracking-${name}`, name, TRACKING[name]]),
    );
  });

  it("every kit text style names a step whose size it uses", () => {
    const drift: string[] = [];
    for (const g of KIT.type.groups) {
      if (g.name === "Scale" || g.name === "Tracking") continue;
      for (const style of g.styles) {
        if (style.step == null) {
          if (!KIT_NO_STEP[style.name]) drift.push(`  ${style.name}: no step`);
          continue;
        }
        const step = TYPE_SCALE[style.step as TypeStep];
        if (!step) drift.push(`  ${style.name}: unknown step ${style.step}`);
        else if (step.fontSize !== num(style.fontSize)) {
          drift.push(`  ${style.name}: ${style.fontSize} but ${style.step} is ${step.fontSize}px`);
        }
      }
    }
    expect(drift).toEqual([]);
  });

  it("every tracked kit style names its tracking step", () => {
    const drift: string[] = [];
    for (const g of KIT.type.groups) {
      if (g.name === "Scale" || g.name === "Tracking") continue;
      for (const style of g.styles) {
        if (style.letterSpacing === undefined) {
          if (style.tracking !== undefined) drift.push(`  ${style.name}: tracking with no letterSpacing`);
          continue;
        }
        if (style.tracking === undefined) {
          if (!KIT_UNTRACKED_SPACING[style.name]) drift.push(`  ${style.name}: letterSpacing with no tracking step`);
          continue;
        }
        const expected =
          style.tracking === "numeral"
            ? numeralTracking(num(style.fontSize))
            : TRACKING[style.tracking as TrackingStep];
        if (expected === undefined || expected !== num(style.letterSpacing)) {
          drift.push(`  ${style.name}: ${style.letterSpacing} but ${style.tracking} is ${expected}`);
        }
      }
    }
    expect(drift).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// The docs: Typography.md and DESIGN.md carry the same tables.
// ---------------------------------------------------------------------------

const DOCS = ["design/system/project/Typography.md", "DESIGN.md"];

describe.each(DOCS)("%s documents the scale", (doc) => {
  const text = fs.readFileSync(path.join(REPO_ROOT, doc), "utf8");

  it("has one row per step with its class, size and line height", () => {
    const missing = TYPE_STEP_NAMES.filter((name) => {
      const { fontSize, lineHeight } = TYPE_SCALE[name];
      return !text.includes(`| \`${name}\` | \`text-${name}\` | ${fontSize} | ${lineHeight} |`);
    });
    expect(missing).toEqual([]);
  });

  it("has one row per tracking step with its value", () => {
    const missing = TRACKING_NAMES.filter(
      (name) => !text.includes(`| \`${name}\` | \`tracking-${name}\` | ${TRACKING[name]}px |`),
    );
    expect(missing).toEqual([]);
  });

  it("documents Mono, Label and the migration table", () => {
    expect(text).toMatch(/Primitives: Mono and Label/);
    expect(text).toMatch(/How to migrate/);
  });
});
