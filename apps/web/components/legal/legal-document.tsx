import Link from "next/link";
import type { InlineSpan, LegalBlock, LegalDocId, LegalLang, LegalRefTarget } from "@jits/shared/legal";
import {
  LEGAL_WEB_PATHS,
  parseLegalDocument,
  parseLegalMarkdown,
  sectionAnchor,
  sectionKey,
  tableLabel,
} from "@jits/shared/legal";

/**
 * Server component rendering one legal document (TERMS.md, PRIVACY_POLICY.md
 * or their French versions) for the public /terms, /privacy, /terms/fr and
 * /privacy/fr pages and the /eua agreement form (the Markdown reader is
 * `@jits/shared/legal`, shared with the native renderer in
 * apps/mobile/components/legal/legal-document.tsx). A "TBD" left in a document stays visibly marked (amber
 * outline), never silently rendered as final text.
 *
 * In-text references (jits-rog5.10, `linkReferences` in the shared parser)
 * are links: "Section 5" to `#section-5` on the same page, "Privacy Policy"
 * to /privacy (or /privacy/fr). Numbered headings and clauses carry a stable
 * `id` (`sectionAnchor`), so /terms#section-5 opens at Section 5.
 */

/** Where a reference goes, from the page (or excerpt) it sits in. */
type RefHref = (target: LegalRefTarget) => string;

type Ctx = { lang: LegalLang; href: RefHref; newTab?: boolean };

const withSection = (path: string, section?: string) => (section ? `${path}#${sectionAnchor(section)}` : path);

function Spans({ spans, ctx }: { spans: InlineSpan[]; ctx: Ctx }) {
  return (
    <>
      {spans.map((s, i) =>
        s.kind === "tbd" ? (
          <mark
            key={i}
            data-placeholder="tbd"
            title="Placeholder: not filled in yet"
            className="rounded-sm border border-amber-500 bg-transparent px-1 font-mono text-amber-500"
          >
            TBD
          </mark>
        ) : s.kind === "strong" ? (
          <strong key={i} className="font-semibold text-foreground">
            {s.text}
          </strong>
        ) : s.kind === "em" ? (
          <em key={i} className="italic">
            {s.text}
          </em>
        ) : s.kind === "ref" ? (
          <a
            key={i}
            href={ctx.href(s.target)}
            data-ref-doc={s.target.doc}
            data-ref-section={s.target.section}
            target={ctx.newTab ? "_blank" : undefined}
            rel={ctx.newTab ? "noopener" : undefined}
            className={`text-foreground underline underline-offset-2 ${
              s.style === "strong" ? "font-semibold" : s.style === "em" ? "italic" : ""
            }`}
          >
            {s.text}
          </a>
        ) : (
          <span key={i}>{s.text}</span>
        ),
      )}
    </>
  );
}

function Block({ block, ctx }: { block: LegalBlock; ctx: Ctx }) {
  const key = sectionKey(block);
  const id = key ? sectionAnchor(key) : undefined;
  switch (block.kind) {
    case "heading":
      if (block.level === 1)
        return (
          <h1 className="font-heading text-2xl font-bold text-foreground">
            <Spans spans={block.spans} ctx={ctx} />
          </h1>
        );
      return block.level === 2 ? (
        <h2 id={id} className="mt-4 scroll-mt-4 font-heading text-lg font-bold text-foreground">
          <Spans spans={block.spans} ctx={ctx} />
        </h2>
      ) : (
        <h3 id={id} className="mt-2 scroll-mt-4 font-heading text-base font-bold text-foreground">
          <Spans spans={block.spans} ctx={ctx} />
        </h3>
      );
    case "quote":
      return (
        <blockquote className="border-l-2 border-border bg-muted px-4 py-3 text-sm text-muted-foreground">
          <Spans spans={block.spans} ctx={ctx} />
        </blockquote>
      );
    case "list":
      return (
        <ul className="list-disc space-y-1 pl-6">
          {block.items.map((item, i) => (
            <li key={i}>
              <Spans spans={item} ctx={ctx} />
            </li>
          ))}
        </ul>
      );
    case "ordered":
      return (
        <ol start={block.start} className="list-decimal space-y-1 pl-6">
          {block.items.map((item, i) => (
            <li key={i}>
              <Spans spans={item} ctx={ctx} />
            </li>
          ))}
        </ol>
      );
    case "table":
      return <LegalTable header={block.header} rows={block.rows} ctx={ctx} />;
    default:
      return (
        <p id={id} className={id ? "scroll-mt-4" : undefined}>
          <Spans spans={block.spans} ctx={ctx} />
        </p>
      );
  }
}

