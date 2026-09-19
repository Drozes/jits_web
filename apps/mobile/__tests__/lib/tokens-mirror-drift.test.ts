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
 * Mirror 2 is already locked to mirror 1 by `tokens-contrast.test.ts`, which
 * diffs the tailwind config against the runtime objects. This suite covers the
 * three CSS mirrors, which nothing else watches.
 *
 * Per-mirror policy:
 *
 *   MIRROR 5 (brand canonical) is the one that matters. It lives under
 *   /outside_assets/, which is gitignored and synchronised from SharePoint, so
 *   it is ABSENT from a fresh clone and from CI. When it is absent the brand
 *   test skips and says so. When it is present it MUST agree with mobile, and
 *   any disagreement fails. That is the case this guard exists for: a
 *   SharePoint sync, or a designer regenerating from brand source, silently
 *   reintroducing the WCAG failures the palette repair just fixed.
 *
 *   MIRRORS 3 and 4 (web) are known-stale today and stay stale until jits-ozvd
 *   lands; that work is owned by another workstream and this suite must not
 *   block it. Their divergence is therefore recorded, token by token, in the
 *   PENDING_WEB_DRIFT ledger below. The ledger is an EXACT match, not a
 *   licence: drift that is not in the ledger fails, and a ledger entry that
 *   has stopped diverging ALSO fails, with instructions to delete it. That is
 *   what makes the eventual cleanup announce itself instead of leaving a
 *   permanently blind spot behind.
 *
 * Comparison mechanics: the CSS mirrors name tokens as custom properties and
 * frequently point them at a raw-palette primitive (`var(--color-void)`), so
 * every value is resolved through its var() indirections before it is compared
 * against mobile, and both sides are normalised (hex case, rgba spacing) so the
 * diff is about colour, not formatting. The mobile -> CSS name mapping is an
 * explicit table; every key of `ColorTokens` must appear either in that table
 * or in the UNMAPPED list, so a new token cannot be silently dropped.
 */
import { darkTokens, lightTokens, type ColorTokens } from "@/lib/tokens";

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
const REPO_ROOT = path.resolve(__dirname, "..", "..", "..", "..");

/** Placeholder recorded when a mirror does not declare a mapped token at all. */
const NOT_DECLARED = "(not declared)";

type Theme = "dark" | "light";

const THEMES: readonly Theme[] = ["dark", "light"];

const MOBILE_TOKENS: Record<Theme, ColorTokens> = {
  dark: darkTokens,
  light: lightTokens,
};

// ---------------------------------------------------------------------------
// Mirror registry
// ---------------------------------------------------------------------------

interface CssMirror {
  /** Stable id, also the key used by the pending ledger. */
  id: string;
  label: string;
  /** Path relative to the repo root. */
  relativePath: string;
}

const BRAND_MIRROR: CssMirror = {
  id: "outside_assets/Jits Arena SharePoint/Brand/design-system/tokens.css",
  label: "mirror 5, brand canonical",
  relativePath: "outside_assets/Jits Arena SharePoint/Brand/design-system/tokens.css",
};

