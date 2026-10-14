import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

const claimInviteAction = vi.fn();
const confirmDobAndClaimAction = vi.fn();
vi.mock("@/app/c/[token]/actions", () => ({
  claimInviteAction: (...a: unknown[]) => claimInviteAction(...a),
  confirmDobAndClaimAction: (...a: unknown[]) => confirmDobAndClaimAction(...a),
  acceptJoinAction: vi.fn(),
}));
vi.mock("@/lib/invites/beacon", () => ({ sendLandingEvent: vi.fn() }));

import { InviteActions } from "./invite-actions";

const TOKEN = "e2eChallengeTokenAAAAA";
const DOB = {
  kind: "dob",
  title: "Confirm your date of birth",
  body: "We need your date of birth before your first match. You must be 16 or older.",
  error: null,
};
const BOOKED = {
  kind: "booked",
  title: "Challenge accepted",
  body: "You're booked. The match starts when you're both on the mat.",
  note: null,
};

function renderActive() {
  render(<InviteActions token={TOKEN} kind="challenge" inviterFirstName="Alex" viewer="active" inAppBrowser={null} webAppEnabled />);
}

async function reachDobStep() {
  claimInviteAction.mockResolvedValue(DOB);
  renderActive();
  fireEvent.click(screen.getByRole("button", { name: /accept challenge/i }));
  await screen.findByTestId("invite-dob");
}

function enterDob(value: string) {
  fireEvent.change(screen.getByLabelText("Date of birth"), { target: { value } });
  fireEvent.click(screen.getByRole("button", { name: /save and accept/i }));
}

afterEach(() => {
  vi.unstubAllEnvs();
});

beforeEach(() => {
  claimInviteAction.mockReset();
  confirmDobAndClaimAction.mockReset();
});

describe("InviteActions: dob_required", () => {
  it("asks for the date of birth instead of showing the underage copy", async () => {
    await reachDobStep();
    expect(screen.getByText("Confirm your date of birth")).toBeTruthy();
    expect(screen.getByText(DOB.body)).toBeTruthy();
    expect(screen.queryByText(/must be 16 or older to compete/i)).toBeNull();
    // One red CTA on the surface: the save button.
    expect(screen.getAllByRole("button")).toHaveLength(1);
  });

  it("saves the date and continues to the normal outcome with the same token", async () => {
    await reachDobStep();
    confirmDobAndClaimAction.mockResolvedValue(BOOKED);
    enterDob("1990-05-01");
    await screen.findByText("Challenge accepted");
    expect(confirmDobAndClaimAction).toHaveBeenCalledWith(TOKEN, "1990-05-01");
    expect(screen.queryByTestId("invite-dob")).toBeNull();
  });

  it("an under-16 date shows the underage copy inline, sends nothing and stays editable", async () => {
    await reachDobStep();
    enterDob("2015-01-01");
    await waitFor(() =>
      expect(screen.getByRole("alert").textContent).toBe("You must be 16 or older to compete on ELO RATED."),
    );
    expect(confirmDobAndClaimAction).not.toHaveBeenCalled();
    // The mistyped year can be corrected and saved.
    confirmDobAndClaimAction.mockResolvedValue(BOOKED);
    enterDob("1990-05-01");
    await screen.findByText("Challenge accepted");
    expect(confirmDobAndClaimAction).toHaveBeenCalledWith(TOKEN, "1990-05-01");
  });

  it("a server underage answer on the step keeps the input and lets the athlete fix it", async () => {
    await reachDobStep();
    confirmDobAndClaimAction.mockResolvedValueOnce({ ...DOB, error: "You must be 16 or older to compete on ELO RATED." });
    // Passes the client check (UTC drift is the server's call), then corrected.
    enterDob("1990-05-02");
    await screen.findByText("You must be 16 or older to compete on ELO RATED.");
    const input = screen.getByLabelText("Date of birth") as HTMLInputElement;
    expect(input.value).toBe("1990-05-02");
    confirmDobAndClaimAction.mockResolvedValueOnce(BOOKED);
    enterDob("1990-05-01");
    await screen.findByText("Challenge accepted");
  });

  it("keeps the step open with a message when the save fails", async () => {
    await reachDobStep();
    confirmDobAndClaimAction.mockResolvedValue({
      ...DOB,
      error: "Couldn't save your date of birth. Check your connection and try again.",
    });
    enterDob("1990-05-01");
    await screen.findByText("Couldn't save your date of birth. Check your connection and try again.");
    expect(screen.getByTestId("invite-dob")).toBeTruthy();
  });

  it("keeps the step open when the action call itself throws", async () => {
    await reachDobStep();
    confirmDobAndClaimAction.mockRejectedValue(new Error("offline"));
    enterDob("1990-05-01");
    await screen.findByText("Couldn't save your date of birth. Check your connection and try again.");
  });

  it("rejects a date that is not real without calling the server", async () => {
    await reachDobStep();
    enterDob("2999-01-01");
    await waitFor(() => expect(screen.getByRole("alert").textContent).toBe("Enter a real date of birth."));
    expect(confirmDobAndClaimAction).not.toHaveBeenCalled();
  });
});

