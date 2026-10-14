/**
 * A deliberately tiny Markdown reader for the legal documents (TERMS.md,
 * PRIVACY_POLICY.md and their French versions TERMS.fr.md,
 * PRIVACY_POLICY.fr.md), shared by the web pages (/terms, /privacy,
 * /terms/fr, /privacy/fr; jits-s6mi.7) and the native legal modal
 * (jits-rog5.8), so both platforms render the same blocks. It covers exactly
 * what those files use: ATX headings, paragraphs, "- " lists and "1. "
 * ordered lists (both with indented continuation lines), "> " blockquotes,
 * GitHub-style pipe tables (rows start with "|"), **bold** and *italic*.
 * Anything else renders as plain paragraph text, never as HTML: the output is
 * data, rendered by React or React Native, so nothing is injected. Pure
 * TypeScript with no DOM or Node APIs, so it runs on Hermes.
 *
 * A "TBD" (in any inline style) becomes its own `tbd` span, a safety net so
 * a placeholder left in a document shows visibly marked on the page instead
 * of reading as final text.
 */

import type { LegalDocId } from "./types";

export type TextKind = "text" | "strong" | "em";

/** Where an in-text reference points: another document, or a numbered section of one. */
export interface LegalRefTarget {
  doc: LegalDocId;
  /** A section key such as "5", "24.3" or "4.6" (see `sectionKey` in ./references). */
  section?: string;
}

export type InlineSpan =
  | { kind: TextKind; text: string }
  | { kind: "tbd" }
  /**
   * An in-text reference ("Section 5", "Privacy Policy"), added by
   * `linkReferences` (./references), never by the Markdown reader itself.
   * `style` keeps the bold or italic of the text it was cut from.
   */
  | { kind: "ref"; text: string; style: TextKind; target: LegalRefTarget };

export type LegalBlock =
  | { kind: "heading"; level: 1 | 2 | 3; spans: InlineSpan[] }
  | { kind: "paragraph"; spans: InlineSpan[] }
  | { kind: "list"; items: InlineSpan[][] }
  | { kind: "ordered"; start: number; items: InlineSpan[][] }
  | { kind: "table"; header: InlineSpan[][]; rows: InlineSpan[][][] }
  | { kind: "quote"; spans: InlineSpan[] };

const TBD = /\bTBD\b/;

function splitTbd(text: string, kind: TextKind): InlineSpan[] {
  const out: InlineSpan[] = [];
  const parts = text.split(/\b(TBD)\b/);
  parts.forEach((part, i) => {
    if (i % 2 === 1) out.push({ kind: "tbd" });
    else if (part) out.push({ kind, text: part });
  });
  return out;
}

/**
 * **bold** first, then *italic*: a single-asterisk run must start and end on
 * a non-space, non-asterisk character, so "a * b * c" and "**" stay text.
 */
const INLINE = /\*\*(.+?)\*\*|\*([^*\s](?:[^*]*?[^*\s])?)\*/g;

export function parseInline(text: string): InlineSpan[] {
  const spans: InlineSpan[] = [];
  const re = new RegExp(INLINE.source, "g");
  let last = 0;
  for (let m = re.exec(text); m; m = re.exec(text)) {
    if (m.index > last) spans.push(...splitTbd(text.slice(last, m.index), "text"));
    if (m[1] !== undefined) spans.push(...splitTbd(m[1], "strong"));
    else spans.push(...splitTbd(m[2], "em"));
    last = m.index + m[0].length;
  }
  if (last < text.length) spans.push(...splitTbd(text.slice(last), "text"));
  return spans;
}

const TABLE_SEPARATOR = /^\|?\s*:?-+:?\s*(\|\s*:?-+:?\s*)*\|?$/;

/** Splits "| a | b |" into ["a", "b"]; "\|" is a literal pipe inside a cell. */
function tableCells(row: string): string[] {
  const PIPE = "\u0000"; // stands in for an escaped pipe while splitting
  const inner = row.trim().replace(/\\\|/g, PIPE).replace(/^\|/, "").replace(/\|$/, "");
  return inner.split("|").map((c) => c.trim().split(PIPE).join("|"));
}

/** A header row, a separator row, then body rows; anything else is not a table. */
function parseTable(lines: string[]): LegalBlock | null {
  if (lines.length < 2 || !TABLE_SEPARATOR.test(lines[1].trim())) return null;
  const header = tableCells(lines[0]);
  const width = header.length;
  if (tableCells(lines[1]).length !== width) return null;
  const rows = lines.slice(2).map((line) => {
    const cells = tableCells(line).slice(0, width);
    while (cells.length < width) cells.push("");
    return cells.map(parseInline);
  });
  return { kind: "table", header: header.map(parseInline), rows };
}

