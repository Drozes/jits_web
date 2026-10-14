import { afterEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { AppStoreCta } from "./app-store-cta";

const LISTING = "https://apps.apple.com/app/id6774629438";

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("AppStoreCta", () => {
  it("renders the red listing link when primary and calls onClick", () => {
    vi.stubEnv("NEXT_PUBLIC_APP_STORE_URL", LISTING);
    const onClick = vi.fn();
    render(<AppStoreCta primary onClick={onClick} />);
    const link = screen.getByRole("link", { name: "Get it on the App Store" });
    expect(link).toHaveAttribute("href", LISTING);
    expect(link.style.background).toBe("var(--accent-cta)");
    fireEvent.click(link);
    expect(onClick).toHaveBeenCalledOnce();
  });

  it("renders a neutral link when not primary", () => {
    vi.stubEnv("NEXT_PUBLIC_APP_STORE_URL", LISTING);
    render(<AppStoreCta primary={false} />);
    expect(screen.getByTestId("app-store-link").style.background).toBe("var(--bg-elevated)");
  });

  it("renders a non-link coming-soon state, never red, when the store URL is unset", () => {
    vi.stubEnv("NEXT_PUBLIC_APP_STORE_URL", "");
    const { container } = render(<AppStoreCta primary />);
    const el = screen.getByTestId("app-store-coming-soon");
    expect(el).toHaveTextContent("Coming soon to the App Store");
    expect(el.tagName).toBe("SPAN");
    expect(container.querySelector("a, button")).toBeNull();
    expect(el.style.background).not.toBe("var(--accent-cta)");
  });
});
