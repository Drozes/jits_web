/**
 * WP5 guard (jits-3eeg.6; R3 TY-1, TY-2, TY-4, A1-3): the type scale is the
 * only source of sizes, tracking and the 10px floor. Grep-style ratchet, so
 * the WP5 sweeps (5a: Arena, Rankings, Profile, Home, invites; 5b: match flow,
 * Film Room, match detail) can only LOWER the counts:
 *
 * - arbitrarySize:      `text-[Npx]` classes (use `text-<step>`).
 * - inlineFontSize:     `fontSize: N`, `fontSize: c ? N : M`, `fontSize={N}`
 *                       literals (use `typeStep("<step>")`, `<Mono size>`, `<Label size>`).
 * - belowFloor:         any of the above under 10px (A1-3).
 * - remSize:            rem-named Tailwind sizes `text-xs|sm|base|lg|xl|2xl..9xl`
 *                       (12.25px and friends at rem 14; use the step instead).
 * - offScaleTracking:   `tracking-[...]` and `letterSpacing: N` whose N is not a
 *                       TRACKING step (use `tracking-<step>` / `TRACKING["<step>"]`,
 *                       or `numeralTracking(px)` for hero numerals).
 * - monoWithoutTabular: a `<Text>` tag in `font-mono*` with no `tabular-nums`,
 *                       `TABULAR` or `fontVariant` (TY-4; or use `<Mono>` / `<Label>`).
 *
 * The baseline (`__tests__/fixtures/typography-baseline.json`) holds the
 * per-file counts at WP5-core. A count ABOVE the baseline fails (a new
 * literal); a count BELOW it also fails until the baseline is lowered, so the
 * ratchet always records progress. To lower it after a sweep:
 *
 *   UPDATE_TYPOGRAPHY_BASELINE=1 npx jest __tests__/components/ui/typography-guard
 *
 * which rewrites the fixture with the lower counts only (never higher). The
 * migration table is in design/system/project/Typography.md "How to migrate".
 */
import * as fs from "fs";
import * as path from "path";
import { TEXT_FLOOR, TRACKING } from "@/lib/typography";

const ROOT = path.resolve(__dirname, "../../..");
const SCAN = ["app", "components", "lib"];
const BASELINE_PATH = path.resolve(__dirname, "../../fixtures/typography-baseline.json");

/** The scale's own definition is not a call site. */
const EXCLUDED = new Set(["lib/typography.ts"]);

/**
 * Registered moments that keep an off-scale literal on purpose (DESIGN.md
 * "Typography" and the Motion registry). Each is pinned to an exact count of
 * an exact pattern, is subtracted from the ratchet, and must never move.
 */
interface Sanctioned {
  file: string;
  metric: Metric;
  pattern: RegExp;
  count: number;
  reason: string;
}
const SANCTIONED: Sanctioned[] = [
  {
    file: "components/ui/count-pill.tsx",
    metric: "belowFloor",
    pattern: /\btext-\[9px\]/g,
    count: 1,
    reason: "the CountPill digit (9px, capped at 1.3x Dynamic Type), the one sanctioned sub-10px text",
  },
  {
    file: "components/ui/elo-system/splash-statement.tsx",
    metric: "inlineFontSize",
    pattern: /\bfontSize:\s*15\b/g,
    count: 1,
    reason: 'the splash "WE ARE" line (15px), a registered Adding Flare splash moment',
  },
  {
    file: "components/ui/elo-system/splash-statement.tsx",
    metric: "offScaleTracking",
    pattern: /\bletterSpacing:\s*(6\.3|3\.6)\b/g,
    count: 2,
    reason: "the splash statement's 0.42em / 0.15em tracking (6.3, 3.6)",
  },
  {
    file: "components/ui/elo-system/splash-glow-statement.tsx",
    metric: "inlineFontSize",
    pattern: /\bfontSize:\s*15\b/g,
    count: 1,
    reason: 'the glow splash "WE ARE" line (15px), a registered Adding Flare splash moment',
  },
  {
    file: "components/ui/elo-system/splash-glow-statement.tsx",
    metric: "offScaleTracking",
    pattern: /\bletterSpacing:\s*(6\.3|3\.6)\b/g,
    count: 2,
    reason: "the glow splash statement's 0.42em / 0.15em tracking (6.3, 3.6)",
  },
  {
    file: "components/ui/elo-system/splash-reveal.tsx",
    metric: "offScaleTracking",
    pattern: /\bletterSpacing:\s*3\b/g,
    count: 1,
    reason: "the splash reveal tagline tracking (3), a registered splash moment",
  },
  {
    file: "components/match-flow/countdown/countdown.tsx",
    metric: "offScaleTracking",
    pattern: /\bletterSpacing:\s*2\b/g,
    count: 1,
    reason: "the GO slam's 2px tracking (Adding Flare countdown)",
  },
];

