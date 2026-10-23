import { describe, expect, it } from "vitest";
/**
 * The bundled legal documents (jits-s6mi.7, shared since jits-rog5.8): the
 * generated module must match the repo-root Markdown, its metadata must come
 * from the documents themselves, the reader must leave no unsupported
 * Markdown behind as text, and any TBD left in a document must stay visibly
 * marked.
 */
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import {
  LEGAL_DOCUMENTS,
  LEGAL_WEB_PATHS,
  PRIVACY_EN,
  PRIVACY_FR,
  TERMS_EN,
  TERMS_FR,
  blockSpans,
  documentTitle,
  firstSection,
  hasPlaceholders,
  isLegalDocId,
  isLegalLang,
  parseLegalMarkdown,
  spansText,
} from "./index";

const ALL = [TERMS_EN, TERMS_FR, PRIVACY_EN, PRIVACY_FR];
const root = path.resolve(__dirname, "..", "..", "..", "..");
const script = path.join(root, "packages", "shared", "scripts", "sync-legal-docs.mjs");

describe("bundled legal documents", () => {
  it.each(ALL.map((d) => [d.source, d] as const))("%s is in sync (run: npm run legal:sync)", (file, doc) => {
    expect(doc.markdown).toBe(readFileSync(path.join(root, file), "utf8").replace(/\r\n?/g, "\n"));
    expect(doc.markdown).not.toContain("\r");
  });

  it("the whole generated module is what the generator writes now (npm run legal:sync)", () => {
    expect(() => execFileSync(process.execPath, [script, "--check"], { stdio: "pipe" })).not.toThrow();
  });

  it("titles are each document's H1", () => {
    expect(TERMS_EN.title).toBe("ELO RATED Terms of Service");
    expect(PRIVACY_EN.title).toBe("ELO RATED Privacy Policy");
    expect(TERMS_FR.title).toBe("Conditions d'utilisation d'ELO RATED");
    expect(PRIVACY_FR.title).toBe("Politique de confidentialité d'ELO RATED");
    for (const doc of ALL) expect(documentTitle(parseLegalMarkdown(doc.markdown))).toBe(doc.title);
  });

  it("reads the effective and last-updated dates in both label styles and both languages", () => {
    for (const doc of [TERMS_EN, PRIVACY_EN]) {
      expect(doc.effectiveDate).toBe("October 13, 2026");
      expect(doc.lastUpdated).toBe("October 23, 2026");
    }
    for (const doc of [TERMS_FR, PRIVACY_FR]) {
      expect(doc.effectiveDate).toBe("13 octobre 2026");
      expect(doc.lastUpdated).toBe("23 octobre 2026");
    }
    for (const doc of ALL) {
      expect(doc.effectiveDate).not.toMatch(/[*:]/);
      expect(doc.markdown).toContain(doc.effectiveDate);
    }
  });

  it("versions are the SHA-256 prefix of the text: stable, distinct per document", () => {
    for (const doc of ALL) {
      expect(doc.version).toMatch(/^[0-9a-f]{12}$/);
      expect(doc.version).toBe(createHash("sha256").update(doc.markdown, "utf8").digest("hex").slice(0, 12));
    }
    expect(new Set(ALL.map((d) => d.version)).size).toBe(ALL.length);
  });

  it("indexes every document by id and language, with its web path", () => {
    expect(LEGAL_DOCUMENTS.terms.en).toBe(TERMS_EN);
    expect(LEGAL_DOCUMENTS.terms.fr).toBe(TERMS_FR);
    expect(LEGAL_DOCUMENTS.privacy.en).toBe(PRIVACY_EN);
    expect(LEGAL_DOCUMENTS.privacy.fr).toBe(PRIVACY_FR);
    expect(LEGAL_WEB_PATHS).toEqual({
      terms: { en: "/terms", fr: "/terms/fr" },
      privacy: { en: "/privacy", fr: "/privacy/fr" },
    });
    expect(isLegalDocId("terms")).toBe(true);
    expect(isLegalDocId("eula")).toBe(false);
    expect(isLegalLang("fr")).toBe(true);
    expect(isLegalLang(undefined)).toBe(false);
  });

  it.each([
    ["en", TERMS_EN, /^THESE TERMS INCLUDE AN ASSUMPTION OF RISK, WAIVER AND RELEASE OF LIABILITY \(SECTION 5\)\./],
    ["fr", TERMS_FR, /^LES PRÉSENTES CONDITIONS COMPRENNENT UNE ACCEPTATION DES RISQUES .*\(ARTICLE 5\)\./],
  ] as const)(
    "the inline key points excerpt (%s) is the blocks between the Key points H2 and the next H2, waiver bullet first",
    (_lang, doc, waiver) => {
      const blocks = parseLegalMarkdown(doc.markdown);
      const excerpt = firstSection(blocks);
      const start = blocks.indexOf(excerpt[0]);
      expect(excerpt.length).toBeGreaterThan(2);
      expect(excerpt[0].kind === "heading" && excerpt[0].level).toBe(2);
      const next = blocks[start + excerpt.length];
      expect(next.kind === "heading" && next.level).toBe(2);
      expect(excerpt.slice(1).some((b) => b.kind === "heading" && b.level <= 2)).toBe(false);
      // The waiver is the first bullet, near the top, never buried.
      const listAt = excerpt.findIndex((b) => b.kind === "list");
      expect(listAt).toBeGreaterThan(0);
      expect(listAt).toBeLessThanOrEqual(2);
      const list = excerpt[listAt];
      if (list.kind !== "list") throw new Error("expected a list");
      expect(spansText(list.items[0])).toMatch(waiver);
      expect(spansText(list.items[0])).toMatch(/negligence|négligence/);
    },
  );

  it("the Terms open with their key points section in both languages", () => {
    expect(spansText(headingSpans(firstSection(parseLegalMarkdown(TERMS_EN.markdown))[0]))).toBe(
      "Key points (please read)",
    );
    expect(spansText(headingSpans(firstSection(parseLegalMarkdown(TERMS_FR.markdown))[0]))).toBe(
      "Points clés (à lire attentivement)",
    );
  });

  it("leaves no unsupported Markdown behind as text (stray asterisks, table rows, escaped pipes)", () => {
    for (const { markdown } of ALL) {
      const texts = parseLegalMarkdown(markdown)
        .flatMap(blockSpans)
        .flatMap((s) => (s.kind === "tbd" ? [] : [s.text]));
      for (const text of texts) {
        expect(text).not.toContain("*");
        expect(text.trimStart().startsWith("|")).toBe(false);
        expect(text).not.toContain("\\|");
      }
    }
  });

  it("keeps every TBD placeholder as a marked span (none are invented or dropped)", () => {
    for (const { markdown } of ALL) {
      const expected = (markdown.match(/\bTBD\b/g) ?? []).length;
      const spans = parseLegalMarkdown(markdown).flatMap(blockSpans);
      expect(spans.filter((s) => s.kind === "tbd")).toHaveLength(expected);
      expect(hasPlaceholders(markdown)).toBe(expected > 0);
    }
  });
});

function headingSpans(block: ReturnType<typeof parseLegalMarkdown>[number] | undefined) {
  if (!block || block.kind !== "heading") throw new Error("expected a heading");
  return block.spans;
}

describe("no named service providers (jits-o47s.46)", () => {
  // The documents are shown in the app; the owner wants providers described
  // generically. The app stores, sign-in options and Instagram handles are
  // platforms the user deals with directly and are not on this list.
  const NAMES = /gemini|openai|chatgpt|anthropic|claude|supabase|vercel|sentry|google cloud|vertex/i;

  it("none of the four documents names one", () => {
    for (const doc of ALL) expect(doc.markdown).not.toMatch(NAMES);
  });
});
