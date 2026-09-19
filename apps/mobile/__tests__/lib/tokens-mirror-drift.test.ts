/**
 * Drift guard for the design-token MIRRORS.
 *
 * The ELO colour palette is hand-copied into five places. `lib/tokens.ts` is
 * the source of truth for all of them:
 *
 *   1. apps/mobile/lib/tokens.ts ................ runtime objects (SOURCE OF TRUTH)
 *   2. apps/mobile/tailwind.config.js ........... authoring surface
 *   3. apps/web/app/design-system/tokens.css .... web app stylesheet
 *   4. apps/web/public/design/tokens.css ........ web design-board stylesheet
 *   5. outside_assets/.../Brand/design-system/tokens.css ... brand canonical
 *
 * Mirror 2 is locked to mirror 1 by `tokens-contrast.test.ts`. This suite
 * covers the three CSS mirrors, which nothing else watches.
 *
 * WHAT THE PALETTE IS SUPPOSED TO BE
 *
 * `BRAND_PALETTE_SNAPSHOT` below is the committed contract: the 34
 * (theme, token) -> resolved colour pairs the brand file is expected to
 * produce. It is derived data, a few hundred bytes, no brand IP, and it is in
 * version control precisely because the brand file is not. It exists so that
 * the guard is not inert wherever the brand file is missing, which is a much
 * larger set of places than it first appears: CI, every fresh clone, AND every
 * git worktree, including the parallel-implementer worktrees this workspace's
 * agent policy mandates. Before the snapshot, the only place this guard
 * enforced anything was a pre-commit hook on a primary checkout with a live
 * SharePoint sync.
 *
 * So the suite asserts, in order:
 *
 *   a. ALWAYS, everywhere: the snapshot equals `lib/tokens.ts`. This catches
 *      mobile drifting away from the agreed brand contract, and it runs in CI.
 *   b. ALWAYS, everywhere: the palette still clears the WCAG AA thresholds,
 *      imported from `__tests__/support/token-contrast.ts`. Without this the
 *      guard could certify "the brand file agrees with mobile" in green while
 *      the palette they agree on had quietly stopped passing AA.
 *   c. When the brand file IS present: it resolves to the snapshot.
 *
 * Together: the contract is verified everywhere, the file's conformance to the
 * contract is verified wherever the file exists.
 *
 * MIRRORS 3 AND 4 (web) are known-stale until jits-ozvd lands, which another
 * workstream owns, so their divergence is recorded token by token in
 * `__tests__/fixtures/pending-web-drift.json`. The ledger is an EXACT match,
 * not a licence: drift that is not in the ledger fails, and a ledger entry that
 * has stopped diverging ALSO fails, with the lines to delete. It lives in a
 * data file so the jits-ozvd author edits data, not a mobile test.
 *
 * COMPARISON MECHANICS
 *
 * CSS mirrors name tokens as custom properties and frequently point them at a
 * raw-palette primitive (`var(--color-void)`), so every value is resolved
 * through its var() indirections before comparison, and both sides are
 * normalised (hex case, rgba spacing) so the diff is about colour rather than
 * formatting.
 *
 * The stylesheet is parsed into a real BLOCK TREE rather than scanned flat,
 * and only a TOP-LEVEL `:root` / `[data-theme="dark"]` / `[data-theme="light"]`
 * block counts as a theme block. Everything else, at any nesting depth, is
 * off-palette territory. `paletteDeclarationsOutsideThemeBlocks` then fails if
 * ANY watched custom property is declared anywhere off-palette, where "watched"
 * is the mapped semantic names PLUS the transitive closure of every primitive
 * those tokens resolve through. That closure is computed from the mirror's own
 * values, never hardcoded, so it stays correct when the palette changes. This
 * is what stops a conditional redefinition from rewriting the rendered palette
 * while the guard reports agreement:
 *
 *   @media (prefers-color-scheme: light) { :root { --color-paddock: #F2F4F7 } }
 *   :root { --text-tertiary: #6B7280; @media print { --text-tertiary: #8D929D } }
 *   body { --text-tertiary: #6B7280 }
 *
 * all of which are invisible to a flat scan of the recognised theme blocks.
 */
