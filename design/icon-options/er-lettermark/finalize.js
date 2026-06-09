const path = require("path");
const { build, FONTS } = require("./gen.js");

// Regenerates the three vector sources next to this file. After running,
// render them into apps/mobile/assets with rsvg-convert (see README.md).
const HERE = __dirname;
const FONT = FONTS.dmBold; // DM Sans Bold (brand heading font), approved

// App icon: full-bleed Void square, generous mark
build({ fontPath: FONT, out: path.join(HERE, "icon.svg"), dot: true,
  capTarget: 0.40, widthCap: 0.70, gapF: 0.27, dotF: 0.115 });

// Android adaptive FOREGROUND: transparent, mark pulled into the ~60% safe zone
// (backgroundColor #0D0F14 is applied by Android via app.json)
build({ fontPath: FONT, out: path.join(HERE, "adaptive-foreground.svg"), dot: true, transparent: true,
  capTarget: 0.34, widthCap: 0.60, gapF: 0.27, dotF: 0.115 });

// Native splash: transparent, modest centered mark (hands off to wordmark animation)
build({ fontPath: FONT, out: path.join(HERE, "splash.svg"), dot: true, transparent: true,
  capTarget: 0.30, widthCap: 0.52, gapF: 0.27, dotF: 0.115 });
