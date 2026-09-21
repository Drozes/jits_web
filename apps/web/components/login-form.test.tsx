import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { LoginForm } from "./login-form";

const mocks = vi.hoisted(() => ({
  signInWithPassword: vi.fn(),
  push: vi.fn(),
  refresh: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: mocks.push, refresh: mocks.refresh }),
}));

vi.mock("@/lib/supabase/client", () => ({
  createClient: () => ({
    auth: {
      signInWithPassword: mocks.signInWithPassword,
      signInWithOAuth: vi.fn(),
    },
  }),
}));

function submitCredentials(email: string, password: string) {
  fireEvent.change(screen.getByLabelText("Email"), { target: { value: email } });
  fireEvent.change(screen.getByLabelText("Password"), {
    target: { value: password },
  });
  fireEvent.click(screen.getByRole("button", { name: "Sign In" }));
}

describe("LoginForm", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders the email/password sign-in form alongside the SSO and register paths", () => {
    render(<LoginForm />);

    expect(screen.getByLabelText("Email")).toBeInTheDocument();
    expect(screen.getByLabelText("Password")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Sign In" })).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /sign in with google/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /sign in with apple/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: /register with email/i }),
    ).toHaveAttribute("href", "/signup");
    expect(
      screen.getByRole("link", { name: /forgot password/i }),
    ).toHaveAttribute("href", "/forgot-password");
  });

  it("keeps a single Signal Red CTA on the surface", () => {
    render(<LoginForm />);

    const accentFilled = screen
      .getAllByRole("button")
      .filter((el) => el.style.background === "var(--accent-cta)");

    expect(accentFilled).toHaveLength(1);
    expect(accentFilled[0]).toHaveTextContent("Sign In");
  });

  it("signs in with the trimmed email and lands on the post-auth route", async () => {
    mocks.signInWithPassword.mockResolvedValue({ data: {}, error: null });

    render(<LoginForm />);
    submitCredentials("  rolls@example.com  ", "correct-horse");

    await waitFor(() =>
      expect(mocks.signInWithPassword).toHaveBeenCalledWith({
        email: "rolls@example.com",
        password: "correct-horse",
      }),
    );

    // `/` is the shared post-auth destination; requireAthlete() there routes a
    // pending athlete on to /eua, so the guard stays in charge of activation.
    await waitFor(() => expect(mocks.push).toHaveBeenCalledWith("/"));
    expect(mocks.refresh).toHaveBeenCalled();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("shows a readable, non-enumerating message on wrong credentials", async () => {
    mocks.signInWithPassword.mockResolvedValue({
      data: {},
      error: { code: "invalid_credentials", message: "Invalid login credentials" },
    });

    render(<LoginForm />);
    submitCredentials("rolls@example.com", "wrong");

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("Incorrect email or password.");
    // Must not hint at whether the address is registered.
    expect(alert.textContent).not.toMatch(/rolls@example\.com|not found|no account/i);
    expect(mocks.push).not.toHaveBeenCalled();
    // The form re-enables so the user can retry.
    expect(screen.getByRole("button", { name: "Sign In" })).toBeEnabled();
  });

  it("explains an unconfirmed email instead of echoing the raw API error", async () => {
    mocks.signInWithPassword.mockResolvedValue({
      data: {},
      error: { code: "email_not_confirmed", message: "Email not confirmed" },
    });

    render(<LoginForm />);
    submitCredentials("rolls@example.com", "correct-horse");

    expect(await screen.findByRole("alert")).toHaveTextContent(
      /confirm your email before signing in/i,
    );
  });

  it("falls back to a generic message for unrecognised auth failures", async () => {
    mocks.signInWithPassword.mockResolvedValue({
      data: {},
      error: { code: "unexpected_failure", message: "database is on fire" },
    });

    render(<LoginForm />);
    submitCredentials("rolls@example.com", "correct-horse");

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("Could not sign you in. Please try again.");
    expect(alert.textContent).not.toMatch(/database is on fire/i);
  });

  it("disables the form while the sign-in request is in flight", async () => {
    let settle: (value: { data: object; error: null }) => void = () => {};
    mocks.signInWithPassword.mockReturnValue(
      new Promise<{ data: object; error: null }>((resolve) => {
        settle = resolve;
      }),
    );

    render(<LoginForm />);
    submitCredentials("rolls@example.com", "correct-horse");

    const submit = await screen.findByRole("button", { name: "Signing in..." });
    expect(submit).toBeDisabled();
    expect(screen.getByLabelText("Email")).toBeDisabled();
    expect(screen.getByLabelText("Password")).toBeDisabled();
    expect(
      screen.getByRole("button", { name: /sign in with google/i }),
    ).toBeDisabled();
    expect(
      screen.getByRole("button", { name: /sign in with apple/i }),
    ).toBeDisabled();

    settle({ data: {}, error: null });
    await waitFor(() => expect(mocks.push).toHaveBeenCalledWith("/"));
  });

  it("rejects an empty submit without calling Supabase", async () => {
    render(<LoginForm />);

    fireEvent.submit(screen.getByRole("button", { name: "Sign In" }).closest("form")!);

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Enter your email and password.",
    );
    expect(mocks.signInWithPassword).not.toHaveBeenCalled();
  });
});
