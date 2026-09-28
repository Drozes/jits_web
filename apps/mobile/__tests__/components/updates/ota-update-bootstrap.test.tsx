import { act, render } from "@testing-library/react-native";
import {
  IDLE_ARENA_STATE,
  __resetArenaStoreForTests,
  publishArenaState,
} from "@/lib/arena/arena-store";
import { OtaUpdateBootstrap } from "@/components/updates/ota-update-bootstrap";
import type { OtaUpdateState } from "@/lib/updates/use-ota-update";

let mockState: OtaUpdateState;
jest.mock("@/lib/updates/use-ota-update", () => ({
  useOtaUpdate: () => mockState,
}));
jest.mock("react-native-safe-area-context", () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));
jest.mock("@/lib/theme/use-theme", () => ({
  useThemedTokens: () => ({ mutedForeground: "#999" }),
}));

function state(prompt: OtaUpdateState["prompt"]): OtaUpdateState {
  return {
    prompt,
    notice: null,
    restarting: false,
    restartError: null,
    restart: jest.fn(),
    dismiss: jest.fn(),
  };
}

function raiseChallengePrompt() {
  act(() =>
    publishArenaState({ ...IDLE_ARENA_STATE, incoming: { challengeId: "c1" } as never }),
  );
}

beforeEach(() => __resetArenaStoreForTests());

it("shows the banner, and hides it while the challenge prompt sheet is up", () => {
  mockState = state("banner");
  const { queryByText } = render(<OtaUpdateBootstrap suppressed={false} />);
  expect(queryByText(/Update ready/)).toBeTruthy();
  raiseChallengePrompt();
  expect(queryByText(/Update ready/)).toBeNull();
  act(() => publishArenaState(IDLE_ARENA_STATE));
  expect(queryByText(/Update ready/)).toBeTruthy();
});

it("never hides the critical modal for a challenge prompt", () => {
  mockState = state("modal");
  const { queryByText } = render(<OtaUpdateBootstrap suppressed={false} />);
  raiseChallengePrompt();
  expect(queryByText("Update ready")).toBeTruthy();
});

it("renders nothing for none", () => {
  mockState = state("none");
  const { toJSON } = render(<OtaUpdateBootstrap suppressed={false} />);
  expect(toJSON()).toBeNull();
});
