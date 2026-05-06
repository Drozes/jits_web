import { describe, it, expectTypeOf } from "vitest";
import type { GymDetail } from "./session";
import type { Database } from "./database";

describe("GymDetail type", () => {
  it("includes isGymManager boolean field", () => {
    expectTypeOf<GymDetail["isGymManager"]>().toEqualTypeOf<boolean>();
  });

  it("includes isMemberGym boolean field", () => {
    expectTypeOf<GymDetail["isMemberGym"]>().toEqualTypeOf<boolean>();
  });

  it("includes sessions array", () => {
    expectTypeOf<GymDetail["sessions"]>().toBeArray();
  });
});

describe("gym_managers table type", () => {
  type GymManagerRow = Database["public"]["Tables"]["gym_managers"]["Row"];

  it("has id, gym_id, athlete_id columns", () => {
    expectTypeOf<GymManagerRow["id"]>().toBeString();
    expectTypeOf<GymManagerRow["gym_id"]>().toBeString();
    expectTypeOf<GymManagerRow["athlete_id"]>().toBeString();
  });

  it("has granted_by column", () => {
    expectTypeOf<GymManagerRow["granted_by"]>().toEqualTypeOf<string | null>();
  });
});
