import { describe, expect, it } from "vitest";
/**
 * The legal Markdown reader (jits-s6mi.7, shared since jits-rog5.8): what the
 * legal documents use, tables, ordered lists and italics included, and never
 * HTML.
 */
import { firstSection, parseInline, parseLegalMarkdown, spansText, tableLabel } from "./markdown";

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

  it("reads *italic* as em, apart from **bold**", () => {
    expect(parseInline("a *b c* and **d** then *e*.")).toEqual([
      { kind: "text", text: "a " },
      { kind: "em", text: "b c" },
      { kind: "text", text: " and " },
      { kind: "strong", text: "d" },
      { kind: "text", text: " then " },
      { kind: "em", text: "e" },
      { kind: "text", text: "." },
    ]);
  });

  it("leaves stray asterisks as text", () => {
    expect(parseInline("2 * 3 * 4")).toEqual([{ kind: "text", text: "2 * 3 * 4" }]);
  });

  it("marks TBD inside italics", () => {
    expect(parseInline("*TBD*")).toEqual([{ kind: "tbd" }]);
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

  it("reads ordered lists with continuation lines, starting at the first number", () => {
    const md = ["3. first", "4. second item", "   continues *here*", "", "after"].join("\n");
    expect(parseLegalMarkdown(md)).toEqual([
      {
        kind: "ordered",
        start: 3,
        items: [
          [{ kind: "text", text: "first" }],
          [
            { kind: "text", text: "second item continues " },
            { kind: "em", text: "here" },
          ],
        ],
      },
      { kind: "paragraph", spans: [{ kind: "text", text: "after" }] },
    ]);
  });

  it("keeps a numbered clause like \"5.1 **Title.** text\" a paragraph", () => {
    expect(parseLegalMarkdown("5.1 **Title.** text")).toEqual([
      {
        kind: "paragraph",
        spans: [
          { kind: "text", text: "5.1 " },
          { kind: "strong", text: "Title." },
          { kind: "text", text: " text" },
        ],
      },
    ]);
  });

  it("lets only an item numbered 1 interrupt a paragraph", () => {
    expect(parseLegalMarkdown("founded in\n2026. Since then")).toEqual([
      { kind: "paragraph", spans: [{ kind: "text", text: "founded in 2026. Since then" }] },
    ]);
    expect(parseLegalMarkdown("You agree to:\n1. first\n2. second").map((b) => b.kind)).toEqual([
      "paragraph",
      "ordered",
    ]);
  });

  it("splits a bullet list from an ordered list that follows it", () => {
    const blocks = parseLegalMarkdown(["- a", "1. b"].join("\n"));
    expect(blocks.map((b) => b.kind)).toEqual(["list", "ordered"]);
  });

  it("reads a pipe table with bold cells, padding short rows", () => {
    const md = [
      "Intro line.",
      "| Data | Purpose |",
      "|---|:---:|",
      "| **Email** | Sign-in, *support* |",
      "| Weight |",
      "",
    ].join("\n");
    expect(parseLegalMarkdown(md)).toEqual([
      { kind: "paragraph", spans: [{ kind: "text", text: "Intro line." }] },
      {
        kind: "table",
        header: [[{ kind: "text", text: "Data" }], [{ kind: "text", text: "Purpose" }]],
        rows: [
          [
            [{ kind: "strong", text: "Email" }],
            [
              { kind: "text", text: "Sign-in, " },
              { kind: "em", text: "support" },
            ],
          ],
          [[{ kind: "text", text: "Weight" }], []],
        ],
      },
    ]);
  });

  it("keeps an escaped pipe inside a cell", () => {
    const [table] = parseLegalMarkdown(["| a |", "| - |", "| x \\| y |"].join("\n"));
    expect(table).toEqual({
      kind: "table",
      header: [[{ kind: "text", text: "a" }]],
      rows: [[[{ kind: "text", text: "x | y" }]]],
    });
  });

  it("reads a table whose separator has a different cell count as a paragraph", () => {
    expect(parseLegalMarkdown(["| a | b |", "|---|", "| x | y |"].join("\n")).map((b) => b.kind)).toEqual([
      "paragraph",
    ]);
  });

  it("reads pipe rows without a separator row as a paragraph, never a table", () => {
    expect(parseLegalMarkdown("| a | b |")).toEqual([{ kind: "paragraph", spans: [{ kind: "text", text: "| a | b |" }] }]);
  });
});

describe("firstSection", () => {
  it("returns the first level-2 section up to the next level-2 heading", () => {
    const blocks = parseLegalMarkdown(["# T", "intro", "## A", "- one", "### A.1", "text", "## B", "after"].join("\n"));
    expect(firstSection(blocks).map((b) => b.kind)).toEqual(["heading", "list", "heading", "paragraph"]);
    const [heading] = firstSection(blocks);
    expect(heading.kind === "heading" && spansText(heading.spans)).toBe("A");
  });

  it("runs to the end when no later level-2 heading follows, and is empty without one", () => {
    expect(firstSection(parseLegalMarkdown("## Only\n\nbody")).map((b) => b.kind)).toEqual(["heading", "paragraph"]);
    expect(firstSection(parseLegalMarkdown("# T\n\nbody"))).toEqual([]);
  });
});

describe("tableLabel", () => {
  it("names a table from its header cells, in the document's language", () => {
    const header = [[{ kind: "strong" as const, text: "Provider" }], [{ kind: "text" as const, text: " Data " }], []];
    expect(tableLabel(header)).toBe("Table: Provider, Data");
    expect(tableLabel(header, "fr")).toBe("Tableau: Provider, Data");
    expect(tableLabel([[]], "en")).toBe("Table");
  });
});
