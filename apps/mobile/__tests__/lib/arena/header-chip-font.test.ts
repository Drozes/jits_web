/**
 * Every chip glyph drawn as TEXT must exist in the bundled JetBrains Mono
 * Bold, or iOS draws it from a fallback font (different weight and baseline,
 * not 0.6em wide, so `estimateChipWidth` under-counts it). `○` (U+25CB) is
 * missing from the font, which is why it is drawn as a View (`VIEW_GLYPHS`).
 */
import * as fs from "fs";
import { VIEW_GLYPHS, type ChipGlyph } from "@/lib/arena/header-chip-model";
import { CONFIRM_COPY_COMPACT, CONFIRM_COPY_FULL } from "@/lib/arena/header-chip-model";

/** A minimal TrueType cmap (platform 3, encoding 1, format 4) lookup. */
function loadCmap(path: string): (cp: number) => number {
  const buf = fs.readFileSync(path);
  const numTables = buf.readUInt16BE(4);
  let cmap = -1;
  for (let i = 0; i < numTables; i++) {
    const rec = 12 + 16 * i;
    if (buf.toString("ascii", rec, rec + 4) === "cmap") cmap = buf.readUInt32BE(rec + 8);
  }
  if (cmap < 0) throw new Error("no cmap table");
  const subtables = buf.readUInt16BE(cmap + 2);
  for (let i = 0; i < subtables; i++) {
    const rec = cmap + 4 + 8 * i;
    const platform = buf.readUInt16BE(rec);
    const encoding = buf.readUInt16BE(rec + 2);
    const sub = cmap + buf.readUInt32BE(rec + 4);
    if (platform !== 3 || encoding !== 1 || buf.readUInt16BE(sub) !== 4) continue;
    const segX2 = buf.readUInt16BE(sub + 6);
    const ends = sub + 14;
    const starts = ends + segX2 + 2;
    const deltas = starts + segX2;
    const offsets = deltas + segX2;
    return (cp: number) => {
      for (let s = 0; s < segX2 / 2; s++) {
        if (cp > buf.readUInt16BE(ends + 2 * s)) continue;
        const start = buf.readUInt16BE(starts + 2 * s);
        if (cp < start) return 0;
        const delta = buf.readInt16BE(deltas + 2 * s);
        const ro = buf.readUInt16BE(offsets + 2 * s);
        if (ro === 0) return (cp + delta) & 0xffff;
        const g = buf.readUInt16BE(offsets + 2 * s + ro + 2 * (cp - start));
        return g === 0 ? 0 : (g + delta) & 0xffff;
      }
      return 0;
    };
  }
  throw new Error("no format 4 Unicode BMP cmap");
}

const glyphOf = loadCmap(
  require.resolve("@expo-google-fonts/jetbrains-mono/700Bold/JetBrainsMono_700Bold.ttf"),
);
const has = (ch: string) => glyphOf(ch.codePointAt(0)!) !== 0;

const ALL_GLYPHS: ChipGlyph[] = ["○", "●", "◌", "!"];

it("the lookup works: ASCII is present, U+25CB is not", () => {
  expect(has("A")).toBe(true);
  expect(has("○")).toBe(false);
});

it("every chip glyph drawn as text exists in the bundled Mono Bold", () => {
  for (const g of ALL_GLYPHS.filter((x) => !VIEW_GLYPHS.has(x))) {
    expect({ glyph: g, present: has(g) }).toEqual({ glyph: g, present: true });
  }
});

it("the offline ring is drawn as a View", () => {
  expect(VIEW_GLYPHS.has("○")).toBe(true);
});

it("the chip's separators and CONFIRM copy exist in the font", () => {
  for (const ch of new Set(Array.from(`· … ${CONFIRM_COPY_FULL}${CONFIRM_COPY_COMPACT}0123456789`))) {
    expect({ ch, present: has(ch) }).toEqual({ ch, present: true });
  }
});
