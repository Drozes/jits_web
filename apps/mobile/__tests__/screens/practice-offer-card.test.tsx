/**
 * The one-time practice offer on Home (components/dashboard/practice-offer-card.tsx).
 */
import * as React from "react";
import { act, fireEvent, render } from "@testing-library/react-native";

const mockPush = jest.fn();
jest.mock("expo-router", () => ({ useRouter: () => ({ push: mockPush }) }));

jest.mock("@/lib/supabase/client", () => ({ supabase: {} }));

const mockRefreshSoft = jest.fn(async () => undefined);
jest.mock("@/lib/auth/hooks", () => ({
  useAuth: () => ({ refreshAthleteSoft: mockRefreshSoft }),
}));

jest.mock("@jits/shared/api/mutations", () => ({ markPracticeMatch: jest.fn() }));

import { PracticeOfferCard } from "@/components/dashboard/practice-offer-card";
import { markPracticeMatch } from "@jits/shared/api/mutations";

beforeEach(() => {
  jest.clearAllMocks();
  (markPracticeMatch as jest.Mock).mockResolvedValue({ ok: true, data: {} });
});

describe("PracticeOfferCard", () => {
  it("Start practice opens /practice without marking anything itself", () => {
    const s = render(<PracticeOfferCard onDismiss={jest.fn()} />);
    fireEvent.press(s.getByTestId("practice-offer-start"));
    expect(mockPush).toHaveBeenCalledWith("/practice");
    expect(markPracticeMatch).not.toHaveBeenCalled();
  });

  it("Not now hides at once, marks skipped exactly once, then re-reads the athlete", async () => {
    const onDismiss = jest.fn();
    const s = render(<PracticeOfferCard onDismiss={onDismiss} />);
    fireEvent.press(s.getByTestId("practice-offer-not-now"));
    expect(onDismiss).toHaveBeenCalledTimes(1);
    expect(markPracticeMatch).toHaveBeenCalledTimes(1);
    expect(markPracticeMatch).toHaveBeenCalledWith({}, "skipped");
    await act(async () => {
      await Promise.resolve();
    });
    expect(mockRefreshSoft).toHaveBeenCalled();
  });

  it("a failed mark never throws out of Not now", async () => {
    jest.spyOn(console, "warn").mockImplementation(() => undefined);
    (markPracticeMatch as jest.Mock).mockResolvedValue({
      ok: false,
      error: { code: "UNKNOWN", message: "x" },
    });
    const onDismiss = jest.fn();
    const s = render(<PracticeOfferCard onDismiss={onDismiss} />);
    fireEvent.press(s.getByTestId("practice-offer-not-now"));
    await act(async () => {
      await Promise.resolve();
    });
    expect(onDismiss).toHaveBeenCalled();
  });
});
