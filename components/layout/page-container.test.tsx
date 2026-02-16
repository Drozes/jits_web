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
    expect(container.className).toContain("pb-[calc(5rem+env(safe-area-inset-bottom))]");
  });

  it("merges custom className", () => {
    render(<PageContainer className="py-8">Content</PageContainer>);
    const container = screen.getByText("Content");
    expect(container).toHaveClass("py-8");
  });
});
