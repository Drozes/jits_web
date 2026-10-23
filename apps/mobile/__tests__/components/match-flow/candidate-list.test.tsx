/**
 * Who the athletes can ask (timekeeper mode M2, spec 4.2 Pick, boards
 * P-TK-B2 and P-TK-B3): Friends (TK-P5) and Nearby (TK-P6), the friend
 * caption only on the other athlete's friend (TK-P5b, flipping with the
 * viewer), the search (TK-P4) and every empty and error state (TK-P12 to
 * TK-P16), a row that turned busy (TK-P8, TK-P9), and one open request per
 * match (no Ask while it is up).
 */
import * as React from "react";
import { fireEvent, render } from "@testing-library/react-native";

jest.mock("lucide-react-native", () => {
  const RN = require("react-native");
  const R = require("react");
  return new Proxy({}, { get: (_t: Record<string, unknown>, p: string) => (p === "__esModule" ? true : () => R.createElement(RN.View, { testID: `icon-${p}` })) });
});
jest.mock("@/lib/theme/use-theme", () => ({
  useResolvedColorScheme: () => "dark",
  useThemedTokens: () => jest.requireActual("@/lib/tokens").darkTokens,
}));

import type { TimekeeperCandidate, TimekeeperCandidates } from "@jits/shared/api/timekeeper";
import { CandidateList, type CandidateListProps } from "@/components/match-flow/crew/candidate-list";
import { pickerSections, showsFriendCaption } from "@/components/match-flow/crew/crew-view";
import { paletteFor } from "@/lib/theme/palette";

const person = (id: string, name: string, extra: Partial<TimekeeperCandidate> = {}): TimekeeperCandidate => ({
  athleteId: id,
  displayName: name,
  avatarUrl: null,
  currentElo: 1400,
  isLive: false,
  friendOf: null,
  distanceBand: null,
  ...extra,
});

/** The challenger M. Reyes's view of board P-TK-B2 frame 1. */
const LISTS: TimekeeperCandidates = {
  friends: [
    person("jc", "Jordan Cruz", { currentElo: 1301, isLive: true, friendOf: "opponent", distanceBand: "on_the_mat" }),
    person("sw", "Sam Whitfield", { currentElo: 1620, friendOf: "challenger" }),
    person("ps", "Priya Shah", { currentElo: 1455, friendOf: "both" }),
  ],
  nearby: [person("lt", "Leo Tanaka", { currentElo: 1440, isLive: true, distanceBand: "on_the_mat" })],
};

function list(over: Partial<CandidateListProps> = {}) {
  const props: CandidateListProps = {
    candidates: LISTS,
    loadError: false,
    onRetry: jest.fn(),
    query: "",
    onQuery: jest.fn(),
    viewerIsChallenger: true,
    otherShort: "D. Okafor",
    busy: {},
    asking: null,
    canAsk: true,
    onAsk: jest.fn(),
    ...over,
  };
  return { s: render(<CandidateList {...props} />), props };
}

