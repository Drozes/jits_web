/**
 * After a verified activation, the submit hands the verified athlete row to
 * `refreshAthlete` as its fallback, so a failed context refresh can never
 * leave a "pending" athlete in auth and route the just-activated athlete back
 * into setup (as Edit Profile).
 *
 * jits-02vo.5: the athletes write (incl. primary_gym_id, current_weight and
 * instagram_handle) lands BEFORE set_gym_instagram_handle, because a member
 * may only fill the handle of their own primary gym. applied=false is not an
 * error.
 */
import { act, renderHook } from "@testing-library/react-native";

const mockSelectArgs: string[] = [];
const mockCalls: string[] = [];
const mockUpdates: Record<string, unknown>[] = [];
let mockRpcResult: { data: unknown; error: unknown } = { data: null, error: null };
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
      update: (payload: Record<string, unknown>) => {
        mockCalls.push(`update:${table}`);
        mockUpdates.push(payload);
        return mockChain({ error: null });
      },
      insert: () => mockChain({ error: null }),
      select: (cols: string) => {
        mockSelectArgs.push(`${table}:${cols}`);
        if (table === "athletes") return mockChain({ data: VERIFIED, error: null });
        return mockChain({ data: { id: "ack-1" }, error: null });
      },
    }),
    rpc: (fn: string, args: unknown) => {
      mockCalls.push(`rpc:${fn}:${JSON.stringify(args)}`);
      return Promise.resolve(mockRpcResult);
    },
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
const mockToast = { success: jest.fn(), info: jest.fn(), error: jest.fn() };
// Getter: imports are hoisted above this const, so read it lazily.
jest.mock("@/components/ui/toast", () => ({
  get toast() {
    return mockToast;
  },
}));

import { ATHLETE_GUARD_SELECT } from "@jits/shared/api/queries";
import { useSetupSubmit } from "@/lib/profile-setup/use-setup-submit";
import type { GymInstagramField } from "@/lib/profile-setup/gym-instagram";
import type { WizardValues } from "@/components/profile-setup/types";

const VALUES: WizardValues = {
  firstName: "A",
  lastName: "B",
  weight: "180",
  gender: "male",
  dateOfBirth: "1990-01-01",
  city: "Toronto",
  gymId: "g1",
  instagram: " @Marcus.Reyes ",
  gymInstagram: "@AtosAustin",
};

const MEMBER_BLANK_GYM: GymInstagramField = {
  visible: true,
  readOnly: false,
  storedHandle: null,
  canManage: false,
};

function renderSubmit(isEditing: boolean, field: GymInstagramField = MEMBER_BLANK_GYM) {
  return renderHook(() =>
    useSetupSubmit({
      athleteId: "me-1",
      authUserId: "u-1",
      waiverId: "w1",
      isEditing,
      onAfterTos: jest.fn(),
      gymInstagramFor: () => field,
    }),
  );
}

beforeEach(() => {
  jest.clearAllMocks();
  mockCalls.length = 0;
  mockUpdates.length = 0;
  mockSelectArgs.length = 0;
  mockRpcResult = {
    data: { gym_id: "g1", instagram_handle: "atosaustin", applied: true },
    error: null,
  };
});

describe("useSetupSubmit activation", () => {
  it("passes the verified active row to refreshAthlete, then routes home", async () => {
    const { result } = renderSubmit(false);

    await act(async () => {
      await result.current.submit(VALUES);
    });

    expect(mockSelectArgs).toContain(`athletes:${ATHLETE_GUARD_SELECT}`);
    expect(mockRefreshAthlete).toHaveBeenCalledWith(VERIFIED);
    expect(mockReplace).toHaveBeenCalledWith("/");
    expect(result.current.error).toBeNull();
  });
});

