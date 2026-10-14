import { afterEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { LandingPage } from "./landing-page";

vi.mock("next/image", () => ({
  // eslint-disable-next-line @next/next/no-img-element, jsx-a11y/alt-text
  default: ({ fill: _fill, priority: _priority, ...props }: Record<string, unknown>) => <img {...props} />,
}));

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("LandingPage", () => {
  it("renders the brand line, copy and steps", () => {
    vi.stubEnv("NEXT_PUBLIC_APP_STORE_URL", "");
    render(<LandingPage />);
    expect(screen.getByRole("heading", { level: 1, name: "We are ELO RATED. Are you?" })).toBeInTheDocument();
    expect(screen.getByText("ARE YOU?").style.color).toBe("var(--accent-cta-text)");
    expect(screen.getByText("What's your number?")).toBeInTheDocument();
    expect(screen.getByText("BJJ matches, filmed and rated. Go live, roll, confirm the result. Your ELO moves.")).toBeInTheDocument();
    expect(screen.getByText("NO-GI · SUBMISSION ONLY · EVERY MATCH RANKED")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "HOW IT WORKS" })).toBeInTheDocument();
    for (const [n, title, body] of [
      ["01", "Go live", "Show the room you're ready to roll."],
      ["02", "Roll", "Challenge someone on the mat. Your phone films the match."],
      ["03", "Get rated", "You both confirm the result. Beat someone bigger, earn more."],
    ]) {
      expect(screen.getByText(n)).toBeInTheDocument();
      expect(screen.getByRole("heading", { level: 3, name: title })).toBeInTheDocument();
      expect(screen.getByText(body)).toBeInTheDocument();
    }
    expect(screen.getByText("© 2026 ELO RATED")).toBeInTheDocument();
  });

  it("forces the dark brand island and uses a decorative hero image", () => {
    vi.stubEnv("NEXT_PUBLIC_APP_STORE_URL", "");
    const { container } = render(<LandingPage />);
    expect(screen.getByTestId("landing")).toHaveAttribute("data-theme", "dark");
    const img = container.querySelector("img");
    expect(img).toHaveAttribute("alt", "");
    expect(img).toHaveAttribute("src", "/landing/hero.jpg");
  });

  it("links the footer to legal and support pages and never to login or signup", () => {
    vi.stubEnv("NEXT_PUBLIC_APP_STORE_URL", "");
    const { container } = render(<LandingPage />);
    const nav = screen.getByRole("navigation", { name: "Legal and support" });
    expect(nav.querySelector('a[href="/terms"]')).toHaveTextContent("Terms");
    expect(nav.querySelector('a[href="/privacy"]')).toHaveTextContent("Privacy");
    expect(nav.querySelector('a[href="/support"]')).toHaveTextContent("Support");
    expect(screen.getByRole("link", { name: "Conditions" })).toHaveAttribute("href", "/terms/fr");
    expect(screen.getByRole("link", { name: "Confidentialité" })).toHaveAttribute("href", "/privacy/fr");
    const hrefs = Array.from(container.querySelectorAll("[href]")).map((el) => el.getAttribute("href") ?? "");
    expect(hrefs.some((h) => h.includes("/login") || h.includes("/signup"))).toBe(false);
  });

  it("shows the coming-soon state while the store URL is unset", () => {
    vi.stubEnv("NEXT_PUBLIC_APP_STORE_URL", "");
    render(<LandingPage />);
    expect(screen.getByTestId("app-store-coming-soon")).toHaveTextContent("Coming soon to the App Store");
    expect(screen.queryByTestId("app-store-link")).toBeNull();
  });

  it("shows the red App Store link once the store URL is set", () => {
    vi.stubEnv("NEXT_PUBLIC_APP_STORE_URL", "https://apps.apple.com/app/id6774629438");
    render(<LandingPage />);
    const link = screen.getByRole("link", { name: "Get it on the App Store" });
    expect(link).toHaveAttribute("href", "https://apps.apple.com/app/id6774629438");
    expect(link.style.background).toBe("var(--accent-cta)");
    expect(screen.queryByTestId("app-store-coming-soon")).toBeNull();
  });
});
