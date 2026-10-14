/**
 * The native legal renderer (jits-rog5.8): draws the same LegalBlock[] the
 * web pages render (`@jits/shared/legal`), with headings as accessibility
 * headers, ordered lists from their own start number, tables that scroll
 * sideways under their own name, and a visible TBD marker. The full document
 * is a virtualized list.
 *
 * Source: apps/mobile/components/legal/legal-document.tsx
 */
import * as React from "react";
import { StyleSheet } from "react-native";
import { fireEvent, render, screen } from "@testing-library/react-native";
import { PRIVACY_EN, TERMS_EN, parseLegalDocument, parseLegalMarkdown } from "@jits/shared/legal";
import { LegalBlocks, LegalDocumentList, TABLE_COLUMN_WIDTH } from "@/components/legal/legal-document";

const SAMPLE = [
  "# Title",
  "",
  "## 1. Section",
  "",
  "Para with **bold** and *italic* and TBD.",
  "",
  "3. third",
  "4. fourth",
  "",
  "- bullet",
  "",
  "> quoted",
  "",
  "| Provider | Purpose |",
  "|---|---|",
  "| **Supabase** | Hosting |",
].join("\n");

describe("LegalBlocks", () => {
  it("marks headings as accessibility headers", () => {
    render(<LegalBlocks blocks={parseLegalMarkdown(SAMPLE)} />);
    const headers = screen.getAllByRole("header");
    expect(headers).toHaveLength(2);
    expect(screen.getByRole("header", { name: "Title" })).toBeTruthy();
    expect(screen.getByRole("header", { name: "1. Section" })).toBeTruthy();
  });

  it("numbers an ordered list from its start, and bullets a list", () => {
    render(<LegalBlocks blocks={parseLegalMarkdown(SAMPLE)} />);
    expect(screen.getByText("3.")).toBeTruthy();
    expect(screen.getByText("4.")).toBeTruthy();
    expect(screen.queryByText("1.")).toBeNull();
    expect(screen.getByText("•")).toBeTruthy();
    expect(screen.getByText("bullet")).toBeTruthy();
    expect(screen.getByText("quoted")).toBeTruthy();
  });

  it("draws bold, italic (the real italic face) and a visible TBD marker, never raw markup", () => {
    render(<LegalBlocks blocks={parseLegalMarkdown(SAMPLE)} />);
    expect(screen.getByText("bold")).toBeTruthy();
    expect(screen.getByText("italic").props.className).toBe("font-body-italic");
    expect(screen.getByTestId("legal-tbd")).toHaveTextContent("TBD", { exact: false });
    expect(screen.queryByText(/\*\*/)).toBeNull();
  });

  it("puts a table in a sideways scroller named from its header, columns at a fixed minimum width", () => {
    render(<LegalBlocks blocks={parseLegalMarkdown(SAMPLE)} />);
    const table = screen.getByTestId("legal-table");
    expect(table.props.horizontal).toBe(true);
    expect(table.props.accessibilityLabel).toBe("Table: Provider, Purpose");
    expect(screen.getByText("Supabase")).toBeTruthy();
    expect(screen.getByText("Hosting")).toBeTruthy();
    const cell = screen.getByText("Hosting").parent?.parent;
    expect(StyleSheet.flatten(cell?.props.style)).toMatchObject({ width: TABLE_COLUMN_WIDTH });
  });

  it("names a French table in French and gives French text a French voice", () => {
    render(<LegalBlocks lang="fr" blocks={parseLegalMarkdown("| A | B |\n|---|---|\n| x | y |\n\nTexte.")} />);
    expect(screen.getByTestId("legal-table").props.accessibilityLabel).toBe("Tableau: A, B");
    expect(screen.getByText("Texte.").props.accessibilityLanguage).toBe("fr-CA");
  });
});

describe("LegalDocumentList", () => {
  it("renders the start of the real Terms at once and leaves the rest to the list (virtualized)", () => {
    const blocks = parseLegalMarkdown(TERMS_EN.markdown);
    render(<LegalDocumentList testID="doc" blocks={blocks} />);
    expect(screen.getByRole("header", { name: "ELO RATED Terms of Service" })).toBeTruthy();
    expect(screen.getByRole("header", { name: "Key points (please read)" })).toBeTruthy();
    const total = blocks.filter((b) => b.kind === "heading").length;
    expect(screen.getAllByRole("header").length).toBeLessThan(total);
  });

  it("renders the Privacy Policy's tables from the same blocks the web renders", () => {
    const blocks = parseLegalMarkdown(PRIVACY_EN.markdown);
    const firstTable = blocks.findIndex((b) => b.kind === "table");
    expect(firstTable).toBeGreaterThan(-1);
    render(<LegalBlocks blocks={blocks.slice(firstTable, firstTable + 1)} />);
    expect(screen.getByTestId("legal-table").props.accessibilityLabel).toMatch(/^Table: /);
  });
});

describe("references (jits-rog5.10)", () => {
  const md = ["## 5. Waiver", "", "## 6. Other", "", "Read Section 5 and our Privacy Policy, not section 61 of the Act."].join("\n");

  it("are tappable links that report their target", () => {
    const onRef = jest.fn();
    render(<LegalBlocks blocks={parseLegalDocument("terms", md)} onRef={onRef} />);
    const section = screen.getByTestId("legal-ref-terms-5");
    expect(section).toHaveTextContent("Section 5");
    expect(section.props.accessibilityRole).toBe("link");
    fireEvent.press(section);
    fireEvent.press(screen.getByTestId("legal-ref-privacy-doc"));
    expect(onRef.mock.calls).toEqual([[{ doc: "terms", section: "5" }], [{ doc: "privacy" }]]);
    expect(screen.queryByText(/section 61/)).toBeTruthy();
    expect(screen.queryAllByRole("link")).toHaveLength(2);
  });

  it("read as text without a handler", () => {
    render(<LegalBlocks blocks={parseLegalDocument("terms", md)} />);
    expect(screen.queryAllByRole("link")).toHaveLength(0);
    expect(screen.getByText("Section 5")).toBeTruthy();
  });
});
