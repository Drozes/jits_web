import { describe, it, expect, vi, beforeEach } from "vitest";
import { StrictMode } from "react";
import { render } from "@testing-library/react";

const nav = vi.hoisted(() => ({ replace: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ replace: nav.replace }) }));
const toasts = vi.hoisted(() => ({ info: vi.fn() }));
vi.mock("sonner", () => ({ toast: toasts }));

import { MatchExitRedirect } from "./match-exit-redirect";

describe("MatchExitRedirect", () => {
  beforeEach(() => vi.clearAllMocks());

  it("toasts and navigates exactly once under Strict Mode", () => {
    render(
      <StrictMode>
        <MatchExitRedirect exitHref="/arena" reason="cancelled" />
      </StrictMode>,
    );
    expect(toasts.info).toHaveBeenCalledTimes(1);
    expect(nav.replace).toHaveBeenCalledTimes(1);
    expect(nav.replace).toHaveBeenCalledWith("/arena");
  });

  it("toasts why and leaves a cancelled match for the exit", () => {
    render(<MatchExitRedirect exitHref="/arena" reason="cancelled" />);
    expect(toasts.info).toHaveBeenCalledWith("This match was cancelled.");
    expect(nav.replace).toHaveBeenCalledWith("/arena");
  });

  it("explains a voided result", () => {
    render(<MatchExitRedirect exitHref="/session/s1/lobby" reason="voided" />);
    expect(toasts.info).toHaveBeenCalledWith(
      "This result was voided on review. Any rating change was reversed.",
    );
    expect(nav.replace).toHaveBeenCalledWith("/session/s1/lobby");
  });
});
