import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
/**
 * The /eua agreement form (jits-rog5.8): the Terms' own key points inline
 * (waiver bullet first), links to the full Terms and the Privacy Policy, and
 * an unticked checkbox that names the waiver and gates the CTA.
 */
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn(), back: vi.fn() }) }));
vi.mock("@/lib/supabase/client", () => ({ createClient: vi.fn() }));
vi.mock("@/components/layout/app-header", () => ({ AppHeader: ({ title }: { title: string }) => <h1>{title}</h1> }));

import { TERMS_EN, firstSection, parseLegalDocument } from "@jits/shared/legal";
import { LegalExcerpt } from "@/components/legal/legal-document";
import { EuaForm } from "./eua-form";

const PROFILE = { weight: "", gender: "" as const, dateOfBirth: "", city: "", gymId: "", freeAgent: false };

function renderForm() {
  return render(
    <EuaForm
      needsProfile={false}
      gyms={[]}
      cities={[]}
      initialProfile={PROFILE}
      terms={<LegalExcerpt blocks={firstSection(parseLegalDocument("terms", TERMS_EN.markdown))} />}
    />,
  );
}

describe("EuaForm", () => {
  it("shows the Terms' key points with the waiver bullet first, and not the rest of the Terms", () => {
    renderForm();
    const region = screen.getByRole("region", { name: "Terms of Service: key points" });
    expect(region.querySelector("h2")?.textContent).toBe("Key points (please read)");
    expect(region.querySelector("li")?.textContent).toMatch(
      /^THESE TERMS INCLUDE AN ASSUMPTION OF RISK, WAIVER AND RELEASE OF LIABILITY \(SECTION 5\)\./,
    );
    expect(screen.queryByRole("heading", { name: "Contents" })).toBeNull();
    expect(screen.queryByText(/End User Agreement/)).toBeNull();
  });

  it("links the full Terms and the Privacy Policy in a new tab", () => {
    renderForm();
    const full = screen.getByRole("link", { name: "Read the full Terms of Service" });
    expect(full.getAttribute("href")).toBe("/terms");
    expect(full.getAttribute("target")).toBe("_blank");
    expect(screen.getByRole("link", { name: "Read the Privacy Policy" }).getAttribute("href")).toBe("/privacy");
  });

  it("names the waiver on an unticked checkbox that gates the CTA", () => {
    renderForm();
    const label = screen.getByTestId("eua-agree-label");
    expect(label?.textContent).toMatch(/Assumption of Risk, Waiver and Release of Liability in Section 5/);
    expect(label?.textContent).toMatch(/Privacy Policy/);
    expect(label.querySelector("a")).toBeNull();
    const box = screen.getByRole("checkbox");
    expect(box.getAttribute("aria-checked")).toBe("false");
    const cta = screen.getByRole("button", { name: "Agree & Continue" });
    expect((cta as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(box);
    expect((cta as HTMLButtonElement).disabled).toBe(false);
  });
});
