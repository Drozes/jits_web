import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { SessionActions } from "./session-actions";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn() }),
}));

vi.mock("@/lib/supabase/client", () => ({
  createClient: () => ({}),
}));

const mockActivate = vi.fn().mockResolvedValue({ ok: true, data: undefined });
const mockCancel = vi.fn().mockResolvedValue({ ok: true, data: undefined });
const mockComplete = vi.fn().mockResolvedValue({ ok: true, data: undefined });

vi.mock("@jits/shared/api/mutations", () => ({
  activateSession: (...args: unknown[]) => mockActivate(...args),
  cancelSession: (...args: unknown[]) => mockCancel(...args),
  completeSession: (...args: unknown[]) => mockComplete(...args),
}));

vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

// Mock Radix DropdownMenu to render items directly (avoiding jsdom pointer event limitations)
vi.mock("@/components/ui/dropdown-menu", () => ({
  DropdownMenu: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DropdownMenuTrigger: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  DropdownMenuContent: ({ children }: { children: React.ReactNode }) => <div data-testid="dropdown-content">{children}</div>,
  DropdownMenuItem: ({ children, onClick, className }: { children: React.ReactNode; onClick?: () => void; className?: string }) => (
    <button data-testid="menu-item" onClick={onClick} className={className}>{children}</button>
  ),
}));

beforeEach(() => {
  vi.clearAllMocks();
});

describe("SessionActions", () => {
  it("renders the trigger button", () => {
    render(<SessionActions sessionId="s1" status="scheduled" />);
    // The trigger button plus menu item buttons are rendered
    const buttons = screen.getAllByRole("button");
    expect(buttons.length).toBeGreaterThanOrEqual(1);
  });

  it("shows Activate and Cancel items for scheduled sessions", () => {
    render(<SessionActions sessionId="s1" status="scheduled" />);

    expect(screen.getByText("Activate")).toBeInTheDocument();
    expect(screen.getByText("Cancel")).toBeInTheDocument();
    expect(screen.queryByText("End Session")).not.toBeInTheDocument();
  });

  it("shows End Session and Cancel items for active sessions", () => {
    render(<SessionActions sessionId="s1" status="active" />);

    expect(screen.getByText("End Session")).toBeInTheDocument();
    expect(screen.getByText("Cancel")).toBeInTheDocument();
    expect(screen.queryByText("Activate")).not.toBeInTheDocument();
  });

  it("does not show actions for completed sessions", () => {
    render(<SessionActions sessionId="s1" status="completed" />);

    expect(screen.queryByText("Activate")).not.toBeInTheDocument();
    expect(screen.queryByText("End Session")).not.toBeInTheDocument();
    expect(screen.queryByText("Cancel")).not.toBeInTheDocument();
  });

  it("does not show actions for cancelled sessions", () => {
    render(<SessionActions sessionId="s1" status="cancelled" />);

    expect(screen.queryByText("Activate")).not.toBeInTheDocument();
    expect(screen.queryByText("End Session")).not.toBeInTheDocument();
    expect(screen.queryByText("Cancel")).not.toBeInTheDocument();
  });

  it("calls activateSession when Activate is clicked", async () => {
    render(<SessionActions sessionId="s1" status="scheduled" />);

    fireEvent.click(screen.getByText("Activate"));
    // The mutation should be called
    expect(mockActivate).toHaveBeenCalledWith(expect.anything(), "s1");
  });

  it("calls completeSession when End Session is clicked", async () => {
    render(<SessionActions sessionId="s1" status="active" />);

    fireEvent.click(screen.getByText("End Session"));
    expect(mockComplete).toHaveBeenCalledWith(expect.anything(), "s1");
  });

  it("calls cancelSession when Cancel is clicked on a scheduled session", async () => {
    render(<SessionActions sessionId="s1" status="scheduled" />);

    fireEvent.click(screen.getByText("Cancel"));
    expect(mockCancel).toHaveBeenCalledWith(expect.anything(), "s1");
  });
});
