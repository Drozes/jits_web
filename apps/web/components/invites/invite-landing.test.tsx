import { afterEach, describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";

vi.mock("@/app/c/[token]/actions", () => ({
  claimInviteAction: vi.fn(),
  confirmDobAndClaimAction: vi.fn(),
  acceptJoinAction: vi.fn(),
  signOutKeepInviteAction: vi.fn(),
}));
vi.mock("@/lib/invites/beacon", () => ({ sendLandingEvent: vi.fn() }));

const TOKEN = "e2eUnavailableTokenAAA";
const RED = "var(--accent-cta)";

/** The store URLs are read at module load (lib/app-links.ts): re-import per env. */
async function renderSignedOutUnavailable(appStoreUrl: string) {
  vi.resetModules();
  vi.stubEnv("NEXT_PUBLIC_APP_STORE_URL", appStoreUrl);
  const { InviteLanding } = await import("./invite-landing");
  render(
    <InviteLanding token={TOKEN} preview={{ state: "unavailable" }} viewer={{ state: "signed_out" }} inAppBrowser={null} />,
  );
  return within(screen.getByTestId("invite-unavailable"));
}

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("InviteLanding unavailable, signed out", () => {
  it("store not live: Open in app is the red CTA, then the Coming soon badges", async () => {
    const section = await renderSignedOutUnavailable("");
    const open = section.getByRole("link", { name: "Open in app" });
    const soon = section.getByRole("group", { name: "App Store: coming soon" });
    expect(open.style.background).toBe(RED);
    expect(open.compareDocumentPosition(soon) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(section.getByRole("group", { name: "Google Play: coming soon" })).toBeTruthy();
  });

  it("store live: the App Store badge links the listing but is never red; Open in app stays the red CTA", async () => {
    const section = await renderSignedOutUnavailable("https://apps.apple.com/app/id6774629438");
    const badge = section.getByRole("link", { name: "Download ELO RATED on the App Store" });
    expect(badge).toHaveAttribute("href", "https://apps.apple.com/app/id6774629438");
    expect(badge.style.background).not.toBe(RED);
    expect(section.getByRole("link", { name: "Open in app" }).style.background).toBe(RED);
  });
});