import { darkTokens, lightTokens, type ColorTokens } from "@/lib/tokens";
import {
  AA_NORMAL_TEXT,
  ACCENT_FILL_KEYS,
  SURFACE_KEYS,
  TEXT_KEYS,
  contrast,
  round,
} from "../support/token-contrast";

// The mobile tsconfig ships only the expo-router and jest type packages, so
// node globals are not declared project-wide. Narrow local declarations keep
// "node" out of the project `types` array (same pattern as the file-scanning
// block at the bottom of tokens-contrast.test.ts).
declare const require: (id: string) => any;
declare const __dirname: string;

const fs = require("fs") as {
  existsSync: (p: string) => boolean;
  readFileSync: (p: string, encoding: string) => string;
};
const path = require("path") as {
  resolve: (...parts: string[]) => string;
};

// __dirname is apps/mobile/__tests__/lib
const MOBILE_ROOT = path.resolve(__dirname, "..", "..");
const REPO_ROOT = path.resolve(MOBILE_ROOT, "..", "..");

/** Placeholder recorded when a mirror does not declare a mapped token at all. */
const NOT_DECLARED = "(not declared)";

type Theme = "dark" | "light";

const THEMES: readonly Theme[] = ["dark", "light"];

const MOBILE_TOKENS: Record<Theme, ColorTokens> = {
  dark: darkTokens,
  light: lightTokens,
};

/** theme -> css custom property -> normalised colour. */
type Palette = Record<Theme, Record<string, string>>;

// ---------------------------------------------------------------------------
// Mirror registry
// ---------------------------------------------------------------------------

interface CssMirror {
  label: string;
  /** Path relative to the repo root. Also the pending-ledger key. */
  relativePath: string;
}

const BRAND_MIRROR: CssMirror = {
  label: "mirror 5, brand canonical",
  relativePath: "outside_assets/Jits Arena SharePoint/Brand/design-system/tokens.css",
};

const WEB_MIRRORS: readonly CssMirror[] = [
  {
    label: "mirror 3, web app stylesheet",
    relativePath: "apps/web/app/design-system/tokens.css",
  },
  {
    label: "mirror 4, web design-board stylesheet",
    relativePath: "apps/web/public/design/tokens.css",
  },
];

// ---------------------------------------------------------------------------
// Token name mapping
// ---------------------------------------------------------------------------

/**
 * Mobile runtime key -> CSS custom property. Built by hand from both files
 * rather than derived from a camelCase/kebab-case transform, because the two
 * naming families do not line up mechanically (`textOnAccent` is
 * `--text-on-accent`, but the CSS side also carries a raw-palette family that
 * has no mobile counterpart at all).
 */
const TOKEN_MAP: ReadonlyArray<readonly [keyof ColorTokens, string]> = [
  ["bgPrimary", "--bg-primary"],
  ["bgSecondary", "--bg-secondary"],
  ["bgElevated", "--bg-elevated"],
  ["bgElevatedHover", "--bg-elevated-hover"],
  ["textPrimary", "--text-primary"],
  ["textSecondary", "--text-secondary"],
  ["textTertiary", "--text-tertiary"],
  ["textOnAccent", "--text-on-accent"],
  ["accentCta", "--accent-cta"],
  ["accentCtaText", "--accent-cta-text"],
  ["accentCtaHover", "--accent-cta-hover"],
  ["statePositive", "--state-positive"],
  ["stateNegative", "--state-negative"],
  ["stateNeutral", "--state-neutral"],
  ["borderHairline", "--border-hairline"],
  ["borderHairlineFaint", "--border-hairline-faint"],
  ["borderHairlineStrong", "--border-hairline-strong"],
];

/**
 * Mobile tokens with no counterpart in any CSS mirror, listed rather than
 * dropped. These are the pre-redesign shadcn-style compatibility shims: hsl()
 * triples consumed only by React Native components that have not been migrated
 * to the ELO families, which the CSS mirrors never carried. If one ever gains a
 * CSS counterpart, move it into TOKEN_MAP.
 *
 * An unmapped token that should have been compared is how this guard rots, so
 * the completeness test forces every ColorTokens key into exactly one list.
 */