describe("CandidateList", () => {
  it("lists Friends then Nearby, each row with its rating, the LIVE pill and Ask", () => {
    const { s, props } = list();
    s.getByText("Friends");
    s.getByText("Nearby");
    // Sentence-case source strings; the boards' caps come from the style.
    expect(s.getByTestId("crew-section-friends-header")).toHaveStyle({ textTransform: "uppercase" });
    expect(s.getByTestId("crew-section-nearby-header")).toHaveStyle({ textTransform: "uppercase" });
    s.getByText("Jordan Cruz");
    s.getByText("1301 ELO");
    s.getAllByText("LIVE");
    fireEvent.press(s.getByLabelText("Ask Leo Tanaka to timekeep"));
    expect(props.onAsk).toHaveBeenCalledWith(expect.objectContaining({ athleteId: "lt" }));
    s.getByPlaceholderText("Search friends and nearby");
  });

  it("captions only the other athlete's friend, and the caption flips with the viewer (TK-P5b)", () => {
    const challenger = list().s;
    challenger.getByText("D. Okafor's friend");
    expect(challenger.queryByTestId("crew-candidate-caption-sw")).toBeNull();
    expect(challenger.queryByTestId("crew-candidate-caption-ps")).toBeNull();
    const opponent = list({ viewerIsChallenger: false, otherShort: "M. Reyes" }).s;
    expect(opponent.getByTestId("crew-candidate-caption-sw")).toHaveTextContent("M. Reyes's friend");
    expect(opponent.queryByTestId("crew-candidate-caption-jc")).toBeNull();
    expect(showsFriendCaption("both", true)).toBe(false);
    expect(showsFriendCaption(null, false)).toBe(false);
  });

  it("no Ask while a request is open (one per match), or while another Ask is in flight", () => {
    const { s, props } = list({ canAsk: false });
    fireEvent.press(s.getByLabelText("Ask Jordan Cruz to timekeep"));
    expect(props.onAsk).not.toHaveBeenCalled();
  });

  it("a row that turned busy says why instead of Ask (TK-P8, TK-P9)", () => {
    const { s } = list({ busy: { jc: "timekeeper", sw: "competitor" } });
    expect(s.getByTestId("crew-candidate-busy-jc")).toHaveTextContent("Timekeeping another match");
    expect(s.getByTestId("crew-candidate-busy-sw")).toHaveTextContent("Running their own match");
    expect(s.queryByLabelText("Ask Jordan Cruz to timekeep")).toBeNull();
    s.getByLabelText("Ask Priya Shah to timekeep");
  });

  it("no friends: the Friends line (TK-P12), Nearby still listed", () => {
    const { s } = list({ candidates: { friends: [], nearby: LISTS.nearby } });
    s.getByText("No friends yet. Nearby athletes can timekeep too.");
    s.getByText("Leo Tanaka");
  });

  it("nobody nearby: the Nearby line (TK-P13)", () => {
    const { s } = list({ candidates: { friends: LISTS.friends, nearby: [] } });
    s.getByText("Nobody else on the mat right now.");
  });

  it("nobody at all: one panel replaces both sections (TK-P14)", () => {
    const { s } = list({ candidates: { friends: [], nearby: [] } });
    s.getByText("Nobody to ask yet. Ask someone at your gym to open ELO RATED and go live.");
    expect(s.queryByText("Friends")).toBeNull();
    expect(s.queryByText("Nearby")).toBeNull();
  });

  it("a search narrows on the device and hides a section with no match, header and all", () => {
    const { s, props } = list({ query: "cru" });
    s.getByText("Jordan Cruz");
    expect(s.queryByText("Sam Whitfield")).toBeNull();
    expect(s.queryByText("Nearby")).toBeNull();
    fireEvent.changeText(s.getByPlaceholderText("Search friends and nearby"), "le");
    expect(props.onQuery).toHaveBeenCalledWith("le");
  });

  it("the search's edge is the strong hairline at rest and ink-2 while focused (never red)", () => {
    const p = paletteFor("dark");
    const { s } = list({ query: "cru" });
    const field = () => s.getByTestId("crew-search-field");
    expect(field()).toHaveStyle({ borderColor: p.strong });
    fireEvent(s.getByTestId("crew-search"), "focus");
    expect(field()).toHaveStyle({ borderColor: p.text2 });
    expect(p.text2).not.toBe(p.cta);
    expect(p.text2).not.toBe(p.red);
    fireEvent(s.getByTestId("crew-search"), "blur");
    expect(field()).toHaveStyle({ borderColor: p.strong });
  });

  it("a search with no match says so (TK-P15)", () => {
    const { s } = list({ query: "zz" });
    s.getByText("No one by that name.");
    expect(s.queryByText("Friends")).toBeNull();
  });

  it("a failed read says so with Try again (TK-P16)", () => {
    const { s, props } = list({ candidates: null, loadError: true });
    s.getByText("Couldn't load people to ask.");
    fireEvent.press(s.getByLabelText("Try again"));
    expect(props.onRetry).toHaveBeenCalled();
  });

  it("loading shows a spinner under the search", () => {
    const { s } = list({ candidates: null });
    s.getByTestId("crew-loading");
  });
});

describe("pickerSections", () => {
  it("is case-insensitive and anywhere in the name", () => {
    const s = pickerSections(LISTS, "  TANA ");
    expect(s.friends).toEqual([]);
    expect(s.nearby.map((c) => c.athleteId)).toEqual(["lt"]);
    expect(s.searching).toBe(true);
    expect(s.empty).toBeNull();
  });
});
