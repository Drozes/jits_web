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
  AppStoreButton: () => <a href="#store">Get it on the App Store</a>,
  OpenInAppButton: () => <a href="#app">Open in app</a>,
  CopyLinkButton: () => <button type="button">Copy link</button>,
}));

import { InviteActions } from "./invite-actions";

const TOKEN = "e2eChallengeTokenAAAAA";
const DOB = {
  kind: "dob",
  title: "Confirm your date of birth",
  body: "We need your date of birth before your first ranked match. You must be 16 or older.",
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

  it("shows the underage copy when the entered date is under 16", async () => {
    await reachDobStep();
    confirmDobAndClaimAction.mockResolvedValue({
      kind: "error",
      title: "16 and over",
      body: "You must be 16 or older to compete on ELO RATED.",
    });
    enterDob("2015-01-01");
    await screen.findByText("You must be 16 or older to compete on ELO RATED.");
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