const UNMAPPED_MOBILE_TOKENS: ReadonlyArray<keyof ColorTokens> = [
  "background",
  "foreground",
  "card",
  "cardForeground",
  "popover",
  "popoverForeground",
  "primary",
  "primaryForeground",
  "secondary",
  "secondaryForeground",
  "muted",
  "mutedForeground",
  "accent",
  "accentForeground",
  "destructive",
  "destructiveForeground",
  "success",
  "successForeground",
  "border",
  "input",
  "ring",
  "gold",
  "brandOrange",
  "deepRed",
];

const MAPPED_CSS_NAMES: readonly string[] = TOKEN_MAP.map(([, cssName]) => cssName);

const MOBILE_KEY_BY_CSS_NAME: Record<string, keyof ColorTokens> = {};
for (const [mobileKey, cssName] of TOKEN_MAP) MOBILE_KEY_BY_CSS_NAME[cssName] = mobileKey;

// ---------------------------------------------------------------------------
// The committed brand palette contract
// ---------------------------------------------------------------------------

/**
 * The 34 resolved (theme, token) pairs the brand canonical tokens.css is
 * expected to produce, and equivalently the palette lib/tokens.ts is expected
 * to hold. Derived data, committed on purpose: the brand file itself is
 * gitignored, so without this the guard verifies nothing outside a synced
 * primary checkout.
 *
 * This is NOT a hash of the brand file. A file hash would go red on any comment
 * or whitespace change a SharePoint round-trip introduces and would be deleted
 * in frustration within a week. Resolved values only change when a COLOUR
 * changes, which is exactly when a human should be looking.
 *
 * To change the palette deliberately: edit lib/tokens.ts and tailwind.config.js
 * (tokens-contrast.test.ts keeps those two in lockstep and re-checks AA), then
 * update this snapshot, then push the same change into the brand file in
 * SharePoint. The suite fails until all three agree.
 */
const BRAND_PALETTE_SNAPSHOT: Palette = {
  dark: {
    "--bg-primary": "#0d0f14",
    "--bg-secondary": "#13151b",
    "--bg-elevated": "#1e222b",
    "--bg-elevated-hover": "#262a34",
    "--text-primary": "#e8edf2",
    "--text-secondary": "#9ca3af",
    "--text-tertiary": "#8d929d",
    "--text-on-accent": "#0d0f14",
    "--accent-cta": "#e63946",
    "--accent-cta-text": "#ec6a74",
    "--accent-cta-hover": "#f0556b",
    "--state-positive": "#22c55e",
    "--state-negative": "#ec6a74",
    "--state-neutral": "#8d929d",
    "--border-hairline": "rgba(107, 114, 128, 0.45)",
    "--border-hairline-faint": "rgba(107, 114, 128, 0.2)",
    "--border-hairline-strong": "rgba(107, 114, 128, 0.62)",
  },
  light: {
    "--bg-primary": "#f8fafc",
    "--bg-secondary": "#e8ebf0",
    "--bg-elevated": "#dee2e9",
    "--bg-elevated-hover": "#d2d7e0",
    "--text-primary": "#0d0f14",
    "--text-secondary": "#4b5563",
    "--text-tertiary": "#575c68",
    "--text-on-accent": "#0d0f14",
    "--accent-cta": "#e63946",
    "--accent-cta-text": "#ac2b34",
    "--accent-cta-hover": "#f0556b",
    "--state-positive": "#116a33",
    "--state-negative": "#ac2b34",
    "--state-neutral": "#575c68",
    "--border-hairline": "rgba(13, 15, 20, 0.22)",
    "--border-hairline-faint": "rgba(13, 15, 20, 0.11)",
    "--border-hairline-strong": "rgba(13, 15, 20, 0.34)",
  },
};

// ---------------------------------------------------------------------------
// Pending web drift, loaded from its fixture
// ---------------------------------------------------------------------------

const PENDING_FIXTURE_RELATIVE = "apps/mobile/__tests__/fixtures/pending-web-drift.json";

interface PendingDoc {
  mirrors: Record<string, Record<string, string>>;
}

const PENDING_DOC = JSON.parse(
  fs.readFileSync(path.resolve(REPO_ROOT, PENDING_FIXTURE_RELATIVE), "utf8"),
) as PendingDoc;

function pendingFor(mirror: CssMirror): Record<string, string> {
  return PENDING_DOC.mirrors[mirror.relativePath] ?? {};
}

// ---------------------------------------------------------------------------
// CSS parsing: a real block tree
// ---------------------------------------------------------------------------

