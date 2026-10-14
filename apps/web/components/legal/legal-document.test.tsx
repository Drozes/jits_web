import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { LegalDocument, LegalExcerpt } from "./legal-document";
import { PRIVACY_EN, PRIVACY_FR, TERMS_EN, TERMS_FR, firstSection, parseLegalDocument } from "@jits/shared/legal";

const TERMS_MARKDOWN = TERMS_EN.markdown;
const PRIVACY_MARKDOWN = PRIVACY_EN.markdown;

describe("LegalDocument", () => {
  it("renders the Terms with its heading, sections and visibly marked placeholders", () => {
    const { container } = render(<LegalDocument markdown={TERMS_MARKDOWN} />);
    expect(screen.getByRole("heading", { level: 1, name: "ELO RATED Terms of Service" })).toBeTruthy();
    expect(screen.getByRole("heading", { level: 2, name: "27. Governing law and where disputes are heard" })).toBeTruthy();
    const marks = container.querySelectorAll('mark[data-placeholder="tbd"]');
    expect(marks.length).toBe((TERMS_MARKDOWN.match(/\bTBD\b/g) ?? []).length);
    marks.forEach((m) => expect(m.textContent).toBe("TBD"));
  });

  it("renders the Privacy Policy lists and tables", () => {
    render(<LegalDocument markdown={PRIVACY_MARKDOWN} />);
    expect(screen.getByRole("heading", { level: 1, name: "ELO RATED Privacy Policy" })).toBeTruthy();
    expect(screen.getAllByRole("list").length).toBeGreaterThan(0);
    expect(
      screen.getByText(
        "We do not sell your personal information and we do not share it for targeted or cross-context behavioural advertising.",
      ),
    ).toBeTruthy();
    const names = screen.getAllByRole("region").map((r) => r.getAttribute("aria-label"));
    expect(names.length).toBe((PRIVACY_MARKDOWN.match(/^\|\s*:?-+/gm) ?? []).length);
    expect(new Set(names).size).toBe(names.length);
    expect(names).toContain("Table: Provider, What they do for us, Data involved, Where data is processed");
  });

  it("labels a French table region and marks the article lang", () => {
    const md = ["# Titre", "", "| A | B |", "|---|---|", "| *x* | **y** |"].join("\n");
    const { container } = render(
      <LegalDocument markdown={md} lang="fr" alternate={{ href: "/terms", label: "English", lang: "en" }} />,
    );
    const region = screen.getByRole("region", { name: "Tableau: A, B" });
    expect(region.getAttribute("tabindex")).toBe("0");
    expect(container.querySelector("article")?.getAttribute("lang")).toBe("fr");
    expect(screen.getByRole("link", { name: "English" }).getAttribute("href")).toBe("/terms");
    expect(container.querySelector("em")?.textContent).toBe("x");
  });
});

describe("LegalDocument references and anchors (jits-rog5.10)", () => {
  it("gives numbered headings and clauses stable ids", () => {
    const { container } = render(<LegalDocument markdown={TERMS_MARKDOWN} doc="terms" />);
    expect(container.querySelector("h2#section-5")?.textContent).toBe("5. ASSUMPTION OF RISK, WAIVER AND RELEASE OF LIABILITY");
    expect(container.querySelector("p#section-24-3")?.textContent).toMatch(/^24\.3 Quebec residents\./);
    const { container: privacy } = render(<LegalDocument markdown={PRIVACY_MARKDOWN} doc="privacy" />);
    expect(privacy.querySelector("h3#section-4-6")?.textContent).toMatch(/^4\.6 Product improvement/);
  });

  it("links same-page sections to their anchor and the other document to its page, in the page's language", () => {
    const { container } = render(<LegalDocument markdown={TERMS_MARKDOWN} doc="terms" />);
    const refs = Array.from(container.querySelectorAll("a[data-ref-doc]"));
    expect(refs.length).toBeGreaterThan(50);
    for (const a of refs) {
      const href = a.getAttribute("href") ?? "";
      if (a.getAttribute("data-ref-doc") === "terms") {
        expect(href).toBe(`#section-${a.getAttribute("data-ref-section")?.replace(/\./g, "-")}`);
        expect(container.querySelector(href)).not.toBeNull();
      } else {
        expect(href).toBe("/privacy");
        expect(a.textContent).toBe("Privacy Policy");
      }
    }
    const { container: fr } = render(<LegalDocument markdown={TERMS_FR.markdown} doc="terms" lang="fr" />);
    const toPrivacy = Array.from(fr.querySelectorAll('a[data-ref-doc="privacy"]'));
    expect(toPrivacy.length).toBeGreaterThan(0);
    toPrivacy.forEach((a) => expect(a.getAttribute("href")).toBe("/privacy/fr"));
    const { container: pfr } = render(<LegalDocument markdown={PRIVACY_FR.markdown} doc="privacy" lang="fr" />);
    pfr.querySelectorAll('a[data-ref-doc="terms"]').forEach((a) => expect(a.getAttribute("href")).toBe("/terms/fr"));
  });

  it("never links a statute ('section 61 of the Family Law Act')", () => {
    const { container } = render(<LegalDocument markdown={TERMS_MARKDOWN} doc="terms" />);
    const texts = Array.from(container.querySelectorAll("a[data-ref-doc]")).map((a) => a.textContent);
    expect(texts.some((t) => /61|1477|1542/.test(t ?? ""))).toBe(false);
  });

  it("renders no reference links without a doc", () => {
    const { container } = render(<LegalDocument markdown={TERMS_MARKDOWN} />);
    expect(container.querySelectorAll("a[data-ref-doc]")).toHaveLength(0);
  });

  it("an excerpt opens the full page at the section, in a new tab", () => {
    const { container } = render(<LegalExcerpt blocks={firstSection(parseLegalDocument("terms", TERMS_MARKDOWN))} />);
    const section5 = container.querySelector('a[data-ref-section="5"]');
    expect(section5?.textContent).toBe("SECTION 5");
    expect(section5?.getAttribute("href")).toBe("/terms#section-5");
    expect(section5?.getAttribute("target")).toBe("_blank");
  });

  it("links every item of the Terms' own Contents list to its section anchor", () => {
    const { container } = render(<LegalDocument markdown={TERMS_MARKDOWN} doc="terms" />);
    const items = Array.from(container.querySelectorAll("h2 + ol > li"));
    expect(items).toHaveLength(29);
    items.forEach((li, i) => {
      const a = li.querySelector("a");
      expect(a?.getAttribute("href")).toBe(`#section-${i + 1}`);
      expect(container.querySelector(`#section-${i + 1}`)?.textContent).toBe(`${i + 1}. ${a?.textContent}`);
    });
  });

  it("does not link the Privacy Policy inside clause 1.6's own title", () => {
    const { container } = render(<LegalDocument markdown={TERMS_MARKDOWN} doc="terms" />);
    const clause = container.querySelector("#section-1-6");
    expect(clause?.querySelector("strong")?.textContent).toBe("Privacy Policy and feature rules.");
    expect(clause?.querySelector("strong a")).toBeNull();
    expect(clause?.querySelector('a[data-ref-doc="privacy"]')).not.toBeNull();
  });
});
