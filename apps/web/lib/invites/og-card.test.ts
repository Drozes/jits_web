// @vitest-environment node
import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { cardLines } from "./og-card";

describe("og-card cardLines", () => {
  it("an unavailable invite asks where you stand, with no CTA or code", () => {
    expect(cardLines({ state: "unavailable" })).toEqual({
      headline: "WHERE DO YOU STAND?",
      stats: "Jiu-jitsu, rated.",
      cta: null,
      code: null,
    });
  });
});
