import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { PageContainer } from "./page-container";

describe("PageContainer", () => {
  it("renders children", () => {
    render(<PageContainer>Hello world</PageContainer>);
    expect(screen.getByText("Hello world")).toBeInTheDocument();
  });

  it("applies mobile-width constraint classes", () => {
    render(<PageContainer>Content</PageContainer>);
    const container = screen.getByText("Content");
    expect(container).toHaveClass("max-w-md", "mx-auto", "px-4");
    expect(container.className).toContain("pb-[calc(6rem+env(safe-area-inset-bottom))]");
  });

  it("stays narrow by default (no lg widening)", () => {
    render(<PageContainer>Content</PageContainer>);
    const container = screen.getByText("Content");
    expect(container.className).not.toContain("lg:max-w-3xl");
  });

  it("widens at >= lg when wide is set, keeping the comfortable column below lg", () => {
    render(<PageContainer wide>Content</PageContainer>);
    const container = screen.getByText("Content");
    // Comfortable mobile column is preserved below lg.
    expect(container).toHaveClass("max-w-md", "mx-auto", "px-4");
    // And the column widens at the lg breakpoint and up.
    expect(container).toHaveClass("lg:max-w-3xl", "lg:px-6");
  });

  it("merges custom className", () => {
    render(<PageContainer className="py-8">Content</PageContainer>);
    const container = screen.getByText("Content");
    expect(container).toHaveClass("py-8");
  });
});
