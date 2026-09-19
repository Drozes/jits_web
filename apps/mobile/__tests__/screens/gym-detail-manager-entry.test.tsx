import * as React from "react";
import { render, waitFor, fireEvent } from "@testing-library/react-native";

/**
 * /gyms/[id] is the ONLY entry point to the gym-owner portal since the
 * manager-gated tab was removed. If the Manage Gym affordance disappears or
 * stops carrying the gym id, seven routes and two directories of manager code
 * become unreachable on mobile, silently. These tests are that alarm.
 */

const mockPush = jest.fn();

jest.mock("expo-router", () => ({
  useLocalSearchParams: () => ({ id: "g1" }),
  useRouter: () => ({ push: mockPush }),
}));

jest.mock("lucide-react-native", () => {
  const R = require("react");
  const RN = require("react-native");
  const stub = () => R.createElement(RN.View, {});
  return new Proxy(
    {},
    {
      get: (_t: Record<string, unknown>, prop: string) => {
        if (prop === "__esModule") return true;
        return stub;
      },
    },
  );
});

jest.mock("react-native-safe-area-context", () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

jest.mock("@/lib/theme/use-theme", () => ({
  useThemedTokens: () => ({
    accentCta: "#E63946",
    textSecondary: "#A8B3BE",
    textOnAccent: "#E8EDF2",
    background: "#0B0F14",
    foreground: "#E8EDF2",
  }),
}));

jest.mock("@/lib/location/use-location", () => ({
  useLocation: () => ({
    position: null,
    isGranted: true,
    isLoading: false,
    request: jest.fn(),
  }),
  formatDistanceKm: () => "1.0 km",
  haversineKm: () => 1,
}));

jest.mock("@/lib/auth/hooks", () => ({
  useRequireAthlete: () => ({
    athlete: { id: "a1", display_name: "TestUser", primary_gym_id: "g1" },
    isLoading: false,
  }),
}));

// The gym row lookup goes straight through the client, so stub the chain.
jest.mock("@/lib/supabase/client", () => ({
  supabase: {
    from: () => ({
      select: () => ({
        eq: () => ({
          maybeSingle: () =>
            Promise.resolve({
              data: { latitude: null, longitude: null, address: "1 Main St" },
            }),
        }),
      }),
    }),
  },
}));

jest.mock("@/components/ui", () => ({
  toast: { error: jest.fn(), info: jest.fn(), success: jest.fn() },
}));

// Sheets and lists are exercised by their own suites; here they only need to
// render their trigger children so the manager block's layout is intact.
const passthrough = (props: { children?: React.ReactNode }) => {
  const R = require("react");
  const RN = require("react-native");
  return R.createElement(RN.View, {}, props.children);
};

jest.mock("@/components/session/create-session-sheet", () => ({
  CreateSessionSheet: passthrough,
}));
jest.mock("@/components/gyms/edit-gym-sheet", () => ({
  EditGymSheet: passthrough,
}));
jest.mock("@/components/session/session-templates", () => ({
  SessionTemplates: () => null,
}));
jest.mock("@/components/session-card", () => ({
  SessionCard: () => null,
}));

const mockGym = {
  id: "g1",
  name: "Test Gym",
  city: "Austin",
  status: "active",
  sessions: [],
  rsvpSessionIds: [],
  participantSessionIds: [],
  memberCount: 12,
  isMemberGym: true,
  isGymManager: false,
};

jest.mock("@jits/shared/api/queries", () => ({
  getGymDetail: jest.fn(),
  getGymManagerStats: jest.fn(),
}));

jest.mock("@jits/shared/types/session", () => ({}), { virtual: true });

import GymDetailScreen from "@/app/(app)/gyms/[id]";

interface QueryMocks {
  getGymDetail: jest.Mock;
  getGymManagerStats: jest.Mock;
}

function setManager(isGymManager: boolean) {
  const queries = require("@jits/shared/api/queries") as QueryMocks;
  queries.getGymDetail.mockResolvedValue({ ...mockGym, isGymManager });
  queries.getGymManagerStats.mockResolvedValue({
    totalSessions: 0,
    totalParticipants: 0,
  });
}

beforeEach(() => {
  jest.clearAllMocks();
});

describe("GymDetailScreen manager entry", () => {
  it("offers Manage Gym to a manager and routes to the portal with this gym", async () => {
    setManager(true);
    const { getByLabelText } = render(React.createElement(GymDetailScreen));

    await waitFor(() => {
      expect(getByLabelText("Manage gym")).toBeTruthy();
    });

    fireEvent.press(getByLabelText("Manage gym"));
    // The gym id rides along so the portal shows THIS gym instead of falling
    // back to the manager's first one.
    expect(mockPush).toHaveBeenCalledWith({
      pathname: "/gym-manager",
      params: { gymId: "g1" },
    });
  });

  it("shows no manager entry to a non-manager", async () => {
    setManager(false);
    const { getByText, queryByLabelText } = render(
      React.createElement(GymDetailScreen),
    );

    await waitFor(() => {
      expect(getByText("Test Gym")).toBeTruthy();
    });
    expect(queryByLabelText("Manage gym")).toBeNull();
    expect(queryByLabelText("Start session")).toBeNull();
  });
});
