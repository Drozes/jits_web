/**
 * WP5a (jits-3eeg.6): the className-heavy screens moved onto the type scale.
 * These pin the parts the typography ratchet cannot see:
 *
 * - TextInputs take `typeSize` (font size only, no line height), so iOS
 *   single-line inputs keep their caret (Typography.md "How to migrate").
 * - Size tables keyed by step render the same pixels as the old literals
 *   (Wordmark, DeltaNumber, EloTile).
 * - The hero ELO on the profile and competitor pages is mono, tabular, with
 *   numeral tracking (R3 PR-3).
 * - Every caps label in the 5a areas carries a caps tracking step (R3 TY-3,
 *   AR-1, AR-6, ST-5); 11px mono data lines in strips stay untracked.
 */
import * as fs from "fs";
import * as path from "path";
import * as React from "react";
import { StyleSheet, TextInput } from "react-native";
import { render } from "@testing-library/react-native";
import { AuthFormField } from "@/components/auth/auth-form-field";
import { EloTextInput } from "@/components/profile-setup/elo-form-field";
import { Wordmark } from "@/components/ui/elo-system/wordmark";
import { DeltaNumber } from "@/components/ui/elo-system/delta-number";
import { EloTile } from "@/components/ui/elo-system/elo-tile";
import { numeralTracking } from "@/lib/typography";

const flat = (style: unknown): Record<string, unknown> => (StyleSheet.flatten(style as never) ?? {}) as Record<string, unknown>;

