import { afterEach, describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";

vi.mock("@/app/c/[token]/actions", () => ({
  claimInviteAction: vi.fn(),
  confirmDobAndClaimAction: vi.fn(),
  acceptJoinAction: vi.fn(),
  signOutKeepInviteAction: vi.fn(),
}));
vi.mock("@/lib/invites/beacon", () => ({ sendLandingEvent: vi.fn() }));

import { InviteLanding } from "./invite-landing";

const TOKEN = "e2eUnavailableTokenAAA";
const RED = "var(--accent-cta)";

function renderSignedOutUnavailable() {
  render(
    <InviteLanding token={TOKEN} preview={{ state: "unavailable" }} viewer={{ state: "signed_out" }} inAppBrowser={null} />,
  );
  return within(screen.getByTestId("invite-unavailable"));
}

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("InviteLanding unavailable, signed out", () => {
  it("store live: the red App Store link only (unchanged)", () => {
    vi.stubEnv("NEXT_PUBLIC_APP_STORE_URL", "https://apps.apple.com/app/id6774629438");
    const section = renderSignedOutUnavailable();
    expect(section.getByRole("link", { name: "Get it on the App Store" }).style.background).toBe(RED);
    expect(section.queryByRole("link", { name: "Open in app" })).toBeNull();
  });

  it("store not live: Open in app is the red CTA, then the neutral coming-soon state", () => {
    vi.stubEnv("NEXT_PUBLIC_APP_STORE_URL", "");
    const section = renderSignedOutUnavailable();
    const open = section.getByRole("link", { name: "Open in app" });
    const soon = section.getByTestId("app-store-coming-soon");
    expect(open.style.background).toBe(RED);
    expect(soon.style.background).not.toBe(RED);
    expect(open.compareDocumentPosition(soon) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });
});
