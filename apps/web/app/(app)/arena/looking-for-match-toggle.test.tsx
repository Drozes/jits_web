import { describe, it, expect, vi, beforeEach } from "vitest";
import { GO_LIVE_LOCATION_DENIED_COPY } from "@jits/shared/utils";
import { fireEvent, render, screen } from "@testing-library/react";
import { LookingForMatchToggle } from "./looking-for-match-toggle";

type State = {
  ready: boolean;
  isLive: boolean;
  isSaving: boolean;
  isLocating?: boolean;
  locationPrompt?: "explain" | "denied" | "accuracy" | "implausible" | null;
};
const store = vi.hoisted(() => ({
  state: { ready: true, isLive: false, isSaving: false } as State,
  toggle: vi.fn(async () => {}),
  confirmLocation: vi.fn(async () => {}),
  dismissLocation: vi.fn(),
}));
vi.mock("@/lib/arena/arena-store", () => ({
  useArenaState: () => store.state,
  arenaActions: {
    toggle: store.toggle,
    confirmLocation: store.confirmLocation,
    dismissLocation: store.dismissLocation,
  },
}));

beforeEach(() => {
  store.state = { ready: true, isLive: false, isSaving: false };
  vi.clearAllMocks();
});

describe("LookingForMatchToggle", () => {
  it("calls the app-wide toggle action instead of writing itself", () => {
    render(<LookingForMatchToggle initialRanked={false} />);
    fireEvent.click(screen.getByRole("button", { name: "Go live" }));
    expect(store.toggle).toHaveBeenCalledOnce();
  });

  it("reflects the store's live state", () => {
    store.state = { ready: true, isLive: true, isSaving: false };
    render(<LookingForMatchToggle initialRanked={false} />);
    expect(screen.getByRole("button", { name: "Go offline" })).toBeInTheDocument();
    expect(screen.getByText("Live")).toBeInTheDocument();
  });

  it("falls back to the server value until the owner publishes", () => {
    store.state = { ready: false, isLive: false, isSaving: false };
    render(<LookingForMatchToggle initialRanked />);
    const button = screen.getByRole("button", { name: "Go offline" });
    expect(button).toBeDisabled();
  });

  it("disables the button while a write is in flight", () => {
    store.state = { ready: true, isLive: true, isSaving: true };
    render(<LookingForMatchToggle initialRanked={false} />);
    fireEvent.click(screen.getByRole("button"));
    expect(store.toggle).not.toHaveBeenCalled();
  });

  describe("match_location_required states", () => {
    it("explain: shows why, Allow location is the one red action, Not now dismisses", () => {
      store.state = { ...store.state, locationPrompt: "explain" };
      render(<LookingForMatchToggle initialRanked={false} />);
      expect(
        screen.getByText(/checks you're on the same mat as your opponent/),
      ).toBeInTheDocument();
      expect(screen.queryByRole("button", { name: "Go live" })).toBeNull();
      fireEvent.click(screen.getByRole("button", { name: "Allow location" }));
      expect(store.confirmLocation).toHaveBeenCalledOnce();
      fireEvent.click(screen.getByRole("button", { name: "Not now" }));
      expect(store.dismissLocation).toHaveBeenCalledOnce();
      expect(store.toggle).not.toHaveBeenCalled();
    });

    it("denied: announces the shared Go Live denied copy plus the browser line, with Try again", () => {
      store.state = { ...store.state, locationPrompt: "denied" };
      render(<LookingForMatchToggle initialRanked={false} />);
      const alert = screen.getByRole("alert");
      // The same string mobile's Go Live denied state shows (@jits/shared).
      expect(alert).toHaveTextContent(GO_LIVE_LOCATION_DENIED_COPY);
      expect(alert).toHaveTextContent(/browser settings/);
      fireEvent.click(screen.getByRole("button", { name: "Try again" }));
      expect(store.confirmLocation).toHaveBeenCalledOnce();
    });

    it("accuracy: announces the can't-pin copy with Try again", () => {
      store.state = { ...store.state, locationPrompt: "accuracy" };
      render(<LookingForMatchToggle initialRanked={false} />);
      expect(screen.getByRole("alert")).toHaveTextContent(
        "Can't pin your location. Try near a window.",
      );
      expect(screen.getByRole("button", { name: "Try again" })).toBeInTheDocument();
    });

    it("implausible: announces the can't-pin try-again copy with Try again", () => {
      store.state = { ...store.state, locationPrompt: "implausible" };
      render(<LookingForMatchToggle initialRanked={false} />);
      expect(screen.getByRole("alert")).toHaveTextContent("Can't pin your location. Try again.");
      expect(screen.getByRole("button", { name: "Try again" })).toBeInTheDocument();
    });

    it("locating: the Go live button says so and is disabled", () => {
      store.state = { ...store.state, isSaving: true, isLocating: true };
      render(<LookingForMatchToggle initialRanked={false} />);
      expect(screen.getByRole("button", { name: "Finding you..." })).toBeDisabled();
    });

    it("no prompt: the live region is mounted but empty", () => {
      render(<LookingForMatchToggle initialRanked={false} />);
      expect(screen.getByRole("alert")).toBeEmptyDOMElement();
      expect(screen.getByRole("button", { name: "Go live" })).toBeInTheDocument();
    });

    it("never shows a prompt once live", () => {
      store.state = { ...store.state, isLive: true, locationPrompt: "denied" };
      render(<LookingForMatchToggle initialRanked={false} />);
      expect(screen.getByRole("alert")).toBeEmptyDOMElement();
      expect(screen.getByRole("button", { name: "Go offline" })).toBeInTheDocument();
    });
  });
});
