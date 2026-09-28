/**
 * A deliberately tiny Markdown reader for the two legal documents
 * (TERMS.md, PRIVACY_POLICY.md) served at /terms and /privacy (jits-s6mi.7).
 * It covers exactly what those files use: ATX headings, paragraphs,
 * "- " lists (with indented continuation lines), "> " blockquotes and
 * **bold**. Anything else renders as plain paragraph text, never as HTML:
 * the output is data, rendered by React, so nothing is injected.
 *
 * A "TBD" (bold or plain) becomes its own `tbd` span so the page can mark
 * the placeholders the owner still has to fill (legal contact, rights
 * email, jurisdiction) visibly, instead of letting them read as final text.
 */

export type InlineSpan =
  | { kind: "text"; text: string }
  | { kind: "strong"; text: string }
  | { kind: "tbd" };

export type LegalBlock =
  | { kind: "heading"; level: 1 | 2 | 3; spans: InlineSpan[] }
  | { kind: "paragraph"; spans: InlineSpan[] }
  | { kind: "list"; items: InlineSpan[][] }
  | { kind: "quote"; spans: InlineSpan[] };

const TBD = /\bTBD\b/;

function splitTbd(text: string, kind: "text" | "strong"): InlineSpan[] {
  const out: InlineSpan[] = [];
  const parts = text.split(/\b(TBD)\b/);
  parts.forEach((part, i) => {
    if (i % 2 === 1) out.push({ kind: "tbd" });
    else if (part) out.push({ kind, text: part });
  });
  return out;
}

export function parseInline(text: string): InlineSpan[] {
  const spans: InlineSpan[] = [];
  const re = /\*\*(.+?)\*\*/g;
  let last = 0;
  for (let m = re.exec(text); m; m = re.exec(text)) {
    if (m.index > last) spans.push(...splitTbd(text.slice(last, m.index), "text"));
    spans.push(...splitTbd(m[1], "strong"));
    last = m.index + m[0].length;
  }
  if (last < text.length) spans.push(...splitTbd(text.slice(last), "text"));
  return spans;
}

export function parseLegalMarkdown(markdown: string): LegalBlock[] {
  const blocks: LegalBlock[] = [];
  const lines = markdown.replace(/\r\n?/g, "\n").split("\n");
  let para: string[] = [];
  let quote: string[] = [];
  let list: string[] | null = null;

  const flush = () => {
    if (para.length) blocks.push({ kind: "paragraph", spans: parseInline(para.join(" ")) });
    if (quote.length) blocks.push({ kind: "quote", spans: parseInline(quote.join(" ")) });
    if (list) blocks.push({ kind: "list", items: list.map(parseInline) });
    para = [];
    quote = [];
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
    const quoted = /^>\s?(.*)$/.exec(line);
    if (quoted) {
      if (para.length || list) flush();
      quote.push(quoted[1].trim());
      continue;
    }
    const item = /^[-*]\s+(.*)$/.exec(line);
    if (item) {
      if (para.length || quote.length) flush();
      (list ??= []).push(item[1].trim());
      continue;
    }
    // An indented line continues the current list item.
    if (list && /^\s+/.test(raw)) {
      list[list.length - 1] += ` ${line.trim()}`;
      continue;
    }
    if (list || quote.length) flush();
    para.push(line.trim());
  }
  flush();
  return blocks;
}

/** True when a document still carries an unfilled placeholder. */
export function hasPlaceholders(markdown: string): boolean {
  return TBD.test(markdown);
}

/** The document's first H1, used as the page title. */
export function documentTitle(blocks: LegalBlock[]): string {
  const h1 = blocks.find((b) => b.kind === "heading" && b.level === 1);
  if (!h1 || h1.kind !== "heading") return "";
  return h1.spans.map((s) => (s.kind === "tbd" ? "TBD" : s.text)).join("");
}