/**
 * Scrolls sideways inside its own box so a wide table never scrolls the page
 * on a phone; the min width keeps columns readable instead of squeezing them.
 * The box is a focusable, labelled region so keyboard users can scroll it.
 */
function LegalTable({ header, rows, ctx }: { header: InlineSpan[][]; rows: InlineSpan[][][]; ctx: Ctx }) {
  const { lang } = ctx;
  return (
    <div
      role="region"
      tabIndex={0}
      aria-label={tableLabel(header, lang)}
      className="w-full max-w-full overflow-x-auto rounded-md border border-border outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50"
    >
      <table className="w-full min-w-[36rem] border-collapse text-left text-xs">
        <thead className="bg-muted">
          <tr>
            {header.map((cell, i) => (
              <th key={i} scope="col" className="border-b border-border px-3 py-2 align-top font-semibold text-foreground">
                <Spans spans={cell} ctx={ctx} />
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, r) => (
            <tr key={r} className="border-b border-border last:border-b-0">
              {row.map((cell, c) => (
                <td key={c} className="px-3 py-2 align-top">
                  <Spans spans={cell} ctx={ctx} />
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export type { LegalLang };

/** The other language's version of the same document. */
export type LegalAlternate = { href: string; label: string; lang: LegalLang };

export function LegalDocument({
  markdown,
  doc,
  lang = "en",
  alternate,
}: {
  markdown: string;
  /** Which document this is: turns on its in-text references. */
  doc?: LegalDocId;
  lang?: LegalLang;
  alternate?: LegalAlternate;
}) {
  const blocks = doc ? parseLegalDocument(doc, markdown) : parseLegalMarkdown(markdown);
  const ctx: Ctx = {
    lang,
    href: (t) =>
      t.doc === doc ? `#${t.section ? sectionAnchor(t.section) : ""}` : withSection(LEGAL_WEB_PATHS[t.doc][lang], t.section),
  };
  return (
    <div className="flex flex-col gap-4">
      {alternate && (
        <Link
          href={alternate.href}
          hrefLang={alternate.lang}
          lang={alternate.lang}
          className="self-end font-heading text-xs uppercase tracking-wider text-muted-foreground hover:text-foreground"
        >
          {alternate.label}
        </Link>
      )}
      <article lang={lang} className="flex flex-col gap-3 font-body text-sm leading-relaxed text-foreground/90">
        {blocks.map((b, i) => (
          <Block key={i} block={b} ctx={ctx} />
        ))}
      </article>
    </div>
  );
}

/**
 * A run of already-parsed blocks, e.g. the Terms' "Key points" section
 * (`firstSection`) shown inline on the /eua agreement form, with no
 * language switch. Its references open the full documents in a new tab
 * (so a half-filled form is kept), e.g. "SECTION 5" to /terms#section-5.
 */
export function LegalExcerpt({ blocks, lang = "en" }: { blocks: LegalBlock[]; lang?: LegalLang }) {
  const ctx: Ctx = { lang, newTab: true, href: (t) => withSection(LEGAL_WEB_PATHS[t.doc][lang], t.section) };
  return (
    <article lang={lang} className="flex flex-col gap-3 font-body text-sm leading-relaxed text-foreground/90">
      {blocks.map((b, i) => (
        <Block key={i} block={b} ctx={ctx} />
      ))}
    </article>
  );
}