type Declarations = Record<string, string>;

interface CssBlock {
  selector: string;
  /** Ancestor selectors plus this one, for diagnostics. */
  path: string[];
  /** Declarations written DIRECTLY in this block, excluding nested blocks. */
  declarations: Declarations;
  children: CssBlock[];
}

function stripComments(css: string): string {
  return css.replace(/\/\*[\s\S]*?\*\//g, "");
}

/**
 * A declaration is only recognised when the segment STARTS with the custom
 * property, so `background: var(--bg-primary)` is never mistaken for a
 * declaration of `--bg-primary`.
 */
function addDeclaration(into: Declarations, segment: string): void {
  const match = segment.match(/^\s*(--[A-Za-z0-9-]+)\s*:\s*([\s\S]*?)\s*$/);
  if (match === null) return;
  if (match[2].length === 0) return;
  into[match[1]] = match[2];
}

function parseBody(
  src: string,
  ancestors: readonly string[],
): { declarations: Declarations; children: CssBlock[] } {
  const declarations: Declarations = {};
  const children: CssBlock[] = [];
  let segmentStart = 0;
  let cursor = 0;

  while (cursor < src.length) {
    const char = src[cursor];

    if (char === "{") {
      const selector = src.slice(segmentStart, cursor).trim();
      let depth = 1;
      let scan = cursor + 1;
      while (scan < src.length && depth > 0) {
        if (src[scan] === "{") depth += 1;
        else if (src[scan] === "}") depth -= 1;
        scan += 1;
      }
      const bodyEnd = depth === 0 ? scan - 1 : src.length;
      const blockPath = [...ancestors, selector];
      const inner = parseBody(src.slice(cursor + 1, bodyEnd), blockPath);
      children.push({
        selector,
        path: blockPath,
        declarations: inner.declarations,
        children: inner.children,
      });
      cursor = scan;
      segmentStart = scan;
      continue;
    }

    if (char === ";" || char === "}") {
      addDeclaration(declarations, src.slice(segmentStart, cursor));
      segmentStart = cursor + 1;
    }
    cursor += 1;
  }

  addDeclaration(declarations, src.slice(segmentStart));
  return { declarations, children };
}

function parseStylesheet(css: string): CssBlock[] {
  return parseBody(stripComments(css), []).children;
}

function selectorParts(selector: string): string[] {
  return selector
    .split(",")
    .map((part) => part.trim())
    .filter((part) => part.length > 0);
}

function isAtRule(selector: string): boolean {
  return selector.trimStart().startsWith("@");
}

/**
 * The theme a block defines, or null if it is not a recognised theme block.
 * Recognition requires TOP LEVEL (`path.length === 1`): a `:root` nested inside
 * an `@media` is a conditional override, not the palette, and must be reported
 * rather than merged.
 */
function themeOf(block: CssBlock): Theme | null {
  if (block.path.length !== 1) return null;
  if (isAtRule(block.selector)) return null;
  const parts = selectorParts(block.selector);
  if (parts.includes('[data-theme="light"]')) return "light";
  if (parts.includes(":root") || parts.includes('[data-theme="dark"]')) return "dark";
  return null;
}

/** Collapse every recognised block for `theme`, later blocks winning. */
function declarationsForTheme(blocks: readonly CssBlock[], theme: Theme): Declarations {
  const merged: Declarations = {};
  for (const block of blocks) {
    if (themeOf(block) !== theme) continue;
    for (const [name, value] of Object.entries(block.declarations)) {
      merged[name] = value;
    }
  }
  return merged;
}

// ---------------------------------------------------------------------------
// var() resolution and value normalisation
// ---------------------------------------------------------------------------

const WHOLE_VALUE_VAR = /^var\(\s*(--[A-Za-z0-9-]+)\s*(?:,\s*([\s\S]*))?\)$/;
const ANY_VAR_REFERENCE = /var\(\s*(--[A-Za-z0-9-]+)/g;

/**
 * Resolve a value that is entirely a var() reference, following the chain
 * through the raw-palette primitives. `scope` is the theme's own declarations,
 * `base` the root/dark declarations the light block inherits primitives from.
 * Composite values (`var(--a) var(--b)`) are left alone: no mapped colour token
 * uses one, and half-resolving would be worse than reporting it verbatim.
 */
function resolveValue(raw: string, scope: Declarations, base: Declarations): string {
  let value = raw.trim();
  const seen = new Set<string>();

  for (;;) {
    const match = value.match(WHOLE_VALUE_VAR);
    if (match === null) return value;

    const name = match[1];
    if (seen.has(name)) return `(circular var reference at ${name})`;
    seen.add(name);

    const next = scope[name] ?? base[name];
    if (next !== undefined) {
      value = next.trim();
      continue;
    }
    if (match[2] !== undefined) {
      value = match[2].trim();
      continue;
    }
    return `(unresolved var ${name})`;
  }
}

function normalizeColor(value: string): string {
  const collapsed = value.trim().replace(/\s+/g, " ");

  const hex = collapsed.match(/^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/);
  if (hex !== null) {
    const digits = hex[1].toLowerCase();
    if (digits.length !== 3) return `#${digits}`;
    return `#${digits[0]}${digits[0]}${digits[1]}${digits[1]}${digits[2]}${digits[2]}`;
  }

  const rgba = collapsed.match(
    /^rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)\s*(?:,\s*([\d.]+)\s*)?\)$/i,
  );
  if (rgba !== null) {
    const alpha = rgba[4] === undefined ? 1 : Number(rgba[4]);
    return `rgba(${Number(rgba[1])}, ${Number(rgba[2])}, ${Number(rgba[3])}, ${alpha})`;
  }

  return collapsed.toLowerCase();
}

