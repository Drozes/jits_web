/**
 * After a verified activation, the submit hands the verified athlete row to
 * `refreshAthlete` as its fallback, so a failed context refresh can never
 * leave a "pending" athlete in auth and route the just-activated athlete back
 * into setup (as Edit Profile).
 */
import { act, renderHook } from "@testing-library/react-native";

const mockSelectArgs: string[] = [];
const VERIFIED = { id: "me-1", auth_user_id: "u-1", status: "active", display_name: "A B" };

function mockChain(result: unknown) {
  const chain: Record<string, unknown> = {};
  for (const m of ["eq", "is"]) chain[m] = () => chain;
  chain.maybeSingle = () => Promise.resolve(result);
  chain.single = () => Promise.resolve(result);
  chain.then = (resolve: (v: unknown) => unknown) => resolve(result);
  return chain;
}

jest.mock("@/lib/supabase/client", () => ({
  supabase: {
    from: (table: string) => ({
      update: () => mockChain({ error: null }),
      insert: () => mockChain({ error: null }),
      select: (cols: string) => {
        mockSelectArgs.push(`${table}:${cols}`);
        if (table === "athletes") return mockChain({ data: VERIFIED, error: null });
        return mockChain({ data: { id: "ack-1" }, error: null });
      },
    }),
  },
}));

const mockRefreshAthlete = jest.fn((_fallback?: unknown) => Promise.resolve(false));
jest.mock("@/lib/auth/hooks", () => ({
  useAuth: () => ({ refreshAthlete: mockRefreshAthlete }),
}));
const mockReplace = jest.fn();
jest.mock("expo-router", () => ({
  useRouter: () => ({ replace: mockReplace }),
}));
jest.mock("@/components/ui/toast", () => ({ toast: { success: jest.fn() } }));

import { ATHLETE_GUARD_SELECT } from "@jits/shared/api/queries";
import { useSetupSubmit } from "@/lib/profile-setup/use-setup-submit";

const VALUES = {
  firstName: "A",
  lastName: "B",
  weight: "180",
  gender: "male",
  dateOfBirth: "1990-01-01",
  city: "Toronto",
  gymId: "g1",
};

describe("useSetupSubmit activation", () => {
  it("passes the verified active row to refreshAthlete, then routes home", async () => {
    const { result } = renderHook(() =>
      useSetupSubmit({
        athleteId: "me-1",
        authUserId: "u-1",
        waiverId: "w1",
        isEditing: false,
        onAfterTos: jest.fn(),
      }),
    );

    await act(async () => {
      await result.current.submit(VALUES as never);
    });

    expect(mockSelectArgs).toContain(`athletes:${ATHLETE_GUARD_SELECT}`);
    expect(mockRefreshAthlete).toHaveBeenCalledWith(VERIFIED);
    expect(mockReplace).toHaveBeenCalledWith("/");
    expect(result.current.error).toBeNull();
  });
});
