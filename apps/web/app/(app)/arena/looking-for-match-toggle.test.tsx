import { describe, it, expect, vi, beforeEach } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { LookingForMatchToggle } from "./looking-for-match-toggle";

const store = vi.hoisted(() => ({
  state: { ready: true, isLive: false, isSaving: false },
  toggle: vi.fn(async () => {}),
}));
vi.mock("@/lib/arena/arena-store", () => ({
  useArenaState: () => store.state,
  arenaActions: { toggle: store.toggle },
}));

beforeEach(() => {
  store.state = { ready: true, isLive: false, isSaving: false };
  store.toggle.mockClear();
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
});
