import { filterSubmissionTypes } from "@/lib/match-flow/filter-submissions";
import type { SubmissionType } from "@jits/shared/types/submission-type";

const t = (code: string, display_name: string, sort_order = 0): SubmissionType => ({
  code,
  display_name,
  category: "choke",
  id: code,
  sort_order,
  status: "active",
});

const TYPES = [
  t("rear_naked_choke", "Rear Naked Choke", 1),
  t("guillotine", "Guillotine", 2),
  t("darce", "D'Arce", 3),
  t("north_south_choke", "North-South Choke", 4),
  t("mounted_triangle_armbar", "Mounted Triangle Armbar", 5),
  t("armbar", "Armbar", 6),
  t("other", "Other Submission", 7),
];

const codes = (q: string) => filterSubmissionTypes(TYPES, q).map((x) => x.code);

describe("filterSubmissionTypes", () => {
  it("returns the full list, in order, for an empty or blank query", () => {
    expect(codes("")).toEqual(TYPES.map((x) => x.code));
    expect(codes("   ")).toEqual(TYPES.map((x) => x.code));
  });

  it("matches anywhere in the name, case-insensitively", () => {
    expect(codes("ARMBAR")).toEqual(["mounted_triangle_armbar", "armbar"]);
    expect(codes("illo")).toEqual(["guillotine"]);
  });

  it("ignores apostrophes, hyphens and spacing", () => {
    expect(codes("darce")).toEqual(["darce"]);
    expect(codes("d'arce")).toEqual(["darce"]);
    expect(codes("north south")).toEqual(["north_south_choke"]);
    expect(codes("northsouth")).toEqual(["north_south_choke"]);
    expect(codes("rear-naked")).toEqual(["rear_naked_choke"]);
  });

  it("matches initials shorthand like rnc", () => {
    expect(codes("rnc")).toEqual(["rear_naked_choke"]);
    expect(codes("mta")).toEqual(["mounted_triangle_armbar"]);
  });

  it("matches the code", () => {
    expect(codes("north_south")).toEqual(["north_south_choke"]);
  });

  it("returns nothing when nothing matches", () => {
    expect(codes("zzzz")).toEqual([]);
  });
});
