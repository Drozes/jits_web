/**
 * WP7 (jits-3eeg.8): the attention / heat tokens and the one on-media source.
 *
 *  - `onMediaTokens` (lib/tokens.ts) is the only on-media palette. `ON_MEDIA`
 *    and `BROADCAST` are aliases, and the merge must not change a single
 *    rendered value (Adding Flare's live HUD, ON AIR, countdown and Film Room
 *    chrome), so both are pinned here to the literals they held before.
 *  - The on-media contrast rule: text over media sits on `badge` (light inks)
 *    or `chip` (dark inks), and both grounds hold 4.5:1 over ANY frame.
 *  - `attention` reads at 4.5:1 on every surface in both themes; heat is fixed
 *    across themes.
 */
import { darkTokens, lightTokens, onMediaTokens } from "@/lib/tokens";
import { ON_MEDIA, paletteFor } from "@/lib/theme/palette";
import { BROADCAST } from "@/components/match-flow/live/broadcast-tokens";
import {
  AA_NORMAL_TEXT,
  SURFACE_KEYS,
  composite,
  contrast,
} from "../support/token-contrast";

declare const require: (id: string) => any;
declare const __dirname: string;

/** `ON_MEDIA` exactly as it was before the merge (lib/theme/palette.ts at 4b4f844). */
const ON_MEDIA_BEFORE = {
  white: "#FFFFFF",
  text: "#E8EDF2",
  text2: "rgba(232,237,242,0.72)",
  text3: "rgba(232,237,242,0.55)",
  tagText: "rgba(255,255,255,0.85)",
  strong: "rgba(255,255,255,0.40)",
  cta: "#E63946",
  red: "#F0556B",
  redRule: "rgba(240,85,107,0.7)",
  win: "#22C55E",
  amber: "#F59E0B",
  amberRule: "rgba(245,158,11,0.7)",
  track: "rgba(255,255,255,0.18)",
  glass: "rgba(255,255,255,0.08)",
  glassStrong: "rgba(255,255,255,0.12)",
  tag: "rgba(0,0,0,0.45)",
  badge: "rgba(0,0,0,0.88)",
  scrim: "rgba(0,0,0,0.55)",
  chip: "rgba(232,235,240,0.96)",
  chipBorder: "rgba(13,15,20,0.34)",
  ink: "#0D0F14",
  ink3: "#575C68",
  inkRed: "#AC2B34",
};

/** `BROADCAST` exactly as it was before the merge (broadcast-tokens.ts at 4b4f844). */
const BROADCAST_BEFORE = {
  black: "#000000",
  ground: "#0D0F14",
  ink: "#0D0F14",
  inkDark: "#E8EDF2",
  ink3: "#575C68",
  cta: "#E63946",
  ctaHover: "#F0556B",
  ctaText: "#AC2B34",
  amber: "#F59E0B",
  amberSoft: "rgba(245,158,11,0.16)",
  amberSpent: "rgba(245,158,11,0.22)",
  amberRule: "rgba(245,158,11,0.5)",
  slab: "rgba(13,15,20,0.92)",
  plate: "rgba(232,235,240,0.96)",
  plateBorder: "rgba(13,15,20,0.34)",
  glassFill: "rgba(255,255,255,0.12)",
  glassFillPressed: "rgba(255,255,255,0.20)",
  glassBorder: "rgba(255,255,255,0.40)",
  tagFill: "rgba(0,0,0,0.40)",
  tagText: "rgba(255,255,255,0.85)",
  tallyGlass: "rgba(13,15,20,0.72)",
  white: "#FFFFFF",
  dim62: "rgba(232,237,242,0.62)",
  body72: "rgba(232,237,242,0.72)",
  track: "rgba(13,15,20,0.25)",
  startingDim: "rgba(0,0,0,0.35)",
  savingDim: "rgba(0,0,0,0.55)",
};

describe("one on-media source", () => {
  it("ON_MEDIA is onMediaTokens itself", () => {
    expect(ON_MEDIA).toBe(onMediaTokens);
  });

  it("ON_MEDIA keeps every value it had before the merge", () => {
    expect(ON_MEDIA).toMatchObject(ON_MEDIA_BEFORE);
  });

  it("BROADCAST keeps every key and value it had before the merge", () => {
    expect({ ...BROADCAST }).toEqual(BROADCAST_BEFORE);
  });

  it("every BROADCAST value is an onMediaTokens value (no private literal)", () => {
    const source = new Set<string>(Object.values(onMediaTokens));
    const strays = Object.entries(BROADCAST).filter(([, v]) => !source.has(v));
    expect(strays).toEqual([]);
  });

  it("holds no duplicate value under two names", () => {
    // Two keys with one value is how the overlapping sets started. ink and
    // ground are the one sanctioned pair: same Void hex, different jobs
    // (dark ink on the chip vs the live screen's ground).
    const seen = new Map<string, string>();
    const dupes: string[] = [];
    for (const [key, value] of Object.entries(onMediaTokens)) {
      const prior = seen.get(value);
      const sanctioned = [prior, key].sort().join("+") === "ground+ink";
      if (prior !== undefined && !sanctioned) {
        dupes.push(`${prior} = ${key} (${value})`);
      }
      seen.set(value, prior ?? key);
    }
    expect(dupes).toEqual([]);
  });
});

