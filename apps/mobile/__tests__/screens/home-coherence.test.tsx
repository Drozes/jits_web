import { View } from "react-native";
import { render, fireEvent } from "@testing-library/react-native";
import type { SessionListItem } from "@jits/shared/types/session";

/**
 * ActiveSessionCard and SessionDiscoverySection are adjacent on Home and read
 * as one block, so they have to agree. They describe different things:
 * getActiveSession answers "is this athlete checked in or RSVP'd", while
 * discovery answers "what is on at their gym". The most common member state,
 * an open mat tomorrow that they have not RSVP'd to, satisfies the first as
 * "no" and the second as "yes", which is exactly when a card claiming there is
 * no upcoming session would sit directly on top of that session's Attend
 * button. This mounts the real pair in that state.
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

import { ActiveSessionCard } from "@/components/dashboard/active-session-card";
import { SessionDiscoverySection } from "@/components/dashboard/session-discovery-section";

const tomorrowsOpenMat: SessionListItem = {
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
};

/** The two components in the order and adjacency Home renders them. */
function HomeBlock({ sessions }: { sessions: SessionListItem[] }) {
  return (
    <View>
      <ActiveSessionCard session={null} />
      <SessionDiscoverySection
        gymId="g1"
        gymName="Test Gym"
        sessions={sessions}
        rsvpSessionIds={[]}
        participantSessionIds={[]}
        liveGyms={[]}
      />
    </View>
  );
}

beforeEach(() => {
  jest.clearAllMocks();
});

describe("Home active-session card and discovery together", () => {
  it("does not deny a session that the surface below is listing", () => {
    const { queryByText, getByText } = render(
      <HomeBlock sessions={[tomorrowsOpenMat]} />,
    );

    // The session is listed and joinable.
    expect(getByText("Upcoming ELO Sessions")).toBeTruthy();
    expect(getByText("Attend")).toBeTruthy();

    // So nothing above it may claim there is none.
    expect(queryByText("No upcoming session")).toBeNull();
    expect(queryByText(/Browse gyms in your city/)).toBeNull();
  });

  it("states only what is true of the athlete, not of the gym", () => {
    const { getByText } = render(<HomeBlock sessions={[tomorrowsOpenMat]} />);

    expect(getByText("Not checked in")).toBeTruthy();
    expect(getByText(/not checked in to a session yet/)).toBeTruthy();
  });

  it("does not deny an RSVP once the session has gone active", () => {
    // getActiveSession's RSVP branch matches only sessions still `scheduled`
    // with a start in the future, so an athlete who RSVP'd to tonight's open
    // mat and opens the app after it goes live gets a null card while very much
    // holding an RSVP. Common state, and the card used to call them a no-show.
    const { getByText, queryByText } = render(
      <HomeBlock
        sessions={[{ ...tomorrowsOpenMat, id: "live1", status: "active" }]}
      />,
    );

    expect(getByText("Not checked in")).toBeTruthy();
    expect(queryByText(/RSVP/)).toBeNull();
    // And the live session they RSVP'd to is right there to join.
    expect(getByText("Session Live")).toBeTruthy();
  });

  it("offers exactly one browse action across the pair", () => {
    const { getAllByText } = render(
      <HomeBlock sessions={[tomorrowsOpenMat]} />,
    );

    // Two Browse CTAs three lines apart was the other half of the contradiction.
    expect(getAllByText(/^Browse/i)).toHaveLength(1);
  });

  it("still coheres when the gym genuinely has nothing on", () => {
    const { getByText, getAllByText, queryByText } = render(
      <HomeBlock sessions={[]} />,
    );

    expect(getByText("Not checked in")).toBeTruthy();
    expect(getByText("No Sessions Scheduled")).toBeTruthy();
    expect(queryByText("No upcoming session")).toBeNull();
    expect(getAllByText(/^Browse/i)).toHaveLength(1);

    fireEvent.press(getByText("Browse Gyms"));
    expect(mockPush).toHaveBeenCalledWith("/gyms");
  });
});