export function parseLegalMarkdown(markdown: string): LegalBlock[] {
  const blocks: LegalBlock[] = [];
  const lines = markdown.replace(/\r\n?/g, "\n").split("\n");
  let para: string[] = [];
  let quote: string[] = [];
  let table: string[] = [];
  let list: { ordered: boolean; start: number; items: string[] } | null = null;

  const flush = () => {
    if (para.length) blocks.push({ kind: "paragraph", spans: parseInline(para.join(" ")) });
    if (quote.length) blocks.push({ kind: "quote", spans: parseInline(quote.join(" ")) });
    if (list) {
      const items = list.items.map(parseInline);
      blocks.push(list.ordered ? { kind: "ordered", start: list.start, items } : { kind: "list", items });
    }
    if (table.length) {
      // A malformed table (no separator row, or one whose cell count differs
      // from the header's) degrades to a plain paragraph.
      blocks.push(parseTable(table) ?? { kind: "paragraph", spans: parseInline(table.map((l) => l.trim()).join(" ")) });
    }
    para = [];
    quote = [];
    table = [];
    list = null;
  };

  for (const raw of lines) {
    const line = raw.trimEnd();
    if (!line.trim()) {
      flush();
      continue;
    }
    const heading = /^(#{1,3})\s+(.*)$/.exec(line);
    if (heading) {
      flush();
      blocks.push({
        kind: "heading",
        level: heading[1].length as 1 | 2 | 3,
        spans: parseInline(heading[2].trim()),
      });
      continue;
    }
    if (line.trim().startsWith("|")) {
      if (para.length || quote.length || list) flush();
      table.push(line);
      continue;
    }
    const quoted = /^>\s?(.*)$/.exec(line);
    if (quoted) {
      if (para.length || list || table.length) flush();
      quote.push(quoted[1].trim());
      continue;
    }
    // "1. " starts an ordered item; "5.1 **Title.**" (no space after the
    // first dot) stays a paragraph. As in CommonMark, only an item numbered 1
    // may interrupt an open paragraph, so a wrapped "...founded in\n2026. Since"
    // stays one paragraph.
    const numbered = /^(\d+)\.\s+(.*)$/.exec(line);
    const ordered = numbered && (!para.length || numbered[1] === "1") ? numbered : null;
    const bullet = ordered ? null : /^[-*]\s+(.*)$/.exec(line);
    if (ordered || bullet) {
      const isOrdered = Boolean(ordered);
      if (para.length || quote.length || table.length || (list && list.ordered !== isOrdered)) flush();
      list ??= { ordered: isOrdered, start: ordered ? Number(ordered[1]) : 1, items: [] };
      list.items.push((ordered?.[2] ?? bullet?.[1] ?? "").trim());
      continue;
    }
    // An indented line continues the current list item.
    if (list && /^\s+/.test(raw)) {
      list.items[list.items.length - 1] += ` ${line.trim()}`;
      continue;
    }
    if (list || quote.length || table.length) flush();
    para.push(line.trim());
  }
  flush();
  return blocks;
}

/** Every inline span in a block, in reading order (list items and table cells included). */
export function blockSpans(block: LegalBlock): InlineSpan[] {
  switch (block.kind) {
    case "list":
    case "ordered":
      return block.items.flat();
    case "table":
      return [...block.header.flat(), ...block.rows.flat(2)];
    default:
      return block.spans;
  }
}

/** True when a document still carries an unfilled placeholder. */
export function hasPlaceholders(markdown: string): boolean {
  return TBD.test(markdown);
}

/** The document's first H1, used as the page title. */
export function documentTitle(blocks: LegalBlock[]): string {
  const h1 = blocks.find((b) => b.kind === "heading" && b.level === 1);
  if (!h1 || h1.kind !== "heading") return "";
  return spansText(h1.spans);
}

/** The plain text of some spans ("TBD" for a placeholder). */
export function spansText(spans: InlineSpan[]): string {
  return spans.map((s) => (s.kind === "tbd" ? "TBD" : s.text)).join("");
}

/**
 * The document's first level-2 section: its heading and every block up to
 * the next level-1 or level-2 heading. In the Terms that is "Key points
 * (please read)" / "Points clés (à lire attentivement)"; empty when the
 * document has no level-2 heading.
 */
export function firstSection(blocks: LegalBlock[]): LegalBlock[] {
  const start = blocks.findIndex((b) => b.kind === "heading" && b.level === 2);
  if (start < 0) return [];
  const rest = blocks.slice(start + 1);
  const end = rest.findIndex((b) => b.kind === "heading" && b.level <= 2);
  return blocks.slice(start, end < 0 ? blocks.length : start + 1 + end);
}

/**
 * An accessible name for a table: "Table: Provider, What they do for us" (or
 * "Tableau: ..." in French), so each table on a page has its own name.
 */
export function tableLabel(header: InlineSpan[][], lang: "en" | "fr" = "en"): string {
  const columns = header
    .map((cell) => spansText(cell).trim())
    .filter(Boolean)
    .join(", ");
  const noun = lang === "fr" ? "Tableau" : "Table";
  return columns ? `${noun}: ${columns}` : noun;
}
