import type { InlineSpan, LegalBlock } from "@/lib/legal/markdown";
import { parseLegalMarkdown } from "@/lib/legal/markdown";

/**
 * Server component rendering one legal document (TERMS.md or
 * PRIVACY_POLICY.md) for the public /terms and /privacy pages. Placeholders
 * the owner has not filled yet stay visibly marked ("TBD", amber outline),
 * never silently rendered as final text.
 */
function Spans({ spans }: { spans: InlineSpan[] }) {
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
        ) : (
          <span key={i}>{s.text}</span>
        ),
      )}
    </>
  );
}

function Block({ block }: { block: LegalBlock }) {
  switch (block.kind) {
    case "heading":
      if (block.level === 1)
        return (
          <h1 className="font-heading text-2xl font-bold text-foreground">
            <Spans spans={block.spans} />
          </h1>
        );
      return block.level === 2 ? (
        <h2 className="mt-4 font-heading text-lg font-bold text-foreground">
          <Spans spans={block.spans} />
        </h2>
      ) : (
        <h3 className="mt-2 font-heading text-base font-bold text-foreground">
          <Spans spans={block.spans} />
        </h3>
      );
    case "quote":
      return (
        <blockquote className="border-l-2 border-border bg-muted px-4 py-3 text-sm text-muted-foreground">
          <Spans spans={block.spans} />
        </blockquote>
      );
    case "list":
      return (
        <ul className="list-disc space-y-1 pl-6">
          {block.items.map((item, i) => (
            <li key={i}>
              <Spans spans={item} />
            </li>
          ))}
        </ul>
      );
    default:
      return (
        <p>
          <Spans spans={block.spans} />
        </p>
      );
  }
}

export function LegalDocument({ markdown }: { markdown: string }) {
  const blocks = parseLegalMarkdown(markdown);
  return (
    <article className="flex flex-col gap-3 font-body text-sm leading-relaxed text-foreground/90">
      {blocks.map((b, i) => (
        <Block key={i} block={b} />
      ))}
    </article>
  );
}
