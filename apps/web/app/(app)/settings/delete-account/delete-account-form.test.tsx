import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { DeleteAccountForm } from "./delete-account-form";
import { deleteAccount } from "./delete-account-api";

const mocks = vi.hoisted(() => ({
  invoke: vi.fn(),
  signOut: vi.fn(() => Promise.resolve({ error: null })),
  replace: vi.fn(),
  back: vi.fn(),
  toastError: vi.fn(),
  toastSuccess: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: mocks.replace, back: mocks.back, push: vi.fn() }),
}));
vi.mock("sonner", () => ({ toast: { error: mocks.toastError, success: mocks.toastSuccess } }));
vi.mock("@/lib/supabase/client", () => ({
  createClient: () => ({ functions: { invoke: mocks.invoke }, auth: { signOut: mocks.signOut } }),
}));

beforeEach(() => vi.clearAllMocks());

function toConfirm() {
  render(<DeleteAccountForm />);
  expect(screen.getByText("This permanently deletes your profile, photos and ELO. Your past matches stay in your opponents' history as a deleted athlete. This can't be undone.")).toBeTruthy();
  expect(screen.queryByLabelText("TYPE DELETE TO CONFIRM")).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "CONTINUE" }));
}

describe("DeleteAccountForm", () => {
  it("keeps Delete disabled until DELETE is typed exactly", () => {
    toConfirm();
    const submit = screen.getByRole("button", { name: "DELETE ACCOUNT" }) as HTMLButtonElement;
    expect(submit.disabled).toBe(true);
    fireEvent.change(screen.getByLabelText("TYPE DELETE TO CONFIRM"), { target: { value: "delete" } });
    expect(submit.disabled).toBe(true);
    fireEvent.change(screen.getByLabelText("TYPE DELETE TO CONFIRM"), { target: { value: "DELETE" } });
    expect(submit.disabled).toBe(false);
  });

  it("deletes, clears the local session and goes to login", async () => {
    mocks.invoke.mockResolvedValue({ data: { ok: true }, error: null });
    toConfirm();
    fireEvent.change(screen.getByLabelText("TYPE DELETE TO CONFIRM"), { target: { value: "DELETE" } });
    fireEvent.click(screen.getByRole("button", { name: "DELETE ACCOUNT" }));
    await waitFor(() => expect(mocks.replace).toHaveBeenCalledWith("/login"));
    expect(mocks.invoke).toHaveBeenCalledWith("delete-account", { body: { confirm: "DELETE" } });
    expect(mocks.signOut).toHaveBeenCalledWith({ scope: "local" });
    expect(mocks.toastSuccess).toHaveBeenCalledWith("Your account was deleted.");
  });

  it("keeps the account and explains a failure", async () => {
    mocks.invoke.mockResolvedValue({
      data: null,
      error: { context: new Response(JSON.stringify({ ok: false, code: "delete_failed" }), { status: 500 }) },
    });
    toConfirm();
    fireEvent.change(screen.getByLabelText("TYPE DELETE TO CONFIRM"), { target: { value: "DELETE" } });
    fireEvent.click(screen.getByRole("button", { name: "DELETE ACCOUNT" }));
    await waitFor(() =>
      expect(mocks.toastError).toHaveBeenCalledWith(
        "We couldn't delete your account. Check your connection and try again.",
      ),
    );
    expect(mocks.signOut).not.toHaveBeenCalled();
    expect(mocks.replace).not.toHaveBeenCalled();
  });

  it("treats not_authenticated as terminal: signs out locally with neutral copy", async () => {
    mocks.invoke.mockResolvedValue({
      data: null,
      error: { context: new Response(JSON.stringify({ ok: false, code: "not_authenticated" }), { status: 401 }) },
    });
    toConfirm();
    fireEvent.change(screen.getByLabelText("TYPE DELETE TO CONFIRM"), { target: { value: "DELETE" } });
    fireEvent.click(screen.getByRole("button", { name: "DELETE ACCOUNT" }));
    await waitFor(() => expect(mocks.replace).toHaveBeenCalledWith("/login"));
    expect(mocks.signOut).toHaveBeenCalledWith({ scope: "local" });
    expect(mocks.toastError).toHaveBeenCalledWith("You're signed out. If your account still exists, sign in to delete it.");
    expect(mocks.toastSuccess).not.toHaveBeenCalled();
  });

  it("refuses during a live match and keeps the account", async () => {
    mocks.invoke.mockResolvedValue({
      data: null,
      error: { context: new Response(JSON.stringify({ ok: false, code: "match_in_progress" }), { status: 409 }) },
    });
    toConfirm();
    fireEvent.change(screen.getByLabelText("TYPE DELETE TO CONFIRM"), { target: { value: "DELETE" } });
    fireEvent.click(screen.getByRole("button", { name: "DELETE ACCOUNT" }));
    await waitFor(() => expect(mocks.toastError).toHaveBeenCalledWith("Finish your match first. You can delete your account once it ends."));
    expect(mocks.signOut).not.toHaveBeenCalled();
    expect(mocks.replace).not.toHaveBeenCalled();
  });

  it("does not claim match videos are erased", () => {
    render(<DeleteAccountForm />);
    expect(screen.getByText(/Match videos and their stills stay with the matches they belong to\./)).toBeTruthy();
  });

  it("Keep my account goes back", () => {
    render(<DeleteAccountForm />);
    fireEvent.click(screen.getByRole("button", { name: "KEEP MY ACCOUNT" }));
    expect(mocks.back).toHaveBeenCalled();
  });
});

describe("deleteAccount", () => {
  it("maps a 401 body to not_authenticated", async () => {
    const client = {
      functions: {
        invoke: vi.fn().mockResolvedValue({
          data: null,
          error: { context: new Response(JSON.stringify({ ok: false, code: "not_authenticated" }), { status: 401 }) },
        }),
      },
    };
    expect(await deleteAccount(client as never)).toEqual({ ok: false, code: "not_authenticated" });
  });

  it("maps a network error to failed", async () => {
    const client = { functions: { invoke: vi.fn().mockResolvedValue({ data: null, error: { context: new Error("x") } }) } };
    expect(await deleteAccount(client as never)).toEqual({ ok: false, code: "failed" });
  });
});
