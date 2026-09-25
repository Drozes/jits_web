import { describe, it, expect, vi, beforeEach } from "vitest";
import { isValidElement } from "react";
import { ArenaBootstrapGate } from "./arena-bootstrap-gate";
import { ArenaBootstrap } from "./arena-bootstrap";

const guard = vi.hoisted(() => ({ getActiveAthlete: vi.fn() }));
vi.mock("@/lib/guards", () => guard);
vi.mock("./arena-bootstrap", () => ({ ArenaBootstrap: () => null }));

beforeEach(() => guard.getActiveAthlete.mockReset());

describe("ArenaBootstrapGate", () => {
  it("does not mount the owner without an active athlete", async () => {
    // getActiveAthlete returns null for signed-out and pending athletes.
    guard.getActiveAthlete.mockResolvedValue(null);
    expect(await ArenaBootstrapGate()).toBeNull();
  });

  it("mounts the owner keyed by athlete id with the DB live flag", async () => {
    guard.getActiveAthlete.mockResolvedValue({
      id: "ath-1",
      current_weight: 180,
      looking_for_ranked: true,
    });
    const el = await ArenaBootstrapGate();
    expect(isValidElement(el)).toBe(true);
    expect(el!.type).toBe(ArenaBootstrap);
    expect(el!.key).toBe("ath-1");
    expect(el!.props).toEqual({
      athleteId: "ath-1",
      athleteWeight: 180,
      initialLive: true,
    });
  });
});
