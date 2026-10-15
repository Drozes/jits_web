import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import SupportPage from "./page";

describe("/support", () => {
  it("renders contact, account deletion and the legal links", () => {
    const { container } = render(<SupportPage />);
    expect(screen.getByRole("heading", { level: 1, name: "Support" })).toBeInTheDocument();
    const mailto = container.querySelectorAll('a[href="mailto:info@elorated.com"]');
    expect(mailto.length).toBe(3);
    expect(mailto[0]).toHaveTextContent("info@elorated.com");
    expect(screen.getByText(/Settings > Delete account/)).toBeInTheDocument();
    for (const [name, href] of [
      ["Terms of Service", "/terms"],
      ["Conditions d'utilisation", "/terms/fr"],
      ["Politique de confidentialité", "/privacy/fr"],
    ]) {
      expect(screen.getByRole("link", { name })).toHaveAttribute("href", href);
    }
    const privacy = screen.getAllByRole("link", { name: "Privacy Policy" }).map((a) => a.getAttribute("href"));
    expect(privacy).toEqual(expect.arrayContaining(["/privacy", "/privacy#section-12"]));
  });
});
