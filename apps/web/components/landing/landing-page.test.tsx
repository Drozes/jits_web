import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { LandingPage } from "./landing-page";

beforeEach(() => {
  // jsdom has no media playback; HeroVideo calls play() after mount.
  vi.spyOn(HTMLMediaElement.prototype, "play").mockImplementation(() => Promise.resolve());
  vi.spyOn(HTMLMediaElement.prototype, "pause").mockImplementation(() => {});
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

/** A few names from Thomas's invented pool: none may reach the page. */
const THOMAS_NAMES = ["Hiroshi Tanaka", "Maria Cruz", "Kenji Sato", "Yuki Tanaka", "Marcus Whitfield"];

describe("LandingPage", () => {
  it("renders the hidden brand line and the footer, with the intro and steps hidden", () => {
    vi.stubEnv("NEXT_PUBLIC_APP_STORE_URL", "");
    render(<LandingPage />);
    expect(screen.getAllByRole("heading", { level: 1 })).toHaveLength(1);
    expect(screen.getByRole("heading", { level: 1, name: "We are ELO RATED. Are you?" })).toBeInTheDocument();
    expect(screen.queryByTestId("landing-intro")).toBeNull();
    expect(screen.queryByText("What's your number?")).toBeNull();
    expect(screen.queryByRole("heading", { name: "HOW IT WORKS" })).toBeNull();
    expect(screen.getByText("© 2026 ELO RATED")).toBeInTheDocument();
  });

  it("forces the dark brand island with the colour crown", () => {
    render(<LandingPage />);
    const main = screen.getByTestId("landing");
    expect(main).toHaveAttribute("data-theme", "dark");
    expect(main).toHaveAttribute("data-crown", "colour");
  });

  it("draws Thomas's lockups: a 137 x 31 header logo and decorative hero art", () => {
    const { container } = render(<LandingPage />);
    const logo = screen.getByRole("img", { name: "ELO RATED" });
    expect(logo.tagName.toLowerCase()).toBe("svg");
    expect(logo).toHaveAttribute("width", "137");
    expect(logo).toHaveAttribute("height", "31");
    expect(container.querySelector('path[data-part="crown-belt-bar"][fill="#E63946"]')).not.toBeNull();
    expect(container.querySelector('path[data-part="crown-belt"][fill="#050609"]')).not.toBeNull();
    const art = Array.from(container.querySelectorAll("svg")).filter((svg) => (svg as Element) !== logo);
    expect(art.length).toBe(5);
    for (const svg of art) expect(svg).toHaveAttribute("aria-hidden", "true");
    expect(container.querySelector("img[src='/landing/hero.jpg']")).toBeNull();
  });

  it("renders the background video with its poster and no autoplay", () => {
    render(<LandingPage />);
    const video = screen.getByTestId("hero-video") as HTMLVideoElement;
    expect(video).toHaveAttribute("poster", "/landing/videos/sparring-01-v1-poster.jpg");
    expect(video).toHaveAttribute("preload", "none");
    expect(video).toHaveAttribute("aria-hidden", "true");
    expect(video.loop).toBe(true);
    expect(video.muted).toBe(true);
    expect(video.playsInline || video.hasAttribute("playsinline")).toBe(true);
    expect(video.hasAttribute("autoplay")).toBe(false);
    const sources = Array.from(video.querySelectorAll("source"));
    expect(sources.map((s) => [s.getAttribute("media"), s.getAttribute("src"), s.getAttribute("type")])).toEqual([
      ["(max-width: 1023px)", "/landing/videos/sparring-01-v1-720.mp4", "video/mp4"],
      [null, "/landing/videos/sparring-01-v1-1080.mp4", "video/mp4"],
    ]);
  });

  it("starts with an empty, aria-hidden ticker and no invented names or em dashes", () => {
    const { container } = render(<LandingPage />);
    const ticker = screen.getByTestId("hero-ticker");
    expect(ticker).toHaveAttribute("aria-hidden", "true");
    expect(ticker).toBeEmptyDOMElement();
    const text = container.textContent ?? "";
    for (const name of THOMAS_NAMES) expect(text).not.toContain(name);
    expect(text).not.toContain("—");
  });

  it("links the footer to legal and support pages and never to login or signup", () => {
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

  /** The hero line, one per lockup set (CSS shows one). */
  const heroLines = (root: HTMLElement) => Array.from(root.querySelectorAll<HTMLElement>('[data-lk="soon"]'));

  it("shows both badges as Coming soon in the hero and footer while the store URLs are unset", async () => {
    const { container } = await renderWith("", "");
    const blocks = screen.getAllByTestId("store-badges");
    expect(blocks).toHaveLength(2);
    expect(screen.getByTestId("hero-badges")).toContainElement(blocks[0]);
    expect(screen.getAllByRole("group", { name: "App Store: coming soon" })).toHaveLength(2);
    expect(screen.getAllByRole("group", { name: "Google Play: coming soon" })).toHaveLength(2);
    expect(screen.queryByRole("link", { name: /app store|google play/i })).toBeNull();
    // The red hero line names the moment in the red text token; nothing is red-filled.
    const lines = heroLines(container);
    expect(lines).toHaveLength(2);
    for (const line of lines) {
      expect(line).toHaveTextContent("Coming Soon");
      expect(line.style.color).toBe("var(--accent-cta-text)");
    }
    expect(screen.queryByText("Get the app")).toBeNull();
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
    for (const line of heroLines(container)) expect(line).toHaveTextContent("Get the app");
    expect(redFills(container)).toHaveLength(0);
  });
});
