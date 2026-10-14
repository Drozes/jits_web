import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { StoreBadges } from "./store-badges";

const APPLE = "https://apps.apple.com/app/id6774629438";
const PLAY = "https://play.google.com/store/apps/details?id=com.elorated.mobile";

describe("StoreBadges", () => {
  it("links each live listing in a new tab with an accessible name", () => {
    render(<StoreBadges appStoreUrl={APPLE} playStoreUrl={PLAY} />);
    const apple = screen.getByRole("link", { name: "Download ELO RATED on the App Store" });
    const play = screen.getByRole("link", { name: "Get ELO RATED on Google Play" });
    expect(apple.getAttribute("href")).toBe(APPLE);
    expect(play.getAttribute("href")).toBe(PLAY);
    for (const link of [apple, play]) {
      expect(link.getAttribute("target")).toBe("_blank");
      expect(link.getAttribute("rel")).toContain("noopener");
    }
    expect(screen.queryByText("Coming soon")).toBeNull();
  });

  it("renders a store without a listing as a non-interactive Coming soon badge", () => {
    render(<StoreBadges appStoreUrl={null} playStoreUrl={null} />);
    expect(screen.queryAllByRole("link")).toHaveLength(0);
    const apple = screen.getByRole("group", { name: "App Store: coming soon" });
    const play = screen.getByRole("group", { name: "Google Play: coming soon" });
    for (const el of [apple, play]) {
      expect(el.tagName).not.toBe("A");
      expect(el.getAttribute("href")).toBeNull();
      expect(el.getAttribute("tabindex")).toBeNull();
      expect(el.getAttribute("aria-disabled")).toBe("true");
      expect(el.textContent).toBe("Coming soon");
    }
    expect(document.querySelectorAll("a, [tabindex]")).toHaveLength(0);
    // The official artwork is never dimmed or recoloured, only labelled.
    for (const el of Array.from(document.querySelectorAll<HTMLElement>("[data-testid=store-badges] *"))) {
      expect(el.style.opacity).toBe("");
      expect(el.style.filter).toBe("");
    }
  });

  it("mixes states per store", () => {
    render(<StoreBadges appStoreUrl={APPLE} playStoreUrl={null} />);
    expect(screen.getByRole("link", { name: /app store/i })).toBeTruthy();
    expect(screen.getByRole("group", { name: "Google Play: coming soon" })).toBeTruthy();
  });

  it("fires onBadgeClick with the store for live badges only", () => {
    const onBadgeClick = vi.fn();
    const { unmount } = render(<StoreBadges appStoreUrl={APPLE} playStoreUrl={PLAY} onBadgeClick={onBadgeClick} />);
    fireEvent.click(screen.getByRole("link", { name: /app store/i }));
    fireEvent.click(screen.getByRole("link", { name: /google play/i }));
    expect(onBadgeClick.mock.calls).toEqual([["app_store"], ["play_store"]]);
    unmount();

    onBadgeClick.mockClear();
    render(<StoreBadges appStoreUrl={null} playStoreUrl={null} onBadgeClick={onBadgeClick} />);
    fireEvent.click(screen.getByRole("group", { name: "App Store: coming soon" }));
    expect(onBadgeClick).not.toHaveBeenCalled();
  });

  it("uses the official artwork, unmodified files, at Apple's minimum height or more", () => {
    const { container, unmount } = render(<StoreBadges size="sm" appStoreUrl={APPLE} playStoreUrl={PLAY} />);
    const [apple, play] = Array.from(container.querySelectorAll("img"));
    expect(apple.getAttribute("src")).toBe("/badges/app-store-badge-en-us.svg");
    expect(apple.style.height).toBe("40px");
    expect(play.getAttribute("src")).toBe("/badges/google-play-badge-en-us.png");
    // The PNG's own padding is cropped so the visible badge is also 40px.
    expect((play.parentElement as HTMLElement).style.height).toBe("40px");
    unmount();

    const md = render(<StoreBadges appStoreUrl={APPLE} playStoreUrl={PLAY} />);
    expect(md.container.querySelector("img")?.style.height).toBe("48px");
  });

  it("renders the optional heading", () => {
    render(<StoreBadges heading="Get the app" appStoreUrl={null} playStoreUrl={null} />);
    expect(screen.getByText("Get the app")).toBeTruthy();
  });
});
