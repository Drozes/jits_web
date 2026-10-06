/**
 * `matches.tab_opened` (specs/matches-tab section 13): a breadcrumb on each
 * focus of the Matches tab tagged with how it was reached; Home's See all
 * param is consumed so a later tab-bar open is not miscounted.
 */
import * as React from "react";
import { render } from "@testing-library/react-native";

const mockSetParams = jest.fn();
let mockParams: { entry?: string } = {};
let mockFocus: (() => void) | null = null;
jest.mock("expo-router", () => ({
  useRouter: () => mockRouter,
  useLocalSearchParams: () => mockParams,
  useFocusEffect: (cb: () => void) => {
    mockFocus = cb;
    const R = require("react");
    R.useEffect(() => cb(), [cb]);
  },
}));
const mockRouter = { setParams: (...a: unknown[]) => mockSetParams(...a) };
const mockCrumb = jest.fn();
jest.mock("@/lib/error-tracking/sentry", () => ({ addBreadcrumb: (...a: unknown[]) => mockCrumb(...a), captureMessage: jest.fn() }));

import { useMatchesTabOpened } from "@/lib/matches/use-tab-opened";

function Probe() {
  useMatchesTabOpened();
  return null;
}

const crumb = (entry: string) => ({ category: "matches", message: "matches.tab_opened", data: { entry } });

beforeEach(() => {
  jest.clearAllMocks();
  mockParams = {};
  mockFocus = null;
});

describe("useMatchesTabOpened", () => {
  it("logs a tab open with no param and clears nothing", () => {
    render(<Probe />);
    expect(mockCrumb).toHaveBeenCalledTimes(1);
    expect(mockCrumb).toHaveBeenCalledWith(crumb("tab"));
    expect(mockSetParams).not.toHaveBeenCalled();
  });

  it("logs see_all once and clears the param; the clearing re-render logs nothing more, the next focus logs tab", () => {
    mockParams = { entry: "see_all" };
    const utils = render(<Probe />);
    expect(mockCrumb).toHaveBeenCalledWith(crumb("see_all"));
    expect(mockSetParams).toHaveBeenCalledWith({ entry: undefined });
    mockParams = {};
    utils.rerender(<Probe />);
    expect(mockCrumb).toHaveBeenCalledTimes(1);
    mockFocus?.();
    expect(mockCrumb).toHaveBeenLastCalledWith(crumb("tab"));
  });

  it("an unknown entry value counts as a tab open and is still consumed", () => {
    mockParams = { entry: "junk" };
    render(<Probe />);
    expect(mockCrumb).toHaveBeenCalledWith(crumb("tab"));
    expect(mockSetParams).toHaveBeenCalledWith({ entry: undefined });
  });
});
