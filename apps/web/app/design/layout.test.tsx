import { afterEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";

const redirect = vi.fn((url: string) => {
  throw new Error(`NEXT_REDIRECT ${url}`);
});
vi.mock("next/navigation", () => ({
  redirect: (url: string) => redirect(url),
  usePathname: () => "/design",
}));
vi.mock("next-themes", () => ({ useTheme: () => ({ theme: "dark", setTheme: vi.fn() }) }));

import DesignLayout from "./layout";

afterEach(() => {
  vi.unstubAllEnvs();
  redirect.mockClear();
});

describe("/design layout and the web app lock", () => {
  it("redirects home while locked", () => {
    vi.stubEnv("NEXT_PUBLIC_WEB_APP_ENABLED", "");
    vi.spyOn(console, "error").mockImplementation(() => {});
    expect(() => render(<DesignLayout>content</DesignLayout>)).toThrow("NEXT_REDIRECT /");
    expect(redirect).toHaveBeenCalledWith("/");
  });

  it("renders when the web app is enabled", () => {
    vi.stubEnv("NEXT_PUBLIC_WEB_APP_ENABLED", "true");
    render(<DesignLayout>content</DesignLayout>);
    expect(screen.getByText("content")).toBeInTheDocument();
    expect(redirect).not.toHaveBeenCalled();
  });
});
