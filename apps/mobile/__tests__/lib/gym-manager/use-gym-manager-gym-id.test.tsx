import { Text } from "react-native";
import { render } from "@testing-library/react-native";

/**
 * The gym-owner portal used to read `gyms[0]` on every screen, so a manager of
 * more than one gym could only ever see gym #1. The portal now travels with a
 * `gymId` route param handed over by /gyms/[id]. These cover both halves of
 * that: the param is honored, and it is validated rather than trusted.
 *
 * Rendered through a probe component instead of renderHook: this workspace has
 * a documented history of renderHook tripping over React copies (see
 * __tests__/hooks/use-unread-count.test.ts).
 */

let mockParams: Record<string, string | undefined> = {};
let mockGyms: { gymId: string; name: string; city: string | null }[] = [];

jest.mock("expo-router", () => ({
  useLocalSearchParams: () => mockParams,
}));

jest.mock("@/lib/gym-manager/use-managed-gyms", () => ({
  useManagedGyms: () => ({ gyms: mockGyms, isReady: true }),
}));

import {
  managerHref,
  useGymManagerGymId,
} from "@/lib/gym-manager/use-gym-manager-gym-id";

function Probe() {
  const { gymId, gym } = useGymManagerGymId();
  return (
    <Text testID="resolved">{`${gymId ?? "none"}|${gym?.name ?? "none"}`}</Text>
  );
}

const GYM_A = { gymId: "g1", name: "Gym A", city: "Austin" };
const GYM_B = { gymId: "g2", name: "Gym B", city: "Dallas" };

beforeEach(() => {
  mockParams = {};
  mockGyms = [];
});

describe("useGymManagerGymId", () => {
  it("resolves the gym named by the route param, not the first managed one", () => {
    mockGyms = [GYM_A, GYM_B];
    mockParams = { gymId: "g2" };

    const { getByTestId } = render(<Probe />);
    expect(getByTestId("resolved").props.children).toBe("g2|Gym B");
  });

  it("falls back to the first managed gym with no param", () => {
    mockGyms = [GYM_A, GYM_B];

    const { getByTestId } = render(<Probe />);
    expect(getByTestId("resolved").props.children).toBe("g1|Gym A");
  });

  it("ignores a param for a gym the athlete does not manage", () => {
    mockGyms = [GYM_A];
    mockParams = { gymId: "someone-elses-gym" };

    const { getByTestId } = render(<Probe />);
    expect(getByTestId("resolved").props.children).toBe("g1|Gym A");
  });

  it("resolves nothing when the athlete manages no gym", () => {
    mockParams = { gymId: "g1" };

    const { getByTestId } = render(<Probe />);
    expect(getByTestId("resolved").props.children).toBe("none|none");
  });
});

describe("managerHref", () => {
  it("carries the gym forward", () => {
    expect(managerHref("/gym-manager/roster", "g1")).toEqual({
      pathname: "/gym-manager/roster",
      params: { gymId: "g1" },
    });
  });

  it("merges extra params", () => {
    expect(managerHref("/gym-manager/stats-by-elo", "g1", { range: "30d" })).toEqual({
      pathname: "/gym-manager/stats-by-elo",
      params: { range: "30d", gymId: "g1" },
    });
  });

  it("returns a bare path when there is no gym and nothing else to pass", () => {
    expect(managerHref("/gym-manager", undefined)).toBe("/gym-manager");
  });
});
