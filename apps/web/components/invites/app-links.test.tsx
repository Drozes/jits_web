import { afterEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";

const sendLandingEvent = vi.fn();
vi.mock("@/lib/invites/beacon", () => ({
  sendLandingEvent: (...a: unknown[]) => sendLandingEvent(...a),
}));

const TOKEN = "e2eChallengeTokenAAAAA";

async function renderBadges(appStoreUrl: string | undefined, playStoreUrl: string | undefined) {
  vi.resetModules();
  vi.stubEnv("NEXT_PUBLIC_APP_STORE_URL", appStoreUrl);
  vi.stubEnv("NEXT_PUBLIC_PLAY_STORE_URL", playStoreUrl);
  const { InviteStoreBadges } = await import("./app-links");
  render(<InviteStoreBadges token={TOKEN} inAppBrowser="instagram" kind="challenge" />);
}

describe("InviteStoreBadges", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    sendLandingEvent.mockReset();
  });

  it("logs app_store_tapped on a live App Store tap, nothing for Google Play", async () => {
    await renderBadges(
      "https://apps.apple.com/app/id6774629438",
      "https://play.google.com/store/apps/details?id=com.elorated.mobile",
    );
    fireEvent.click(screen.getByRole("link", { name: "Download ELO RATED on the App Store" }));
    expect(sendLandingEvent).toHaveBeenCalledWith(TOKEN, "app_store_tapped", "instagram", "challenge");
    fireEvent.click(screen.getByRole("link", { name: "Get ELO RATED on Google Play" }));
    expect(sendLandingEvent).toHaveBeenCalledTimes(1);
  });

  it("shows both stores as Coming soon, with no links, until the listings are set", async () => {
    await renderBadges(undefined, undefined);
    expect(screen.getByText("Get the app")).toBeTruthy();
    expect(screen.getByRole("group", { name: "App Store: coming soon" })).toBeTruthy();
    expect(screen.getByRole("group", { name: "Google Play: coming soon" })).toBeTruthy();
    expect(screen.queryAllByRole("link")).toHaveLength(0);
  });
});