/** Files built on the scale: zero literals, zero untracked or untabular mono, from day one. */
const STRICT_FILES = [
  "components/ui/elo-system/mono.tsx",
  "components/ui/elo-system/label.tsx",
  "components/ui/elo-system/meta-tag.tsx",
];

const METRICS = [
  "arbitrarySize",
  "inlineFontSize",
  "belowFloor",
  "remSize",
  "offScaleTracking",
  "monoWithoutTabular",
] as const;
type Metric = (typeof METRICS)[number];
type Counts = Record<Metric, number>;

function sources(): { file: string; text: string }[] {
  const out: { file: string; text: string }[] = [];
  const walk = (dir: string) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (entry.name === "node_modules" || entry.name === "__tests__") continue;
        walk(p);
      } else if (/\.(tsx?|jsx?)$/.test(entry.name)) {
        const file = path.relative(ROOT, p);
        if (!EXCLUDED.has(file)) out.push({ file, text: fs.readFileSync(p, "utf8") });
      }
    }
  };
  for (const d of SCAN) walk(path.join(ROOT, d));
  return out.sort((a, b) => a.file.localeCompare(b.file));
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

const NUM = String.raw`(\d+(?:\.\d+)?)`;
const ARBITRARY_SIZE = new RegExp(String.raw`\btext-\[${NUM}px\]`, "g");
const FONT_SIZE_LITERAL = new RegExp(String.raw`\bfontSize\s*:\s*${NUM}(?![\w.\[])`, "g");
const FONT_SIZE_TERNARY = new RegExp(
  String.raw`\bfontSize\s*:\s*[\w.!]+\s*\?\s*${NUM}\s*:\s*${NUM}(?![\w.\[])`,
  "g",
);
const FONT_SIZE_PROP = new RegExp(String.raw`\bfontSize=\{\s*${NUM}\s*\}`, "g");
/** Word-bounded, so `text-small` / `text-xs-foo` never count. */
const REM_SIZE = /(?<![\w-])text-(xs|sm|base|lg|[2-9]?xl)(?![\w-])/g;
const ARBITRARY_TRACKING = /\btracking-\[[^\]]+\]/g;
const LETTER_SPACING_LITERAL = new RegExp(String.raw`\bletterSpacing\s*:\s*(-?\s*${NUM})(?![\w.\[])`, "g");

const ON_SCALE_TRACKING = new Set<number>(Object.values(TRACKING));

/** The counts for one file's source. Exported shape is the fixture's. */
function countTypography(text: string): Counts {
  const sizes: number[] = [];
  let arbitrarySize = 0;
  let inlineFontSize = 0;
  for (const m of text.matchAll(ARBITRARY_SIZE)) {
    arbitrarySize++;
    sizes.push(Number(m[1]));
  }
  for (const m of text.matchAll(FONT_SIZE_LITERAL)) {
    inlineFontSize++;
    sizes.push(Number(m[1]));
  }
  for (const m of text.matchAll(FONT_SIZE_TERNARY)) {
    inlineFontSize++;
    sizes.push(Number(m[1]), Number(m[2]));
  }
  for (const m of text.matchAll(FONT_SIZE_PROP)) {
    inlineFontSize++;
    sizes.push(Number(m[1]));
  }
  const belowFloor = sizes.filter((px) => px < TEXT_FLOOR).length;

  let offScaleTracking = (text.match(ARBITRARY_TRACKING) ?? []).length;
  for (const m of text.matchAll(LETTER_SPACING_LITERAL)) {
    const value = Number(m[1].replace(/\s+/g, ""));
    if (!ON_SCALE_TRACKING.has(value)) offScaleTracking++;
  }

  let monoWithoutTabular = 0;
  for (const tag of [...openingTags(text, "Text"), ...openingTags(text, "Animated\\.Text")]) {
    if (/\bfont-mono(-medium|-bold)?\b/.test(tag) && !/tabular-nums|TABULAR|fontVariant/.test(tag)) {
      monoWithoutTabular++;
    }
  }

  const remSize = (text.match(REM_SIZE) ?? []).length;

  return { arbitrarySize, inlineFontSize, belowFloor, remSize, offScaleTracking, monoWithoutTabular };
}

type Baseline = { _note?: string; files: Record<string, Partial<Counts>> };

/** One line per file (sorted), so the two sweeps' edits rarely touch the same line. */
function serializeBaseline(baseline: Baseline): string {
  const rows = Object.keys(baseline.files)
    .sort()
    .map((file) => `  ${JSON.stringify(file)}: ${JSON.stringify(baseline.files[file]).replace(/,/g, ", ").replace(/:/g, ": ")}`);
  return `{\n "_note": ${JSON.stringify(baseline._note ?? "")},\n "files": {\n${rows.join(",\n")}\n }\n}\n`;
}

