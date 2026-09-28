import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { LegalDocument } from "./legal-document";
import { PRIVACY_MARKDOWN, TERMS_MARKDOWN } from "@/lib/legal/documents.generated";

describe("LegalDocument", () => {
  it("renders the Terms with its heading, sections and visibly marked placeholders", () => {
    const { container } = render(<LegalDocument markdown={TERMS_MARKDOWN} />);
    expect(screen.getByRole("heading", { level: 1, name: "ELO RATED Terms of Service" })).toBeTruthy();
    expect(screen.getByRole("heading", { level: 2, name: "11. Governing Law" })).toBeTruthy();
    const marks = container.querySelectorAll('mark[data-placeholder="tbd"]');
    expect(marks.length).toBe((TERMS_MARKDOWN.match(/\bTBD\b/g) ?? []).length);
    marks.forEach((m) => expect(m.textContent).toBe("TBD"));
  });

  it("renders the Privacy Policy lists", () => {
    render(<LegalDocument markdown={PRIVACY_MARKDOWN} />);
    expect(screen.getByRole("heading", { level: 1, name: "ELO RATED Privacy Policy" })).toBeTruthy();
    expect(screen.getAllByRole("list").length).toBeGreaterThan(0);
    expect(screen.getByText(/We do not sell personal data/)).toBeTruthy();
  });
});
