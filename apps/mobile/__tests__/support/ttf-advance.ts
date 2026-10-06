/**
 * Reads glyph advance widths straight from a TrueType file, so a test can
 * measure a label the way the device lays it out (sum of advances plus
 * letter-spacing) without a renderer. Only the tables needed for that are
 * parsed: head (unitsPerEm), hhea (numberOfHMetrics), hmtx and a format 4
 * cmap. Kerning is ignored, which only ever over-estimates caps labels
 * slightly, so a "fits" assertion stays conservative.
 */
declare const __dirname: string;
const fs = require("fs") as { readFileSync: (p: string) => Uint8Array; existsSync: (p: string) => boolean };
const path = require("path") as { join: (...p: string[]) => string; dirname: (p: string) => string };

export interface FontMetrics {
  unitsPerEm: number;
  /** Advance of the glyph for `char`, in font units. */
  advance: (char: string) => number;
}

/** Finds a file under the nearest `node_modules` walking up from this folder. */
export function resolveFromNodeModules(rel: string): string {
  let dir = __dirname;
  for (;;) {
    const candidate = path.join(dir, "node_modules", rel);
    if (fs.existsSync(candidate)) return candidate;
    const parent = path.dirname(dir);
    if (parent === dir) throw new Error(`not found in any node_modules: ${rel}`);
    dir = parent;
  }
}

export function loadFontMetrics(file: string): FontMetrics {
  const bytes = fs.readFileSync(file);
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const tables = new Map<string, number>();
  const numTables = view.getUint16(4);
  for (let i = 0; i < numTables; i += 1) {
    const rec = 12 + i * 16;
    const tag = String.fromCharCode(...Array.from(bytes.subarray(rec, rec + 4)));
    tables.set(tag, view.getUint32(rec + 8));
  }
  const table = (tag: string) => {
    const off = tables.get(tag);
    if (off === undefined) throw new Error(`font has no ${tag} table`);
    return off;
  };

  const unitsPerEm = view.getUint16(table("head") + 18);
  const numberOfHMetrics = view.getUint16(table("hhea") + 34);
  const hmtx = table("hmtx");

  // The Windows Unicode BMP subtable (3, 1), format 4.
  const cmap = table("cmap");
  let sub = -1;
  for (let i = 0; i < view.getUint16(cmap + 2); i += 1) {
    const rec = cmap + 4 + i * 8;
    if (view.getUint16(rec) === 3 && view.getUint16(rec + 2) === 1) sub = cmap + view.getUint32(rec + 4);
  }
  if (sub < 0 || view.getUint16(sub) !== 4) throw new Error("font has no format 4 (3,1) cmap");
  const segX2 = view.getUint16(sub + 6);
  const ends = sub + 14;
  const starts = ends + segX2 + 2;
  const deltas = starts + segX2;
  const rangeOffsets = deltas + segX2;

  const glyphOf = (code: number): number => {
    for (let i = 0; i < segX2; i += 2) {
      if (code > view.getUint16(ends + i)) continue;
      const start = view.getUint16(starts + i);
      if (code < start) return 0;
      const delta = view.getInt16(deltas + i);
      const ro = view.getUint16(rangeOffsets + i);
      if (ro === 0) return (code + delta) & 0xffff;
      const g = view.getUint16(rangeOffsets + i + ro + (code - start) * 2);
      return g === 0 ? 0 : (g + delta) & 0xffff;
    }
    return 0;
  };

  return {
    unitsPerEm,
    advance: (char: string) => {
      const g = glyphOf(char.codePointAt(0) ?? 0);
      const idx = Math.min(g, numberOfHMetrics - 1);
      return view.getUint16(hmtx + idx * 4);
    },
  };
}

/** Laid-out width of `text` at `fontSize` with `letterSpacing` after every glyph. */
export function measureLine(font: FontMetrics, text: string, fontSize: number, letterSpacing: number): number {
  let units = 0;
  for (const ch of text) units += font.advance(ch);
  return (units * fontSize) / font.unitsPerEm + letterSpacing * [...text].length;
}
