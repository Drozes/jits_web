import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { SessionList } from "./session-list";
import type { SessionListItem } from "@jits/shared/types/session";

// Mock SessionCard to inspect the isCreator prop
vi.mock("@/components/domain/session-card", () => ({
  SessionCard: ({
    session,
    isCreator,
  }: {
    session: SessionListItem;
    isRsvpd: boolean;
    isCreator?: boolean;
  }) => (
    <div data-testid={`session-${session.id}`} data-is-creator={isCreator}>
      {session.title}
    </div>
  ),
}));

function makeSession(overrides: Partial<SessionListItem> = {}): SessionListItem {
  return {
    id: "s1",
    title: "Open Mat",
    scheduledStart: new Date().toISOString(),
    scheduledEnd: new Date(Date.now() + 2 * 3600_000).toISOString(),
    status: "active",
    participantCount: 5,
    maxParticipants: 20,
    rsvpCount: 3,
    createdBy: "athlete-creator",
    createdByName: "Coach",
    ...overrides,
  };
}

describe("SessionList", () => {
  it("renders sessions header with count badge", () => {
    render(
      <SessionList
        sessions={[makeSession()]}
        rsvpSessionIds={[]}
        currentAthleteId="me"
      />,
    );
    expect(screen.getByText("Sessions")).toBeInTheDocument();
    expect(screen.getByText("1")).toBeInTheDocument();
  });

  it("renders empty state when no sessions", () => {
    render(
      <SessionList
        sessions={[]}
        rsvpSessionIds={[]}
        currentAthleteId="me"
      />,
    );
    expect(screen.getByText("No upcoming sessions")).toBeInTheDocument();
  });

  it("passes isCreator=true when currentAthleteId matches createdBy", () => {
    render(
      <SessionList
        sessions={[makeSession({ createdBy: "me" })]}
        rsvpSessionIds={[]}
        currentAthleteId="me"
      />,
    );
    const card = screen.getByTestId("session-s1");
    expect(card).toHaveAttribute("data-is-creator", "true");
  });

  it("passes isCreator=true when isGymManager is true even if not the creator", () => {
    render(
      <SessionList
        sessions={[makeSession({ createdBy: "someone-else" })]}
        rsvpSessionIds={[]}
        currentAthleteId="me"
        isGymManager={true}
      />,
    );
    const card = screen.getByTestId("session-s1");
    expect(card).toHaveAttribute("data-is-creator", "true");
  });

  it("passes isCreator=false when not creator and not gym manager", () => {
    render(
      <SessionList
        sessions={[makeSession({ createdBy: "someone-else" })]}
        rsvpSessionIds={[]}
        currentAthleteId="me"
        isGymManager={false}
      />,
    );
    const card = screen.getByTestId("session-s1");
    expect(card).toHaveAttribute("data-is-creator", "false");
  });

  it("sorts active sessions before scheduled sessions", () => {
    const sessions = [
      makeSession({ id: "s-sched", status: "scheduled", title: "Scheduled Mat" }),
      makeSession({ id: "s-active", status: "active", title: "Active Mat" }),
    ];
    render(
      <SessionList
        sessions={sessions}
        rsvpSessionIds={[]}
        currentAthleteId="me"
      />,
    );
    const cards = screen.getAllByTestId(/^session-/);
    expect(cards[0]).toHaveAttribute("data-testid", "session-s-active");
    expect(cards[1]).toHaveAttribute("data-testid", "session-s-sched");
  });
});
