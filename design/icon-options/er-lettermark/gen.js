const opentype = require("opentype.js");
const fs = require("fs");

const VOID = "#0D0F14";
const WHITE = "#E8EDF2";
const RED = "#E63946";
const CANVAS = 1024;

// Build an E·R lettermark SVG from real glyph outlines.
// opts: fontPath, out, dot(bool), letters("ER"),
//   capTarget (cap height as fraction of canvas),
//   widthCap (max ink width as fraction of canvas),
//   gapF (gap each side of dot, fraction of capH),
//   dotF (dot side, fraction of capH),
//   tightGapF (letter gap when no dot, fraction of capH),
//   dotYNudge (fraction of capH, +down)
function build(opts) {
  const {
    fontPath, out, dot = true,
    capTarget = 0.40, widthCap = 0.70,
    gapF = 0.27, dotF = 0.115, tightGapF = 0.12, dotYNudge = 0.0,
    transparent = false,
  } = opts;
  const _buf = fs.readFileSync(fontPath);
  const font = opentype.parse(_buf.buffer.slice(_buf.byteOffset, _buf.byteOffset + _buf.byteLength));

  const glyph = (ch, size) => {
    const p = font.getPath(ch, 0, 0, size);
    const b = p.getBoundingBox();
    return { p, b, w: b.x2 - b.x1, top: b.y1, bot: b.y2 };
  };

  // measure at reference size, then scale to hit cap-height & width targets
  const REF = 1000;
  const E0 = glyph("E", REF), R0 = glyph("R", REF);
  const capH0 = Math.max(E0.bot, R0.bot) - Math.min(E0.top, R0.top);

  // first pass size from cap height
  let size = REF * (capTarget * CANVAS) / capH0;
  let E = glyph("E", size), R = glyph("R", size);
  let capH = Math.max(E.bot, R.bot) - Math.min(E.top, R.top);
  let dotSize = dot ? capH * dotF : 0;
  let gap = dot ? capH * gapF : capH * tightGapF;
  let totalW = E.w + gap + dotSize + gap * (dot ? 1 : 0) + R.w;
  if (!dot) totalW = E.w + gap + R.w;

  // if too wide, rescale down to width cap
  const maxW = widthCap * CANVAS;
  if (totalW > maxW) {
    const k = maxW / totalW;
    size *= k;
    E = glyph("E", size); R = glyph("R", size);
    capH = Math.max(E.bot, R.bot) - Math.min(E.top, R.top);
    dotSize = dot ? capH * dotF : 0;
    gap = dot ? capH * gapF : capH * tightGapF;
    totalW = dot ? E.w + gap + dotSize + gap + R.w : E.w + gap + R.w;
  }

  const startX = (CANVAS - totalW) / 2;
  const capTop = Math.min(E.top, R.top);
  const capBot = Math.max(E.bot, R.bot);
  const capMid = (capTop + capBot) / 2;
  const offY = CANVAS / 2 - capMid; // shift baseline so caps center vertically

  const exOff = startX - E.b.x1;
  const dotX = startX + E.w + gap;
  const rxLeft = dot ? dotX + dotSize + gap : startX + E.w + gap;
  const rxOff = rxLeft - R.b.x1;

  const ePath = E.p.toPathData(2);
  const rPath = R.p.toPathData(2);

  const parts = [];
  parts.push(`<svg xmlns="http://www.w3.org/2000/svg" width="${CANVAS}" height="${CANVAS}" viewBox="0 0 ${CANVAS} ${CANVAS}">`);
  if (!transparent) parts.push(`<rect width="${CANVAS}" height="${CANVAS}" fill="${VOID}"/>`);
  parts.push(`<g fill="${WHITE}">`);
  parts.push(`<path transform="translate(${exOff.toFixed(2)} ${offY.toFixed(2)})" d="${ePath}"/>`);
  parts.push(`<path transform="translate(${rxOff.toFixed(2)} ${offY.toFixed(2)})" d="${rPath}"/>`);
  parts.push(`</g>`);
  if (dot) {
    const dy = CANVAS / 2 - dotSize / 2 + dotYNudge * capH;
    parts.push(`<rect x="${dotX.toFixed(2)}" y="${dy.toFixed(2)}" width="${dotSize.toFixed(2)}" height="${dotSize.toFixed(2)}" fill="${RED}"/>`);
  }
  parts.push(`</svg>`);
  fs.writeFileSync(out, parts.join("\n"));
  console.log(`wrote ${out}  size=${size.toFixed(0)} capH=${capH.toFixed(0)} totalW=${totalW.toFixed(0)} dot=${dotSize.toFixed(0)}`);
}

const path = require("path");
// Resolve brand TTFs from the repo's node_modules (this file lives at
// design/icon-options/er-lettermark/, so repo root is three levels up).
const NM = path.resolve(__dirname, "../../../node_modules/@expo-google-fonts");
const FONTS = {
  dmBold: path.join(NM, "dm-sans/700Bold/DMSans_700Bold.ttf"),
  dmExtra: path.join(NM, "dm-sans/800ExtraBold/DMSans_800ExtraBold.ttf"),
  jbBold: path.join(NM, "jetbrains-mono/700Bold/JetBrainsMono_700Bold.ttf"),
};

module.exports = { build, FONTS, VOID, WHITE, RED, CANVAS };

if (require.main === module) {
  const arg = process.argv[2] || "all";
  const targets = arg === "all" ? Object.keys(FONTS) : [arg];
  for (const key of targets) {
    build({ fontPath: FONTS[key], out: `/tmp/er-icon/cand-${key}.svg`, dot: true });
  }
}
