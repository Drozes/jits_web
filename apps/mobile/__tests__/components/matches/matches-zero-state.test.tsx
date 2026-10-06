/**
 * The Matches zero state (specs/matches-tab 10.2, 10.7; AC 6.1, 6.2, 6.11,
 * 6.14): ghost card, progress, one red CTA, the flag-driven secondary action
 * (invite, practice, or an empty reserved slot while the flag is unknown),
 * the helper, and the `matches.empty_cta` funnel.
 *
 * Source: apps/mobile/components/matches/matches-zero-state.tsx
 */
import * as React from "react";
import { fireEvent, render } from "@testing-library/react-native";

const mockPush = jest.fn();
jest.mock("expo-router", () => ({ useRouter: () => ({ push: mockPush }) }));
jest.mock("@/lib/supabase/client", () => ({ supabase: {} }));
const mockFlag = jest.fn();
jest.mock("@/lib/invites/use-invites-enabled", () => ({ useInvitesFlagState: () => mockFlag() }));
const mockActive = jest.fn();
jest.mock("@/lib/match-flow/use-my-active-match", () => ({ useMyActiveMatch: () => ({ match: mockActive(), refresh: jest.fn() }) }));
const mockEverPlayed = jest.fn();
jest.mock("@/lib/practice/use-has-ever-played", () => ({ useHasEverPlayed: () => mockEverPlayed() }));
const mockCapture = jest.fn();
jest.mock("@/lib/error-tracking/sentry", () => ({ captureMessage: (...a: unknown[]) => mockCapture(...a) }));

import { MatchesZeroState } from "@/components/matches/matches-zero-state";
import type { ZeroAthlete } from "@/lib/matches/use-zero-secondary-action";

const ON = { enabled: true, known: true, state: "on" };
const OFF = { enabled: false, known: true, state: "off" };
const UNKNOWN = { enabled: false, known: false, state: "unknown" };
const NEW_ATHLETE: ZeroAthlete = { id: "a-1", is_bot: false, practice_match_offered_at: null, practice_match_completed_at: null };
const viewer = { name: "Ana Lima", photoUrl: null };

function renderZero(over: { clipsEnabled?: boolean; athlete?: ZeroAthlete } = {}) {
  return render(<MatchesZeroState athlete={over.athlete ?? NEW_ATHLETE} viewer={viewer} clipsEnabled={over.clipsEnabled ?? true} />);
}

beforeEach(() => {
  jest.clearAllMocks();
  mockFlag.mockReturnValue(ON);
  mockActive.mockReturnValue(null);
  mockEverPlayed.mockReturnValue(false);
});

it("shows the ghost card, the progress line, the red Arena CTA and the clips-on helper (AC 6.1)", () => {
  const u = renderZero();
  expect(u.getByText("Your first match will show up here")).toBeTruthy();
  expect(u.getByText("0 of 1 matches to your first highlight")).toBeTruthy();
  expect(u.getByTestId("matches-zero-helper")).toHaveTextContent(
    "Turn on Record from my phone at face-off and we cut your best moments into a highlight.",
  );
  fireEvent.press(u.getByTestId("matches-zero-arena"));
  expect(mockPush).toHaveBeenCalledWith("/arena");
  expect(mockCapture).toHaveBeenCalledWith("matches.empty_cta", { level: "info", tags: { surface: "matches", state: "zero", cta: "arena" } });
});

it("the Arena CTA is the one red primary; the secondary action is never red", () => {
  const u = renderZero();
  expect(u.getByTestId("matches-zero-arena").props.className).toContain("bg-cta");
  const reds = u.UNSAFE_root.findAll(
    (n: { props: { className?: unknown } }) => typeof n.props.className === "string" && /(^|\s)bg-cta(\s|$)/.test(n.props.className),
  );
  // One host node carries the fill (composite wrappers may repeat the prop).
  expect(new Set(reds.map((n: { props: { testID?: string } }) => n.props.testID))).toEqual(new Set(["matches-zero-arena"]));
  expect(u.getByTestId("matches-zero-invite").props.className ?? "").not.toContain("bg-cta");
});

it("invites on: Challenge a friend opens /invite?from=matches and logs cta invite (AC 6.2)", () => {
  const u = renderZero();
  const invite = u.getByTestId("matches-zero-invite");
  expect(invite.props.accessibilityLabel).toBe("Challenge a friend to a match. Opens an invite with a QR code and link.");
  fireEvent.press(invite);
  expect(mockPush).toHaveBeenCalledWith("/invite?from=matches");
  expect(mockCapture).toHaveBeenCalledWith("matches.empty_cta", { level: "info", tags: { surface: "matches", state: "zero", cta: "invite" } });
});

it("invites off and practice offered: Try a practice match opens the practice route (AC 6.2)", () => {
  mockFlag.mockReturnValue(OFF);
  const u = renderZero();
  expect(u.queryByTestId("matches-zero-invite")).toBeNull();
  fireEvent.press(u.getByTestId("matches-zero-practice"));
  expect(mockPush).toHaveBeenCalledWith("/practice");
  expect(mockCapture).toHaveBeenCalledWith("matches.empty_cta", { level: "info", tags: { surface: "matches", state: "zero", cta: "practice" } });
});

it("invites off and no practice offer (already offered): no secondary action", () => {
  mockFlag.mockReturnValue(OFF);
  const u = renderZero({ athlete: { ...NEW_ATHLETE, practice_match_offered_at: "2026-10-01T00:00:00Z" } });
  expect(u.queryByTestId("matches-zero-invite")).toBeNull();
  expect(u.queryByTestId("matches-zero-practice")).toBeNull();
});

it("invites off while the ever-played read is pending: no practice link yet", () => {
  mockFlag.mockReturnValue(OFF);
  mockEverPlayed.mockReturnValue(null);
  const u = renderZero();
  expect(u.queryByTestId("matches-zero-practice")).toBeNull();
});

it("flag unknown: the slot is empty at its reserved height (no practice-to-invite flash)", () => {
  mockFlag.mockReturnValue(UNKNOWN);
  const u = renderZero();
  expect(u.queryByTestId("matches-zero-invite")).toBeNull();
  expect(u.queryByTestId("matches-zero-practice")).toBeNull();
  const slot = u.getByTestId("matches-zero-secondary");
  expect(Object.assign({}, ...[].concat(slot.props.style)).minHeight).toBe(44);
});

it("clips off: C-Z2b, no progress line, and C-L6 replaces C-Z6 (AC 6.11)", () => {
  const u = renderZero({ clipsEnabled: false });
  expect(u.getByText("Your first match lands here")).toBeTruthy();
  expect(u.queryByTestId("matches-zero-progress")).toBeNull();
  expect(u.getByTestId("matches-zero-helper")).toHaveTextContent("Turn on Record from my phone at face-off.");
  expect(u.queryByText(/highlight/)).toBeNull();
  // The secondary rule is the same with clips off.
  expect(u.getByTestId("matches-zero-invite")).toBeTruthy();
});
