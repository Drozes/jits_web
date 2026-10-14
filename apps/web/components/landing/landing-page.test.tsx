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

  /** The store URLs are read at module load (lib/app-links.ts): re-import per env. */
  async function renderWith(appStoreUrl: string, playStoreUrl: string) {
    vi.resetModules();
    vi.stubEnv("NEXT_PUBLIC_APP_STORE_URL", appStoreUrl);
    vi.stubEnv("NEXT_PUBLIC_PLAY_STORE_URL", playStoreUrl);
    const { LandingPage: Page } = await import("./landing-page");
    return render(<Page />);
  }

  /** Every element styled as the Signal Red CTA fill. */
  const redFills = (root: HTMLElement) =>
    Array.from(root.querySelectorAll<HTMLElement>("*")).filter((el) => el.style.background === "var(--accent-cta)");

  it("shows both badges as Coming soon in the hero and footer while the store URLs are unset", async () => {
    const { container } = await renderWith("", "");
    const blocks = screen.getAllByTestId("store-badges");
    expect(blocks).toHaveLength(2);
    expect(screen.getAllByRole("group", { name: "App Store: coming soon" })).toHaveLength(2);
    expect(screen.getAllByRole("group", { name: "Google Play: coming soon" })).toHaveLength(2);
    expect(screen.queryByRole("link", { name: /app store|google play/i })).toBeNull();
    // The hero names the download moment; nothing on the page is red-filled.
    expect(screen.getByText("Get the app")).toBeInTheDocument();
    expect(redFills(container)).toHaveLength(0);
  });

  it("links both badges once the store URLs are set, never as a red fill", async () => {
    const apple = "https://apps.apple.com/app/id6774629438";
    const play = "https://play.google.com/store/apps/details?id=com.elorated.mobile";
    const { container } = await renderWith(apple, play);
    const appLinks = screen.getAllByRole("link", { name: "Download ELO RATED on the App Store" });
    expect(appLinks).toHaveLength(2);
    for (const link of appLinks) expect(link).toHaveAttribute("href", apple);
    expect(screen.getAllByRole("link", { name: "Get ELO RATED on Google Play" })[0]).toHaveAttribute("href", play);
    expect(screen.queryByRole("group", { name: /coming soon/i })).toBeNull();
    expect(redFills(container)).toHaveLength(0);
  });
});
