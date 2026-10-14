import { afterEach, describe, expect, it, vi } from "vitest";

const redirect = vi.fn((url: string) => {
  throw new Error(`NEXT_REDIRECT ${url}`);
});
vi.mock("next/navigation", () => ({ redirect: (url: string) => redirect(url) }));
vi.mock("@/lib/guards", () => ({ getActiveAthlete: vi.fn() }));
vi.mock("@/components/layout/bottom-nav-bar", () => ({ BottomNavBar: () => null }));
vi.mock("@/components/layout/sidebar-rail", () => ({ SidebarRail: () => null }));
vi.mock("@/components/layout/sidebar-footer", () => ({ SidebarFooter: () => null, SidebarFooterSkeleton: () => null }));
vi.mock("@/components/layout/global-notifications-provider", () => ({ GlobalNotificationsProvider: () => null }));
vi.mock("@/components/layout/online-presence-bootstrap", () => ({ OnlinePresenceBootstrap: () => null }));
vi.mock("@/components/layout/deployment-check-bootstrap", () => ({ DeploymentCheckBootstrap: () => null }));
vi.mock("@/components/layout/push-registration-bootstrap", () => ({ PushRegistrationBootstrap: () => null }));
vi.mock("@/components/arena/arena-bootstrap-gate", () => ({ ArenaBootstrapGate: () => null }));

import AppLayout from "./layout";

afterEach(() => {
  vi.unstubAllEnvs();
  redirect.mockClear();
});

describe("(app) layout and the web app lock", () => {
  it("redirects home before mounting the app shell while locked", () => {
    vi.stubEnv("NEXT_PUBLIC_WEB_APP_ENABLED", "");
    expect(() => AppLayout({ children: null })).toThrow("NEXT_REDIRECT /");
    expect(redirect).toHaveBeenCalledWith("/");
  });

  it("renders the shell when the web app is enabled", () => {
    vi.stubEnv("NEXT_PUBLIC_WEB_APP_ENABLED", "true");
    expect(AppLayout({ children: null })).toBeTruthy();
    expect(redirect).not.toHaveBeenCalled();
  });
});