type Viewer = "signed_out" | "no_athlete" | "pending";

function renderViewer(viewer: Viewer, webAppEnabled: boolean) {
  return render(
    <InviteActions token={TOKEN} kind="challenge" inviterFirstName="Alex" viewer={viewer} inAppBrowser={null} webAppEnabled={webAppEnabled} />,
  );
}

function hrefs(container: HTMLElement): string[] {
  return Array.from(container.querySelectorAll("a[href]")).map((a) => a.getAttribute("href") ?? "");
}

const NEXT = encodeURIComponent(`/c/${TOKEN}`);
const RED = "var(--accent-cta)";

describe("InviteActions: web app locked", () => {
  it.each<Viewer>(["signed_out", "no_athlete", "pending"])("%s gets no web sign-in or setup links, only the app", (viewer) => {
    const { container } = renderViewer(viewer, false);
    expect(hrefs(container).some((h) => /^\/(login|signup|eua)/.test(h))).toBe(false);
    expect(screen.getByRole("link", { name: "Open in app" })).toHaveAttribute("href", `elorated://c/${TOKEN}`);
    expect(screen.queryByRole("link", { name: "Sign up on web" })).toBeNull();
    expect(screen.queryByRole("link", { name: "Log in" })).toBeNull();
  });
});

describe("InviteActions: web app unlocked", () => {
  it("signed out shows Sign up on web and Log in", () => {
    renderViewer("signed_out", true);
    expect(screen.getByRole("link", { name: "Sign up on web" })).toHaveAttribute("href", `/signup?next=${NEXT}`);
    expect(screen.getByRole("link", { name: "Log in" })).toHaveAttribute("href", `/login?next=${NEXT}`);
  });

  it("pending links to /eua and no_athlete to /signup", () => {
    const { unmount } = renderViewer("pending", true);
    expect(screen.getByRole("link", { name: "Finish setup to accept" })).toHaveAttribute("href", `/eua?next=${NEXT}`);
    unmount();
    renderViewer("no_athlete", true);
    expect(screen.getByRole("link", { name: "Finish setup to accept" })).toHaveAttribute("href", `/signup?next=${NEXT}`);
  });
});

describe("InviteActions: one actionable red CTA (spec P3)", () => {
  it.each([true, false])("store URL unset (web app enabled %s): Open in app is red and comes first", (enabled) => {
    vi.stubEnv("NEXT_PUBLIC_APP_STORE_URL", "");
    renderViewer("signed_out", enabled);
    const open = screen.getByRole("link", { name: "Open in app" });
    const soon = screen.getByTestId("app-store-coming-soon");
    expect(open.style.background).toBe(RED);
    expect(soon.style.background).not.toBe(RED);
    expect(open.compareDocumentPosition(soon) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("store URL set: the App Store link is red and Open in app is not", () => {
    vi.stubEnv("NEXT_PUBLIC_APP_STORE_URL", "https://apps.apple.com/app/id6774629438");
    renderViewer("signed_out", false);
    expect(screen.getByRole("link", { name: "Get it on the App Store" }).style.background).toBe(RED);
    expect(screen.getByRole("link", { name: "Open in app" }).style.background).not.toBe(RED);
  });
});
