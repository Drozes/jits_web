import { describe, expect, it } from "vitest";
/**
 * Outline, section keys and in-text references (jits-rog5.10), checked on
 * the four real documents and on small samples.
 */
import {
  LEGAL_DOCUMENTS,
  blockSpans,
  documentOutline,
  firstSection,
  linkReferences,
  parseLegalDocument,
  parseLegalMarkdown,
  sectionAnchor,
  sectionIndex,
  sectionKey,
  spansText,
  type InlineSpan,
  type LegalBlock,
  type LegalDocId,
  type LegalLang,
} from "./index";

const ALL: [LegalDocId, LegalLang][] = [
  ["terms", "en"],
  ["terms", "fr"],
  ["privacy", "en"],
  ["privacy", "fr"],
];
const md = (doc: LegalDocId, lang: LegalLang) => LEGAL_DOCUMENTS[doc][lang].markdown;
type Ref = Extract<InlineSpan, { kind: "ref" }>;
const refsOf = (blocks: LegalBlock[]) => blocks.flatMap(blockSpans).filter((s): s is Ref => s.kind === "ref");

/** Each block's plain text, in order: what linking must never change. */
function texts(blocks: LegalBlock[]): string[] {
  return blocks.map((b) =>
    b.kind === "list" || b.kind === "ordered"
      ? b.items.map(spansText).join("\n")
      : b.kind === "table"
        ? [...b.header, ...b.rows.flat()].map(spansText).join("\n")
        : spansText(b.spans),
  );
}