// ---------------------------------------------------------------------------
// Watched names and the off-palette declaration check
// ---------------------------------------------------------------------------

/**
 * Every custom property that can affect a mapped token's rendered value: the
 * mapped semantic names themselves, plus the transitive closure of every
 * primitive they resolve through, in either theme.
 *
 * Computed from the mirror's OWN declarations rather than hardcoded, so it
 * follows the palette automatically. If the brand file stops routing
 * `--text-tertiary` through `--color-data-gray`, that primitive correctly drops
 * out of the watch set, and if a new primitive is introduced it is picked up
 * with no edit here.
 */
function watchedNames(dark: Declarations, light: Declarations): Set<string> {
  const watched = new Set<string>(MAPPED_CSS_NAMES);
  const queue: string[] = [...MAPPED_CSS_NAMES];

  while (queue.length > 0) {
    const name = queue.pop() as string;
    for (const scope of [dark, light]) {
      const value = scope[name];
      if (value === undefined) continue;
      ANY_VAR_REFERENCE.lastIndex = 0;
      let reference = ANY_VAR_REFERENCE.exec(value);
      while (reference !== null) {
        const referenced = reference[1];
        if (!watched.has(referenced)) {
          watched.add(referenced);
          queue.push(referenced);
        }
        reference = ANY_VAR_REFERENCE.exec(value);
      }
    }
  }

  return watched;
}

/**
 * Every watched custom property declared anywhere that is not a recognised
 * top-level theme block, at any nesting depth. A declaration there silently
 * rewrites the rendered palette while the theme blocks still read as correct,
 * which is the failure mode that lets a regenerated brand file reintroduce the
 * WCAG failures in green.
 */
function paletteDeclarationsOutsideThemeBlocks(
  blocks: readonly CssBlock[],
  watched: ReadonlySet<string>,
): string[] {
  const leaks: string[] = [];

  const visit = (block: CssBlock): void => {
    if (themeOf(block) === null) {
      for (const name of Object.keys(block.declarations)) {
        if (watched.has(name)) {
          leaks.push(`${name} declared at ${block.path.join(" > ").replace(/\s+/g, " ")}`);
        }
      }
    }
    for (const child of block.children) visit(child);
  };

  for (const block of blocks) visit(block);
  return leaks.sort();
}

// ---------------------------------------------------------------------------
// Mirror comparison
// ---------------------------------------------------------------------------

interface Divergence {
  /** "<theme> <css custom property>", the pending-ledger key. */
  key: string;
  theme: Theme;
  mobileKey: keyof ColorTokens;
  cssName: string;
  expected: string;
  actual: string;
}

function absolutePathOf(mirror: CssMirror): string {
  return path.resolve(REPO_ROOT, mirror.relativePath);
}