describe("useSetupSubmit Instagram handles (jits-02vo.5)", () => {
  it("saves weight, gym and the normalized athlete handle in one athletes update", async () => {
    const { result } = renderSubmit(false);
    await act(async () => {
      await result.current.submit(VALUES);
    });

    expect(mockUpdates[0]).toMatchObject({
      current_weight: 180,
      primary_gym_id: "g1",
      free_agent: false,
      instagram_handle: "marcus.reyes",
    });
  });

  it("writes a blank athlete handle as null (clears it)", async () => {
    const { result } = renderSubmit(true);
    await act(async () => {
      await result.current.submit({ ...VALUES, instagram: "  " });
    });
    expect(mockUpdates[0]).toMatchObject({ instagram_handle: null });
  });

  it("updates the athlete (primary_gym_id) BEFORE calling set_gym_instagram_handle", async () => {
    const { result } = renderSubmit(false);
    await act(async () => {
      await result.current.submit(VALUES);
    });

    const updateIdx = mockCalls.indexOf("update:athletes");
    const rpcIdx = mockCalls.findIndex((c) => c.startsWith("rpc:set_gym_instagram_handle"));
    expect(updateIdx).toBeGreaterThanOrEqual(0);
    expect(rpcIdx).toBeGreaterThan(updateIdx);
    expect(mockCalls[rpcIdx]).toBe(
      `rpc:set_gym_instagram_handle:${JSON.stringify({ p_gym_id: "g1", p_handle: "atosaustin" })}`,
    );
    expect(mockToast.info).not.toHaveBeenCalled();
    expect(mockToast.error).not.toHaveBeenCalled();
  });

  it("treats applied=false as success: shows the existing handle, still routes on", async () => {
    mockRpcResult = {
      data: { gym_id: "g1", instagram_handle: "existing", applied: false },
      error: null,
    };
    const { result } = renderSubmit(false);
    await act(async () => {
      await result.current.submit(VALUES);
    });

    expect(result.current.error).toBeNull();
    expect(mockToast.error).not.toHaveBeenCalled();
    expect(mockToast.info).toHaveBeenCalledWith(
      expect.objectContaining({ description: "Your gym is tagged as @existing." }),
    );
    expect(mockReplace).toHaveBeenCalledWith("/");
  });

  it("folds applied=false into the edit-mode success toast", async () => {
    mockRpcResult = {
      data: { gym_id: "g1", instagram_handle: "existing", applied: false },
      error: null,
    };
    const { result } = renderSubmit(true);
    await act(async () => {
      await result.current.submit(VALUES);
    });

    expect(mockToast.success).toHaveBeenCalledWith({
      text1: "Profile updated successfully",
      description: "Your gym is tagged as @existing.",
    });
    expect(mockReplace).toHaveBeenCalledWith("/(app)/profile");
  });

  it("does not block the saved profile when the gym RPC fails", async () => {
    mockRpcResult = {
      data: null,
      error: { code: "P0001", hint: "not_authorized", message: "x", details: "" },
    };
    const { result } = renderSubmit(true);
    await act(async () => {
      await result.current.submit(VALUES);
    });

    expect(result.current.error).toBeNull();
    expect(mockToast.error).toHaveBeenCalledWith(
      expect.objectContaining({ description: "You can't set this gym's Instagram handle." }),
    );
    expect(mockReplace).toHaveBeenCalledWith("/(app)/profile");
  });

  it("skips the RPC for a read-only gym handle and for free agents", async () => {
    const readOnly = { ...MEMBER_BLANK_GYM, readOnly: true, storedHandle: "atos" };
    const first = renderSubmit(true, readOnly);
    await act(async () => {
      await first.result.current.submit(VALUES);
    });
    const hidden = { visible: false, readOnly: false, storedHandle: null, canManage: false };
    const second = renderSubmit(true, hidden);
    await act(async () => {
      await second.result.current.submit({ ...VALUES, gymId: "free_agent" });
    });

    expect(mockCalls.some((c) => c.startsWith("rpc:"))).toBe(false);
    expect(mockUpdates[1]).toMatchObject({ free_agent: true, primary_gym_id: null });
  });
});
