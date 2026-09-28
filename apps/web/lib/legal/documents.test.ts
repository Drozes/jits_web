import { describe, expect, it } from "vitest";
/**
 * /terms and /privacy (jits-s6mi.7): the bundled text must match the
 * repo-root Markdown, the reader must cover what those files use, and the
 * owner's unfilled placeholders must stay visibly marked.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { PRIVACY_MARKDOWN, TERMS_MARKDOWN } from "./documents.generated";
import { documentTitle, hasPlaceholders, parseInline, parseLegalMarkdown } from "./markdown";

const root = path.resolve(__dirname, "..", "..", "..", "..");

describe("bundled legal documents", () => {
  it.each([
    ["TERMS.md", TERMS_MARKDOWN],
    ["PRIVACY_POLICY.md", PRIVACY_MARKDOWN],
  ])("%s is in sync (run: node apps/web/scripts/sync-legal-docs.mjs)", (file, bundled) => {
    expect(bundled).toBe(readFileSync(path.join(root, file), "utf8"));
  });

  it("titles come from each document's H1", () => {
    expect(documentTitle(parseLegalMarkdown(TERMS_MARKDOWN))).toBe("ELO RATED Terms of Service");
    expect(documentTitle(parseLegalMarkdown(PRIVACY_MARKDOWN))).toBe("ELO RATED Privacy Policy");
  });

  it("keeps every TBD placeholder as a marked span (none are invented or dropped)", () => {
    for (const md of [TERMS_MARKDOWN, PRIVACY_MARKDOWN]) {
      const expected = (md.match(/\bTBD\b/g) ?? []).length;
      const blocks = parseLegalMarkdown(md);
      const spans = blocks.flatMap((b) => (b.kind === "list" ? b.items.flat() : b.spans));
      expect(spans.filter((s) => s.kind === "tbd")).toHaveLength(expected);
      expect(hasPlaceholders(md)).toBe(expected > 0);
    }
  });
});

describe("parseInline", () => {
  it("splits bold and plain text", () => {
    expect(parseInline("a **b** c")).toEqual([
      { kind: "text", text: "a " },
      { kind: "strong", text: "b" },
      { kind: "text", text: " c" },
    ]);
  });

  it("marks TBD whether bold or plain", () => {
    expect(parseInline("email **TBD** (x) and TBD.")).toEqual([
      { kind: "text", text: "email " },
      { kind: "tbd" },
      { kind: "text", text: " (x) and " },
      { kind: "tbd" },
      { kind: "text", text: "." },
    ]);
  });

  it("never treats markup as HTML", () => {
    expect(parseInline("<script>x</script>")).toEqual([{ kind: "text", text: "<script>x</script>" }]);
  });
});

describe("parseLegalMarkdown", () => {
  it("reads headings, quotes, lists with continuation lines, and paragraphs", () => {
    const md = [
      "# Title",
      "",
      "> **Note:** one",
      "> two",
      "",
      "## 1. Section",
      "",
      "- first",
      "- second item",
      "  continues here",
      "",
      "Para line one",
      "line two.",
    ].join("\n");
    expect(parseLegalMarkdown(md)).toEqual([
      { kind: "heading", level: 1, spans: [{ kind: "text", text: "Title" }] },
      {
        kind: "quote",
        spans: [
          { kind: "strong", text: "Note:" },
          { kind: "text", text: " one two" },
        ],
      },
      { kind: "heading", level: 2, spans: [{ kind: "text", text: "1. Section" }] },
      {
        kind: "list",
        items: [[{ kind: "text", text: "first" }], [{ kind: "text", text: "second item continues here" }]],
      },
      { kind: "paragraph", spans: [{ kind: "text", text: "Para line one line two." }] },
    ]);
  });
});