function readMirror(mirror: CssMirror): CssBlock[] {
  return parseStylesheet(fs.readFileSync(absolutePathOf(mirror), "utf8"));
}

/** The palette a mirror actually renders, after var() resolution. */
function resolvedPalette(blocks: readonly CssBlock[]): Palette {
  const base = declarationsForTheme(blocks, "dark");
  const palette: Palette = { dark: {}, light: {} };

  for (const theme of THEMES) {
    const scope = declarationsForTheme(blocks, theme);
    for (const cssName of MAPPED_CSS_NAMES) {
      const declared = scope[cssName];
      palette[theme][cssName] =
        declared === undefined ? NOT_DECLARED : normalizeColor(resolveValue(declared, scope, base));
    }
  }

  return palette;
}

function paletteFromMobile(): Palette {
  const palette: Palette = { dark: {}, light: {} };
  for (const theme of THEMES) {
    for (const [mobileKey, cssName] of TOKEN_MAP) {
      palette[theme][cssName] = normalizeColor(MOBILE_TOKENS[theme][mobileKey]);
    }
  }
  return palette;
}

function divergencesBetween(actual: Palette, expected: Palette): Divergence[] {
  const found: Divergence[] = [];
  for (const theme of THEMES) {
    for (const cssName of MAPPED_CSS_NAMES) {
      if (actual[theme][cssName] === expected[theme][cssName]) continue;
      found.push({
        key: `${theme} ${cssName}`,
        theme,
        mobileKey: MOBILE_KEY_BY_CSS_NAME[cssName],
        cssName,
        expected: expected[theme][cssName],
        actual: actual[theme][cssName],
      });
    }
  }
  return found;
}

function describeDivergence(mirror: CssMirror, d: Divergence): string {
  return (
    `  ${mirror.relativePath} [${d.theme}] ${d.cssName}\n` +
    `      mirror resolves to : ${d.actual}\n` +
    `      expected           : ${d.expected}   (${d.theme}Tokens.${String(d.mobileKey)})`
  );
}

// ---------------------------------------------------------------------------
// Mapping completeness
// ---------------------------------------------------------------------------

describe("token mapping table", () => {
  it("covers every ColorTokens key exactly once, mapped or explicitly unmapped", () => {
    const mapped = TOKEN_MAP.map(([mobileKey]) => mobileKey);
    const declared = [...mapped, ...UNMAPPED_MOBILE_TOKENS].map(String).sort();
    const actual = Object.keys(darkTokens).sort();

    expect(new Set(declared).size).toBe(declared.length);
    expect(declared).toEqual(actual);
    expect(Object.keys(lightTokens).sort()).toEqual(actual);
  });

  it("maps each mobile token to a distinct CSS custom property", () => {
    expect(new Set(MAPPED_CSS_NAMES).size).toBe(MAPPED_CSS_NAMES.length);
  });

  it("pending ledger names only mirrors this suite knows about", () => {
    const known = new Set(WEB_MIRRORS.map((mirror) => mirror.relativePath));
    for (const id of Object.keys(PENDING_DOC.mirrors)) {
      expect(known.has(id)).toBe(true);
    }
  });
});

// ---------------------------------------------------------------------------
// The committed contract, verified EVERYWHERE including CI and worktrees
// ---------------------------------------------------------------------------