describe("the on-media contrast rule", () => {
  const WHITE_FRAME = "#FFFFFF";
  const BLACK_FRAME = "#000000";
  const LIGHT_INKS = ["white", "text", "text2", "textDim", "text3", "tagText", "red", "win", "amber"] as const;
  const DARK_INKS = ["ink", "ink3", "inkRed"] as const;

  /** Ink over a translucent ground over a frame, both composited. */
  function onGround(ink: string, ground: string, frame: string): number {
    const g = composite(ground, frame);
    return contrast(composite(ink, g), g);
  }

  it.each(LIGHT_INKS)("light ink %s holds 4.5:1 on the badge over any frame", (key) => {
    for (const frame of [WHITE_FRAME, BLACK_FRAME]) {
      expect(onGround(onMediaTokens[key], onMediaTokens.badge, frame)).toBeGreaterThanOrEqual(
        AA_NORMAL_TEXT,
      );
    }
  });

  it.each(DARK_INKS)("dark ink %s holds 4.5:1 on the chip over any frame", (key) => {
    for (const frame of [WHITE_FRAME, BLACK_FRAME]) {
      expect(onGround(onMediaTokens[key], onMediaTokens.chip, frame)).toBeGreaterThanOrEqual(
        AA_NORMAL_TEXT,
      );
    }
  });

  it("the tag fill is NOT a text ground (why the rule exists)", () => {
    expect(onGround(onMediaTokens.tagText, onMediaTokens.tag, WHITE_FRAME)).toBeLessThan(
      AA_NORMAL_TEXT,
    );
  });
});

describe("attention and heat tokens", () => {
  it.each([
    ["dark", darkTokens],
    ["light", lightTokens],
  ] as const)("attention reads at 4.5:1 on every %s surface", (_theme, t) => {
    for (const surface of SURFACE_KEYS) {
      expect(contrast(t.attention, t[surface])).toBeGreaterThanOrEqual(AA_NORMAL_TEXT);
    }
  });

  it("keeps the shipped amber values", () => {
    expect(darkTokens.attention).toBe("#F59E0B");
    expect(lightTokens.attention).toBe("#92400E");
    expect(darkTokens.attentionRule).toBe("rgba(245,158,11,0.7)");
    expect(lightTokens.attentionRule).toBe("rgba(146,64,14,0.6)");
  });

  it("the match-flow palette reads amber from the token", () => {
    expect(paletteFor("dark").amber).toBe(darkTokens.attention);
    expect(paletteFor("light").amber).toBe(lightTokens.attention);
    expect(paletteFor("dark").amberRule).toBe(darkTokens.attentionRule);
    expect(paletteFor("light").amberRule).toBe(lightTokens.attentionRule);
  });

  it("heat is fixed across themes and keeps the shipped values", () => {
    expect(darkTokens.heatOrange).toBe(lightTokens.heatOrange);
    expect(darkTokens.heatRed).toBe(lightTokens.heatRed);
    expect(darkTokens.heatOrange).toBe("hsl(25, 95%, 53%)");
    expect(darkTokens.heatRed).toBe("#EC6A74");
  });

  it("on-media amber is the dark attention value", () => {
    expect(onMediaTokens.amber).toBe(darkTokens.attention);
    expect(onMediaTokens.amberRule).toBe(darkTokens.attentionRule);
  });
});

describe("no amber or heat literal outside the token files", () => {
  // Guard for CO-3 / AR-4: amber reaches components only through the
  // `attention` token (classes, usePalette, useAmber, ON_MEDIA) and heat only
  // through `heatOrange` / `heatRed`.
  const fs = require("fs");
  const path = require("path");
  const MOBILE_ROOT = path.resolve(__dirname, "..", "..");
  const ALLOWED = new Set(["lib/tokens.ts"]);
  const PATTERN =
    /#f59e0b|#92400e|245,\s*158,\s*11|146,\s*64,\s*14|\b(?:text|bg|border)-amber-\d|bg-brand-orange|#ec6a74|#f97415/i;

  function walk(dir: string, out: string[] = []): string[] {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (entry.name !== "node_modules") walk(full, out);
      } else if (/\.tsx?$/.test(entry.name)) {
        out.push(full);
      }
    }
    return out;
  }

  it("finds none in app/, components/ or lib/", () => {
    const offenders = ["app", "components", "lib"]
      .flatMap((dir) => walk(path.join(MOBILE_ROOT, dir)))
      .map((file: string) => path.relative(MOBILE_ROOT, file))
      .filter((rel: string) => !ALLOWED.has(rel))
      .filter((rel: string) => PATTERN.test(fs.readFileSync(path.join(MOBILE_ROOT, rel), "utf8")));
    expect(offenders).toEqual([]);
  });
});
