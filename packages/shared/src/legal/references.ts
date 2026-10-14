/**
 * In-text references and the outline of a legal document (jits-rog5.10),
 * shared by the web pages and the native modal.
 *
 * Sections are numbered the same way in all four files: level-2 headings
 * "## 5. ASSUMPTION OF RISK ..." (Terms and Privacy Policy), level-3 headings
 * "### 4.6 Product improvement ..." (Privacy Policy), and clause paragraphs
 * "5.1 **How you accept.** ..." (Terms). Each of those is a section key
 * ("5", "4.6", "5.1").
 *
 * References are detected conservatively, only outside headings:
 * - "Section 5", "Sections 22 and 23", "section 4.6", "SECTION 5",
 *   "article 24.3", "articles 5, 22 et 23" (the Terms in French say
 *   "article", the French Privacy Policy says "section"): every number that
 *   is a section of THIS document becomes a reference; a number that is not
 *   (a statute such as "section 61 of the Family Law Act", "article 1477 du
 *   Code civil") stays text, and a run followed by "of the" / "du" / "de la"
 *   is never linked at all.
 * - The other document by its title: "Privacy Policy" / "Politique de
 *   confidentialité" in the Terms, "Terms of Service" / "Conditions
 *   d'utilisation" in the Privacy Policy (exact case, as the files write them).
 *   A document naming itself is never linked, and neither is a title inside
 *   a clause's own bold heading ("1.6 **Privacy Policy and feature rules.**").
 * - The Terms' own "Contents" list: each item links to its section (only
 *   when every item matches its section's heading).
 */
import { parseLegalMarkdown, spansText, type InlineSpan, type LegalBlock, type TextKind } from "./markdown";
import type { LegalDocId } from "./types";

const HEADING_KEY = /^(\d+(?:\.\d+)?)\.?\s/;
const CLAUSE_KEY = /^(\d+\.\d+)\s/;

/** The section key a block starts, or null: "5" for "5. ASSUMPTION ...", "5.1" for a "5.1 **How you accept.**" clause. */
export function sectionKey(block: LegalBlock): string | null {
  if (block.kind === "heading" && block.level >= 2) return HEADING_KEY.exec(spansText(block.spans))?.[1] ?? null;
  if (block.kind === "paragraph") return CLAUSE_KEY.exec(spansText(block.spans))?.[1] ?? null;
  return null;
}

/** Section key to block index (the first block that starts that section). */
export function sectionIndex(blocks: LegalBlock[]): Map<string, number> {
  const map = new Map<string, number>();
  blocks.forEach((b, i) => {
    const key = sectionKey(b);
    if (key && !map.has(key)) map.set(key, i);
  });
  return map;
}

/** A stable HTML id for a section: "section-5", "section-24-3". */
export function sectionAnchor(section: string): string {
  return `section-${section.replace(/\./g, "-")}`;
}

export interface OutlineEntry {
  /** Index of the heading in the document's blocks (a FlatList row on native). */
  index: number;
  text: string;
  level: 2 | 3;
  /** The section key, when the heading is numbered. */
  section: string | null;
}

/** The document's level-2 and level-3 headings, in order (the Contents list). */
export function documentOutline(blocks: LegalBlock[]): OutlineEntry[] {
  const out: OutlineEntry[] = [];
  blocks.forEach((b, index) => {
    if (b.kind !== "heading" || b.level === 1) return;
    out.push({ index, text: spansText(b.spans), level: b.level, section: sectionKey(b) });
  });
  return out;
}

