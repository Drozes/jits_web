/**
 * Settings screens of jits-rog5.11: Blocked athletes (list, Unblock, empty
 * and error states), AI processing (status and explanation), the chat
 * toggle gone from Notifications, and the support contact on Help.
 */
import * as React from "react";
import { act, fireEvent, render } from "@testing-library/react-native";

jest.mock("@/lib/supabase/client", () => ({ supabase: { tag: "client" } }));
jest.mock("expo-router", () => {
  const R = require("react");
  return {
    // Focus runs once, like a mount.
    useFocusEffect: (cb: () => void) => R.useEffect(() => cb(), [cb]),
    useRouter: () => ({ push: jest.fn() }),
    Link: ({ href, children }: { href: string; children: React.ReactElement }) =>
      R.cloneElement(children, { testID: `link-${href}` }),
  };
});
jest.mock("lucide-react-native", () => {
  const R = require("react");
  const RN = require("react-native");
  const stub = () => R.createElement(RN.View);
  return new Proxy({}, { get: (_t, p) => (p === "__esModule" ? true : stub) });
});
jest.mock("@/components/layout/app-header", () => ({ AppHeader: () => null }));
jest.mock("@/components/layout/page-container", () => ({
  PageContainer: ({ children }: { children: React.ReactNode }) => children,
}));
const mockToast = { success: jest.fn(), error: jest.fn(), info: jest.fn() };
jest.mock("@/components/ui/toast", () => ({
  get toast() {
    return mockToast;
  },
}));
jest.mock("@/lib/invites/use-friend-ids", () => ({ notifyFriendsChanged: jest.fn() }));
const mockApi = { getMyBlockIds: jest.fn(), getMyBlockedAthletes: jest.fn(), unblockAthlete: jest.fn() };
jest.mock("@jits/shared/api/moderation", () => ({
  getMyBlockIds: (...a: unknown[]) => mockApi.getMyBlockIds(...a),
  getMyBlockedAthletes: (...a: unknown[]) => mockApi.getMyBlockedAthletes(...a),
  unblockAthlete: (...a: unknown[]) => mockApi.unblockAthlete(...a),
}));
jest.mock("@/lib/auth/hooks", () => ({ useAuth: () => ({ athlete: { id: "me" } }) }));
jest.mock("@jits/shared/api/mutations", () => ({
  getNotificationPreferences: jest.fn(() =>
    Promise.resolve({ enable_challenges: true, enable_chat: true, enable_matches: true }),
  ),
  updateNotificationPreferences: jest.fn(),
}));
jest.mock("@jits/shared/api/friends", () => ({
  getFriendsNotificationsEnabled: jest.fn(() => Promise.resolve(true)),
  setFriendsNotificationsEnabled: jest.fn(),
}));

import BlockedAthletesScreen from "@/app/(app)/settings/blocked";
import AiProcessingScreen from "@/app/(app)/settings/ai-processing";
import NotificationsScreen from "@/app/(app)/settings/notifications";
import SettingsHelpScreen from "@/app/(app)/settings/help";
import { __resetBlocksForTests } from "@/lib/moderation/block-store";
import { __resetAiConsentForTests } from "@/lib/moderation/ai-consent";

const ROWS = [
  { athlete_id: "b-1", display_name: "Alex Park", blocked_at: "2026-10-14T16:00:00Z" },
  { athlete_id: "b-2", display_name: "Sam Lee", blocked_at: "2026-10-02T16:00:00Z" },
];

beforeEach(() => {
  jest.clearAllMocks();
  __resetBlocksForTests({ athleteId: "me" });
  __resetAiConsentForTests();
  mockApi.getMyBlockIds.mockResolvedValue({ ok: true, data: ["b-1", "b-2"] });
  mockApi.getMyBlockedAthletes.mockResolvedValue({ ok: true, data: ROWS });
  mockApi.unblockAthlete.mockResolvedValue({ ok: true, data: undefined });
});