describe("documentOutline", () => {
  it.each(ALL)("%s (%s): every level-2 and level-3 heading, in order, at its block index", (doc, lang) => {
    const blocks = parseLegalDocument(doc, md(doc, lang));
    const outline = documentOutline(blocks);
    expect(outline.filter((e) => e.level === 2)).toHaveLength((md(doc, lang).match(/^## /gm) ?? []).length);
    expect(outline.filter((e) => e.level === 3)).toHaveLength((md(doc, lang).match(/^### /gm) ?? []).length);
    for (const e of outline) {
      const b = blocks[e.index];
      expect(b.kind === "heading" && spansText(b.spans)).toBe(e.text);
    }
    expect(outline.map((e) => e.index)).toEqual([...outline.map((e) => e.index)].sort((a, b) => a - b));
  });

  it("numbers the same sections in English and French", () => {
    for (const doc of ["terms", "privacy"] as const) {
      const keys = (lang: LegalLang) =>
        documentOutline(parseLegalDocument(doc, md(doc, lang))).map((e) => e.section);
      expect(keys("fr")).toEqual(keys("en"));
    }
    const terms = documentOutline(parseLegalDocument("terms", md("terms", "en")));
    expect(terms.filter((e) => e.level === 2 && e.section).map((e) => e.section)).toEqual(
      Array.from({ length: 29 }, (_, i) => String(i + 1)),
    );
    expect(terms[0]).toMatchObject({ text: "Key points (please read)", level: 2, section: null });
  });
});

describe("sectionKey / sectionIndex", () => {
  it("reads numbered headings and clause paragraphs, nothing else", () => {
    const blocks = parseLegalMarkdown(
      ["## 5. Waiver", "5.1 **How.** text", "### 4.6 Training", "founded in 2026. Since", "- 1.2 not a clause"].join("\n\n"),
    );
    expect(blocks.map(sectionKey)).toEqual(["5", "5.1", "4.6", null, null]);
    expect(sectionAnchor("24.3")).toBe("section-24-3");
  });

  it("finds Terms clauses and Privacy subsections", () => {
    expect(sectionIndex(parseLegalMarkdown(md("terms", "en"))).has("24.3")).toBe(true);
    expect(sectionIndex(parseLegalMarkdown(md("privacy", "en"))).has("4.6")).toBe(true);
  });
});

describe("linkReferences", () => {
  it.each(ALL)("%s (%s): never changes the text, never touches headings, and every target resolves", (doc, lang) => {
    const plain = parseLegalMarkdown(md(doc, lang));
    const linked = linkReferences(plain, doc);
    expect(texts(linked)).toEqual(texts(plain));
    const sections = sectionIndex(plain);
    const refs = refsOf(linked);
    expect(refs.length).toBeGreaterThan(30);
    for (const r of refs) {
      expect(r.text.trim()).toBe(r.text);
      if (r.target.doc === doc) {
        expect(r.target.section).toBeDefined();
        expect(sections.has(r.target.section!)).toBe(true);
        // A section reference ends with its number; a Contents item is the section's title.
        if (/^(sections?|articles?|\d)/i.test(r.text)) expect(r.text.endsWith(r.target.section!)).toBe(true);
      } else {
        expect(r.target.section).toBeUndefined();
        expect(r.target.doc).toBe(doc === "terms" ? "privacy" : "terms");
      }
    }
    linked.forEach((b, i) => {
      if (b.kind === "heading") expect(b).toBe(plain[i]);
    });
  });

  it.each(ALL)("%s (%s): links the other document by its exact title only", (doc, lang) => {
    const titles = refsOf(parseLegalDocument(doc, md(doc, lang)))
      .filter((r) => !r.target.section)
      .map((r) => r.text);
    const expected = { terms: { en: "Privacy Policy", fr: "Politique de confidentialité" }, privacy: { en: "Terms of Service", fr: "Conditions d'utilisation" } }[doc][lang];
    expect(titles.length).toBeGreaterThan(0);
    expect(new Set(titles)).toEqual(new Set([expected]));
  });

  it("the Terms key points link SECTION 5 / ARTICLE 5 to Section 5, keeping the bold", () => {
    for (const lang of ["en", "fr"] as const) {
      const first = firstSection(parseLegalDocument("terms", md("terms", lang))).find((b) => b.kind === "list");
      if (!first || first.kind !== "list") throw new Error("expected the key points list");
      const ref = first.items[0].find((s): s is Ref => s.kind === "ref");
      expect(ref).toMatchObject({ text: lang === "en" ? "SECTION 5" : "ARTICLE 5", style: "strong", target: { doc: "terms", section: "5" } });
    }
  });

  it("never links statutes or numbers that are not sections of this document", () => {
    for (const lang of ["en", "fr"] as const) {
      const refs = refsOf(parseLegalDocument("terms", md("terms", lang))).map((r) => r.text);
      expect(refs.some((t) => /\b(61|1477|1542)\b/.test(t))).toBe(false);
    }
    const sample = parseLegalMarkdown(
      [
        "## 5. Waiver",
        "",
        "## 12. Recording",
        "",
        "12.3 **Consent.** text",
        "",
        "See Section 5, section 61 of the Family Law Act, Section 230, Section 12.3 of every person, article 5 du Code civil and Sections 5 and 12.",
      ].join("\n"),
    );
    const [para] = linkReferences(sample, "terms").slice(-1);
    if (para.kind !== "paragraph") throw new Error("expected a paragraph");
    expect(para.spans.filter((s): s is Ref => s.kind === "ref").map((r) => [r.text, r.target.section])).toEqual([
      ["Section 5", "5"],
      ["Section 12.3", "12.3"],
      ["Sections 5", "5"],
      ["12", "12"],
    ]);
    expect(spansText(para.spans)).toBe(spansText((sample.slice(-1)[0] as { spans: InlineSpan[] }).spans));
  });

  it("does not let a document link itself by name", () => {
    const blocks = linkReferences(parseLegalMarkdown("## 1. A\n\nThese Terms of Service and our Privacy Policy."), "privacy");
    const refs = refsOf(blocks);
    expect(refs.map((r) => r.text)).toEqual(["Terms of Service"]);
  });

  it.each(["en", "fr"] as const)("links every item of the Terms' own Contents list (%s) to its section", (lang) => {
    const blocks = parseLegalDocument("terms", md("terms", lang));
    const at = blocks.findIndex((b) => b.kind === "heading" && b.level === 2 && /^(Contents|Table des matières)$/.test(spansText(b.spans)));
    const list = blocks[at + 1];
    if (list.kind !== "ordered") throw new Error("expected the contents list");
    expect(list.items).toHaveLength(29);
    const sections = sectionIndex(blocks);
    list.items.forEach((item, i) => {
      expect(item).toHaveLength(1);
      const [ref] = item;
      expect(ref).toMatchObject({ kind: "ref", target: { doc: "terms", section: String(i + 1) } });
      const heading = blocks[sections.get(String(i + 1))!];
      expect(heading.kind === "heading" && spansText(heading.spans)).toBe(`${i + 1}. ${spansText(item)}`);
    });
  });

  it("leaves other ordered lists alone, even right after an unnumbered heading", () => {
    const blocks = linkReferences(parseLegalMarkdown("## 1. A\n\n## Steps\n\n1. Something else\n2. A"), "terms");
    expect(refsOf(blocks)).toEqual([]);
  });

  it.each(["en", "fr"] as const)("never links the other document's name inside a clause's own title (Terms 1.6, %s)", (lang) => {
    const blocks = parseLegalDocument("terms", md("terms", lang));
    const clause = blocks[sectionIndex(blocks).get("1.6")!];
    if (clause.kind !== "paragraph") throw new Error("expected clause 1.6");
    const title = clause.spans.find((s) => s.kind === "strong");
    expect(title && spansText([title])).toMatch(/^(Privacy Policy|Politique de confidentialité)/);
    const refs = clause.spans.filter((s): s is Ref => s.kind === "ref");
    expect(refs.length).toBeGreaterThan(0);
    expect(clause.spans.indexOf(refs[0])).toBeGreaterThan(clause.spans.indexOf(title!));
  });

  it.each(["en", "fr"] as const)("still links a bold document name later in a clause (Terms 19.1, %s)", (lang) => {
    const blocks = parseLegalDocument("terms", md("terms", lang));
    const clause = blocks[sectionIndex(blocks).get("19.1")!];
    if (clause.kind !== "paragraph") throw new Error("expected clause 19.1");
    const ref = clause.spans.find((s): s is Ref => s.kind === "ref" && s.target.doc === "privacy");
    expect(ref).toMatchObject({ style: "strong", text: lang === "en" ? "Privacy Policy" : "Politique de confidentialité" });
  });

  it("treats a bold span as the clause title only when it opens the clause", () => {
    const blocks = linkReferences(
      parseLegalMarkdown(
        ["## 1. A", "", "1.1 **Privacy Policy rules.** See our **Privacy Policy**.", "", "1.2 Read our **Privacy Policy** first."].join("\n"),
      ),
      "terms",
    );
    const titled = blocks[1];
    const untitled = blocks[2];
    if (titled.kind !== "paragraph" || untitled.kind !== "paragraph") throw new Error("expected clauses");
    expect(titled.spans[1]).toEqual({ kind: "strong", text: "Privacy Policy rules." });
    expect(refsOf([titled]).map((r) => r.text)).toEqual(["Privacy Policy"]);
    expect(refsOf([untitled])).toEqual([{ kind: "ref", text: "Privacy Policy", style: "strong", target: { doc: "privacy" } }]);
  });

  it("the English Privacy Policy links 'section 16.3' like the French", () => {
    for (const lang of ["en", "fr"] as const) {
      const refs = refsOf(parseLegalDocument("privacy", md("privacy", lang)));
      expect(refs.some((r) => r.target.section === "16.3")).toBe(true);
    }
  });
});
