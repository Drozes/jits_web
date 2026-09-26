import { describe, it, expect, vi } from "vitest";
import { render } from "@testing-library/react";
import { GlobalNotificationsProvider } from "./global-notifications-provider";

vi.mock("next/navigation", () => ({ usePathname: () => "/arena" }));
vi.mock("@/lib/supabase/client", () => ({ createClient: () => ({}) }));
vi.mock("@/lib/notifications", () => ({ showNotification: vi.fn() }));
vi.mock("@/hooks/use-unread-count", () => ({ refreshUnreadCounts: vi.fn() }));

const hook = vi.hoisted(() => ({ args: null as null | Record<string, unknown> }));
vi.mock("@jits/shared/hooks/use-global-notifications", () => ({
  useGlobalNotifications: (args: Record<string, unknown>) => {
    hook.args = args;
  },
}));

describe("GlobalNotificationsProvider", () => {
  it("leaves accepted/declined to the Arena and never links to the hidden lobby", () => {
    render(<GlobalNotificationsProvider athleteId="me" />);
    expect(hook.args?.challengeOutcomeToasts).toBe(false);
    expect(hook.args?.buildLobbyHref).toBeUndefined();
    expect(hook.args?.currentAthleteId).toBe("me");
  });
});
