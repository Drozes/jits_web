import { afterEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";

vi.mock("@/lib/supabase/client", () => ({ createClient: () => ({ auth: { resetPasswordForEmail: vi.fn() } }) }));

import { ForgotPasswordForm } from "./forgot-password-form";

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("ForgotPasswordForm", () => {
  it("has no link to /login while the web app is locked", () => {
    vi.stubEnv("NEXT_PUBLIC_WEB_APP_ENABLED", "");
    const { container } = render(<ForgotPasswordForm />);
    expect(container.querySelector('a[href="/login"]')).toBeNull();
  });

  it("links to /login when the web app is enabled", () => {
    vi.stubEnv("NEXT_PUBLIC_WEB_APP_ENABLED", "true");
    render(<ForgotPasswordForm />);
    expect(screen.getByRole("link", { name: "Login" })).toHaveAttribute("href", "/login");
  });
});
