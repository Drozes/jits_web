import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

const claimInviteAction = vi.fn();
const confirmDobAndClaimAction = vi.fn();
vi.mock("@/app/c/[token]/actions", () => ({
  claimInviteAction: (...a: unknown[]) => claimInviteAction(...a),
  confirmDobAndClaimAction: (...a: unknown[]) => confirmDobAndClaimAction(...a),
  acceptJoinAction: vi.fn(),
}));
vi.mock("./app-links", () => ({
  InviteStoreBadges: () => <div role="group" aria-label="App Store: coming soon" />,
  OpenInAppButton: ({ primary }: { primary?: boolean }) => <a href="#app" data-primary={primary ? "true" : "false"}>Open in app</a>,
  CopyLinkButton: () => <button type="button">Copy link</button>,
}));

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
  render(<InviteActions token={TOKEN} kind="challenge" inviterFirstName="Alex" viewer="active" inAppBrowser={null} />);
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

describe("InviteActions: CTA hierarchy with the store badges", () => {
  const RED = "var(--accent-cta)";

  it("signed out: Sign up on web is the one red CTA, the store badges are not", () => {
    render(<InviteActions token={TOKEN} kind="challenge" inviterFirstName="Alex" viewer="signed_out" inAppBrowser={null} />);
    const signUp = screen.getByRole("link", { name: /sign up on web/i });
    expect(signUp.style.background).toBe(RED);
    expect(signUp.getAttribute("href")).toBe(`/signup?next=${encodeURIComponent(`/c/${TOKEN}`)}`);
    expect(screen.getByRole("group", { name: "App Store: coming soon" })).toBeTruthy();
    const red = screen.getAllByRole("link").filter((el) => el.style.background === RED);
    expect(red).toEqual([signUp]);
    expect(screen.getByRole("link", { name: /open in app/i }).dataset.primary).toBe("false");
  });

  it("after a web booking: Open in app is the red CTA, never the App Store", async () => {
    claimInviteAction.mockResolvedValue(BOOKED);
    renderActive();
    fireEvent.click(screen.getByRole("button", { name: /accept challenge/i }));
    await screen.findByText("Challenge accepted");
    expect(screen.getByRole("link", { name: /open in app/i }).dataset.primary).toBe("true");
    expect(screen.getByRole("group", { name: "App Store: coming soon" })).toBeTruthy();
  });
});
