import {
  isIdentityComplete,
  isTrainingComplete,
} from "@/lib/profile-setup/validation";
import {
  gymInstagramField,
  planGymInstagramWrite,
} from "@/lib/profile-setup/gym-instagram";
import { FREE_AGENT_OPTION } from "@/components/profile-setup/types";

const IDENTITY = {
  firstName: "Marcus",
  lastName: "Reyes",
  gender: "M",
  dateOfBirth: "1996-03-14",
  weight: "170",
  instagram: "",
};

describe("isIdentityComplete (Who Are You, with weight + Instagram)", () => {
  it("is complete with a valid weight and a blank Instagram", () => {
    expect(isIdentityComplete(IDENTITY)).toBe(true);
  });

  it("requires a weight between 50 and 400 lbs", () => {
    expect(isIdentityComplete({ ...IDENTITY, weight: "" })).toBe(false);
    expect(isIdentityComplete({ ...IDENTITY, weight: "49" })).toBe(false);
    expect(isIdentityComplete({ ...IDENTITY, weight: "401" })).toBe(false);
    expect(isIdentityComplete({ ...IDENTITY, weight: "400" })).toBe(true);
  });

  it("accepts a valid handle with @ and case, rejects a malformed one", () => {
    expect(isIdentityComplete({ ...IDENTITY, instagram: "@Marcus.Reyes" })).toBe(true);
    expect(isIdentityComplete({ ...IDENTITY, instagram: "marcus..reyes" })).toBe(false);
    expect(isIdentityComplete({ ...IDENTITY, instagram: "marcus-reyes" })).toBe(false);
  });
});

describe("isTrainingComplete (Where You Train)", () => {
  const base = { gymId: "g1", city: "Austin", gymInstagram: "" };

  it("no longer needs weight; needs a gym and a city", () => {
    expect(isTrainingComplete(base)).toBe(true);
    expect(isTrainingComplete({ ...base, gymId: "" })).toBe(false);
    expect(isTrainingComplete({ ...base, city: " " })).toBe(false);
  });

  it("rejects a malformed gym handle, but ignores it for free agents", () => {
    expect(isTrainingComplete({ ...base, gymInstagram: "bad handle" })).toBe(false);
    expect(
      isTrainingComplete({ ...base, gymId: FREE_AGENT_OPTION, gymInstagram: "bad handle" }),
    ).toBe(true);
  });
});

describe("gym Instagram field + write plan", () => {
  const gyms = [
    { id: "g1", name: "Atos", city: "Austin", instagram_handle: "atos" },
    { id: "g2", name: "Blank", city: "Austin", instagram_handle: null },
  ];
  const member = { managedGymIds: [], isAdmin: false };
  const manager = { managedGymIds: ["g1"], isAdmin: false };

  it("is hidden for free agents and before a gym is picked", () => {
    expect(gymInstagramField(FREE_AGENT_OPTION, gyms, member).visible).toBe(false);
    expect(gymInstagramField("", gyms, member).visible).toBe(false);
  });

  it("is read-only for a member when the gym already has a handle", () => {
    expect(gymInstagramField("g1", gyms, member)).toMatchObject({ visible: true, readOnly: true });
    expect(gymInstagramField("g2", gyms, member)).toMatchObject({ visible: true, readOnly: false });
  });

  it("is editable for the gym's manager and for admins", () => {
    expect(gymInstagramField("g1", gyms, manager).readOnly).toBe(false);
    expect(gymInstagramField("g1", gyms, { managedGymIds: [], isAdmin: true }).readOnly).toBe(false);
  });

  it("plans a normalized write only when the handle changed", () => {
    const blank = gymInstagramField("g2", gyms, member);
    expect(planGymInstagramWrite({ gymId: "g2", gymInstagram: "@NewGym" }, blank)).toEqual({
      gymId: "g2",
      handle: "newgym",
    });
    expect(planGymInstagramWrite({ gymId: "g2", gymInstagram: "" }, blank)).toBeNull();

    const managed = gymInstagramField("g1", gyms, manager);
    expect(planGymInstagramWrite({ gymId: "g1", gymInstagram: "@ATOS" }, managed)).toBeNull();
    // A manager clearing sends "" (the RPC normalizes it to NULL).
    expect(planGymInstagramWrite({ gymId: "g1", gymInstagram: "" }, managed)).toEqual({
      gymId: "g1",
      handle: "",
    });
  });

  it("never writes a read-only or hidden field", () => {
    const readOnly = gymInstagramField("g1", gyms, member);
    expect(planGymInstagramWrite({ gymId: "g1", gymInstagram: "@other" }, readOnly)).toBeNull();
    const hidden = gymInstagramField(FREE_AGENT_OPTION, gyms, member);
    expect(
      planGymInstagramWrite({ gymId: FREE_AGENT_OPTION, gymInstagram: "@x" }, hidden),
    ).toBeNull();
  });
});