const WEB_MIRRORS: readonly CssMirror[] = [
  {
    id: "apps/web/app/design-system/tokens.css",
    label: "mirror 3, web app stylesheet",
    relativePath: "apps/web/app/design-system/tokens.css",
  },
  {
    id: "apps/web/public/design/tokens.css",
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
 * `--text-on-accent`, but `bgElevatedHover` is `--bg-elevated-hover` and the
 * CSS side also carries a raw-palette family that has no mobile counterpart).
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
 * dropped. These are the pre-redesign shadcn-style compatibility shims: they
 * are hsl() triples consumed only by React Native components that have not
 * been migrated to the ELO families yet, and the CSS mirrors never carried
 * them. If one of these ever gains a CSS counterpart, move it into TOKEN_MAP.
 *
 * An unmapped token that should have been compared is how this guard rots, so
 * the completeness test below forces every ColorTokens key into exactly one of
 * these two lists.
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

// ---------------------------------------------------------------------------
// PENDING: recorded divergence for the web mirrors (jits-ozvd)
// ---------------------------------------------------------------------------

/**
 * The web mirrors were not updated by the WCAG token repair. Until jits-ozvd
 * lands they legitimately differ from mobile, and this suite records exactly
 * how, so that it can stay green without going blind.
 *
 * Shape: mirror id -> "<theme> <css custom property>" -> the value the mirror
 * CURRENTLY resolves to (normalised, or "(not declared)" when the mirror is
 * missing the token entirely). The mobile side is deliberately NOT recorded
 * here; it is read from lib/tokens.ts at run time, so there is still exactly
 * one source of truth for what the value is supposed to be.
 *
 * The ledger is compared for EXACT equality against the drift actually found:
 *
 *   - drift that is not listed here            -> FAIL (new, uncovered drift)
 *   - a listed entry that no longer diverges   -> FAIL ("delete this entry")
 *   - a listed entry whose value has changed   -> FAIL ("update this entry")
 *
 * So when jits-ozvd updates a web token, this suite turns red and tells the
 * author which lines to delete. When a mirror's map empties, delete the
 * mirror's whole entry; when PENDING_WEB_DRIFT is empty, delete it along with
 * `pendingFor` and let the web mirrors be gated as strictly as the brand file.
 */
const PENDING_WEB_DRIFT: Readonly<Record<string, Readonly<Record<string, string>>>> = {
  // Recorded 2026-09-18 against the palette merged at af87d69. The two web
  // mirrors are near-identical copies, so their ledgers are identical too.
  "apps/web/app/design-system/tokens.css": {
    "dark --bg-elevated": "#1a1d24",
    "dark --bg-elevated-hover": "#242832",
    "dark --text-tertiary": "#6b7280",
    "dark --text-on-accent": "#e8edf2",
    "dark --accent-cta-text": "(not declared)",
    "dark --state-negative": "#e63946",
    "dark --state-neutral": "#6b7280",
    "dark --border-hairline": "rgba(107, 114, 128, 0.25)",
    "dark --border-hairline-faint": "rgba(107, 114, 128, 0.12)",
    "dark --border-hairline-strong": "rgba(107, 114, 128, 0.4)",
    "light --bg-primary": "#f2f4f7",
    "light --text-tertiary": "#6b7280",
    "light --text-on-accent": "#e8edf2",
    "light --accent-cta-text": "(not declared)",
    "light --accent-cta-hover": "#c42939",
    "light --state-positive": "#15803d",
    "light --state-negative": "#e63946",
    "light --state-neutral": "#6b7280",
    "light --border-hairline": "rgba(13, 15, 20, 0.14)",
    "light --border-hairline-faint": "rgba(13, 15, 20, 0.07)",
    "light --border-hairline-strong": "rgba(13, 15, 20, 0.25)",
  },
  "apps/web/public/design/tokens.css": {
    "dark --bg-elevated": "#1a1d24",
    "dark --bg-elevated-hover": "#242832",
    "dark --text-tertiary": "#6b7280",
    "dark --text-on-accent": "#e8edf2",
    "dark --accent-cta-text": "(not declared)",
    "dark --state-negative": "#e63946",
    "dark --state-neutral": "#6b7280",
    "dark --border-hairline": "rgba(107, 114, 128, 0.25)",
    "dark --border-hairline-faint": "rgba(107, 114, 128, 0.12)",
    "dark --border-hairline-strong": "rgba(107, 114, 128, 0.4)",
    "light --bg-primary": "#f2f4f7",
    "light --text-tertiary": "#6b7280",
    "light --text-on-accent": "#e8edf2",
    "light --accent-cta-text": "(not declared)",
    "light --accent-cta-hover": "#c42939",
    "light --state-positive": "#15803d",
    "light --state-negative": "#e63946",
    "light --state-neutral": "#6b7280",
    "light --border-hairline": "rgba(13, 15, 20, 0.14)",
    "light --border-hairline-faint": "rgba(13, 15, 20, 0.07)",
    "light --border-hairline-strong": "rgba(13, 15, 20, 0.25)",
  },
};

function pendingFor(mirror: CssMirror): Readonly<Record<string, string>> {
  return PENDING_WEB_DRIFT[mirror.id] ?? {};
}

// ---------------------------------------------------------------------------
// CSS parsing
// ---------------------------------------------------------------------------

type Declarations = Record<string, string>;

interface CssBlock {
  selector: string;
  declarations: Declarations;
}

function stripComments(css: string): string {
  return css.replace(/\/\*[\s\S]*?\*\//g, "");
}

function parseDeclarations(body: string): Declarations {
  const declarations: Declarations = {};
  const pattern = /(--[A-Za-z0-9-]+)\s*:\s*([^;{}]+?)\s*(?:;|$)/g;
  let match = pattern.exec(body);
  while (match !== null) {
    declarations[match[1]] = match[2].trim();
    match = pattern.exec(body);
  }
  return declarations;
}

/**
 * Split a stylesheet into its brace blocks. Comments are stripped first so a
 * comment body can never be mistaken for a selector or a declaration, and
 * nested blocks (the `:root` inside `@media (prefers-reduced-motion)`) stay
 * inside their parent's body instead of being hoisted to the top level.
 */
function parseTopLevelBlocks(css: string): CssBlock[] {
  const src = stripComments(css);
  const blocks: CssBlock[] = [];
  let cursor = 0;
  let selectorStart = 0;

  while (cursor < src.length) {
    const char = src[cursor];

    if (char === "{") {
      const selector = src.slice(selectorStart, cursor).trim();
      let depth = 1;
      let scan = cursor + 1;
      while (scan < src.length && depth > 0) {
        if (src[scan] === "{") depth += 1;
        else if (src[scan] === "}") depth -= 1;
        scan += 1;
      }
      const bodyEnd = depth === 0 ? scan - 1 : src.length;
      blocks.push({
        selector,
        declarations: parseDeclarations(src.slice(cursor + 1, bodyEnd)),
      });
      cursor = scan;
      selectorStart = scan;
      continue;
    }

    if (char === "}") {
      selectorStart = cursor + 1;
    }
    cursor += 1;
  }

  return blocks;
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

function blockMatchesTheme(selector: string, theme: Theme): boolean {
  if (isAtRule(selector)) return false;
  const parts = selectorParts(selector);
  if (theme === "light") return parts.includes('[data-theme="light"]');
  return parts.includes(":root") || parts.includes('[data-theme="dark"]');
}

/**
 * Collapse every block that applies to `theme` into one declaration map, later
 * blocks winning, which is what the cascade does for same-specificity rules.
 */
function declarationsForTheme(blocks: readonly CssBlock[], theme: Theme): Declarations {
  const merged: Declarations = {};
  for (const block of blocks) {
    if (!blockMatchesTheme(block.selector, theme)) continue;
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

/**
 * Resolve a value that is entirely a var() reference, following the chain
 * through the raw-palette primitives. `scope` is the theme's own declarations,
 * `base` the root/dark declarations that the light block inherits primitives
 * from. Composite values (`var(--a) var(--b)`) are left alone: no mapped
 * colour token uses one, and silently half-resolving such a value would be
 * worse than reporting it verbatim.
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

function readMirrorBlocks(mirror: CssMirror): CssBlock[] {
  return parseTopLevelBlocks(fs.readFileSync(absolutePathOf(mirror), "utf8"));
}

function divergencesFor(blocks: readonly CssBlock[]): Divergence[] {
  const base = declarationsForTheme(blocks, "dark");
  const found: Divergence[] = [];

  for (const theme of THEMES) {
    const scope = declarationsForTheme(blocks, theme);
    for (const [mobileKey, cssName] of TOKEN_MAP) {
      const declared = scope[cssName];
      const actual =
        declared === undefined
          ? NOT_DECLARED
          : normalizeColor(resolveValue(declared, scope, base));
      const expected = normalizeColor(MOBILE_TOKENS[theme][mobileKey]);
      if (actual === expected) continue;
      found.push({
        key: `${theme} ${cssName}`,
        theme,
        mobileKey,
        cssName,
        expected,
        actual,
      });
    }
  }

  return found;
}

/**
 * A colour token declared inside an at-rule (`@media`, `@supports`) sits
 * outside the theme blocks this suite reads, so it would silently stop being
 * compared. Report any such declaration instead of losing it.
 */
function atRuleLeaks(blocks: readonly CssBlock[]): string[] {
  const leaks: string[] = [];
  for (const block of blocks) {
    if (!isAtRule(block.selector)) continue;
    for (const cssName of MAPPED_CSS_NAMES) {
      if (cssName in block.declarations) {
        leaks.push(`${block.selector.trim().replace(/\s+/g, " ")} declares ${cssName}`);
      }
    }
  }
  return leaks;
}

function describeDivergence(mirror: CssMirror, d: Divergence): string {
  return (
    `  ${mirror.relativePath} [${d.theme}] ${d.cssName}\n` +
    `      mirror resolves to : ${d.actual}\n` +
    `      lib/tokens.ts says : ${d.expected}   (${d.theme}Tokens.${String(d.mobileKey)})`
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

  it("only names mirrors that the pending ledger also knows about", () => {
    const knownIds = new Set(WEB_MIRRORS.map((mirror) => mirror.id));
    for (const id of Object.keys(PENDING_WEB_DRIFT)) {
      expect(knownIds.has(id)).toBe(true);
    }
  });
});

// ---------------------------------------------------------------------------
// Mirror 5: brand canonical
// ---------------------------------------------------------------------------

const BRAND_PATH = absolutePathOf(BRAND_MIRROR);
const BRAND_PRESENT = fs.existsSync(BRAND_PATH);
const BRAND_SKIP_REASON =
  "brand tokens.css is not present in this checkout. It lives under /outside_assets/, " +
  "which is gitignored and synchronised from SharePoint, so it is absent from a fresh " +
  "clone and from CI. Nothing is being verified about the brand palette on this run.";

if (!BRAND_PRESENT) {
  // The skip reason is in the test title too, but the default reporter only
  // prints titles for skipped tests in verbose mode, and a silently unenforced
  // guard is the thing this file exists to prevent.
  console.warn(`[tokens-mirror-drift] SKIPPING the brand canonical check: ${BRAND_SKIP_REASON}`);
}

describe(`${BRAND_MIRROR.label}`, () => {
  const itBrand = BRAND_PRESENT ? it : it.skip;

  itBrand(
    BRAND_PRESENT
      ? "agrees with lib/tokens.ts on every mapped token, in both themes"
      : `SKIPPED: ${BRAND_SKIP_REASON}`,
    () => {
      const blocks = readMirrorBlocks(BRAND_MIRROR);
      expect(atRuleLeaks(blocks)).toEqual([]);

      const divergences = divergencesFor(blocks);
      if (divergences.length > 0) {
        throw new Error(
          [
            `The brand canonical tokens.css has drifted from apps/mobile/lib/tokens.ts ` +
              `on ${divergences.length} token(s).`,
            "",
            "lib/tokens.ts is the source of truth. A mismatch here usually means the",
            "brand file was re-synced from SharePoint or regenerated from brand source,",
            "which is exactly how the WCAG AA failures get reintroduced. Fix the brand",
            "file, do not relax this test.",
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
    it("is tracked in git and readable", () => {
      expect(fs.existsSync(absolutePathOf(mirror))).toBe(true);
    });

    it("declares no mapped colour token inside an at-rule", () => {
      expect(atRuleLeaks(readMirrorBlocks(mirror))).toEqual([]);
    });

    it("diverges from lib/tokens.ts exactly as the jits-ozvd pending ledger records", () => {
      const divergences = divergencesFor(readMirrorBlocks(mirror));
      const pending = pendingFor(mirror);

      const actualByKey: Record<string, string> = {};
      for (const d of divergences) actualByKey[d.key] = d.actual;

      const uncovered = divergences.filter((d) => !(d.key in pending));
      const stale = divergences.filter(
        (d) => d.key in pending && pending[d.key] !== d.actual,
      );
      const resolved = Object.keys(pending).filter((key) => !(key in actualByKey));

      const problems: string[] = [];

      if (resolved.length > 0) {
        problems.push(
          [
            `GOOD NEWS, AND AN ACTION: ${resolved.length} pending entr(y/ies) for this`,
            "mirror now AGREE with lib/tokens.ts. Delete these lines from",
            `PENDING_WEB_DRIFT["${mirror.id}"] in this test file:`,
            "",
            ...resolved.map((key) => `      ${JSON.stringify(key)}: ${JSON.stringify(pending[key])},`),
            "",
            "When that mirror's map is empty, delete the whole mirror entry. When",
            "PENDING_WEB_DRIFT is empty, delete it and `pendingFor` as well, so the web",
            "mirrors are gated as strictly as the brand file.",
          ].join("\n"),
        );
      }

      if (uncovered.length > 0) {
        problems.push(
          [
            `NEW DRIFT: ${uncovered.length} token(s) diverge in a way the jits-ozvd`,
            "baseline does not cover. Either fix the mirror, or, if this divergence is",
            "part of the jits-ozvd web palette work, record it deliberately in",
            `PENDING_WEB_DRIFT["${mirror.id}"]:`,
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
            `CHANGED DRIFT: ${stale.length} pending entr(y/ies) still diverge, but the`,
            "mirror's value is no longer the one recorded. Update the ledger to match,",
            "or finish the fix so the entry can be deleted:",
            "",
            ...stale.map(
              (d) =>
                `      ${JSON.stringify(d.key)}: recorded ${JSON.stringify(
                  pending[d.key],
                )}, now ${JSON.stringify(d.actual)} (lib/tokens.ts: ${d.expected})`,
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
