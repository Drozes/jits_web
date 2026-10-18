// @vitest-environment node
import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { BLOCK_B3 } from "./block-b3";
import { BLOCK_B3_SM } from "./block-b3-sm";
import { HORIZONTAL_H1 } from "./horizontal-h1";
import { ONELINE_DETAIL } from "./oneline-detail";
import { ONELINE_FINE } from "./oneline-fine";
import { ONELINE_SMALL } from "./oneline-small";
import type { LockupArt } from "./types";

/** All paths in document order (loose paths first, then each group's). */
function allPaths(art: LockupArt) {
  return [...(art.paths ?? []), ...art.groups.flatMap((g) => g.paths)];
}

const sha16 = (s: string) => createHash("sha256").update(s).digest("hex").slice(0, 16);

// specs/web-landing/addendum-teaser-v2.md section 1.2, computed from
// Thomas's index.html on 2026-10-17: the "verbatim" proof.
const FINGERPRINTS: Array<[string, LockupArt, string, number | null, number, string]> = [
  ["horizontal H1", HORIZONTAL_H1, "0 -30 137 31", null, 6, "6bf21115fe141c0d"],
  ["block B3", BLOCK_B3, "0 -136.53 144 165.78", 52, 13, "36f3914aea973dd9"],
  ["block B3-sm", BLOCK_B3_SM, "0 -68.76 72 83.39", 26, 13, "f2548ba9c0ce9f3d"],
  ["one-line detail", ONELINE_DETAIL, "0 0 440 331.96", 100, 10, "2fdbfeb1f66bc229"],
  ["one-line fine", ONELINE_FINE, "0 0 440 332.91", 100, 10, "4aaf77d0676481a0"],
  ["one-line small", ONELINE_SMALL, "0 0 440 331.05", 100, 12, "302e30c91c7b84ec"],
];

describe("Thomas's lockups are verbatim", () => {
  it.each(FINGERPRINTS)("%s matches its fingerprint", (_name, art, viewBox, x, count, prefix) => {
    expect(art.viewBox).toBe(viewBox);
    expect(art.x).toBe(x);
    const paths = allPaths(art);
    expect(paths).toHaveLength(count);
    expect(sha16(paths.map((p) => p.d).join("\n"))).toBe(prefix);
  });

  it.each(FINGERPRINTS)("%s keeps the logo fills", (_name, art) => {
    const fills = new Set([...allPaths(art).map((p) => p.fill), ...art.groups.map((g) => g.fill)].filter(Boolean));
    for (const f of fills) expect(["#E8EDF2", "#050609", "#E63946", "#9CA3AF"]).toContain(f);
    const bar = allPaths(art).find((p) => p.part === "crown-belt-bar");
    expect(bar?.fill).toBe("#E63946");
    expect(allPaths(art).find((p) => p.part === "crown-belt")?.fill).toBe("#050609");
  });

  it("keeps the hero lockups' group structure", () => {
    for (const art of [BLOCK_B3, BLOCK_B3_SM]) expect(art.groups.map((g) => g.lk)).toEqual(["we", "crown", "word", "you"]);
    for (const art of [ONELINE_DETAIL, ONELINE_FINE, ONELINE_SMALL]) {
      expect(art.groups.map((g) => g.lk)).toEqual(["we", "crown", "word", "you"]);
      expect(art.groups.find((g) => g.lk === "crown")?.innerTransform).toMatch(/^translate\(.+\) scale\(.+\)$/);
    }
    expect(BLOCK_B3.groups.find((g) => g.lk === "word")?.paths.map((p) => p.lk)).toEqual(["w1", "w2"]);
    expect(ONELINE_DETAIL.groups.find((g) => g.lk === "word")?.paths.map((p) => p.lk)).toEqual(["w1"]);
  });
});
