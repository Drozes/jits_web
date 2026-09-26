import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";

vi.mock("next/navigation", () => ({ useRouter: () => ({ back: vi.fn(), push: vi.fn() }) }));
vi.mock("@/components/layout/app-header", () => ({
  AppHeader: ({ title }: { title: string }) => <header>{title}</header>,
}));

import MatchNotFound from "./not-found";

describe("match not-found page", () => {
  it("renders the spec 3.2 copy with Back", () => {
    render(<MatchNotFound />);
    expect(screen.getByText("Match not found")).toBeInTheDocument();
    expect(screen.getByText("It may have been cancelled or removed.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Back" })).toBeInTheDocument();
    expect(screen.getByTestId("match-detail-not-found")).toBeInTheDocument();
  });
});