describe("Blocked athletes", () => {
  it("lists my blocks with the date and an Unblock per row", async () => {
    const s = render(<BlockedAthletesScreen />);
    await act(async () => {});
    expect(s.getByText("Alex Park")).toBeTruthy();
    expect(s.getByText("Sam Lee")).toBeTruthy();
    expect(s.getByText("Blocked Oct 14, 2026")).toBeTruthy();
    expect(s.getByTestId("unblock-b-1")).toBeTruthy();
  });

  it("Unblock removes the row and toasts", async () => {
    const s = render(<BlockedAthletesScreen />);
    await act(async () => {});
    mockApi.getMyBlockedAthletes.mockResolvedValue({ ok: true, data: [ROWS[1]] });
    mockApi.getMyBlockIds.mockResolvedValue({ ok: true, data: ["b-2"] });
    await act(async () => {
      fireEvent.press(s.getByTestId("unblock-b-1"));
    });
    expect(mockApi.unblockAthlete).toHaveBeenCalledWith({ tag: "client" }, "b-1");
    expect(mockToast.success).toHaveBeenCalledWith("You unblocked Alex Park.");
    expect(s.queryByText("Alex Park")).toBeNull();
  });

  it("a failed unblock keeps the row and says so", async () => {
    mockApi.unblockAthlete.mockResolvedValue({ ok: false, error: { hint: "unknown", message: "" } });
    const s = render(<BlockedAthletesScreen />);
    await act(async () => {});
    await act(async () => {
      fireEvent.press(s.getByTestId("unblock-b-1"));
    });
    expect(mockToast.error).toHaveBeenCalledWith("Couldn't unblock. Check your connection and try again.");
    expect(s.getByText("Alex Park")).toBeTruthy();
  });

  it("nobody blocked: the empty state", async () => {
    mockApi.getMyBlockIds.mockResolvedValue({ ok: true, data: [] });
    mockApi.getMyBlockedAthletes.mockResolvedValue({ ok: true, data: [] });
    const s = render(<BlockedAthletesScreen />);
    await act(async () => {});
    expect(s.getByText("You haven't blocked anyone.")).toBeTruthy();
  });

  it("a failed first read offers Try again", async () => {
    mockApi.getMyBlockIds.mockResolvedValue({ ok: false, error: { hint: "unknown", message: "" } });
    mockApi.getMyBlockedAthletes.mockResolvedValue({ ok: false, error: { hint: "unknown", message: "" } });
    const s = render(<BlockedAthletesScreen />);
    await act(async () => {});
    expect(s.getByTestId("blocked-error")).toBeTruthy();
  });
});

describe("AI processing", () => {
  it("not given: says so, explains, and links the Privacy Policy", () => {
    __resetAiConsentForTests({ athleteId: "me", consentAt: null, known: true });
    const s = render(<AiProcessingScreen />);
    expect(s.getByTestId("ai-consent-status").props.children).toBe("Not given");
    expect(s.getByText(/sent to Google Gemini to find key moments/)).toBeTruthy();
    expect(s.getByText(/may be sent to OpenAI to make your avatar/)).toBeTruthy();
    expect(s.getByTestId("link-/legal/privacy?section=4")).toBeTruthy();
  });

  it("given: shows the date", () => {
    __resetAiConsentForTests({ athleteId: "me", consentAt: "2026-10-14T16:00:00Z", known: true });
    const s = render(<AiProcessingScreen />);
    expect(s.getByTestId("ai-consent-status").props.children).toBe("Given Oct 14, 2026");
  });
});

describe("Notifications", () => {
  it("has no chat toggle (the app has no chat)", async () => {
    const s = render(<NotificationsScreen />);
    await act(async () => {});
    expect(s.queryByText(/chat/i)).toBeNull();
    expect(s.queryByText(/messages/i)).toBeNull();
    expect(s.getByText("CHALLENGES")).toBeTruthy();
  });
});

describe("Help & Support contact", () => {
  it("names info@elorated.com and how to report and block in the app", () => {
    const s = render(<SettingsHelpScreen />);
    expect(s.getByText(/To report a user or content, use Report on their profile or video, or email info@elorated\.com/)).toBeTruthy();
    expect(s.getByText(/tap More, then Block athlete/)).toBeTruthy();
    expect(s.queryByText(/support@elorated\.com/)).toBeNull();
  });
});
