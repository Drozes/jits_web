/**
 * A failed athlete read in the setup wizard is an error, not "no row yet".
 *
 * Treated as "no row", the wizard's submit takes the INSERT path, which RLS
 * refuses (athletes has no INSERT policy), and the athlete is stuck. It must
 * surface through the screen's existing error / Try Again state instead.
 */
import { act, renderHook, waitFor } from "@testing-library/react-native";

type Res = { data: unknown; error: unknown };
const mockTables: Record<string, Res[]> = {};

/** Every builder method chains; `maybeSingle` / `order` / `limit` resolve. */
function mockBuilder(table: string) {
  const next = () => mockTables[table].shift() ?? { data: null, error: null };
  const chain: Record<string, unknown> = {};
  for (const m of ["select", "eq", "limit"]) chain[m] = () => chain;
  chain.maybeSingle = () => Promise.resolve(next());
  chain.order = () => Promise.resolve(next());
  return chain;
}

jest.mock("@/lib/supabase/client", () => ({
  supabase: { from: (t: string) => mockBuilder(t) },
}));

import {
  ATHLETE_READ_FAILED_MESSAGE,
  useSetupData,
} from "@/lib/profile-setup/use-setup-data";

const ATHLETE = {
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
  mockTables.gyms = [{ data: [{ id: "g1", name: "Gym", city: "Toronto" }], error: null }];
  mockTables.waivers = [{ data: { id: "w1" }, error: null }];
  mockTables.waiver_acknowledgements = [{ data: null, error: null }];
}

beforeEach(() => {
  jest.spyOn(console, "warn").mockImplementation(() => {});
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe("useSetupData", () => {
  it("surfaces a failed athlete read as an error with no data", async () => {
    seed({ data: null, error: { code: "PGRST000", message: "network" } });
    const { result } = renderHook(() => useSetupData("u-1"));

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.error).toBe(ATHLETE_READ_FAILED_MESSAGE);
    expect(result.current.data).toBeNull();
  });

  it("recovers on reload (the Try Again button)", async () => {
    seed({ data: null, error: { code: "PGRST000", message: "network" } });
    const { result } = renderHook(() => useSetupData("u-1"));
    await waitFor(() => expect(result.current.error).toBe(ATHLETE_READ_FAILED_MESSAGE));

    seed({ data: ATHLETE, error: null });
    await act(async () => {
      await result.current.reload();
    });

    expect(result.current.error).toBeNull();
    expect(result.current.data?.athlete?.id).toBe("me-1");
    expect(result.current.data?.isEditing).toBe(false);
  });

  it("still treats a successful read with no row as a fresh setup", async () => {
    seed({ data: null, error: null });
    const { result } = renderHook(() => useSetupData("u-1"));

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.error).toBeNull();
    expect(result.current.data?.athlete).toBeNull();
  });
});