const OTHER_DOC_TITLE: Record<LegalDocId, { doc: LegalDocId; re: RegExp }> = {
  terms: { doc: "privacy", re: /\bPrivacy Policy\b|Politique de confidentialité/g },
  privacy: { doc: "terms", re: /\bTerms of Service\b|Conditions d['’]utilisation/g },
};

const NUMBER = String.raw`\d+(?:\.\d+)?(?![\d])`;
const SECTION_RUN = new RegExp(
  String.raw`\b(sections?|articles?)\s+(${NUMBER}(?:(?:\s*,\s*|\s+(?:and|or|to|et|ou|à)\s+)${NUMBER})*)`,
  "gi",
);
const STATUTE_AFTER = /^\s+(?:of (?:the|an?)\b|du\b|de la\b|de l['’]|des\b)/i;

/** Splits one text into plain and reference pieces. */
function splitText(
  text: string,
  style: TextKind,
  doc: LegalDocId,
  sections: Map<string, number>,
  titles = true,
): InlineSpan[] {
  type Hit = { start: number; end: number; spans: InlineSpan[] };
  const hits: Hit[] = [];

  const run = new RegExp(SECTION_RUN.source, "gi");
  for (let m = run.exec(text); m; m = run.exec(text)) {
    if (STATUTE_AFTER.test(text.slice(m.index + m[0].length))) continue;
    const list = m[2];
    const listStart = m.index + m[0].length - list.length;
    const spans: InlineSpan[] = [];
    let cursor = m.index;
    let first = true;
    const num = new RegExp(NUMBER, "g");
    for (let n = num.exec(list); n; n = num.exec(list)) {
      const at = listStart + n.index;
      const end = at + n[0].length;
      if (sections.has(n[0])) {
        // The first number takes the keyword with it ("Section 5"): a bigger target to tap.
        const from = first ? m.index : at;
        if (from > cursor) spans.push({ kind: style, text: text.slice(cursor, from) });
        spans.push({ kind: "ref", text: text.slice(from, end), style, target: { doc, section: n[0] } });
        cursor = end;
      }
      first = false;
    }
    if (cursor === m.index) continue; // nothing in this run resolves
    const end = m.index + m[0].length;
    if (end > cursor) spans.push({ kind: style, text: text.slice(cursor, end) });
    hits.push({ start: m.index, end, spans });
  }

  const other = OTHER_DOC_TITLE[doc];
  const title = new RegExp(other.re.source, "g");
  for (let m = titles ? title.exec(text) : null; m; m = title.exec(text)) {
    const start = m.index;
    const end = start + m[0].length;
    if (hits.some((h) => start < h.end && end > h.start)) continue;
    hits.push({ start, end, spans: [{ kind: "ref", text: m[0], style, target: { doc: other.doc } }] });
  }

  if (!hits.length) return [{ kind: style, text }];
  hits.sort((a, b) => a.start - b.start);
  const out: InlineSpan[] = [];
  let last = 0;
  for (const h of hits) {
    if (h.start > last) out.push({ kind: style, text: text.slice(last, h.start) });
    out.push(...h.spans);
    last = h.end;
  }
  if (last < text.length) out.push({ kind: style, text: text.slice(last) });
  return out;
}

/**
 * `clause`: the spans of a numbered clause paragraph ("1.6 **Privacy Policy
 * and feature rules.** ..."). Its leading bold span is the clause's own
 * title, so a document title inside it is not a reference.
 */
function linkSpans(spans: InlineSpan[], doc: LegalDocId, sections: Map<string, number>, clause = false): InlineSpan[] {
  // The title only when it opens the clause: "5.1 " then the bold span.
  const opensWithTitle =
    clause && spans[0]?.kind === "text" && /^\d+\.\d+\s+$/.test(spans[0].text) && spans[1]?.kind === "strong";
  const titleAt = opensWithTitle ? 1 : -1;
  return spans.flatMap((s, i) =>
    s.kind === "text" || s.kind === "strong" || s.kind === "em" ? splitText(s.text, s.kind, doc, sections, i !== titleAt) : [s],
  );
}

/** "1. Acceptance of these Terms" -> "Acceptance of these Terms". */
const headingTitle = (b: LegalBlock) => (b.kind === "heading" ? spansText(b.spans).replace(/^\d+(?:\.\d+)?\.?\s+/, "") : "");

/**
 * The Terms' own table of contents: an ordered list right after an
 * unnumbered H2 whose every item (number start + i) reads exactly like that
 * section's heading. Each item becomes one reference to its section; any
 * other ordered list is left alone.
 */
function linkContentsList(
  b: Extract<LegalBlock, { kind: "ordered" }>,
  prev: LegalBlock | undefined,
  blocks: LegalBlock[],
  sections: Map<string, number>,
  doc: LegalDocId,
): LegalBlock | null {
  if (!prev || prev.kind !== "heading" || prev.level !== 2 || sectionKey(prev) !== null) return null;
  const refs: InlineSpan[][] = [];
  for (let i = 0; i < b.items.length; i++) {
    const key = String(b.start + i);
    const at = sections.get(key);
    const item = b.items[i];
    if (at === undefined || item.some((s) => s.kind === "tbd") || spansText(item) !== headingTitle(blocks[at])) return null;
    refs.push([{ kind: "ref", text: spansText(item), style: "text", target: { doc, section: key } }]);
  }
  return { ...b, items: refs };
}

/**
 * Adds reference spans to every block but the headings. `blocks` must be the
 * WHOLE document (the section map comes from it), even when only an excerpt
 * (`firstSection`) is shown. Never changes the text: joining every span's
 * text gives the same string as before.
 */
export function linkReferences(blocks: LegalBlock[], doc: LegalDocId): LegalBlock[] {
  const sections = sectionIndex(blocks);
  const link = (spans: InlineSpan[]) => linkSpans(spans, doc, sections);
  return blocks.map((b, i): LegalBlock => {
    switch (b.kind) {
      case "heading":
        return b;
      case "list":
        return { ...b, items: b.items.map(link) };
      case "ordered":
        return linkContentsList(b, blocks[i - 1], blocks, sections, doc) ?? { ...b, items: b.items.map(link) };
      case "table":
        return { ...b, header: b.header, rows: b.rows.map((r) => r.map(link)) };
      case "paragraph":
        return { ...b, spans: linkSpans(b.spans, doc, sections, sectionKey(b) !== null) };
      default:
        return { ...b, spans: link(b.spans) };
    }
  });
}

/** One legal document parsed with its references linked: what both apps render. */
export function parseLegalDocument(doc: LegalDocId, markdown: string): LegalBlock[] {
  return linkReferences(parseLegalMarkdown(markdown), doc);
}
