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
function HomeBlock({
  sessions,
  rsvpSessionIds = [],
  participantSessionIds = [],
}: {
  sessions: SessionListItem[];
  rsvpSessionIds?: string[];
  participantSessionIds?: string[];
}) {
  return (
    <View>
      <ActiveSessionCard session={null} />
      <SessionDiscoverySection
        gymId="g1"
        gymName="Test Gym"
        sessions={sessions}
        rsvpSessionIds={rsvpSessionIds}
        participantSessionIds={participantSessionIds}
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

    expect(getByText("No live session")).toBeTruthy();
    expect(getByText(/not in a live session right now/)).toBeTruthy();
  });

  /**
   * The state THIS FEATURE creates, in one tap from the surface it adds.
   *
   * Attend on the discovery section opens /session/[id]/join for a SCHEDULED
   * session (gym-detail-parts.tsx), confirm-step calls joinSessionLobby with no
   * branch on status, and joinSessionLobby upserts a participant row with
   * status 'checked_in' and writes NO rsvp row (mutations.ts:234-261). The
   * session is still 'scheduled', so getActiveSession's priority 1 (active +
   * participant) misses and priority 2 (RSVP + future start) misses, and it
   * returns null. The card must not tell someone who checked in a moment ago,
   * from this very screen, that they are not checked in.
   */
  it("does not deny a check-in to a session that is still scheduled", () => {
    const { getByText, queryByText } = render(
      <HomeBlock
        sessions={[tomorrowsOpenMat]}
        participantSessionIds={[tomorrowsOpenMat.id]}
      />,
    );

    // The section below already knows they are going.
    expect(getByText("✓ Going")).toBeTruthy();

    // So the card above may not contradict it. It may say only that no session
    // is LIVE, which is still true here.
    expect(queryByText(/checked in/i)).toBeNull();
    expect(getByText("No live session")).toBeTruthy();
    expect(getByText(/not in a live session right now/)).toBeTruthy();
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

    expect(queryByText(/RSVP/)).toBeNull();
    // The card speaks about the athlete, not about the gym: they are not IN a
    // live session. The live session they RSVP'd to is right there to join, and
    // the body sentence points at it rather than away.
    expect(getByText("No live session")).toBeTruthy();
    expect(getByText(/Pick one from Find a\s+Session below/)).toBeTruthy();
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

    expect(getByText("No live session")).toBeTruthy();
    expect(getByText("No Sessions Scheduled")).toBeTruthy();
    expect(queryByText("No upcoming session")).toBeNull();
    expect(getAllByText(/^Browse/i)).toHaveLength(1);

    fireEvent.press(getByText("Browse Gyms"));
    expect(mockPush).toHaveBeenCalledWith("/gyms");
  });
});
