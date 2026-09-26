/**
 * The profile-setup screen must show Try Again when the athlete read fails.
 *
 * `data` is null after a failed read, and the screen's loading condition used
 * to include `!!user && !data`, so the spinner never gave way to the error
 * state: an endless spinner with no way out.
 *
 * Real screen, real `useSetupData`; only the Supabase client and the heavy
 * children are stubbed.
 */
import * as React from "react";
import { act, fireEvent, render, waitFor } from "@testing-library/react-native";

type Res = { data: unknown; error: unknown };
const mockTables: Record<string, Res[]> = {};
function mockBuilder(table: string) {
  const next = () => mockTables[table]?.shift() ?? { data: null, error: null };
  const chain: Record<string, unknown> = {};
  for (const m of ["select", "eq", "limit"]) chain[m] = () => chain;
  chain.maybeSingle = () => Promise.resolve(next());
  chain.order = () => Promise.resolve(next());
  return chain;
}
jest.mock("@/lib/supabase/client", () => ({
  supabase: { from: (t: string) => mockBuilder(t) },
}));

jest.mock("@/lib/auth/hooks", () => ({
  useRequireAuth: () => ({ user: { id: "u-1" }, isLoading: false }),
}));
jest.mock("@/lib/theme/use-theme", () => ({
  useThemedTokens: () => ({ accentCta: "#E63946" }),
}));
jest.mock("@/components/layout/app-header", () => ({ AppHeader: () => null }));
jest.mock("@/components/ui/elo-system", () => ({ Wordmark: () => null }));
jest.mock("@/components/profile-setup/setup-wizard", () => ({
  SetupWizard: () => {
    const R = require("react");
    const RN = require("react-native");
    return R.createElement(RN.Text, {}, "wizard");
  },
}));

import ProfileSetupScreen from "@/app/profile-setup";
import { ATHLETE_READ_FAILED_MESSAGE } from "@/lib/profile-setup/use-setup-data";

const PENDING = {
  id: "me-1",
  display_name: null,
  first_name: null,
  last_name: null,
  current_weight: null,
  primary_gym_id: null,
  status: "pending",
  gender: null,
  date_of_birth: null,
  city: null,
  free_agent: false,
};

function seed(athlete: Res) {
  mockTables.athletes = [athlete];
  mockTables.gyms = [{ data: [], error: null }];
  mockTables.waivers = [{ data: { id: "w1" }, error: null }];
  mockTables.waiver_acknowledgements = [{ data: null, error: null }];
}

beforeEach(() => {
  jest.spyOn(console, "warn").mockImplementation(() => {});
});
afterEach(() => {
  jest.restoreAllMocks();
});

describe("ProfileSetupScreen", () => {
  it("shows Try Again (not an endless spinner) when the athlete read fails, and Try Again reloads", async () => {
    seed({ data: null, error: { code: "PGRST000", message: "network" } });
    const r = render(<ProfileSetupScreen />);

    expect(await r.findByText(ATHLETE_READ_FAILED_MESSAGE)).toBeTruthy();
    expect(r.getByText("Try Again")).toBeTruthy();
    expect(r.queryByText("wizard")).toBeNull();

    seed({ data: PENDING, error: null });
    await act(async () => {
      fireEvent.press(r.getByText("Try Again"));
    });

    await waitFor(() => expect(r.getByText("wizard")).toBeTruthy());
    expect(r.queryByText(ATHLETE_READ_FAILED_MESSAGE)).toBeNull();
  });
});
