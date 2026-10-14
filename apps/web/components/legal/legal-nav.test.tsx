import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";

const pathname = vi.hoisted(() => ({ value: "/terms" }));
vi.mock("next/navigation", () => ({ usePathname: () => pathname.value }));

import { LegalNav } from "./legal-nav";

describe("LegalNav", () => {
  it.each([
    ["/terms", "Terms", "/terms", "Privacy", "/privacy"],
    ["/privacy", "Terms", "/terms", "Privacy", "/privacy"],
    ["/terms/fr", "Conditions", "/terms/fr", "Confidentialité", "/privacy/fr"],
    ["/privacy/fr", "Conditions", "/terms/fr", "Confidentialité", "/privacy/fr"],
  ])("on %s links %s and %s in the page's language", (path, terms, termsHref, privacy, privacyHref) => {
    pathname.value = path;
    render(<LegalNav />);
    expect(screen.getByRole("link", { name: terms }).getAttribute("href")).toBe(termsHref);
    expect(screen.getByRole("link", { name: privacy }).getAttribute("href")).toBe(privacyHref);
  });
});
