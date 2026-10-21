/**
 * Home's timekeeper card (timekeeper mode A20, A24, PM19, PM20; spec 9.1;
 * board P-TK-B12): unmistakably the TIMEKEEPER's card, TK-H1 to TK-H5 while
 * on duty, TK-H8 and TK-H9 in the 30-minute edit window, nothing after it.
 */
import { fireEvent, render } from "@testing-library/react-native";
import { Timer } from "lucide-react-native";

const mockPush = jest.fn();
jest.mock("expo-router", () => ({ useRouter: () => ({ push: mockPush, navigate: jest.fn() }) }));

import {
  TimekeepingResumeCard,
  formatEditDeadline,
  timekeepingCardCopy,
} from "@/components/dashboard/timekeeping-resume-card";
import { ResumeMatchCard } from "@/components/dashboard/resume-match-card";
import type { MyTimekeepingMatch } from "@jits/shared/api/timekeeper";

const NOW = Date.parse("2026-10-20T16:10:00Z");

function match(over: Partial<MyTimekeepingMatch> = {}): MyTimekeepingMatch {
  return {
    matchId: "tk-1",
    status: "in_progress",
    startedAt: "2026-10-20T16:00:00Z",
    endedAt: null,
    athletes: [
      { athleteId: "c-1", displayName: "Mina Reyes" },
      { athleteId: "o-1", displayName: "Dan Okafor" },
    ],
    reviewPending: false,
    editOpen: false,
    editClosesAt: null,
    ...over,
  };
}

const CLOSES = "2026-10-20T16:35:00Z";
const editWindow = (over: Partial<MyTimekeepingMatch> = {}) =>
  match({ status: "completed", endedAt: "2026-10-20T16:05:00Z", editOpen: true, editClosesAt: CLOSES, ...over });

beforeEach(() => {
  jest.clearAllMocks();
  jest.spyOn(Date, "now").mockReturnValue(NOW);
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe("timekeepingCardCopy", () => {
  it("seated (pending) or running: TK-H3 and TK-H5", () => {
    for (const status of ["pending", "in_progress"] as const) {
      expect(timekeepingCardCopy(match({ status }), NOW)).toEqual({
        line: "You run the clock and record the result.",
        cta: "Back to the match",
      });
    }
  });

  it("the clock ended, the result not recorded: TK-H4", () => {
    expect(timekeepingCardCopy(match({ endedAt: "2026-10-20T16:06:00Z" }), NOW)).toEqual({
      line: "The result is waiting on you.",
      cta: "Back to the match",
    });
  });

  it("recorded, inside the edit window: TK-H8 with the device's short time, and TK-H9", () => {
    expect(timekeepingCardCopy(editWindow(), NOW)).toEqual({
      line: `Result recorded. You can fix it until ${formatEditDeadline(CLOSES)}.`,
      cta: "Review result",
    });
  });

  it("nothing once the window has closed, or when the server says it is not open", () => {
    expect(timekeepingCardCopy(editWindow(), Date.parse(CLOSES))).toBeNull();
    expect(timekeepingCardCopy(editWindow({ editOpen: false }), NOW)).toBeNull();
    expect(timekeepingCardCopy(editWindow({ editClosesAt: null }), NOW)).toBeNull();
  });

  it("the deadline is a short local time (hours and minutes, no seconds, no date)", () => {
    const text = formatEditDeadline(CLOSES);
    expect(text).toMatch(/\d{1,2}[:.]\d{2}/);
    expect(text).not.toMatch(/2026|:\d{2}[:.]\d{2}/);
  });
});

describe("TimekeepingResumeCard", () => {
  it("is unmistakably the timekeeper's: the amber TIMEKEEPER tag, a stopwatch, the matchup; no athlete wording", () => {
    const s = render(<TimekeepingResumeCard match={match()} primary />);
    const role = s.getByTestId("timekeeping-resume-role");
    expect(role).toHaveTextContent("TIMEKEEPER");
    expect(role.props.className).toMatch(/\btext-attention\b/);
    // The stopwatch stands where the athlete card has its state tag.
    expect(s.UNSAFE_getAllByType(Timer)).toHaveLength(1);
    expect(s.getByTestId("timekeeping-resume-title")).toHaveTextContent("M. Reyes vs D. Okafor");
    expect(s.getByTestId("timekeeping-resume-line")).toHaveTextContent("You run the clock and record the result.");
    expect(s.queryByText(/Resume|Pick up where you left off|Match in progress/)).toBeNull();
    // A plain plate: the athlete card's red accent rail is its own.
    expect(s.getByTestId("timekeeping-resume-card").props.className).not.toMatch(/border-l-cta/);
  });

  it("differs from the athlete Resume card on every line", () => {
    const athlete = render(
      <ResumeMatchCard match={{ matchId: "m-1", status: "in_progress", opponentName: "Demo Red" } as never} />,
    );
    const tk = render(<TimekeepingResumeCard match={match()} primary={false} />);
    expect(athlete.queryByText("TIMEKEEPER")).toBeNull();
    expect(tk.queryByText("Match in progress")).toBeNull();
    expect(tk.queryByLabelText("Resume your match")).toBeNull();
  });

  it("primary: the one red CTA; otherwise secondary", () => {
    const red = render(<TimekeepingResumeCard match={match()} primary />);
    expect(red.getByLabelText("Back to the match").props.className).toMatch(/(^|\s)bg-cta(\s|$)/);
    const plain = render(<TimekeepingResumeCard match={editWindow()} primary={false} />);
    expect(plain.getByLabelText("Review result").props.className).not.toMatch(/(^|\s)bg-cta(\s|$)/);
  });

  it("a tap opens the match route (the wizard routes the timekeeper); it never navigates by itself", () => {
    const s = render(<TimekeepingResumeCard match={editWindow()} primary={false} />);
    expect(mockPush).not.toHaveBeenCalled();
    fireEvent.press(s.getByLabelText("Review result"));
    expect(mockPush).toHaveBeenCalledWith("/match/tk-1");
  });

  it("renders nothing after the edit window", () => {
    const s = render(<TimekeepingResumeCard match={editWindow({ editClosesAt: "2026-10-20T16:00:00Z" })} primary={false} />);
    expect(s.queryByTestId("timekeeping-resume-card")).toBeNull();
  });
});