function readBaseline(): Baseline {
  return JSON.parse(fs.readFileSync(BASELINE_PATH, "utf8")) as Baseline;
}

const FILES = sources();
const CURRENT: Record<string, Counts> = Object.fromEntries(
  FILES.map(({ file, text }) => [file, countTypography(text)]),
);

function baselineCount(baseline: Baseline, file: string, metric: Metric): number {
  return baseline.files[file]?.[metric] ?? 0;
}

/** Sanctioned sub-10px sizes are not counted against the ratchet. */
function effective(file: string, metric: Metric): number {
  const n = CURRENT[file]?.[metric] ?? 0;
  const sanctioned = SANCTIONED.filter((s) => s.file === file && s.metric === metric).reduce((sum, s) => sum + s.count, 0);
  return Math.max(0, n - sanctioned);
}

// Lower-only rewrite of the fixture (see the header).
if (process.env.UPDATE_TYPOGRAPHY_BASELINE === "1") {
  const baseline = readBaseline();
  const files: Record<string, Partial<Counts>> = {};
  const all = new Set([...Object.keys(baseline.files), ...Object.keys(CURRENT)]);
  for (const file of [...all].sort()) {
    const row: Partial<Counts> = {};
    for (const metric of METRICS) {
      const now = effective(file, metric);
      const was = baselineCount(baseline, file, metric);
      const keep = Math.min(now, was);
      if (keep > 0) row[metric] = keep;
    }
    if (Object.keys(row).length > 0) files[file] = row;
  }
  fs.writeFileSync(BASELINE_PATH, serializeBaseline({ _note: baseline._note, files }));
}

describe("typography ratchet (WP5)", () => {
  const baseline = readBaseline();

  it.each(METRICS)("no file has more %s than its baseline", (metric) => {
    const over: string[] = [];
    for (const file of Object.keys(CURRENT)) {
      const now = effective(file, metric);
      const allowed = baselineCount(baseline, file, metric);
      if (now > allowed) over.push(`  ${file}: ${metric} ${now} > baseline ${allowed}`);
    }
    expect(over).toEqual([]);
  });

  it.each(METRICS)("the %s baseline is current (lower it after a sweep)", (metric) => {
    const stale: string[] = [];
    for (const file of Object.keys(baseline.files)) {
      const now = effective(file, metric);
      const allowed = baselineCount(baseline, file, metric);
      if (now < allowed) {
        stale.push(`  ${file}: ${metric} is ${now}, baseline says ${allowed} (run UPDATE_TYPOGRAPHY_BASELINE=1)`);
      }
    }
    expect(stale).toEqual([]);
  });

  it.each(SANCTIONED.map((s) => [`${s.file} ${s.metric}`, s] as const))(
    "sanctioned moment is still exactly as registered: %s",
    (_label, s) => {
      const text = FILES.find((f) => f.file === s.file)?.text ?? "";
      expect({ reason: s.reason, matches: (text.match(s.pattern) ?? []).length }).toEqual({
        reason: s.reason,
        matches: s.count,
      });
      expect(CURRENT[s.file][s.metric]).toBeGreaterThanOrEqual(s.count);
    },
  );

  it("the components built on the scale have no literal, off-scale or untabular text", () => {
    for (const file of STRICT_FILES) {
      expect({ file, counts: CURRENT[file] }).toEqual({
        file,
        counts: {
          arbitrarySize: 0,
          inlineFontSize: 0,
          belowFloor: 0,
          remSize: 0,
          offScaleTracking: 0,
          monoWithoutTabular: 0,
        },
      });
      expect(baseline.files[file]).toBeUndefined();
    }
  });
});

describe("typography ratchet counter (not vacuous)", () => {
  it("counts each literal kind", () => {
    const sample = [
      `<Text className="font-mono text-[10px] text-[9px] tracking-[4px]">1</Text>`,
      `<Text className="font-mono tabular-nums">2</Text>`,
      `<Animated.Text className="font-mono-bold" style={{ fontSize: 8, letterSpacing: 0.8 }}>3</Animated.Text>`,
      `<Text style={{ fontSize: win ? 96 : 80, letterSpacing: 1.68 }} />`,
      `<Initials fontSize={34} />`,
      `<Text style={{ fontSize: px, letterSpacing: -SIZE * 0.04, fontSize: SIZE_PX[size] }} />`,
      `<Text className="text-sm text-2xl text-small text-body text-xs-foo" />`,
    ].join("\n");
    expect(countTypography(sample)).toEqual({
      arbitrarySize: 2,
      inlineFontSize: 3,
      belowFloor: 2,
      remSize: 2,
      offScaleTracking: 2,
      monoWithoutTabular: 2,
    });
  });
});
