/**
 * The timekeep route (`/match/<id>/timekeep?request=<id>`, timekeeper mode
 * M2, spec 8 `timekeep_href`): the realtime listener opens it with the
 * request, a TK-N1 push tap with the match only. The sheet gets the request
 * from `?request=`, and null when it is absent or empty, so it reads the
 * newest request sent to the athlete instead.
 */
import * as React from "react";
import { render } from "@testing-library/react-native";

let mockParams: Record<string, string | string[] | undefined> = {};
jest.mock("expo-router", () => {
  const Stack = (props: { children?: React.ReactNode }) => props.children ?? null;
  Stack.Screen = () => null;
  return { Stack, useLocalSearchParams: () => mockParams };
});
jest.mock("@/components/layout/app-header", () => ({ AppHeader: () => null }));
const mockAthlete: { current: { id: string } | null } = { current: { id: "tk-1" } };
jest.mock("@/lib/auth/hooks", () => ({ useRequireAthlete: () => ({ athlete: mockAthlete.current }) }));
const mockSheet = jest.fn((_p: unknown) => null);
jest.mock("@/components/match-flow/crew/timekeep-sheet", () => ({
  TimekeepSheet: (p: unknown) => mockSheet(p),
}));

import TimekeepScreen from "@/app/(app)/match/[matchId]/timekeep";

const M1 = "0c1d2e3f-4a5b-4c6d-8e7f-0000000000a1";
const Q1 = "0c1d2e3f-4a5b-4c6d-8e7f-0000000000b1";

beforeEach(() => {
  mockSheet.mockClear();
  mockAthlete.current = { id: "tk-1" };
});

describe("timekeep route", () => {
  it("from the realtime listener: the sheet gets the request from ?request=", () => {
    mockParams = { matchId: M1, request: Q1 };
    const s = render(<TimekeepScreen />);
    s.getByTestId("timekeep-screen");
    expect(mockSheet).toHaveBeenLastCalledWith({ matchId: M1, requestId: Q1, athleteId: "tk-1" });
  });

  it.each([
    ["absent (a push tap carries the match only)", undefined],
    ["empty", ""],
  ])("with ?request= %s: the sheet gets null and reads the newest request", (_label, request) => {
    mockParams = { matchId: M1, request };
    render(<TimekeepScreen />);
    expect(mockSheet).toHaveBeenLastCalledWith({ matchId: M1, requestId: null, athleteId: "tk-1" });
  });

  it("a repeated param is not a request id: null", () => {
    mockParams = { matchId: M1, request: [Q1, Q1] };
    render(<TimekeepScreen />);
    expect(mockSheet).toHaveBeenLastCalledWith({ matchId: M1, requestId: null, athleteId: "tk-1" });
  });

  it("before the athlete loads, the sheet gets no athlete", () => {
    mockAthlete.current = null;
    mockParams = { matchId: M1, request: Q1 };
    render(<TimekeepScreen />);
    expect(mockSheet).toHaveBeenLastCalledWith({ matchId: M1, requestId: Q1, athleteId: null });
  });

  it("without a match id there is no sheet, only the screen and its back control", () => {
    mockParams = {};
    const s = render(<TimekeepScreen />);
    s.getByTestId("timekeep-screen");
    expect(mockSheet).not.toHaveBeenCalled();
  });
});