describe("brand palette contract", () => {
  it("snapshot matches lib/tokens.ts", () => {
    const fromMobile = paletteFromMobile();
    const divergences = divergencesBetween(fromMobile, BRAND_PALETTE_SNAPSHOT);
    if (divergences.length === 0) return;
    throw new Error(
      [
        "apps/mobile/lib/tokens.ts no longer matches BRAND_PALETTE_SNAPSHOT, the",
        "committed contract for what the brand palette is.",
        "",
        "If the palette change is deliberate, update the snapshot in this file AND",
        "push the same change into the brand file in SharePoint. If it is not, the",
        "palette has drifted and lib/tokens.ts is what needs fixing.",
        "",
        ...divergences.map((d) => describeDivergence(BRAND_MIRROR, d)),
      ].join("\n"),
    );
  });

  it("covers all 34 theme-token pairs", () => {
    const sorted = [...MAPPED_CSS_NAMES].sort();
    expect(Object.keys(BRAND_PALETTE_SNAPSHOT.dark).sort()).toEqual(sorted);
    expect(Object.keys(BRAND_PALETTE_SNAPSHOT.light).sort()).toEqual(sorted);
    expect(
      Object.keys(BRAND_PALETTE_SNAPSHOT.dark).length +
        Object.keys(BRAND_PALETTE_SNAPSHOT.light).length,
    ).toBe(34);
  });

  /**
   * Without this, the guard could certify "the brand file agrees with mobile"
   * in green while the palette they agree on had stopped passing AA, because
   * the only thing enforcing AA would be a sibling suite this file merely
   * mentions in a comment. The thresholds come from the shared support module,
   * so they are not restated here, and deleting or weakening that module breaks
   * both suites at once.
   */
  it("certifies nothing unless the palette still clears WCAG AA", () => {
    const failures: string[] = [];

    for (const theme of THEMES) {
      const tokens = MOBILE_TOKENS[theme];
      for (const textKey of TEXT_KEYS) {
        for (const surfaceKey of SURFACE_KEYS) {
          const ratio = round(contrast(tokens[textKey], tokens[surfaceKey]));
          if (ratio < AA_NORMAL_TEXT) {
            failures.push(`${theme} ${textKey} on ${surfaceKey}: ${ratio}:1 < ${AA_NORMAL_TEXT}:1`);
          }
        }
      }
      for (const fillKey of ACCENT_FILL_KEYS) {
        const ratio = round(contrast(tokens.textOnAccent, tokens[fillKey]));
        if (ratio < AA_NORMAL_TEXT) {
          failures.push(`${theme} textOnAccent on ${fillKey}: ${ratio}:1 < ${AA_NORMAL_TEXT}:1`);
        }
      }
    }

    expect(failures).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// Mirror 5: brand canonical
// ---------------------------------------------------------------------------

const BRAND_PATH = absolutePathOf(BRAND_MIRROR);
const BRAND_PRESENT = fs.existsSync(BRAND_PATH);
const BRAND_SKIP_REASON =
  "brand tokens.css is not present in this checkout. It lives under /outside_assets/, " +
  "which is gitignored and synchronised from SharePoint, so it is absent from CI, from " +
  "a fresh clone, and from every git worktree. The committed BRAND_PALETTE_SNAPSHOT is " +
  "still being verified against lib/tokens.ts on this run; what is NOT verified is the " +
  "brand file's own conformance to it.";

if (!BRAND_PRESENT) {
  console.warn(`[tokens-mirror-drift] SKIPPING the brand file check: ${BRAND_SKIP_REASON}`);
}

describe(BRAND_MIRROR.label, () => {
  const itBrand = BRAND_PRESENT ? it : it.skip;

  itBrand(
    BRAND_PRESENT
      ? "resolves to the committed brand palette snapshot"
      : `SKIPPED: ${BRAND_SKIP_REASON}`,
    () => {
      const blocks = readMirror(BRAND_MIRROR);
      const dark = declarationsForTheme(blocks, "dark");
      const light = declarationsForTheme(blocks, "light");

      const leaks = paletteDeclarationsOutsideThemeBlocks(blocks, watchedNames(dark, light));
      if (leaks.length > 0) {
        throw new Error(
          [
            `The brand canonical tokens.css declares ${leaks.length} palette custom`,
            "propert(y/ies) outside its two theme blocks. Such a declaration rewrites the",
            "rendered palette conditionally while the theme blocks still read as correct,",
            "so a token comparison alone would report agreement in green.",
            "",
            "The palette must be defined only in the top-level `:root` (dark) and",
            '`[data-theme="light"]` blocks. A `@media (prefers-color-scheme: ...)` variant,',
            "a nested at-rule, or a declaration on any other selector is not supported.",
            "",
            ...leaks.map((leak) => `      ${leak}`),
            "",
            `File: ${BRAND_MIRROR.relativePath}`,
          ].join("\n"),
        );
      }

      const divergences = divergencesBetween(resolvedPalette(blocks), BRAND_PALETTE_SNAPSHOT);
      if (divergences.length > 0) {
        throw new Error(
          [
            `The brand canonical tokens.css has drifted from the committed palette ` +
              `snapshot on ${divergences.length} token(s).`,
            "",
            "A mismatch here usually means the brand file was re-synced from SharePoint",
            "or regenerated from brand source, which is exactly how the WCAG AA failures",
            "get reintroduced. Fix the brand file, do not relax this test.",
            "",
            ...divergences.map((d) => describeDivergence(BRAND_MIRROR, d)),
            "",
            `File: ${BRAND_MIRROR.relativePath}`,
          ].join("\n"),
        );
      }
    },
  );
});

// ---------------------------------------------------------------------------
// Mirrors 3 and 4: web, pending jits-ozvd
// ---------------------------------------------------------------------------

describe.each(WEB_MIRRORS.map((mirror) => [mirror.label, mirror] as const))(
  "%s",
  (_label, mirror) => {
    it("is present in the checkout", () => {
      expect(fs.existsSync(absolutePathOf(mirror))).toBe(true);
    });

    it("declares no palette custom property outside its theme blocks", () => {
      const blocks = readMirror(mirror);
      const watched = watchedNames(
        declarationsForTheme(blocks, "dark"),
        declarationsForTheme(blocks, "light"),
      );
      expect(paletteDeclarationsOutsideThemeBlocks(blocks, watched)).toEqual([]);
    });

    it("diverges from lib/tokens.ts exactly as the jits-ozvd pending ledger records", () => {
      const divergences = divergencesBetween(
        resolvedPalette(readMirror(mirror)),
        paletteFromMobile(),
      );
      const pending = pendingFor(mirror);

      const actualByKey: Record<string, string> = {};
      for (const d of divergences) actualByKey[d.key] = d.actual;

      const uncovered = divergences.filter((d) => !(d.key in pending));
      const stale = divergences.filter((d) => d.key in pending && pending[d.key] !== d.actual);
      const resolved = Object.keys(pending).filter((key) => !(key in actualByKey));

      const problems: string[] = [];

      if (resolved.length > 0) {
        problems.push(
          [
            "THIS FAILURE IS EXPECTED IF YOU ARE WORKING ON jits-ozvd. Nothing is broken:",
            `${resolved.length} recorded divergence(s) for this mirror now AGREE with`,
            "lib/tokens.ts, which is the outcome jits-ozvd is for. Finish the job by",
            "deleting these lines from the DATA FILE, no test code changes:",
            "",
            `  ${PENDING_FIXTURE_RELATIVE}  ->  mirrors["${mirror.relativePath}"]`,
            "",
            ...resolved.map(
              (key) => `      ${JSON.stringify(key)}: ${JSON.stringify(pending[key])},`,
            ),
            "",
            "When that mirror's map is empty, delete the mirror key. When `mirrors` is",
            "empty, delete the fixture and the pending branch in this test file, so the",
            "web mirrors are gated as strictly as the brand file.",
          ].join("\n"),
        );
      }

      if (uncovered.length > 0) {
        problems.push(
          [
            `NEW DRIFT: ${uncovered.length} token(s) diverge in a way the jits-ozvd`,
            "baseline does not cover. Either fix the mirror, or, if this divergence is",
            "part of the jits-ozvd web palette work, record it deliberately in",
            `${PENDING_FIXTURE_RELATIVE}:`,
            "",
            ...uncovered.map((d) => describeDivergence(mirror, d)),
            "",
            "    ledger lines:",
            ...uncovered.map((d) => `      ${JSON.stringify(d.key)}: ${JSON.stringify(d.actual)},`),
          ].join("\n"),
        );
      }

      if (stale.length > 0) {
        problems.push(
          [
            `CHANGED DRIFT: ${stale.length} recorded divergence(s) still diverge, but the`,
            "mirror's value is no longer the one recorded. Update the ledger to match, or",
            "finish the fix so the entry can be deleted:",
            "",
            ...stale.map(
              (d) =>
                `      ${JSON.stringify(d.key)}: recorded ${JSON.stringify(
                  pending[d.key],
                )}, now ${JSON.stringify(d.actual)} (expected ${d.expected})`,
            ),
          ].join("\n"),
        );
      }

      if (problems.length > 0) {
        throw new Error(
          [`Pending-drift ledger is out of date for ${mirror.relativePath}.`, "", ...problems].join(
            "\n\n",
          ),
        );
      }

      // Structural backstop: the ledger and the observed drift are the same set.
      expect(actualByKey).toEqual(pending);
    });
  },
);