describe("TextInputs take typeSize (size only, no line height)", () => {
  it.each([
    ["AuthFormField", () => <AuthFormField label="Email" />],
    ["EloTextInput", () => <EloTextInput accessibilityLabel="Weight" />],
  ])("%s renders 14px with no lineHeight and no size class", (_name, make) => {
    const input = render(make()).UNSAFE_getByType(TextInput);
    const style = flat(input.props.style);
    expect(style.fontSize).toBe(14);
    expect(style.lineHeight).toBeUndefined();
    expect(String(input.props.className)).not.toMatch(/\btext-(\[|callout|body|small|micro|caption)/);
  });

  it("keeps a caller's style on EloTextInput", () => {
    const input = render(<EloTextInput accessibilityLabel="Weight" style={{ minHeight: 99 }} />).UNSAFE_getByType(
      TextInput,
    );
    expect(flat(input.props.style)).toMatchObject({ fontSize: 14, minHeight: 99 });
  });
});

describe("size tables keyed by step keep their pixels", () => {
  it.each([
    ["sm", 18],
    ["md", 22],
    ["lg", 48],
    ["hero", 72],
  ] as const)("Wordmark %s is %ipx with a matching line height", (size, px) => {
    const text = render(<Wordmark size={size} />).getByText("ELO RATED");
    expect(flat(text.props.style)).toMatchObject({ fontSize: px, lineHeight: px });
  });

  it.each([
    ["s", 12, 10],
    ["m", 16, 13],
    ["l", 28, 22],
  ] as const)("DeltaNumber %s: number %ipx, arrow %ipx", (size, numberPx, glyphPx) => {
    const u = render(<DeltaNumber value={14} size={size} />);
    expect(flat(u.getByText("14").props.style)).toEqual({
      fontSize: numberPx,
      lineHeight: Math.round(numberPx * 1.2),
    });
    expect(flat(u.getByText("▲").props.style)).toEqual({ fontSize: glyphPx, lineHeight: numberPx });
  });

  it.each([
    ["hero", 96],
    ["large", 64],
    ["medium", 44],
    ["small", 36],
  ] as const)("EloTile %s number is %ipx with numeral tracking", (size, px) => {
    const text = render(<EloTile value={1512} size={size} />).getByText("1512");
    expect(flat(text.props.style)).toMatchObject({
      fontSize: px,
      lineHeight: px * 1.1,
      letterSpacing: numeralTracking(px),
      fontVariant: ["tabular-nums"],
    });
    expect(numeralTracking(px)).toBeCloseTo(-px * 0.04, 10);
  });
});

describe("hero ELO numerals (R3 PR-3)", () => {
  const ROOT = path.resolve(__dirname, "../../..");
  it.each(["components/profile/profile-header.tsx", "components/athlete/competitor-header.tsx"])(
    "%s sets the ELO with Mono at display-72, numeral tracking",
    (file) => {
      const src = fs.readFileSync(path.join(ROOT, file), "utf8");
      expect(src).toMatch(/<Mono size="display-72" weight="bold" tracking="numeral"[^>]*>\s*\{athlete\.current_elo\}/);
    },
  );
});


describe("caps labels are tracked in the WP5a areas (R3 TY-3)", () => {
  const ROOT = path.resolve(__dirname, "../../..");
  const DIRS = [
    "app",
    "components/arena",
    "components/invite",
    "components/profile",
    "components/athlete",
    "components/leaderboard",
    "components/dashboard",
    "components/layout",
    "components/settings",
    "components/updates",
    "components/admin",
    "components/auth",
    "components/profile-setup",
    "components/notifications",
    "components/ui",
  ];
  /** WP5b and the protected Adding Flare moments are out of 5a scope. */
  const OWNED_ELSEWHERE =
    /^app\/\(app\)\/(match|video)\/|^components\/ui\/(elo-system\/)?(rolling-number|delta-chip|splash-|live-pill|er-mark|steel-sheen|pressable-scale)/;
  /** Whole files that are genuine exceptions, with the reason. */
  const ALLOWED_FILES: Record<string, string> = {
    // The chip's width budget (lib/arena/header-chip-model.ts estimateChipWidth)
    // assumes untracked JetBrains Mono advances; tracking it needs a fit-model
    // change (deferred to its own bead).
    "components/layout/header-status-chip.tsx": "header chip fit model",
    // Mono's opt-in `caps`: the caller picks the tracking with the `tracking` prop.
    "components/ui/elo-system/mono.tsx": "tracking comes from the tracking prop",
  };
  /**
   * 11px mono data lines in strips stay untracked (Typography.md "Rules": caps
   * tracking is for labels; a data line carries a name or figures that must not
   * truncate), matching the kit ChallengeStrip card. Pinned to exact counts.
   */
  const DATA_LINE = /\bfont-mono(-medium|-bold)?\b.*\btext-caption\b.*\buppercase\b/;
  const DATA_LINES: Record<string, number> = {
    "components/arena/mat-board.tsx": 7,
    "components/invite/booked-strip.tsx": 1,
  };
  /** A caps tracking step (CAPS_TRACKING in lib/typography.ts), not just any tracking. */
  const CAPS_STEP = /\btracking-caps(-l|-xl|-xxl)?\b/;

  function files(dir: string): string[] {
    const abs = path.join(ROOT, dir);
    if (!fs.existsSync(abs)) return [];
    return fs.readdirSync(abs, { withFileTypes: true }).flatMap((e) => {
      const rel = path.join(dir, e.name);
      if (e.isDirectory()) return files(rel);
      return /\.tsx?$/.test(e.name) ? [rel] : [];
    });
  }

  /** Root components/*.tsx (share sheet, compare stats, match card, banners). */
  function rootComponents(): string[] {
    return fs
      .readdirSync(path.join(ROOT, "components"), { withFileTypes: true })
      .filter((e) => e.isFile() && /\.tsx?$/.test(e.name))
      .map((e) => path.join("components", e.name));
  }

  it("every caps class string sets a caps tracking step (caps to caps-xxl)", () => {
    const offenders: string[] = [];
    const dataLines: Record<string, number> = {};
    for (const file of [...DIRS.flatMap(files), ...rootComponents()]) {
      if (OWNED_ELSEWHERE.test(file) || file in ALLOWED_FILES) continue;
      fs.readFileSync(path.join(ROOT, file), "utf8")
        .split("\n")
        .forEach((line, i) => {
          // A class string: `uppercase` next to a font or size class (multi-line cn() strings too).
          if (!/\buppercase\b/.test(line) || !/\b(font|text)-/.test(line) || CAPS_STEP.test(line)) return;
          if (file in DATA_LINES && DATA_LINE.test(line)) {
            dataLines[file] = (dataLines[file] ?? 0) + 1;
            return;
          }
          offenders.push(`${file}:${i + 1}`);
        });
    }
    expect(offenders).toEqual([]);
    expect(dataLines).toEqual(DATA_LINES);
  });
});
