import * as React from "react";
import { render, fireEvent } from "@testing-library/react-native";
import type { GymListItem, SessionListItem } from "@jits/shared/types/session";

/**
 * Home's discovery surface is the only way into a session now that the Gyms tab
 * is gone, so these cover the three states an athlete can be in and, in each
 * one, that the surface offers a real onward tap.
 */

const mockPush = jest.fn();

jest.mock("expo-router", () => ({
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

jest.mock("@/lib/theme/use-theme", () => ({
  useThemedTokens: () => ({
    textSecondary: "#A8B3BE",
    textOnAccent: "#E8EDF2",
    accentCta: "#E63946",
  }),
}));

import { SessionDiscoverySection } from "@/components/dashboard/session-discovery-section";

function session(overrides: Partial<SessionListItem> = {}): SessionListItem {
  return {
    id: "s1",
    title: "Open Mat",
    scheduledStart: "2026-09-20T18:00:00.000Z",
    scheduledEnd: "2026-09-20T20:00:00.000Z",
    status: "scheduled",
    participantCount: 2,
    maxParticipants: null,
    rsvpCount: 1,
    createdBy: "a2",
    createdByName: "Coach",
    ...overrides,
  };
}

function gym(overrides: Partial<GymListItem> = {}): GymListItem {
  return {
    id: "g9",
    name: "Live Gym",
    city: "Austin",
    status: "active",
    memberCount: 8,
    activeSessions: 1,
    upcomingSessions: 0,
    hasActiveSession: true,
    nextSessionStart: null,
    ...overrides,
  };
}

const baseProps = {
  gymId: "g1" as string | null,
  gymName: "Test Gym" as string | null,
  sessions: [] as SessionListItem[],
  rsvpSessionIds: [] as string[],
  participantSessionIds: [] as string[],
  liveGyms: [] as GymListItem[],
};

beforeEach(() => {
  jest.clearAllMocks();
});

describe("SessionDiscoverySection (member with sessions)", () => {
  it("lists the gym's upcoming sessions and opens the join flow", () => {
    const { getByText } = render(
      React.createElement(SessionDiscoverySection, {
        ...baseProps,
        sessions: [session()],
      }),
    );

    expect(getByText("Upcoming ELO Sessions")).toBeTruthy();
    // The attend row is the join entry point. Press its own label: a positional
    // getAllByRole("button")[0] would silently retarget the moment the surface
    // gains a button above the list.
    fireEvent.press(getByText("Attend"));
    expect(mockPush).toHaveBeenCalledWith("/session/s1/join");
  });

  it("surfaces a live session with its own join plate", () => {
    const { getByLabelText } = render(
      React.createElement(SessionDiscoverySection, {
        ...baseProps,
        sessions: [session({ id: "live1", status: "active" })],
      }),
    );

    fireEvent.press(getByLabelText("Join lobby"));
    expect(mockPush).toHaveBeenCalledWith("/session/live1/join");
  });

  it("links to the athlete's own gym", () => {
    const { getByLabelText } = render(
      React.createElement(SessionDiscoverySection, {
        ...baseProps,
        sessions: [session()],
      }),
    );

    fireEvent.press(getByLabelText("Open Test Gym"));
    expect(mockPush).toHaveBeenCalledWith("/gyms/g1");
  });
});

describe("SessionDiscoverySection (member with no sessions)", () => {
  it("says the gym has nothing scheduled and still offers the gym list", () => {
    const { getByText, getByLabelText } = render(
      React.createElement(SessionDiscoverySection, baseProps),
    );

    expect(getByText("No Sessions Scheduled")).toBeTruthy();
    expect(
      getByText(/Nothing scheduled at Test Gym right now/),
    ).toBeTruthy();

    fireEvent.press(getByLabelText("Browse gyms"));
    expect(mockPush).toHaveBeenCalledWith("/gyms");
  });
});

describe("SessionDiscoverySection (free agent)", () => {
  it("explains the missing home gym and lists gyms that are live now", () => {
    const { getByText, getByLabelText, queryByText } = render(
      React.createElement(SessionDiscoverySection, {
        ...baseProps,
        gymId: null,
        gymName: null,
        liveGyms: [gym()],
      }),
    );

    expect(getByText(/haven.t set a home gym yet/)).toBeTruthy();
    expect(getByText("Live Right Now")).toBeTruthy();
    expect(getByText("Live Gym")).toBeTruthy();
    // No gym means no "my gym" shortcut, and no session list to be empty.
    expect(queryByText("Upcoming ELO Sessions")).toBeNull();

    fireEvent.press(getByLabelText("Live Gym gym"));
    expect(mockPush).toHaveBeenCalledWith("/gyms/g9");
  });

  it("stays actionable when no gym is live", () => {
    const { getByLabelText, queryByText } = render(
      React.createElement(SessionDiscoverySection, {
        ...baseProps,
        gymId: null,
        gymName: null,
      }),
    );

    expect(queryByText("Live Right Now")).toBeNull();
    fireEvent.press(getByLabelText("Browse gyms"));
    expect(mockPush).toHaveBeenCalledWith("/gyms");
  });
});

/**
 * A dropped request and an empty gym produce identical data. Telling a member
 * their gym is dark when the read simply failed is the worst outcome on this
 * surface: it is the only path to a session, so they close the app instead of
 * joining the open mat that is actually running.
 */
describe("SessionDiscoverySection (failed load)", () => {
  it("never claims the gym is empty when the read failed", () => {
    const onRetry = jest.fn();
    const { getByText, queryByText, getByLabelText } = render(
      React.createElement(SessionDiscoverySection, {
        ...baseProps,
        loadFailed: true,
        onRetry,
      }),
    );

    expect(getByText("Sessions Unavailable")).toBeTruthy();
    expect(queryByText("No Sessions Scheduled")).toBeNull();
    expect(queryByText(/Nothing scheduled at Test Gym right now/)).toBeNull();

    fireEvent.press(getByLabelText("Retry loading sessions"));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it("keeps showing sessions it already has and stays quiet about the failure", () => {
    const { getByText, queryByText } = render(
      React.createElement(SessionDiscoverySection, {
        ...baseProps,
        sessions: [session()],
        loadFailed: true,
      }),
    );

    // Stale sessions beat an error plate: the data is still the best answer.
    expect(getByText("Upcoming ELO Sessions")).toBeTruthy();
    expect(queryByText("Sessions Unavailable")).toBeNull();
  });

  it("reports the failure on the free-agent path too", () => {
    const { getByText, queryByText } = render(
      React.createElement(SessionDiscoverySection, {
        ...baseProps,
        gymId: null,
        gymName: null,
        loadFailed: true,
      }),
    );

    expect(getByText("Sessions Unavailable")).toBeTruthy();
    // The home-gym explainer is still true, so it stays.
    expect(queryByText(/haven.t set a home gym yet/)).toBeTruthy();
  });

  it("still offers the gym list when the read failed", () => {
    const { getByLabelText } = render(
      React.createElement(SessionDiscoverySection, {
        ...baseProps,
        loadFailed: true,
      }),
    );

    fireEvent.press(getByLabelText("Browse gyms"));
    expect(mockPush).toHaveBeenCalledWith("/gyms");
  });
});
